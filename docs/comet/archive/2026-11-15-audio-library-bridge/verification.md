---
generated_from_state_version: 12
---

# 验证

## 当前结果

- 结果: **已归档**
- 验证情况: **已完成检查，验证结果已确认**
- 目标周期: 2
- 迭代: 2
- 验证器尝试次数: 1
- 完成时间: 2026-11-15T12:04:12.979Z
- 摘要: 独立只读验收通过：A1-A5 全部 passed，verdict=passed。证据以源码追链 + 127.0.0.1:5173 上 Playwright DOM 实测为主（自建 audio/video/image 种子数据，覆盖三分支媒体筛选、提供方筛选、排序、计数、提示词搜索、灯箱开关、按钮显隐、showOutput 实参与调用栈），并复用 Runtime 已执行的 6 项检查（typecheck/lint/build-web/build-electron/test-job-presentation/test-navigation，均在本候选文件最后修改之后运行）。另补跑 29 个 test:* 套件（除 test:locale）与 scripts/test-continuation-media.cjs 全部通过；唯一失败的 test:photo-edit-electron 不在 pnpm test 链内且需真实 Electron 应用，属环境限制；test:locale 维持 47 处基线失败且失败项不在本 change 改动文件中。发现的问题仅为风险提示：真实 Electron 端到端音频播放未实测、工作区混有上一 change 的改名与无关 .gitignore 改动、brief 描述的 `.library-card audio` 与实现的 `.library-card-audio` 存在等价性偏差。

## 验收

