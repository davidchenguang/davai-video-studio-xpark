---
generated_from_state_version: 15
---

# 验证

## 当前结果

- 结果: **已归档**
- 验证情况: **已完成检查，验证结果已确认**
- 目标周期: 4
- 迭代: 1
- 验证器尝试次数: 1
- 完成时间: 2026-11-16T13:17:03.229Z
- 摘要: 13/13 通过。删除闭环实现与 spec 对齐：主进程自派生双可信根（settings.outputDirectory + ComfyUI 上报 --output-directory），relative/isAbsolute/realpath 全量预检后逐文件 shell.trashItem（recycled/missing/failed 语义），缩略图 .jpg 限 userData/video-thumbnails；五类引用检测含续接链（sourceJobId 父节点、尾节拍 scriptId）与 URL 归一化，key 缺失=无引用、坏数据 fail-closed 可重试；成功后绕过防抖立即 persist 再 setJobs，失败保留记录。Runtime 检查（typecheck/lint/build/test-media-deletion 等 7 项）全部 passed 且 test-media-deletion 已由本 Verifier 当场独立复跑通过。

## 验收

| 编号 | 结果 | 来源 | 验收项 | 原因 |
| --- | --- | --- | --- | --- |
| A1 | passed | brief.md | 删除本地图片：在媒体库图片卡片点击删除并确认后，文件进入系统回收站，卡片立即从媒体库消失，队列历史不再出现，重启应用后不恢复。 | LibraryView.tsx:24 仅 completed 且有 outputUrl 的 job 有卡片与删除按钮（:108）；确认后 App.tsx:1735 经 media:delete 调 mediaDeletion.ts:150 shell.trashItem 回收；App.tsx:1744 先 persist('minimax.jobs', next.slice(0,100).map(compactJob)) 再 setJobs 移除（:1745），重启后 readSavedJobs 读不到该记录，不复活。 |
| A2 | passed | brief.md | 删除视频清理缓存与派生文件：删除一条视频后，其缩略图缓存被清理；若该 job 有位于可信输出目录内的 latent/分段输出文件，也一并移入回收站；媒体库与队列历史中都不再出现该条目。 | App.tsx:1732 files 含 latentPath/segmentOutputPath；thumbnailCachePath（libraryReferences.ts:167-176）只解析 minimax-media://thumbnail?path=；main.ts:1928 thumbnailRoot=userData/video-thumbnails；mediaDeletion.ts:136-141 校验 .jpg 且位于缓存根、:157-164 unlink 成功置 thumbnailRemoved=true；test-media-deletion.cjs:114-117 断言。 |
| A3 | passed | brief.md | 取消删除：在确认对话框选择取消，文件、媒体库条目、队列历史均保持不变。 | LibraryView.tsx:65-68 window.confirm 返回 false 直接 return：不调用 IPC、不置 busy、不改任何状态，文件/缓存/媒体库/队列历史均不变。 |
| A4 | passed | brief.md | 被影片项目引用时阻止：删除被任一影片项目的片段引用（`job-<id>` 或归一化后相同的 `source`）的资产时，删除被阻止，界面列出所在影片项目名称；资产与文件保持不变。 | libraryReferences.ts:86-97 匹配 clips[].assetId===`job-${id}` 与 sourceMatchesJob（:48-58 覆盖 outputUrl 直等、playableOutputUrl 归一化、minimax-media path 参数对齐 localOutputPath）；MovieEditor.tsx:50 素材池实际写入 id=`job-${job.id}`、source=job.outputUrl，形态对齐；命中时 LibraryView.tsx:60-62 显示阻止对话框且不调用 IPC；test-media-deletion.cjs:160-163。 |
| A5 | passed | brief.md | 被续接脚本、帧书签、角色/地点引用时阻止：删除被续接脚本 `sourceJobId`、帧书签项目或角色/地点漫游视频引用的资产时，删除被阻止并列出引用位置；资产与文件保持不变。 | libraryReferences.ts:111 续接脚本 sourceJobId、:124-135 帧书签 id/归一化 source、:137-148 角色 turntableVideo.path、:150-161 地点 walkthroughVideo.path；写入侧 App.tsx:265/270 path=localOutput ?? outputUrl，与匹配规则对齐；test-media-deletion.cjs:166-187 五类断言；命中即阻止对话框、不调 IPC。 |
| A6 | passed | brief.md | 远程资产：本机无 `localOutputPath` 的远程渲染条目删除后，jobs 记录与缩略图缓存被移除，界面明确提示远端 ComfyUI 上的文件未被删除。 | App.tsx:1733 remote=!job.localOutputPath；空 files 被主进程接受并返回空结果（mediaDeletion.ts 无文件即跳过执行，test-media-deletion.cjs:88-89）；成功提示「已移除本地记录；远端 ComfyUI 上的文件未被删除。」（App.tsx:1750）；确认文案区分远程（LibraryView.tsx:65-67）；缩略图缓存仍按传入路径清理。 |
| A7 | passed | brief.md | 越界路径拒绝：渲染层请求删除两个可信输出目录之外的文件时，主进程拒绝并返回明确错误，文件不受影响。 | mediaDeletion.ts:69-87 validateInput（≤8 项 mediaDeletion.ts:73、绝对路径 :77）、:124-132 所有文件校验先于执行、:136-141 缩略图根外/非 .jpg/realpath 逃逸全拒；拒绝时零文件处理（test-media-deletion.cjs rejected() 断言 calls.trash.length===0）；ComfyUI 未连接场景文案单独区分（mediaDeletion.ts:120-122）。 |
| A8 | passed | brief.md | 文件已不存在：删除已从磁盘消失的本机资产时，回收站动作安全跳过，记录与缓存被移除，界面说明文件已不存在；操作不报致命错误。 | mediaDeletion.ts:144-147 exists=false 计入 missing 不抛错；App.tsx:1747-1751 allMissing 分支提示「文件已不存在，已移除记录。」并移除记录；缩略图按传入路径清理（test-media-deletion.cjs:97-101、123-124）。 |
| A9 | passed | brief.md | 回收站操作失败（含部分成功）：任一本机文件 `shell.trashItem` 失败时，jobs 记录与媒体库条目保持不变，界面如实提示已移动数量、失败文件与原因并允许重试；重试只处理剩余文件，不重复处理已回收文件。 | mediaDeletion.ts:149-154 单文件 trashItem 失败入 failed 不中断其余（test-media-deletion.cjs:104-111）；App.tsx:1736-1740 failed 非空时不 persist、不 setJobs，提示已移动数量/失败文件与原因并保留记录；finally 恢复按钮（LibraryView.tsx:71）；重试时已回收文件 exists=false 归入 missing，不会重复 trash（mediaDeletion.ts:145-147）。 |
| A10 | passed | brief.md | 删除音频：媒体库音频卡片删除后，文件进入回收站、卡片与队列历史消失，音频控件不再引用该文件。 | 删除按钮渲染于全部 available 卡片（LibraryView.tsx:108），音频 job 的 localOutputPath 经同一 IPC 回收；jobs 移除后音频卡片（含 <audio> 元素 :102）不再渲染、队列历史同步消失；灯箱删除先 setLightbox(null) 卸载音频元素再延时调 IPC（LibraryView.tsx:76-78）。 |
| A11 | passed | brief.md | 便携版/自定义输出目录：ComfyUI 上报 `--output-directory` 且与 `settings.outputDirectory` 不同时，位于该目录内的资产仍可正常删除（主进程派生可信根，不因单根判定误拒）。 | main.ts:881-895 trustedMediaOutputRoots 同时派生 settings.outputDirectory 与 /system_stats 上报的 --output-directory（复用 observedComfyOutput 600s 缓存、去重）；mediaDeletion.ts:125 多根 some() 判定；test-media-deletion.cjs:79-82 断言第二根内文件正常回收，不因单根误拒。 |
| A12 | passed | brief.md | 续接节拍链引用阻止：删除作为续接节拍链节点的 job（被子 job 的 `continuation.sourceJobId` 指向，或被删 job 自身的 `continuation.scriptId` 属于已存续接脚本）时，删除被阻止并提示续接脚本名称与节拍位置；文件与记录保持不变。 | libraryReferences.ts:118-122 其他 job 的 continuation.sourceJobId===job.id 即阻止（不依赖脚本存储可读，:116-117 注释明确）；:111-112 待删 job 自身 continuation.scriptId 命中已存脚本（含无子节点尾节拍）；标签为「续接脚本「<名>」的节拍」，脚本不可得时「续接节拍（子节点 job）」（:121）；test-media-deletion.cjs:175-183。 |
| A13 | passed | brief.md | 引用数据不可读时 fail-closed：任一引用存储 key 存在但 JSON 无法解析或结构无效时，删除被阻止并提示「无法读取〈对应数据〉，为避免误删已取消」，提供重试；key 缺失视为无引用。 | libraryReferences.ts:27-35 readStore 三态：key 缺失=missing 视为无引用；JSON 解析失败或顶层结构无效（:84/:105/:127/:140/:152）→ unreadable fail-closed；坏元素只跳过不判整体失败；LibraryView.tsx:60-62、115 显示「无法读取…，为避免误删已取消删除。」并提供重试（重试重走 requestDelete）；test-media-deletion.cjs:196-211 断言五类存储的坏 JSON 与坏形状。 |

