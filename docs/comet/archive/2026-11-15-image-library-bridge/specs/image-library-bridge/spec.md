# 生图成果入库与定位（image-library-bridge）

## Capability

`image-library-bridge` — 生图模块（H3-Image、Z-Image、FireRed 图片编辑）完成的图片登记进共享生成任务列表，在视频库中可见、可按图片筛选、可定位到磁盘正式留存，并在完成后出现在队列历史中。

## 完整行为规格

### 1. 生图完成登记

H3-Image、Z-Image、FireRed 三个生图工作区在渲染完成且正式留存保存成功（`comfy:save-output-image` 返回 `{ path, name }`）后，向 App 登记一条 `GenerationJob`：

- `id`：稳定唯一。
- `provider`：`'h3image'` | `'zimage'` | `'firered'`（三者分别对应三个工作区）。`GenerationJob['provider']` 联合类型包含这三个值。
- `mediaType: 'image'`、`mode: 'image'`、`status: 'completed'`、`progress: 100`、`duration: 0`。
- `prompt`：提交时捕获的提示词快照（H3-Image / Z-Image 为图片提示词；FireRed 为编辑指令），不取完成时 state。
- `width` / `height`：提交时捕获的分辨率快照。Z-Image 的 `ZImageJob` 需在 `create()` 提交时捕获 prompt + resolution（照 H3-Image 的先例），登记值不受生成期间用户改动提示词或尺寸的影响。
- `outputUrl`：`await window.minimax.mediaUrl(saved.path)` 生成的 `minimax-media://` 短 URL。禁止使用 `getOutputImage` 返回的 data URL（`writeLocalJson` 静默吞错，base64 会撑爆 localStorage 配额）。
- `localOutputPath`：`saved.path`，指向 ComfyUI 输出目录下 `Created Images/`（H3-Image、Z-Image）或 `FireRed Photo Edits/`（FireRed）里的正式留存文件。
- `createdAt`：完成时刻。
- `promptId`：ComfyUI prompt id，供队列活动日志关联。

约束：

- 登记只发生在保存成功之后；`saveComfyOutputImage` 失败时不登记任何 job（工作区既有的错误提示路径不变）。
- 一次完成只登记一次：App 侧登记回调必须身份稳定（`useCallback` 空依赖），不进入工作区轮询 effect 的依赖数组（否则 App 高频重渲染会重置 2s 轮询计时器，破坏现有完成检测）；登记按保存路径幂等去重，StrictMode 双挂载不产生重复条目。
- 登记不得影响工作区现有的 `result` 状态、实时预览、"发送到 MiniMax I2V"、"发送到 LTX 2.5"（H3-Image / Z-Image）等交互。
- jobs 状态管理（追加、`compactJob` 压缩、截断到 100 条、`minimax.jobs` 持久化）仍由 App 侧统一负责；生图工作区只单向通知。
- 生图任务不经历 queued/running 阶段（与 Ref2VA 生成即入队的时机不同），只在完成后一次性以 completed 状态出现在队列历史。

#### Scenario: H3-Image 生图完成登记
Acceptance: A1

H3-Image 工作区生成一张图片并保存成功后，App 的 jobs 状态新增一条 `provider: 'h3image'`、`mediaType: 'image'`、`status: 'completed'` 的记录，`localOutputPath` 指向 `Created Images/` 中的留存文件，`outputUrl` 是 minimax-media 短 URL（非 data URL）。

#### Scenario: Z-Image 生图完成登记（快照元数据）
Acceptance: A2

Z-Image 工作区生成一张图片并保存成功后，jobs 新增 `provider: 'zimage'` 的完成记录；登记的 prompt 与宽高来自提交时捕获的快照（生成期间改动提示词或尺寸不影响登记值），宽高非 0。

#### Scenario: FireRed 编辑完成登记
Acceptance: A3

FireRed 图片编辑完成并保存成功后，jobs 新增 `provider: 'firered'`、`mediaType: 'image'` 的完成记录，`localOutputPath` 指向 `FireRed Photo Edits/` 留存。

#### Scenario: 保存失败不登记且登记幂等
Acceptance: A5

`saveComfyOutputImage` 失败时，jobs 不新增记录，工作区按既有路径展示保存失败错误；一次完成只登记一次（StrictMode 双挂载与 App 重渲染不产生重复条目，轮询计时器不被重置）。

### 2. 视频库与队列中的来源标签

图片 job 的来源标签按 `provider` 映射，由 `src/lib/jobPresentation.ts` 的共享函数提供，`LibraryView` 与 `JobsView` 共同消费：

- `h3image` → 「H3-Image」
- `zimage` → 「Z-Image」
- `firered` → 「FireRed 图片编辑」
- 无 provider 或 `minimax` 的 image job → 「Ref2VA 静帧」（Ref2VA 路径现状保持）
- 未知 provider → 中性兜底「生成图片」（避免历史/未来图片误标）

LibraryView lightbox 中图片的 alt 文案随来源调整（不再统一写"生成的参考静帧"）。视频（非 image）job 的标签逻辑不变。提供方筛选下拉不新增选项；新 provider 图片在"全部"下可见，归入 minimax 分组的既有兜底行为保持。