| 编号 | 结果 | 来源 | 验收项 | 原因 |
| --- | --- | --- | --- | --- |
| A1 | passed | brief.md | 用 ACE-Step 或 Music 3 完成一次音频生成后，媒体库默认「全部媒体」视图中出现该音频卡片，卡片上有来源标签（裸标签：Music 3 / ACE-Step，不带「音乐 · 」前缀——前缀仅队列拼接）、时长与内嵌音频播放器（位于卡片 body，媒体区按钮点击开灯箱，播放器不在按钮内）；「媒体」筛选选「音频」只显示音频条目，选「视频」「图片」时音频不出现；全部提供方 + 全部媒体下音频可见。 | 源码：src/components/LibraryView.tsx:21 available 只按 Boolean(job.outputUrl) 过滤（已移除 mediaType!=='audio'）；:22-23 mediaMatches 改三分支（all 全通过 / image 仅 image / audio 仅 audio / video 排除 image 与 audio）；:55 媒体下拉为「全部媒体/视频/图片/音频」。DOM 实测（127.0.0.1:5173 + Playwright，种子含 acestep/music3/无 provider 三个音频 + 1 视频 + 1 图片）：全部媒体下 5 张卡片、计数「5/ 共 5 个素材」；媒体筛选选音频→3 张音频、选视频→1 张视频、选图片→1 张图片，三者互不泄漏；全部提供方下音频可见，音频卡片来源标签为裸标签 ACE-Step / Music 3 / 音乐。入库链路核对：src/App.tsx:2199-2204(acestep)、:2236-2237(music3) 构造 mediaType:'audio' 的 job；:1051/1077 完成分支写 outputUrl 与 localOutputPath；src/lib/workflow.ts:367-397 extractOutputFile 对 mediaType==='audio' 有专门扩展名白名单(flac/wav/mp3/ogg/m4a/aac/opus)，:400-408 extractOutputUrl 产出 minimax-media:// 短 URL。 |
| A2 | passed | brief.md | 音频卡片与灯箱可播放：卡片 body 内嵌播放器与灯箱大播放器的 src 都是该 job 的 `outputUrl`（minimax-media 短 URL），可正常播放、可暂停；卡片 small 行与灯箱 footer 显示「N 秒音频」（不出现「0 × 0 ·」前缀，音频 job 恒 width/height 为 0，该行整体替换）；灯箱 Esc/点击背景可关闭。 | DOM 实测：卡片 body 内 <audio class="library-card-audio" controls preload="metadata" src="minimax-media://local?path=audio%2FACE_Step_1.5_1700000300.flac">，src 与该 job outputUrl 逐字相同，且不在 button.library-card-media 内（媒体按钮内 audio 计数为 0，媒体区只渲染 Music2 占位图标）；点击卡片播放器后 .media-lightbox 不出现（不冒泡开灯箱）。灯箱 .media-lightbox-stage audio 的 src 为同一 outputUrl、controls=true、autoPlay=false、无 video 元素；无 .opening-frame-builder。卡片 small 行为「42 秒音频」「15 秒音频」「60 秒音频」，灯箱 footer 为「42 秒音频」，均无「0 × 0 ·」前缀。Esc 关闭灯箱=true，点击背景关闭=true。播放器样式实测 computed width=369.25px（=body 宽 100%）、height=36px、max-width:none（src/styles/creation-workspaces.css:54-55）。播放能力证据等级：浏览器 mock 环境无 minimax-media 协议处理器，元素 error code 4/ERR_UNKNOWN_URL_SCHEME 属环境限制；传输层源码 electron/main.ts:105-147 localMediaResponse 对 .flac/.mp3 等返回 audio MIME（:99-103）+ accept-ranges + 206 content-range，协议注册见 :149-151，并由 scripts/test-continuation-media.cjs 实跑 PASS（断言 206 / accept-ranges / content-range）。残余风险：未在真实 Electron+ComfyUI 环境做端到端播放实测。 |
| A3 | passed | brief.md | 音频卡片操作区有「打开文件」（新标签页打开 outputUrl）与「在文件夹中显示」（调用 `showOutput(localOutputPath)`，资源管理器定位到 `audio/` 下的留存文件）；`localOutputPath` 缺失的音频条目不显示后者且不报错。 | DOM 实测：有 localOutputPath 的音频卡动作区为 [预览, 打开文件, 在文件夹中显示]；无 localOutputPath 的音频卡为 [预览, 打开文件]，「在文件夹中显示」按钮计数 0，页面无 JS 报错。「打开文件」实测为 <a href="minimax-media://local?path=audio%2FMiniMax_Music3_1700000200.mp3" target="_blank">（新标签页打开 outputUrl）。showOutput 调用以全新页面 + 单层 spy 实测：1 次 DOM click → showOutput 调用 1 次，参数恰为 D:\out\audio\ACE_Step_1.5_1700000300.flac，调用栈为 LibraryView.tsx revealOutput → onClick（此前出现的多计数系我连续多层包裹 spy 的测量假象，已排除）。源码：LibraryView.tsx:44-47 revealOutput 调 window.minimax.showOutput(job.localOutputPath)，:77 渲染条件 (image \|\| audio) && job.localOutputPath。 |
| A4 | passed | brief.md | 音频来源标签与队列一致：媒体库显示裸标签、队列显示「音乐 · <裸标签>」，两处的标签分量来自同一共享映射函数（music3 → 「Music 3」、acestep → 「ACE-Step」、未知或缺失 → 「音乐」，兜底值在队列不拼前缀，避免「音乐 · 音乐」）；提示词搜索对音频条目生效（搜 tags/caption 命中）。 | 共享映射存在且被两处复用：src/lib/jobPresentation.ts:24-28 audioSourceLabel（music3→Music 3、acestep→ACE-Step、其余/缺失→音乐）；LibraryView.tsx:69 用裸标签，JobsView.tsx:60 用同一函数返回值并在标签为兜底值「音乐」时不拼前缀。DOM 实测：媒体库标签 = [ACE-Step, Music 3, 音乐]（裸标签）；同批 job 在队列的 meta = 「音乐 · ACE-Step · 42 秒 · 音频」「音乐 · Music 3 · 15 秒 · 音频」「音乐 · 60 秒 · 音频」（无 provider 的历史条目不出现「音乐 · 音乐」）。提示词搜索实测：搜 tags 只命中 ACE-Step 音频卡、搜 caption 只命中 Music 3 音频卡、搜无关词 0 条。Runtime 检查 test-job-presentation（含 music3/acestep/undefined/ltx25 映射与队列拼接镜像断言）passed。 |
| A5 | passed | brief.md | 排序、计数与既有筛选不回归：音频按 `createdAt` 参与最新/最早排序；工具栏「共 N 个素材」计数包含音频；视频与图片的既有卡片行为（帧书签、RIFE、尾帧参考、图片筛选、来源标签）不变；「MiniMax H3」「LTX 2.5」提供方筛选下音频与既有非 minimax/ltx25 内容一致地不显示。 | 排序与计数 DOM 实测：最早优先顺序 = [视频(…100000), Music 3 音频(…200000), ACE-Step 音频(…300000), 图片(…400000)]，最新优先为其逆序，音频按 createdAt 参与；工具栏「共 N 个素材」=5，含 3 个音频，筛选后显示「N/ 共 M」。既有行为未回归：视频卡仍有「帧书签」按钮与 .library-rife RIFE 区块，其灯箱 footer「1344 × 768 · 5 秒视频」且存在 .opening-frame-builder（尾帧参考未回归）；图片卡灯箱 footer「1344 × 768 · 静态图片」、img alt="Z-Image"、仍有「在文件夹中显示」、无帧书签/RIFE；媒体筛选选图片只出图片。提供方筛选：MiniMax H3→仅剩 minimax 视频卡（音频不显示），LTX 2.5→0 条（音频不显示）。空态：无素材时「完成的视频、图片与音频会自动保存在本设备上」；有素材无匹配时「没有符合这些筛选条件的结果。」+ 清除筛选按钮。回归面：Runtime 6 项检查（typecheck/lint/build-web/build-electron/test-job-presentation/test-navigation）全 passed，日志时间 19:48:50-19:49:07 晚于全部实现文件最后修改时间 19:42:32，与当前候选一致；我另跑 29 个 test:* 套件（跳过 test:locale）28 个通过，仅 test:photo-edit-electron 失败（该套件不在 pnpm test 链内、需真实 Electron 应用，手动执行属环境限制）；locale audit 仍为 47 处基线失败且失败项均不在本 change 改动的文件内。 |

