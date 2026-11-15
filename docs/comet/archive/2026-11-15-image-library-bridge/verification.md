---
generated_from_state_version: 11
---

# 验证

## 当前结果

- 结果: **已归档**
- 验证情况: **已完成检查，验证结果已确认**
- 目标周期: 2
- 迭代: 1
- 验证器尝试次数: 1
- 完成时间: 2026-11-15T09:46:28.759Z
- 摘要: A1–A10 全部通过。实现与 brief/spec 一致：三个生图工作区在 saveComfyOutputImage 成功后以 mediaUrl(saved.path) 的 minimax-media 短 URL 构造 mediaType=image 的 completed GenerationJob，经 App 侧稳定的 registerCompletedImageJob（useCallback 空依赖 + 按 localOutputPath 幂等）登记，登记不进入轮询 effect 依赖数组。证据覆盖：Z-Image/H3-Image/FireRed 三条登记链路在隔离浏览器上下文中以真实工作区组件 + mock 桥接驱动实测（含 Z-Image 提交时快照语义、保存失败不登记、StrictMode/重渲染幂等、生成中不入库、完成后 result 与发送按钮不受影响）；视频库与队列标签一致、来源兜底正确、文件夹按钮仅对有 localOutputPath 的图片卡片显示且调用 showOutput(localOutputPath)；electron shell:show-output 守卫用真实源码在临时目录执行验证（文件被移走不建同名目录）。命令类检查 typecheck/lint/build:web 通过，test:locale 计数 47 与 main 基线持平且改动文件零新增 FAIL。

## 验收

