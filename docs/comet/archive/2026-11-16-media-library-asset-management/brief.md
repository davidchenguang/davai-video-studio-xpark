# 目标

媒体库（音频、图片、视频）具备真正的资产删除能力，形成“查看—回收空间”的完整管理闭环：

- 用户在媒体库删除单条资产后，该资产从媒体库与队列历史中同时消失。
- 磁盘上的媒体文件被移入系统回收站（可恢复性由平台/文件系统决定）；该 job 自有的派生文件（缩略图缓存、latent、分段输出）一并清理。
- 被其他功能引用（影片项目片段、续接脚本与续接节拍链、帧书签、角色/地点漫游视频）的资产在删除前被阻止，并提示引用位置；引用数据无法读取时 fail-closed。
- 远程 ComfyUI 输出（本机无文件）删除时只移除本地记录与缓存，并明确告知远端文件未被删除。

现状事实（已当场核实）：

- 媒体库是 jobs 历史的视图（`src/components/LibraryView.tsx`），数据源为 localStorage `minimax.jobs`（`src/lib/jobPersistence.ts`，最多 100 条）；`compactJob` 保留 `localOutputPath`/`latentPath`/`segmentOutputPath`/`thumbnailUrl`。
- 队列视图的「移除」只过滤记录，文件保留在磁盘上（`src/App.tsx:1723-1728`）。
- 全项目没有任何面向用户的文件删除 IPC；`electron/preload.ts` 未暴露删除能力。
- **输出目录不是单一根**：`activeOutputDirectory = status.detectedOutputDirectory?.trim() || settings.outputDirectory`（`src/App.tsx:372`），`trustedComfyOutputDirectory` 接受 settings 输出目录或 ComfyUI `/system_stats` 报出的 `--output-directory`（`electron/main.ts:862-873`）。因此 `localOutputPath`/`latentPath`/`segmentOutputPath` 可以合法地位于 `settings.outputDirectory` 之外（便携版/自定义 `--output-directory`）。
- `minimax-media://` 协议 `?path=` 的判定（`electron/main.ts:1202-1205`）硬编码 Windows 分隔符 `\\`，不能作为跨平台复用依据；同文件 thumbnail 分支（1194-1195）的 `relative` + `isAbsolute` 写法才是正确范式。
- 视频缩略图缓存在 `userData/video-thumbnails/<sha256>.jpg`，key 由 “路径 + size + mtime” 计算（`electron/main.ts:1733-1760`），媒体文件删除后会成为孤儿。
- Electron 版本为 ^34.0.0，`shell.trashItem` 可用。
- 引用存储：影片项目 `minimax.movie-editor-projects`（片段的 `assetId === 'job-<id>'`，`source` 可能为旧原始 URL）；续接脚本 `oyama.continue.script.v1`（`sourceJobId` 仅标识脚本首段）；续接节拍 job 的 `continuation.sourceJobId`/`scriptId`/`beatId`（`src/App.tsx:2736`、`ContinueWorkspace.tsx:169`）；**motion latent 是提交期从父 job 的 latent 派生后写入 `GenerationOptions.motionContext`（`src/types.ts:351`、`src/App.tsx:2482`）的运行时参数，不落盘到 `GenerationJob`，持久化层只保留 `continuation.sourceJobId` 这条父子引用**；帧书签 `minimax.frame-bookmarks`（`id === 'job-<id>'`，`source`）；角色项目 `minimax.character-projects`（`turntableVideo.path`）；地点项目 `minimax.location-projects`（`walkthroughVideo.path`）。
- jobs 持久化有 1200ms 防抖（`src/App.tsx:879-884`），删除后必须立即持久化，否则崩溃窗口内记录会复活。
- 测试加载器 `scripts/test-ts-loader.cjs:15` 对非相对 import 直接走 Node `require`，测试模块不得在顶层引入 `electron`；`test:locale` 位于 test 链末端附近且当前基线失败，新套件必须注册在它之前。
- LAN 手机端全工作室页面运行在 `browserMock` 下，没有真实文件权限；LAN 服务没有删除端点。
- 影片编辑器是独立 BrowserWindow，共享同一 session/localStorage；`storage` 事件可同步。

# 范围

## 目录结构

### 新建

- `electron/mediaDeletion.ts` — 零 Electron 依赖的删除纯逻辑：可信根归一化与 `relative` 边界判定、待处理文件清单校验、per-file 结果汇总、缩略图缓存路径校验与清理决策；外部副作用（`trashItem`/`stat`/`realpath`/`unlink`）通过参数注入。
- `scripts/test-media-deletion.cjs` — 使用 `scripts/test-ts-loader.cjs` 加载真实模块，覆盖：输出目录内/外、大小写与分隔符、目录本身与 `..` 逃逸、realpath 逃逸、空 `files`、路径数量上限、部分缺失、per-file 失败聚合、缩略图缓存路径边界。

### 修改