#### Scenario: 图片来源标签正确与兜底
Acceptance: A9

H3-Image、Z-Image、FireRed 各生成一张后，视频库图片筛选下的三张卡片分别显示「H3-Image」「Z-Image」「FireRed 图片编辑」；既有 Ref2VA 静帧条目仍显示「Ref2VA 静帧」；未知 provider 的图片显示中性兜底标签而非误标。

#### Scenario: 队列与库标签一致
Acceptance: A9

同一条生图 job 在队列视图与视频库中显示相同的来源标签（同一共享映射函数）。

### 3. 图片卡片定位磁盘文件

视频库图片卡片操作区新增「在文件夹中显示」按钮：

- 仅对 `mediaType === 'image'` 且 `localOutputPath` 存在的卡片显示。
- 点击调用 `window.minimax.showOutput(job.localOutputPath)`（既有 IPC `shell:show-output`），在系统资源管理器中打开并选中该 job 的留存文件。
- `localOutputPath` 缺失（如旧数据）时按钮不显示，不报错。
- 视频卡片不新增该按钮（现状不变）。
- `shell:show-output` 补存在性守卫：目标是文件（路径带扩展名）且不存在时直接跳过，不再对不存在的文件路径执行 `mkdir`（现状 `main.ts:1892` 会在文件被移走后造出同名目录）。对既有调用（传目录或存在文件）行为不变。

#### Scenario: 定位留存文件
Acceptance: A4

点击生图卡片的「在文件夹中显示」后，资源管理器打开 `Created Images/`（或 `FireRed Photo Edits/`）并选中该图片文件；目标文件已被移走时点击不创建同名目录；localOutputPath 缺失的旧图片卡片不显示该按钮且不报错。

### 4. 输出位置文案

H3-Image 与 Z-Image 工作区输出面板在无结果时的同一句占位文案（当前只提及 ComfyUI 原始输出 `MiniMax_first_frames`）改为同时说明两个位置：ComfyUI 渲染原始输出（`MiniMax_first_frames/`）与完成后的 App 正式留存（`Created Images/`）。FireRed 工作区无存储位置文案，不在本能力范围内。

#### Scenario: 文案包含两处位置
Acceptance: A7

H3-Image 与 Z-Image 工作区无结果时，输出面板占位文案同时提及 `MiniMax_first_frames` 与 `Created Images` 两个存储位置。

#### Scenario: 生成中与现有交互不受影响
Acceptance: A8

生成进行中视频库不出现该图片条目；完成登记不影响工作区现有 result 状态与「发送到 MiniMax I2V」「发送到 LTX 2.5」按钮行为。

### 5. 兼容与持久化

- `readSavedJobs`（`src/lib/jobPersistence.ts`）保持旧 shape 容忍性：已持久化的旧条目不因新增 provider 值或字段被丢弃。
- 重启后，本需求登记的生图条目仍出现在视频库（`minimax.jobs` 持久化路径），且持久化内容中无 data URL 级 outputUrl。
- jobs 持久化上限保持 100 条与 FIFO 淘汰不变；生图入库加速淘汰旧视频历史是接受的代价，不调整上限。
- 不为已有历史图片补登记；只对完成时刻起的新生图生效。
- MobileApp 的 provider 窄化分支对新 provider 值自然兼容，不在本需求内改动。

#### Scenario: 重启后生图条目保留
Acceptance: A6

登记过生图条目后重启应用，视频库图片筛选下该条目仍在，提示词搜索可命中，旧有条目无丢失。

### 6. 自动化验证

- 新增 `scripts/test-job-presentation.cjs` 纯函数单测，覆盖标签映射（新 provider、Ref2VA 保持、未知 provider 兜底），经 `scripts/test-ts-loader.cjs` 加载真实模块，并入 `pnpm test` 链。
- `pnpm typecheck` 与 `pnpm lint` 通过；`pnpm build:web` 通过。
- `pnpm test` 为 `&&` 链且 `test:locale` 在链中必失败：验证时排除 `test:locale` 逐套件运行其余部分，`test:locale` 单独运行并与基线计数（main 上 47 处 FAIL）对比，未新增失败即通过。基线从 HEAD 复核（当前工作树另有未提交的 H3-Image 改动可能影响计数）。

#### Scenario: 验证命令通过
Acceptance: A10

`pnpm typecheck` 与 `pnpm lint` 通过；`pnpm build:web` 通过；`pnpm test` 链中除 `test:locale` 外全部套件通过；`test:locale` 输出 FAIL 计数与 main 基线（47）持平，未新增失败。

### 7. 非目标

- 不做删除/清理/配额；不动 `MiniMax_first_frames/` 副产品；不动双份落盘设计；不动 jobs 持久化上限。
- 不扩提供方筛选下拉；不建图片库子系统（缩略图缓存/去重/按文件夹浏览）；不为 FireRed 增加输出位置文案。
- 不改生图工作区现有结果展示与发送到 I2V/LTX 交互；不改 Ref2VA 登记行为；不处理音频 job 与 MobileApp。