## 检查

| 检查 | 命令 | 工作目录 | 状态 | 退出码 | 耗时 |
| --- | --- | --- | --- | ---: | ---: |
| pnpm typecheck | typecheck | . | passed | 0 | 6959 ms |
| pnpm lint | lint | . | passed | 0 | 3462 ms |
| pnpm build:web | build:web | . | passed | 0 | 3551 ms |
| pnpm build:electron | build:electron | . | passed | 0 | 1408 ms |
| pnpm test:job-presentation | test:job-presentation | . | passed | 0 | 814 ms |
| pnpm test:navigation | test:navigation | . | passed | 0 | 810 ms |

### Builder 报告的证据

以下为 Builder 报告，不等同于 Runtime 检查凭据或独立验收结果。

- pnpm typecheck: passed — src 与 electron tsconfig 均无错误
- pnpm lint: passed — --max-warnings 0 无输出
- pnpm build:web: passed — vite build 成功
- pnpm build:electron: passed — tsc -p tsconfig.electron.json 成功
- pnpm test:job-presentation: passed — 新增音频标签与队列拼接规则断言 PASS
- pnpm test:navigation: passed — 工作区导航与搜索排序回归用例 PASS（本轮修正脚本名后实跑）
- pnpm test 链（排除 test:locale）: passed — 26 个套件逐个运行均 OK
- pnpm test:locale 基线对照: passed — 计数对照通过：47 处 FAIL，与 main 基线 47 持平、未新增；该命令本身仍以非零退出（基线既有失败），故未列入 verification_checks
- renderer DOM 检查（dev:web + Playwright）: passed — 入库、三分支筛选、标签口径、灯箱播放、按钮显隐、搜索命中均符合；过程中发现并修复一处模板字符串转义错误
- 已知限制: 未在真实 Electron + ComfyUI 环境跑完整音乐生成链路：入库链路以代码审查、单元断言与 renderer DOM（browserMock 种子数据）覆盖，真实 ComfyUI 产出的 audio job 沿用既有完成分支（outputUrl/localOutputPath），未实测真实文件播放。
- 已知限制: 本轮工作区同时含上一 change 遗留的媒体库改名改动（未提交）与本 change 的实现，交接按文件区分列明；.gitignore 仍是与本需求无关的既有未提交改动。
- 已知限制: 音频来源标签的中性兜底「音乐」在队列不再拼「音乐 · 」前缀；现状三元无兜底（未知 provider 落「音乐 · ACE-Step」）。现实数据 provider 恒为 acestep/music3（App.tsx:2200/2237），差异仅存在于理论未知值。
- 已知限制: test:locale 在本分支仍为基线失败（47 处），本 change 不修复，以计数对比为准；该命令非零退出，未列入 Runtime 检查计划。
- 已知限制: pnpm test:ui-e2e 需要活的 Vite 服务（开发期 dev:web 在 127.0.0.1:5173 已运行），属一次性外部服务操作，未列入 Runtime 检查计划，改由 renderer DOM 实测覆盖。

## 阻塞项

_无。_

