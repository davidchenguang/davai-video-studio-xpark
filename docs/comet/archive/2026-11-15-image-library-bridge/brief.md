# Outcome

生图模块（H3-Image、Z-Image、FireRed 图片编辑）完成的图片当前不进入视频库与队列——它们只更新各自工作区的内部 `result` 状态，用户离开界面后只能到文件系统里翻 `Created Images` / `FireRed Photo Edits` 文件夹。本需求把这三类生图成果以 `mediaType: 'image'` 的 `GenerationJob` 登记进共享 jobs 状态，使它们与 Ref2VA 静帧一样出现在视频库（图片筛选）中，并在**完成后**出现在队列历史中（生图任务不经历 queued/running 阶段，与 Ref2VA 生成即入队的时机不同），且每张图可一键定位到它在磁盘上的正式留存位置。

现状事实（已当场核实）：

- 三类生图完成时均已把正式留存写入 ComfyUI 输出目录的子文件夹：生图 → `Created Images/`（`created-image-*`），FireRed 编辑 → `FireRed Photo Edits/`（`photo-edit-*`），保存逻辑在 `electron/main.ts:1397-1424`（IPC `comfy:save-output-image`）。ComfyUI 渲染原始输出另存于 `MiniMax_first_frames/`（`src/lib/h3Image.ts:67`、`src/lib/zimage.ts:26`），属于副产品，job 记录指向正式留存而非它。
- 全仓库只有 H3 I2V 的 Ref2VA 静帧路径创建 `mediaType: 'image'` 的 job（`src/App.tsx:2383`）。
- `LibraryView` 已支持图片卡片：`<img>` 渲染、lightbox 预览、提示词搜索（`src/components/LibraryView.tsx:21-23,51-57`）；提供方筛选不拦截未标注 provider 的条目（默认归入 minimax）。
- "在文件夹中显示"能力已存在：IPC `shell:show-output` → `shell.showItemInFolder`（`electron/main.ts:1891-1895`、`electron/preload.ts:76`），渲染层 `window.minimax.showOutput(path)`，`LibraryView.tsx:38` 已有调用先例。复用该 IPC，仅补一处存在性守卫（见 Decisions）。
- `writeLocalJson` 失败时静默返回 false（`src/lib/localPersistence.ts`），data URL 级别的 base64 写入 localStorage 会触发配额异常且无人知晓——job 的 `outputUrl` 必须用 `mediaUrl()` 生成的短 `minimax-media://` URL，绝不能用 `getOutputImage` 返回的 data URL。

# Scope

## 目录结构

### 新建

- `scripts/test-job-presentation.cjs` — 共享来源标签映射函数的纯函数单测（经 `scripts/test-ts-loader.cjs` 加载真实模块），覆盖新 provider 映射、Ref2VA 保持、未知 provider 兜底；并入 `pnpm test` 链（接在 `test:job-persistence` 之后）。

### 修改

- `src/types.ts` — `GenerationJob['provider']` 联合类型新增 `'h3image' | 'zimage' | 'firered'`（当前为封闭联合，约 :551）。
- `src/lib/jobPresentation.ts` — 新增"按 provider 映射图片来源标签"的共享函数：`h3image` → "H3-Image"、`zimage` → "Z-Image"、`firered` → "FireRed 图片编辑"、无 provider 或 `minimax` 的 image job → "Ref2VA 静帧"、未知 provider → 中性兜底「生成图片」（避免历史/未来图片误标），供 LibraryView 与 JobsView 复用，替代两处硬编码的"Ref2VA 静帧"。
- `src/components/LibraryView.tsx` — 图片卡片来源标签改用共享映射函数（:62）；卡片操作区新增"在文件夹中显示"按钮（:65-68，调用 `window.minimax.showOutput(job.localOutputPath)`，仅图片卡片且 `localOutputPath` 存在时显示）；lightbox 图片 alt 文案「生成的参考静帧」随来源调整（:74）。
- `src/components/JobsView.tsx` — 图片 job 来源标签改用同一共享映射函数（:60）。
- `src/components/H3ImageWorkspace.tsx` — 完成回调登记 `GenerationJob`（字段清单见 Decisions；提交时把 prompt/resolution 捕获进 job 快照的既有模式不变）；修正输出提示文案（:341），补上 `Created Images` 正式留存。
- `src/components/ZImageWorkspace.tsx` — 完成回调登记 `GenerationJob`（保存点 :140-145）。当前 `ZImageJob` 只有 `{ id, url }`，需在 `create()` 提交时捕获 prompt + resolution 进 job（照 H3-Image 的先例），登记的宽高取自捕获快照而非完成时的 state（RenderSize 在 busy 时未禁用，完成时读 state 会错）；修正同一句 stale 文案（:264）。
- `src/components/PhotoEditWorkspace.tsx` — 完成回调登记 `GenerationJob`（provider `'firered'`、`localOutputPath` 指向 `FireRed Photo Edits/` 留存，保存点 :116-117）。无输出位置文案可改，不涉及 A7。
- `src/App.tsx` — 提供登记入口：向三个生图工作区传入 `onRegisterJob` 回调。回调必须稳定（`useCallback` 空依赖，等价 ref），不得以会变的身份进入工作区轮询 effect 的依赖数组——否则 App 高频重渲染会不断重置 2s 轮询计时器，破坏现有完成检测（ZImageWorkspace.tsx:162 / H3ImageWorkspace.tsx:167 的 effect deps 模式）。登记点幂等（按保存路径去重，StrictMode 双挂载不产生重复条目）。
- `electron/main.ts` — `shell:show-output` 补存在性守卫（:1891-1892）：目标带扩展名（文件）且不存在时不再 `mkdir`，直接跳过或静默返回，避免「在文件夹中显示」在文件被移走后造出同名目录。
- `package.json` — test 链追加 `test:job-presentation`。