- `electron/main.ts` — 注册 `media:delete` IPC：由主进程自行派生可信根（`settings.outputDirectory` + ComfyUI `/system_stats` 上报的 `--output-directory`，复用 `observedComfyOutput` 的缓存语义），不接收渲染层 root；调用 `mediaDeletion` 校验后执行 `shell.trashItem`/缓存 `unlink`，返回 per-file 结果。
- `electron/preload.ts` — 暴露 `deleteMedia` 桥接方法。
- `src/types.ts` — `DesktopApi` 增加 `deleteMedia` 签名与返回类型。
- `src/components/LibraryView.tsx` — 卡片与预览灯箱删除入口、引用检测结果展示、确认、删除中/失败状态与反馈；删除前关闭灯箱并暂停预览。
- `src/App.tsx` — 删除成功后同步移除 job 记录并**立即**持久化（绕过 1200ms 防抖）。
- `src/browserMock.ts` — 增加 `deleteMedia` mock，明确抛错不返回假成功。
- `src/styles/creation-workspaces.css` — 媒体库删除按钮的布局与危险态样式。
- `src/workspace-audit.css` — `.studio-shell-active .library-card-actions` 由 2 列网格调整为容纳删除按钮（删除按钮独占整行 `grid-column: 1 / -1`）。
- `package.json` — 注册 `test:media-deletion`，插入 `test` 链中 `test:locale` 之前。

### 删除

无

### 明确不建

- 不新建独立的媒体文件扫描/索引层 — 媒体库继续以 jobs 历史为唯一事实源。
- 不新建 LAN 删除端点 — 手机端全工作室运行在 browserMock 下无真实文件权限。
- 不建回收站管理 UI — 恢复交给系统回收站。
- 不建引用索引服务 — 引用检测在渲染层按既有 localStorage 存储结构即时读取，失败时 fail-closed。
- 不引入第三方模态组件 — 引用阻止列表复用媒体库现有模态/灯箱样式渲染，二段确认沿用 `window.confirm`。
- 不在本 change 修 `main.ts:1204` 的既有跨平台判定 bug — 删除实现使用独立的 `relative` 判定，不与其耦合；该 bug 另行跟进。

# 非目标

- 不做文件夹浏览器式管理（重命名、移动、导入到输出目录）。
- 不删除其他机器上 ComfyUI 的文件；远程资产只处理本地记录与缓存。
- 移动端/LAN 全工作室没有真实删除能力：删除操作由浏览器 mock 明确报错，不产生假成功。
- 不做批量删除、磁盘占用盘点与多选操作。
- 不删除 job 的输入素材（`referenceAssets` / `referenceFiles` 指向的用户上传文件）与已抽取的独立参考帧文件。
- 不保证回收站在所有平台/文件系统上可恢复（网络盘、FAT 移动介质可能永久删除或失败，按真实结果上报）。

# 验收示例

- 删除本地图片：在媒体库图片卡片点击删除并确认后，文件进入系统回收站，卡片立即从媒体库消失，队列历史不再出现，重启应用后不恢复。
- 删除视频清理缓存与派生文件：删除一条视频后，其缩略图缓存被清理；若该 job 有位于可信输出目录内的 latent/分段输出文件，也一并移入回收站；媒体库与队列历史中都不再出现该条目。
- 取消删除：在确认对话框选择取消，文件、媒体库条目、队列历史均保持不变。
- 被影片项目引用时阻止：删除被任一影片项目的片段引用（`job-<id>` 或归一化后相同的 `source`）的资产时，删除被阻止，界面列出所在影片项目名称；资产与文件保持不变。
- 被续接脚本、帧书签、角色/地点引用时阻止：删除被续接脚本 `sourceJobId`、帧书签项目或角色/地点漫游视频引用的资产时，删除被阻止并列出引用位置；资产与文件保持不变。
- 远程资产：本机无 `localOutputPath` 的远程渲染条目删除后，jobs 记录与缩略图缓存被移除，界面明确提示远端 ComfyUI 上的文件未被删除。
- 越界路径拒绝：渲染层请求删除两个可信输出目录之外的文件时，主进程拒绝并返回明确错误，文件不受影响。
- 文件已不存在：删除已从磁盘消失的本机资产时，回收站动作安全跳过，记录与缓存被移除，界面说明文件已不存在；操作不报致命错误。
- 回收站操作失败（含部分成功）：任一本机文件 `shell.trashItem` 失败时，jobs 记录与媒体库条目保持不变，界面如实提示已移动数量、失败文件与原因并允许重试；重试只处理剩余文件，不重复处理已回收文件。
- 删除音频：媒体库音频卡片删除后，文件进入回收站、卡片与队列历史消失，音频控件不再引用该文件。
- 便携版/自定义输出目录：ComfyUI 上报 `--output-directory` 且与 `settings.outputDirectory` 不同时，位于该目录内的资产仍可正常删除（主进程派生可信根，不因单根判定误拒）。
- 续接节拍链引用阻止：删除作为续接节拍链节点的 job（被子 job 的 `continuation.sourceJobId` 指向，或被删 job 自身的 `continuation.scriptId` 属于已存续接脚本）时，删除被阻止并提示续接脚本名称与节拍位置；文件与记录保持不变。
- 引用数据不可读时 fail-closed：任一引用存储 key 存在但 JSON 无法解析或结构无效时，删除被阻止并提示「无法读取〈对应数据〉，为避免误删已取消」，提供重试；key 缺失视为无引用。