| 编号 | 结果 | 来源 | 验收项 | 原因 |
| --- | --- | --- | --- | --- |
| A1 | passed | brief.md | H3-Image 工作区生成一张图片并保存成功后，App 的 jobs 状态新增 provider 为 h3image、mediaType 为 image、status 为 completed 的记录，localOutputPath 指向 Created Images 留存，outputUrl 是 minimax-media 短 URL（非 data URL），视频库图片筛选与队列历史出现该条目且提示词可搜索命中。 | 在隔离浏览器上下文（端口 5211，独立 localStorage）mock ComfyUI 桥接后真实驱动 H3-Image 工作区：提交→轮询→getOutputImage→saveComfyOutputImage→mediaUrl 全链路跑通，jobs 持久化中新增 {provider:'h3image', mediaType:'image', status:'completed', mode:'image', progress:100, duration:0, promptId:'h3-probe-1', prompt:'h3probe original prompt', width:1344, height:768, localOutputPath:'C:\out\Created Images\created-image-h3probe.png', outputUrl:'minimax-media://selected?path=...'};outputUrl 为 minimax-media 短 URL，localStorage 中不含 base64/data URL；视频库图片筛选与队列视图均出现该条目，搜索提示词可命中。代码路径核对：App.registerCompletedImageJob (useCallback 空依赖) 按 localOutputPath 幂等去重，H3ImageWorkspace 通过 registerJobRef 调用（不进轮询 effect 依赖）。 |
| A2 | passed | brief.md | Z-Image 工作区生成一张图片并保存成功后，App 的 jobs 状态新增 provider 为 zimage、mediaType 为 image 的完成记录；登记的 prompt 与宽高来自提交时捕获的快照（生成期间改动提示词或尺寸不影响登记值），视频库与队列历史可见且可搜索，宽高非 0。 | Z-Image 实测：提交前把分辨率设为 1920x1080、提交后（渲染进行中）把提示词改为 'zprobe CHANGED prompt after submit'、分辨率改为 1024x576；登记条目仍为 prompt='zprobe original prompt', width=1920, height=1080，证明登记取提交时快照（updateJob 在 create() 中写入 {id,url,prompt,width,height}，poll 分支只读 job.*）。宽高非 0，条目在视频库与队列历史可见、提示词搜索可命中。 |
| A3 | passed | brief.md | FireRed 图片编辑完成并保存成功后，App 的 jobs 状态新增 provider 为 firered、mediaType 为 image 的完成记录，localOutputPath 指向 FireRed Photo Edits 留存。 | FireRed 照片编辑实测跑通（选源图→画质模式→编辑图片→saveComfyOutputImage purpose='photo-edit'→mediaUrl），jobs 新增 {provider:'firered', mediaType:'image', status:'completed', localOutputPath:'C:\out\FireRed Photo Edits\photo-edit-probe.png', prompt:'frprobe replace the jacket', width:768, height:768}；保存目录与 electron/main.ts 的 folders 映射 'photo-edit'→'FireRed Photo Edits' 一致。 |
| A4 | passed | brief.md | 图片卡片的「在文件夹中显示」调用 showOutput(localOutputPath)，资源管理器打开并选中该 job 留存文件；localOutputPath 缺失的旧图片卡片不显示该按钮且不报错；目标文件已被移走时点击不创建同名目录。 | 视频库图片卡片实测：点击「在文件夹中显示」后 window.minimax.showOutput 被调用且参数为该 job 的 localOutputPath（'C:/out/Created Images/h3.png'）；localOutputPath 缺失的旧图片卡片（seed-old）与未知 provider 卡片均不渲染该按钮（DOM 断言 hasRevealBtn=false），不报错。electron 侧守卫用真实源码（从 electron/main.ts 抽取 shell:show-output handler，在临时目录以 stubbed shell 执行）验证：带扩展名且不存在的文件不会创建同名目录也不调用 showItemInFolder；存在的文件与目录调用行为不变。 |
| A5 | passed | brief.md | saveComfyOutputImage 失败时 jobs 不新增记录，工作区按既有路径展示保存失败错误；一次完成只登记一次（StrictMode 双挂载与 App 重渲染均不产生重复条目，轮询计时器不被重置）。 | saveComfyOutputImage 抛错实测：jobs 条目数前后均为 10，含 'failure path' 的条目 0 条，工作区沿用既有路径显示错误文案 'probe save failure'，未登记。幂等实测：一次完成期间 6 轮 App 级重渲染（连接检查 + 视图切换）后 saved 调用 1 次、轮询计数 2（running→success，计时器未被重置）、jobs 中该 localOutputPath 只有 1 条；另在 StrictMode 下从 localStorage 恢复旧 shape 的 FireRed job 触发双挂载，saved 仍为 1 次、登记 1 条。 |
| A6 | passed | brief.md | 重启应用后，已持久化的生图条目仍在视频库图片筛选下可见，readSavedJobs 不因新增 provider 字段丢弃旧条目，persisted jobs 中无 data URL 级 outputUrl。 | 把已登记的 zimage 条目写入 localStorage 后 reload 应用（模拟重启）：登记条目与全部旧条目（含无 provider 的历史条目 seed-old）都仍在 persisted jobs 中，视频库图片筛选下 7 张图片卡片可见，提示词搜索 'restartprobe' 命中该 Z-Image 条目，队列历史首行即该条目；persisted jobs 全文不含 base64/data:image。readSavedJobs 代码核对：展开 {...job} 保留全部旧字段，新增 provider 值不会被丢弃（既有 test-job-persistence 套件亦通过）。 |
| A7 | passed | brief.md | H3-Image 与 Z-Image 工作区无结果时，输出面板占位文案同时提及 MiniMax_first_frames 与 Created Images 两个存储位置。 | 实测两工作区无结果时输出面板占位文案均为『生成后保存到 ComfyUI · MiniMax_first_frames，并留存到 App · Created Images』，同时包含 MiniMax_first_frames 与 Created Images 两个存储位置。 |
| A8 | passed | brief.md | 生成进行中不产生库条目；完成登记不影响工作区现有 result 状态与发送到 MiniMax I2V、发送到 LTX 2.5 按钮行为。 | 生成进行中实测：轮询处于 running 阶段时 persisted jobs 中不含该提示词条目、save 未被调用；完成后 result 正常显示（预览 img 出现、文案 'created-image-mid.png · 1024 × 576'），『发送到 MiniMax I2V』『发送到 LTX 2.5』按钮保持 enabled，点击 I2V 后 App 切到 MiniMax H3 工作区并提示『H3-Image 帧已载入 MiniMax I2V 工作区。』，既有交互未被登记破坏。 |
| A9 | passed | brief.md | 同一条生图 job 在队列视图与视频库显示相同来源标签；H3-Image、Z-Image、FireRed 图片编辑、Ref2VA 静帧各显示对应标签，未知 provider 的图片显示中性兜底标签而非误标。 | 同一批条目在视频库与队列视图显示相同来源标签：H3-Image、Z-Image、FireRed 图片编辑、Ref2VA 静帧（provider=minimax 与无 provider 的历史条目均保持 Ref2VA 静帧）、未知 provider(ltx25)→中性兜底『生成图片』，未误标为 Ref2VA；两处均消费 src/lib/jobPresentation.ts 的 imageSourceLabel 同一映射函数，lightbox 图片 alt 也随来源变化（实测 FireRed 卡片 alt='FireRed 图片编辑'）。 |
| A10 | passed | brief.md | pnpm typecheck 与 pnpm lint 通过；pnpm build:web 通过；pnpm test 链中除 test:locale 外全部套件通过；test:locale 输出 FAIL 计数与 main 基线（47）持平，未新增失败。 | pnpm typecheck、pnpm lint、pnpm build:web 均 exit 0（本人复跑）；Runtime 绑定证据显示其余 26 个套件全通过、test:job-presentation 新套件通过（本人复跑 PASS）；pnpm test:locale 单独运行 exit 1 且摘要行『FAIL: locale audit 在已认领文件发现 47 处问题』，与 main 基线 47 持平，且本次改动的 5 个源文件在 locale 输出中无任何 FAIL 行，未新增失败。 |