### 删除

无。

### 明确不建

- 不做删除/清理/配额机制 — 项目铁律是绝不自动覆盖用户数据；删除类操作显式触发且超出本需求。
- 不扩 LibraryView 提供方筛选下拉（仍只有 全部/MiniMax H3/LTX 2.5）— 新 provider 图片默认归入"全部"视图可见，按来源筛选需求出现时再加（YAGNI）。
- 不建独立图片库/图库子系统（缩略图缓存、去重、按文件夹浏览）— jobs 记录 + 目录约定已够用。
- 不动 ComfyUI 侧副产品 `MiniMax_first_frames/` — 那是 ComfyUI 自有输出，App 不拥有它的生命周期。
- 不动 jobs 持久化上限（100 条）与 FIFO 淘汰 — 生图入库加速挤出旧视频历史是接受的产品代价；如需调整上限另立需求（现状 100 条对视频为主的历史本就紧张，盲目调大放大 localStorage 配额风险，见 outputUrl 决定）。
- 不为 FireRed 增加输出位置文案 — 现工作区无误导性存储位置文案，无错可修（YAGNI）。

# Non-goals

- 不改变生图工作区自身的结果展示、发送到 I2V/LTX 等现有交互。
- 不改变 Ref2VA 静帧路径的现有登记行为（它继续用 `mediaType: 'image'` + 无新 provider 标注，标签仍是"Ref2VA 静帧"）。
- 不处理音频 job、不处理移动端 `MobileApp.tsx` 的展示（其 provider 分支已按 string 窄化处理，TypeScript 联合扩展后自然兼容）。
- 不为已有历史图片补登记（只对新完成的生图生效）。

# 验收示例

- H3-Image 工作区生成一张图片并保存成功后，App 的 jobs 状态新增 provider 为 h3image、mediaType 为 image、status 为 completed 的记录，localOutputPath 指向 Created Images 留存，outputUrl 是 minimax-media 短 URL（非 data URL），视频库图片筛选与队列历史出现该条目且提示词可搜索命中。
- Z-Image 工作区生成一张图片并保存成功后，App 的 jobs 状态新增 provider 为 zimage、mediaType 为 image 的完成记录；登记的 prompt 与宽高来自提交时捕获的快照（生成期间改动提示词或尺寸不影响登记值），视频库与队列历史可见且可搜索，宽高非 0。
- FireRed 图片编辑完成并保存成功后，App 的 jobs 状态新增 provider 为 firered、mediaType 为 image 的完成记录，localOutputPath 指向 FireRed Photo Edits 留存。
- 图片卡片的「在文件夹中显示」调用 showOutput(localOutputPath)，资源管理器打开并选中该 job 留存文件；localOutputPath 缺失的旧图片卡片不显示该按钮且不报错；目标文件已被移走时点击不创建同名目录。
- saveComfyOutputImage 失败时 jobs 不新增记录，工作区按既有路径展示保存失败错误；一次完成只登记一次（StrictMode 双挂载与 App 重渲染均不产生重复条目，轮询计时器不被重置）。
- 重启应用后，已持久化的生图条目仍在视频库图片筛选下可见，readSavedJobs 不因新增 provider 字段丢弃旧条目，persisted jobs 中无 data URL 级 outputUrl。
- H3-Image 与 Z-Image 工作区无结果时，输出面板占位文案同时提及 MiniMax_first_frames 与 Created Images 两个存储位置。
- 生成进行中不产生库条目；完成登记不影响工作区现有 result 状态与发送到 MiniMax I2V、发送到 LTX 2.5 按钮行为。
- 同一条生图 job 在队列视图与视频库显示相同来源标签；H3-Image、Z-Image、FireRed 图片编辑、Ref2VA 静帧各显示对应标签，未知 provider 的图片显示中性兜底标签而非误标。
- pnpm typecheck 与 pnpm lint 通过；pnpm build:web 通过；pnpm test 链中除 test:locale 外全部套件通过；test:locale 输出 FAIL 计数与 main 基线（47）持平，未新增失败。