## 风险与跳过的工作

- 未在真实 Electron + ComfyUI 环境跑完整音乐生成链路与真实音频文件播放；A2 的「可播放」由 DOM 结构（src 为 outputUrl、controls、preload=metadata）、协议层源码与 scripts/test-continuation-media.cjs 实跑 PASS 支撑，端到端播放留作残余风险。
- 工作区混有上一 change 的「视频库→媒体库」改名改动（src/lib/workspaceNavigation.ts、src/components/WorkspaceSidebar.tsx、src/lib/workspaceTips.ts、src/App.tsx、src/MobileApp.tsx、scripts/locale-walkthrough.cjs、scripts/test-ui-e2e.cjs、scripts/test-workspace-navigation.cjs，均为纯改名）与本 change 实现（src/components/LibraryView.tsx、src/components/JobsView.tsx、src/lib/jobPresentation.ts、src/styles/creation-workspaces.css、scripts/test-job-presentation.cjs）；.gitignore 为与本需求无关的既有未提交改动，且移除了若干 Comet 运行时忽略规则（如 **/comet/changes/*/runtime、**/.comet/checks），归档提交前需确认归属。
- brief 与 spec 写的是新增 `.library-card audio` 规则，实现改为类选择器 `.library-card-audio`（src/styles/creation-workspaces.css:54-55）。功能等价且实测生效（width=容器 100%、height=36px、max-width:none），但与文字描述存在偏差。
- 队列对 provider 缺失/未知的音频条目现在显示「音乐 · N 秒 · 音频」（原实现一律「音乐 · ACE-Step」），这是 spec §3 明确记录并接受的差异。

## 之前的迭代

| 目标周期 | 迭代 | 尝试 | 结果 | 未解决项 | 摘要 | 完成时间 |
| ---: | ---: | ---: | --- | --- | --- | --- |
| 1 | 0 | 0 | recovery | — | Native confirmed acceptance criteria changed | 2026-11-15T11:34:28.956Z |
| 2 | 1 | 0 | recovery | — | Builder handoff Runtime checks failed: test-workspace-navigation | 2026-11-15T11:47:47.620Z |
| 2 | 2 | 1 | pass | — | 独立只读验收通过：A1-A5 全部 passed，verdict=passed。证据以源码追链 + 127.0.0.1:5173 上 Playwright DOM 实测为主（自建 audio/video/image 种子数据，覆盖三分支媒体筛选、提供方筛选、排序、计数、提示词搜索、灯箱开关、按钮显隐、showOutput 实参与调用栈），并复用 Runtime 已执行的 6 项检查（typecheck/lint/build-web/build-electron/test-job-presentation/test-navigation，均在本候选文件最后修改之后运行）。另补跑 29 个 test:* 套件（除 test:locale）与 scripts/test-continuation-media.cjs 全部通过；唯一失败的 test:photo-edit-electron 不在 pnpm test 链内且需真实 Electron 应用，属环境限制；test:locale 维持 47 处基线失败且失败项不在本 change 改动文件中。发现的问题仅为风险提示：真实 Electron 端到端音频播放未实测、工作区混有上一 change 的改名与无关 .gitignore 改动、brief 描述的 `.library-card audio` 与实现的 `.library-card-audio` 存在等价性偏差。 | 2026-11-15T12:04:12.979Z |



## 结论

独立只读验收通过：A1-A5 全部 passed，verdict=passed。证据以源码追链 + 127.0.0.1:5173 上 Playwright DOM 实测为主（自建 audio/video/image 种子数据，覆盖三分支媒体筛选、提供方筛选、排序、计数、提示词搜索、灯箱开关、按钮显隐、showOutput 实参与调用栈），并复用 Runtime 已执行的 6 项检查（typecheck/lint/build-web/build-electron/test-job-presentation/test-navigation，均在本候选文件最后修改之后运行）。另补跑 29 个 test:* 套件（除 test:locale）与 scripts/test-continuation-media.cjs 全部通过；唯一失败的 test:photo-edit-electron 不在 pnpm test 链内且需真实 Electron 应用，属环境限制；test:locale 维持 47 处基线失败且失败项不在本 change 改动文件中。发现的问题仅为风险提示：真实 Electron 端到端音频播放未实测、工作区混有上一 change 的改名与无关 .gitignore 改动、brief 描述的 `.library-card audio` 与实现的 `.library-card-audio` 存在等价性偏差。