## 检查

| 检查 | 命令 | 工作目录 | 状态 | 退出码 | 耗时 |
| --- | --- | --- | --- | ---: | ---: |
| pnpm typecheck | typecheck | . | passed | 0 | 7181 ms |
| pnpm lint | lint | . | passed | 0 | 3574 ms |
| pnpm build:web | build:web | . | passed | 0 | 3791 ms |
| pnpm build:electron | build:electron | . | passed | 0 | 1406 ms |
| pnpm test:navigation | test:navigation | . | passed | 0 | 794 ms |
| pnpm test:scene | test:scene | . | passed | 0 | 912 ms |
| pnpm test:character-library | test:character-library | . | passed | 0 | 816 ms |
| pnpm test:prompt-auto-tags | test:prompt-auto-tags | . | passed | 0 | 801 ms |
| pnpm test:lm-studio-api | test:lm-studio-api | . | passed | 0 | 796 ms |
| pnpm test:llm-stream | test:llm-stream | . | passed | 0 | 805 ms |
| pnpm test:preload-sandbox | test:preload-sandbox | . | passed | 0 | 800 ms |
| pnpm test:workflows | test:workflows | . | passed | 0 | 935 ms |
| pnpm test:h3-image | test:h3-image | . | passed | 0 | 891 ms |
| pnpm test:h3-node-detection | test:h3-node-detection | . | passed | 0 | 790 ms |
| pnpm test:model-inventory | test:model-inventory | . | passed | 0 | 916 ms |
| pnpm test:ltx-ripple | test:ltx-ripple | . | passed | 0 | 894 ms |
| pnpm test:fire-red-edit | test:fire-red-edit | . | passed | 0 | 902 ms |
| pnpm test:continuation | test:continuation | . | passed | 0 | 921 ms |
| pnpm test:atomic-saves | test:atomic-saves | . | passed | 0 | 7709 ms |
| pnpm test:movie-editor | test:movie-editor | . | passed | 0 | 821 ms |
| pnpm test:comfy-cancel | test:comfy-cancel | . | passed | 0 | 853 ms |
| pnpm test:comfy-job-state | test:comfy-job-state | . | passed | 0 | 797 ms |
| pnpm test:live-preview-socket | test:live-preview-socket | . | passed | 0 | 821 ms |
| pnpm test:job-persistence | test:job-persistence | . | passed | 0 | 795 ms |
| pnpm test:job-presentation | test:job-presentation | . | passed | 0 | 804 ms |
| pnpm test:legacy-browser-storage | test:legacy-browser-storage | . | passed | 0 | 832 ms |
| pnpm test:workspace-persistence | test:workspace-persistence | . | passed | 0 | 815 ms |
| pnpm test:music3-vocabulary | test:music3-vocabulary | . | passed | 0 | 801 ms |
| pnpm test:prompt-parity | test:prompt-parity | . | passed | 0 | 981 ms |
| pnpm test:theme | test:theme | . | passed | 0 | 838 ms |

### Builder 报告的证据

以下为 Builder 报告，不等同于 Runtime 检查凭据或独立验收结果。