## 检查

| 检查 | 命令 | 工作目录 | 状态 | 退出码 | 耗时 |
| --- | --- | --- | --- | ---: | ---: |
| pnpm typecheck | typecheck | . | passed | 0 | 7749 ms |
| pnpm lint | lint | . | passed | 0 | 3739 ms |
| pnpm build:web | build:web | . | passed | 0 | 3446 ms |
| pnpm build:electron | build:electron | . | passed | 0 | 1412 ms |
| pnpm test:media-deletion | test:media-deletion | . | passed | 0 | 818 ms |
| pnpm test:continuation | test:continuation | . | passed | 0 | 890 ms |
| pnpm test:movie-editor | test:movie-editor | . | passed | 0 | 823 ms |
| pnpm test:workspace-persistence | test:workspace-persistence | . | passed | 0 | 818 ms |

### Builder 报告的证据

以下为 Builder 报告，不等同于 Runtime 检查凭据或独立验收结果。

- pnpm typecheck: passed — src 与 electron tsconfig 均无错误
- pnpm lint: passed — --max-warnings 0 无输出
- pnpm build:web: passed — vite build 成功
- pnpm build:electron: passed — tsc -p tsconfig.electron.json 成功
- pnpm test:media-deletion: passed — 新增套件覆盖路径边界、逐文件结果、缩略图清理与五类引用检测；PASS
- pnpm test（截至 test:locale 前的全部套件）: passed — 链式执行到 test:locale 前全部通过，包含新增 test:media-deletion
- pnpm test:locale（基线核对）: failed — 仍为既有基线 42 处 FAIL（与 main 记录一致）；对 LibraryView/libraryReferences/App.tsx 的审计输出 grep 后仅见既有 App.tsx:3131 Ctrl+F，本 change 未新增问题
- 已知限制: 未在真实 Electron + ComfyUI 环境端到端实测 shell.trashItem：回收站/文件占用/网络盘行为由注入依赖的单元测试与 Electron 34 API 语义覆盖；从灯箱删除时先 setLightbox(null) 并用 setTimeout(0) 等到 React 提交后再调用 IPC，Windows 媒体句柄释放行为未实机复验。
- 已知限制: 本机媒体文件与 latentPath/segmentOutputPath 必须全部位于可信根内（spec 第 5 节 all-or-nothing）；若历史数据存在根外派生路径，整个删除请求会被拒绝，不会部分删除。
- 已知限制: test:locale 在本分支仍为既有基线失败（42 处，非零退出），未列入 Runtime 检查计划；本 change 改动文件未新增 locale 问题。
- 已知限制: 工作区存在与本需求无关的既有 .gitignore 修改（Comet 托管忽略段被删），本 change 未触碰，归档时保留。