# Decisions

- Q1（用户已确认）：删除把媒体文件移入系统回收站并移除 jobs 记录；不做永久 `unlink`，不保留“已删除”占位记录。
- Q2（用户已确认）：删除前检测引用；存在引用时阻止删除并列出引用位置，不提供强制删除入口。
- Q3（用户已确认）：远程资产（无本地文件）只移除记录与缩略图缓存，界面明确提示远端文件未删除。
- Q4（用户已确认）：本次范围仅单条删除最小闭环（卡片与灯箱），不含批量删除与占用盘点。
- **可信根由主进程派生**：主进程允许删除的根为 `settings.outputDirectory` 与 ComfyUI `/system_stats` 上报的 `--output-directory`（复用 `observedComfyOutput` 缓存），渲染层只传文件路径、绝不传 root。两个根都不可达 → 拒绝。
- **边界判定用 `relative`**：`relative(root, candidate)` 空 child（目录本身）、`..` 前缀或 `isAbsolute` 一律拒绝；Win32/darwin 归一化后大小写不敏感；目标存在时用 `realpath` 复核真实路径仍在根内，阻止符号链接逃逸。
- **引用检测覆盖续接链**：(a) 脚本 `sourceJobId === job.id`；(b) 任一其他 job 的 `continuation.sourceJobId === job.id`（节拍链父节点）；(c) 待删 job 自身的 `continuation.scriptId` 命中已存续接脚本 id（该 job 是该脚本的任一节拍，含无子节点的尾节拍）。**不匹配 latentPath**：`motionContext.latentPath` 只存在于提交期 `GenerationOptions`，不落盘到 job，持久化层无法据此检测；父子 latent 依赖已由 (b) 的 `sourceJobId` 覆盖。来源标签注明「续接脚本「<videoName>」的节拍」。
- **引用容错改为 fail-closed**：key 缺失 = 无引用；key 存在但 JSON 解析失败或顶层结构无效 = 阻止删除并提示无法读取，提供重试。数组元素缺字段只跳过该元素（该元素无法构成有效引用），不算整体失败。
- **URL 归一化比较**：影片/帧书签的 `source` 与角色/地点的 `path` 先用 `playableOutputUrl()` 归一化，再与 `job.outputUrl` 比较；同时解析 `minimax-media://` 的 `path`/`url` 参数与 `localOutputPath` 对齐，避免旧原始 URL 漏判。
- **删除顺序与结果语义**：主进程先完成全部路径校验（任一非法 → 整体拒绝、零文件处理）；执行阶段逐文件收集 `recycled`/`missing`/`failed[{path,reason}]`，单个失败不中断其余文件；`failed.length > 0` 时渲染层视为失败、保留记录，提示真实状态，重试只处理剩余文件。缩略图 `unlink` 失败为非致命，`thumbnailRemoved: false`。
- **文件数量上限**：`files` 去重、必须为绝对路径、最多 8 项；超限或含相对路径 → 整体拒绝（防篡改调用）。
- **任一本机文件被拒 → 整体拒绝**，绝不静默降级为“远程只删记录”。
- **缩略图路径由渲染层传入**：从 `job.thumbnailUrl` 的 `path` 参数解析；主进程校验其位于 `userData/video-thumbnails` 内且为 `.jpg`。该缓存可再生，直接 `unlink`，不进入回收站。
- **删除后立即持久化**：成功后直接写入 `minimax.jobs`（绕过 1200ms 防抖），必须复用既有持久化形态 `slice(0, 100).map(compactJob)`（与 `App.tsx:875/883` 相同），避免 preview 字段膨胀并维持 100 条上限；再更新 state，保证崩溃窗口内记录不复活。
- **预览锁**：灯箱删除在调用 IPC 前先关闭灯箱/暂停播放；失败文案提示「关闭预览后重试」。
- 只清理 job 自有的派生文件（latent、`segmentOutputPath`）；不删除输入素材与独立参考帧。
- 浏览器 mock 的 `deleteMedia` 直接抛错，不返回成功。

# Verification expectations

- `node scripts/test-media-deletion.cjs` 必须通过；`test:media-deletion` 注册在 `test:locale` 之前。
- `pnpm typecheck`、`pnpm lint`、`pnpm build:web`、`pnpm build:electron` 必须通过。
- 已知基线：`pnpm test` 在 main 上会于 `scripts/locale-audit.cjs` 处报 42 处 locale 问题并中断，不能把该基线失败计为本次实现失败；需单独运行受影响的套件补足证据。
- 回收站行为与灯箱预览锁需在真实 Electron 应用中手工验证（无法在纯 Node 测试中覆盖 `shell.trashItem`）。
- 便携版/自定义输出目录场景需用 `detectedOutputDirectory` 与 `settings.outputDirectory` 不同的配置手工验证一次。