# Decisions

- **按来源区分标签**（用户已确认）：图片 job 的来源标签由硬编码 "Ref2VA 静帧" 改为按 provider 映射——`h3image` → "H3-Image"、`zimage` → "Z-Image"、`firered` → "FireRed 图片编辑"，Ref2VA 静帧保持 "Ref2VA 静帧"，未知 provider 中性兜底。映射函数放 `src/lib/jobPresentation.ts` 共享，LibraryView 与 JobsView 两处消费，附纯函数单测。
- **provider 扩展而非复用 minimax**：为三类生图新增专属 provider 值，而非塞进 'minimax'（避免错标为 "MiniMax H3"）。LibraryView/JobsView 的既有 `provider === 'ltx25'` 等分支不受影响（新值不命中）。
- **job 字段清单**（登记进 jobs 的完整形状）：`id`（稳定唯一）、`createdAt`（完成时刻）、`status: 'completed'`、`progress: 100`、`mediaType: 'image'`、`mode: 'image'`、`provider`（上述三者之一）、`prompt`（提交时捕获的快照）、`width`/`height`（提交时捕获的分辨率快照，Z-Image 必须如此）、`duration: 0`、`outputUrl: await window.minimax.mediaUrl(saved.path)`（短 minimax-media:// URL；绝不用 data URL——writeLocalJson 静默吞错，MB 级 base64 会撑爆 localStorage 配额且无人知晓）、`localOutputPath: saved.path`、`promptId`（ComfyUI prompt id，供队列活动日志关联）。
- **登记时机与幂等**：`saveComfyOutputImage` 返回 `{ path, name }` 之时登记；保存失败不登记（工作区既有错误提示已覆盖）。按保存路径幂等去重（StrictMode 双挂载安全）；App 侧回调必须 `useCallback` 空依赖稳定，不进入工作区轮询 effect 的依赖数组——App 高频重渲染否则会重置 2s 轮询计时器，破坏现有完成检测。
- **showOutput 存在性守卫**：`shell:show-output` 现对不存在的路径 `mkdir`（`main.ts:1892`）；文件被用户移走后点按钮会造出 `created-image-xxx.png` 目录且全程静默。补 1 行守卫：目标是文件（带扩展名）且不存在时直接跳过。行为对既有调用（传目录或存在文件）不变。
- **不动双份落盘**：`Created Images` 拷贝是本地留存保证（引擎可能在另一台机器，`save-output-image` 的 `/view` 回退依赖它），该冗余是设计使然，不是浪费。
- **不动 100 条持久化上限**：生图入库会加速 FIFO 淘汰旧视频历史，这是接受的代价；调整上限放大 localStorage 配额风险，与 outputUrl 决定冲突，需要时另立需求。
- **文案修 H3-Image 与 Z-Image 两处**：两处是同一句 stale 文案（H3ImageWorkspace.tsx:341、ZImageWorkspace.tsx:264），同根问题一并修。FireRed 工作区无存储位置文案，不属于误导，不硬加（YAGNI）。
- **入队时机差异明示**：Ref2VA 是生成即 queued 入队（有进度与活动日志）；生图任务是完成后一次性登记 completed。目标措辞用"完成后出现在队列历史"，不伪装成同等待遇。
- **验证命令拆解**：`pnpm test` 是 `&&` 链且 `test:locale` 在第 23 位必失败，链上其后三个套件不会跑——不能用"pnpm test 通过 + locale 计数对比"这种自相矛盾的表述。改为：typecheck/lint/build:web 通过 + test 链逐套件跑（排除 locale）+ test:locale 单独计数对比基线。

# Verification expectations

- UI 变更须在 Electron 应用中验证：视频库图片筛选下生图条目的空/有/多来源混合状态，卡片按钮的隐藏/可见状态（localOutputPath 缺失时），lightbox 图片 alt。
- 队列视图与视频库的标签一致性（同一 job 在两处显示相同来源）。
- `pnpm test` 链需拆解验证：排除 `test:locale` 的全部套件通过；`test:locale` 单独运行，FAIL 计数与基线 47 持平（基线从 HEAD 复核，当前工作树另有未提交的 H3-Image 改动可能影响计数）。
- 新增 `scripts/test-job-presentation.cjs` 覆盖标签映射（新 provider、Ref2VA 保持、未知 provider 兜底）。
- 现有针对 `LibraryView`/`JobsView` 渲染的断言（如有）不因标签文案变化而失败。