## 阻塞项

_无。_

## 风险与跳过的工作

- realpath 复核以词法根比较真实路径：若可信根本身是 junction/符号链接，realpath(candidate) 解析出的真实路径会落在词法边界外而被误拒（低概率配置场景，测试未覆盖根为链接的情形）。
- shell.trashItem 与灯箱预览锁（setLightbox(null)+setTimeout(0) 后调 IPC）未在真实 Electron/Windows 实机验证；brief 的 Verification expectations 本就声明该项需手工验证，属已知限制而非实现缺口。
- persist 失败（localStorage 配额/不可写）时 deleteMediaJob 仍移除 UI 记录且未特判 persist 返回值，依赖全局 failedKeys 重试提示兜底；该极端窗口内记录可能复活，沿用既有持久化容错机制。
- ComfyUI 离线且 600s 缓存过期时，位于其上报输出目录的资产删除会被「ComfyUI 未连接」文案拒绝，用户需连上 ComfyUI 才能删此类资产（spec 第 5 节既定语义）。
- 影片编辑器独立窗口的素材池仅在下次加载/storage 事件时同步，删除后另一窗口可能短暂显示陈旧条目（spec 第 9 节行为，不在本次 13 项 acceptance 内）。

## 之前的迭代

| 目标周期 | 迭代 | 尝试 | 结果 | 未解决项 | 摘要 | 完成时间 |
| ---: | ---: | ---: | --- | --- | --- | --- |
| 1 | 0 | 0 | recovery | — | Native confirmed acceptance criteria changed | 2026-11-16T12:41:39.706Z |
| 2 | 0 | 0 | recovery | — | Native confirmed acceptance criteria changed | 2026-11-16T12:48:23.660Z |
| 3 | 1 | 0 | recovery | — | Native confirmed acceptance criteria changed | 2026-11-16T13:02:43.065Z |
| 4 | 1 | 1 | pass | — | 13/13 通过。删除闭环实现与 spec 对齐：主进程自派生双可信根（settings.outputDirectory + ComfyUI 上报 --output-directory），relative/isAbsolute/realpath 全量预检后逐文件 shell.trashItem（recycled/missing/failed 语义），缩略图 .jpg 限 userData/video-thumbnails；五类引用检测含续接链（sourceJobId 父节点、尾节拍 scriptId）与 URL 归一化，key 缺失=无引用、坏数据 fail-closed 可重试；成功后绕过防抖立即 persist 再 setJobs，失败保留记录。Runtime 检查（typecheck/lint/build/test-media-deletion 等 7 项）全部 passed 且 test-media-deletion 已由本 Verifier 当场独立复跑通过。 | 2026-11-16T13:17:03.229Z |



## 结论

13/13 通过。删除闭环实现与 spec 对齐：主进程自派生双可信根（settings.outputDirectory + ComfyUI 上报 --output-directory），relative/isAbsolute/realpath 全量预检后逐文件 shell.trashItem（recycled/missing/failed 语义），缩略图 .jpg 限 userData/video-thumbnails；五类引用检测含续接链（sourceJobId 父节点、尾节拍 scriptId）与 URL 归一化，key 缺失=无引用、坏数据 fail-closed 可重试；成功后绕过防抖立即 persist 再 setJobs，失败保留记录。Runtime 检查（typecheck/lint/build/test-media-deletion 等 7 项）全部 passed 且 test-media-deletion 已由本 Verifier 当场独立复跑通过。