- pnpm typecheck: passed — src 与 electron tsconfig 均无错误
- pnpm lint: passed — --max-warnings 0 无输出
- pnpm build:web: passed — vite build 成功
- pnpm build:electron: passed — tsc -p tsconfig.electron.json 成功
- pnpm test:job-presentation: passed — 新增套件 PASS
- pnpm test 链（排除 test:locale）: passed — 26 个套件逐个运行均 OK
- pnpm test:locale: passed — 47 处 FAIL，与 main 基线 47 持平，无新增
- renderer DOM 检查（dev:web + Playwright）: passed — 库/队列标签、lightbox alt、文件夹按钮显隐与 showOutput 入参均符合预期
- 已知限制: 未在真实 Electron 窗口连接 ComfyUI 跑端到端生图：登记路径以代码、单测与 renderer DOM（browserMock）实测覆盖；资源管理器实际打开动作只能确认 IPC 参数。
- 已知限制: test:locale 在本分支仍为基线失败（47 处），本 change 不修复；A10 以计数对比为准。
- 已知限制: 注册到 jobs 的条目不经过 queued/running 状态，只在完成后一次性出现（与 brief 一致）。
- 已知限制: 工作区 .gitignore 存在与本需求无关的既有未提交改动（Comet managed 区块被精简），不属于本 change 的实现内容。

## 阻塞项

_无。_

## 风险与跳过的工作

- 未在真实 Electron + ComfyUI 上做端到端生图：登记链路是在 dev:web(browserMock) 上以真实工作区组件 + mock 桥接 API 驱动验证的，资源管理器真实打开动作只确认到 IPC 参数与 electron handler 源码语义；真实 ComfyUI 引擎下的输出节点选择未复核。
- H3-Image 的 width/height 由 job.resolution 字符串拆分得到（'1344x768'→1344/768），若分辨率字符串格式非 'WxH' 会得到 NaN；当前 RenderSize 只产出 'WxH' 格式，未构造异常输入验证。
- 工作树 .gitignore 存在与本需求无关的 Comet 工具改动（Comet managed 忽略区块被精简），由 Comet 建 worktree 时产生，未回退以免破坏 Comet 状态。
- 浏览器验证期间发现另一个并行会话占用 5199 端口并共用同一浏览器上下文写 localStorage，导致首次注入的种子被覆盖；最终改用独立端口 5211 + 独立 isolated context 完成全部观察，5199 进程未触碰。

## 之前的迭代

| 目标周期 | 迭代 | 尝试 | 结果 | 未解决项 | 摘要 | 完成时间 |
| ---: | ---: | ---: | --- | --- | --- | --- |
| 1 | 1 | 0 | recovery | — | Native confirmed acceptance criteria changed | 2026-11-15T05:24:54.309Z |
| 2 | 1 | 1 | pass | — | A1–A10 全部通过。实现与 brief/spec 一致：三个生图工作区在 saveComfyOutputImage 成功后以 mediaUrl(saved.path) 的 minimax-media 短 URL 构造 mediaType=image 的 completed GenerationJob，经 App 侧稳定的 registerCompletedImageJob（useCallback 空依赖 + 按 localOutputPath 幂等）登记，登记不进入轮询 effect 依赖数组。证据覆盖：Z-Image/H3-Image/FireRed 三条登记链路在隔离浏览器上下文中以真实工作区组件 + mock 桥接驱动实测（含 Z-Image 提交时快照语义、保存失败不登记、StrictMode/重渲染幂等、生成中不入库、完成后 result 与发送按钮不受影响）；视频库与队列标签一致、来源兜底正确、文件夹按钮仅对有 localOutputPath 的图片卡片显示且调用 showOutput(localOutputPath)；electron shell:show-output 守卫用真实源码在临时目录执行验证（文件被移走不建同名目录）。命令类检查 typecheck/lint/build:web 通过，test:locale 计数 47 与 main 基线持平且改动文件零新增 FAIL。 | 2026-11-15T09:46:28.759Z |



## 结论

A1–A10 全部通过。实现与 brief/spec 一致：三个生图工作区在 saveComfyOutputImage 成功后以 mediaUrl(saved.path) 的 minimax-media 短 URL 构造 mediaType=image 的 completed GenerationJob，经 App 侧稳定的 registerCompletedImageJob（useCallback 空依赖 + 按 localOutputPath 幂等）登记，登记不进入轮询 effect 依赖数组。证据覆盖：Z-Image/H3-Image/FireRed 三条登记链路在隔离浏览器上下文中以真实工作区组件 + mock 桥接驱动实测（含 Z-Image 提交时快照语义、保存失败不登记、StrictMode/重渲染幂等、生成中不入库、完成后 result 与发送按钮不受影响）；视频库与队列标签一致、来源兜底正确、文件夹按钮仅对有 localOutputPath 的图片卡片显示且调用 showOutput(localOutputPath)；electron shell:show-output 守卫用真实源码在临时目录执行验证（文件被移走不建同名目录）。命令类检查 typecheck/lint/build:web 通过，test:locale 计数 47 与 main 基线持平且改动文件零新增 FAIL。
