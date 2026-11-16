# 媒体库资产删除与完整管理（media-library-asset-management）

## Capability

`media-library-asset-management` — 媒体库中的音频、图片、视频资产支持单条删除：本机媒体文件进入系统回收站（可恢复性由平台/文件系统决定），同一条 jobs 记录从媒体库与队列历史中同步移除，该 job 自有的缩略图缓存、latent 与分段输出一并清理；被影片项目、续接脚本与续接节拍链、帧书签、角色/地点漫游视频引用的资产在删除前被阻止并提示引用位置；引用数据无法读取时 fail-closed；远程 ComfyUI 资产删除时只移除本地记录与缓存并明确提示。

## 完整行为规格

### 1. 删除入口

媒体库为**已完成的单条资产**提供删除入口：

- 卡片：`library-card-actions` 内新增危险态「删除」按钮（`Trash2` 图标 + 文案「删除」），对 `mediaType` 为 `video`、`image`、`audio` 且 `status === 'completed'`、存在 `outputUrl` 的 job 显示。
- 预览灯箱：footer 操作区显示同一删除按钮，作用于当前预览的 job。
- 布局：删除按钮独占一整行（`.studio-shell-active .library-card-actions` 中 `grid-column: 1 / -1`），不压缩既有「预览 / 帮助 / 打开文件 / 在文件夹中显示」按钮。
- 进行中（`queued` / `running`）或非完成状态的 job 不显示删除入口。
- 删除进行中：仅该 job 的按钮禁用并显示 spinner；其他卡片的删除不受影响。
- 删除按钮复用现有 `.danger-button` 视觉语义。

### 2. 引用检测与阻止

删除前，渲染层读取既有 localStorage 引用存储，判断是否有其他功能仍在引用该资产。匹配任一即视为被引用：

| 引用来源 | 数据位置 | 匹配规则 | 提示标签 |
| --- | --- | --- | --- |
| 影片项目片段 | `minimax.movie-editor-projects` | 任一 project.clips[].assetId === `job-<job.id>`；或归一化后的 clips[].source 与 job.outputUrl/`localOutputPath` 对齐 | 影片项目「<name>」 |
| 续接脚本首段 | `oyama.continue.script.v1` | sourceJobId === job.id | 续接脚本「<videoName>」 |
| 续接节拍链 | jobs 中的其他 job | 其他 job 的 continuation.sourceJobId === job.id（待删 job 是节拍链父节点） | 续接脚本「<videoName>」的节拍；脚本不可得时为「续接节拍（子节点 job）」 |
| 续接节拍归属 | 待删 job 自身 | 待删 job 自身的 continuation.scriptId === 已存续接脚本 id（该 job 是脚本的任一节拍，含无子节点的尾节拍） | 续接脚本「<videoName>」的节拍 |
| 帧书签 | `minimax.frame-bookmarks` | project.id === `job-<job.id>`；或归一化后的 project.source 与 job.outputUrl/`localOutputPath` 对齐 | 帧书签「<name>」 |
| 角色漫游视频 | `minimax.character-projects` | turntableVideo?.path === job.localOutputPath 或 job.outputUrl | 角色「<name>」漫游视频 |
| 地点漫游视频 | `minimax.location-projects` | walkthroughVideo?.path === job.localOutputPath 或 job.outputUrl | 地点「<name>」漫游视频 |

规则：

- URL 归一化：`source`/`path` 先经 `playableOutputUrl()` 归一化，再与 `job.outputUrl` 比较；同时解析 `minimax-media://` 的 `path`/`url` 查询参数，与 `localOutputPath` 对齐。两侧都不做额外编码猜测。
- **fail-closed**：引用存储 key 缺失 = 该来源无引用；key 存在但 JSON 无法解析或顶层结构无效（数组/对象类型不符）= 阻止删除，提示「无法读取〈影片项目/帧书签/续接脚本/角色/地点〉数据，为避免误删已取消删除」，并提供「重试」。数组元素缺字段只跳过该元素，不视为整体不可读。
- **latent 引用不参与匹配**：`motionContext.latentPath` 只存在于提交期的 `GenerationOptions`（`src/types.ts:351`、`src/App.tsx:2482`），不落盘到 `GenerationJob`；持久化 job 只有 `continuation.sourceJobId` 这条父子引用。因此不设置 latentPath 匹配器，父节点删除由 `sourceJobId` 规则阻止；节拍归属由 `continuation.scriptId` 规则阻止（含尾节拍）。
- 检测到引用时：不调用删除 IPC、不移除记录、文件不变；显示阻止对话框，列出全部匹配来源标签，文案说明「该资产仍被以下位置引用，无法删除。请先在对应功能中移除引用后再试。」；列表允许多条，复用媒体库现有模态/灯箱样式渲染，仅提供「关闭」。
- 未检测到引用时进入确认流程。

### 3. 删除确认与预览锁

- 本机资产：确认对话框说明「将把文件移入系统回收站，并从媒体库移除记录；该渲染的缩略图缓存与派生文件会一并清理」。
- 远程资产（无 `localOutputPath`）：确认对话框说明「只会移除本地记录与缓存，远端 ComfyUI 上的文件不会被删除」。
- 对话框标题包含资产标题（`libraryPromptTitle`）。取消不产生任何副作用；确认才进入删除执行。
- 从灯箱删除时，确认后先关闭灯箱并暂停当前播放的 `<video>`/`<audio>`，再调用 IPC，避免 Windows 文件占用导致回收站失败。失败提示包含「关闭预览后重试」。
- 二段确认沿用现有 `window.confirm` 模式（与队列「移除」一致）。

### 4. 删除执行（preload IPC）

渲染层调用新桥接方法：

```ts
deleteMedia(input: { files: string[]; thumbnailPath?: string }): Promise<{
  recycled: string[]                                   // 已移入回收站的文件
  missing: string[]                                    // 执行时已不存在的文件
  failed: Array<{ path: string; reason: string }>       // 回收站操作失败的文件
  thumbnailRemoved: boolean
}>
```

- `files`：`[job.localOutputPath, job.latentPath, job.segmentOutputPath]` 中非空、去重后的**绝对路径**；远程 job 可为空数组。最多 8 项；超限或含相对路径 → 整体拒绝。
- `thumbnailPath`：从 `job.thumbnailUrl` 查询参数 `path` 解析得到（存在时传入）。缺失或不含 `path` 时不传。
- 执行顺序：
  1. 主进程先完成**全部**路径校验（第 5 节），并确认文件位于可信根内。任一校验失败 → 抛错并拒绝整个请求，任何文件都不处理。
  2. 逐个对存在且校验通过的文件执行 `shell.trashItem`；已不存在的路径计入 `missing`；单个失败计入 `failed`，不中断其余文件。
  3. `thumbnailPath` 校验通过且存在时删除该缓存文件（缓存可再生，直接 `unlink`）。`unlink` 失败为非致命，`thumbnailRemoved: false`，不影响其余结果。
- 返回 per-file 结果；主进程不读取、不信任渲染层给出的文件语义，只校验路径并执行删除。
- `shell.trashItem` 的可恢复性取决于平台与文件系统（网络盘、FAT 移动介质可能永久删除或失败）；主进程如实上报成功/失败，不承诺跨平台的恢复保证。

### 5. 可信根与路径边界

主进程**自行派生**允许删除的根，绝不接受渲染层传入的 root：

- 根 1：`settings.outputDirectory`。
- 根 2：ComfyUI `/system_stats` 中 `--output-directory` 上报的目录；复用 `observedComfyOutput` 的缓存语义（同 URL、600 秒内有效），需要时重新请求。
- 判定：`relative(normalizedRoot, normalizedCandidate)` 结果为空（目标就是根目录本身）、以 `..` 开头、或 `isAbsolute` → 拒绝；Win32/darwin 先做大小写折叠，其他平台按字面比较。
- 目标存在时，额外用 `realpath` 解析并再次验证真实路径仍在对应根内，阻止符号链接逃逸。
- 拒绝空路径、通配符、目录本身（只允许文件）。
- `thumbnailPath` 必须位于 `app.getPath('userData')/video-thumbnails` 内且扩展名为 `.jpg`；否则拒绝整个请求。
- 任一本机文件无法归入任一可信根 → 整体拒绝并返回可读错误，绝不静默降级为「远程只删记录」。错误文案区分场景：根 2 因 ComfyUI 未连接且缓存过期而不可用时，返回「无法确认该文件属于可信输出目录（ComfyUI 未连接），请连接后重试」；其余越界返回「只能删除可信输出目录内的媒体文件」。

### 6. 记录移除、持久化与反馈

只要 `failed` 为空（含全部文件为 `missing` 或远程空 `files`），渲染层：

- 立即将下一个 jobs 数组以既有持久化形态写入 `minimax.jobs`（`slice(0, 100).map(compactJob)`，与 `src/App.tsx:875/883` 相同），绕过 1200ms 防抖，再 `setJobs` 移除该 job；媒体库与队列历史同时消失，崩溃窗口内记录不复活。
- 成功提示（`role="status"`，非高频）：
  - 本机已回收：`已将「<title>」移入回收站并移除记录。`
  - 全部缺失：`文件已不存在，已移除记录。`
  - 远程：`已移除本地记录；远端 ComfyUI 上的文件未被删除。`
- `failed` 非空：**记录与媒体库条目保持不变**，提示真实状态：`已移动 N 个文件；<失败文件> 未能移入回收站：<原因>。记录已保留，可重试。`，按钮恢复可用；重试只处理剩余文件，`missing` 兜底不会重复处理已回收文件。
- 删除成功后不保留「已删除」占位记录。

### 7. 远程资产

`localOutputPath` 缺失的 job（ComfyUI 在另一台机器或历史数据不全）：

- 仍显示删除入口；`files` 为空数组或仅含本机存在的派生路径。
- 主进程接受空 `files`，只清理缩略图缓存并返回空 `recycled`/`missing`/`failed`。
- 成功后按第 6 节移除记录并明确提示远端文件未删除。
- 若 job 声称有本机文件但所有文件都无法归入可信根 → 整体拒绝（第 5 节），不退化为远程语义。

### 8. 浏览器 mock 与 LAN

- `src/browserMock.ts` 的 `deleteMedia` 直接抛出 `请在桌面应用中使用媒体库删除。`，不返回成功、不静默成功。
- LAN 服务的完整工作室页面运行在 browser mock 下；点击删除时按错误路径提示，记录与文件均不变，不产生假删除。
- LAN 服务不新增删除端点。

### 9. 幂等与并发

- 同一 job 删除进行中按钮禁用，重复点击不产生第二次调用。
- 两个窗口（主窗口与独立影片编辑器窗口）共享同一 session/localStorage；删除后素材池在存储事件或下次加载时反映变化。
- 删除成功后条目已消失；失败重试按第 4/6 节安全。

### 10. 与既有能力的关系

- 队列视图「移除」行为不变：仍只从历史过滤、保留文件；本次不改写其语义。
- 「在文件夹中显示」、RIFE、帧书签、预览等既有操作保持不变。
- 删除不影响 `referenceAssets` / `referenceFiles` 指向的输入素材，也不删除从视频抽取的独立参考帧文件。
- 不修改 `electron/main.ts:1202-1205` 的既有跨平台判定；删除实现使用独立的 `relative` 判定。

## Scenarios

#### Scenario: 删除本地图片
Acceptance: A1

媒体库图片卡片点击「删除」并确认后：主进程把 `localOutputPath` 文件移入系统回收站，渲染层立即持久化并移除 job 记录；卡片从媒体库消失，队列历史不再出现该条目，重启应用后不恢复。

#### Scenario: 删除视频清理缓存与派生文件
Acceptance: A2

删除一条已完成视频并确认后：缩略图缓存文件被删除（`thumbnailRemoved: true`）；若 job 存在位于可信输出目录内的 `latentPath` / `segmentOutputPath`，这些文件一并移入回收站；媒体库与队列历史中都不再出现该条目。

#### Scenario: 取消删除
Acceptance: A3

在确认对话框选择取消：不调用删除 IPC，文件、缩略图缓存、媒体库条目、队列历史均保持不变。

#### Scenario: 影片项目引用阻止
Acceptance: A4

当任一影片项目的片段以 `job-<id>` 或归一化后相同的 `source` 引用该资产时，点击删除显示阻止对话框并列出对应影片项目名称；不调用删除 IPC，文件与记录保持不变。

#### Scenario: 其他引用阻止
Acceptance: A5

当续接脚本 `sourceJobId`、帧书签项目或角色/地点漫游视频引用该资产时，点击删除显示阻止对话框并列出对应来源标签；不调用删除 IPC，文件与记录保持不变。

#### Scenario: 远程资产删除
Acceptance: A6

删除本机无 `localOutputPath` 的远程渲染条目并确认后：只移除本地 jobs 记录与缩略图缓存，成功提示明确说明远端 ComfyUI 上的文件未被删除。

#### Scenario: 越界路径拒绝
Acceptance: A7

渲染层（或被篡改的调用）请求删除两个可信输出目录之外的文件、非法 `thumbnailPath`、相对路径或超过 8 项的文件列表时，主进程拒绝并返回可读错误；任何文件都不被处理，记录保持不变。

#### Scenario: 文件已不存在
Acceptance: A8

删除一个本机文件已从磁盘消失的资产时：`missing` 包含该路径，不抛致命错误，缩略图缓存按传入路径清理，记录被移除，界面说明文件已不存在。

#### Scenario: 回收站操作失败（含部分成功）
Acceptance: A9

任一文件 `shell.trashItem` 失败时：`failed` 返回失败文件与原因，渲染层保持 jobs 记录与媒体库条目不变，提示已移动数量、失败文件与原因并允许重试；重试只处理剩余文件，已回收文件不会重复处理。

#### Scenario: 删除音频
Acceptance: A10

媒体库音频卡片点击删除并确认后：音频文件移入回收站，卡片与队列历史消失，页面上的音频控件不再引用该文件；重启后不恢复。

#### Scenario: 便携版或自定义输出目录删除
Acceptance: A11

当 ComfyUI 上报的 `--output-directory` 与 `settings.outputDirectory` 不同、且资产位于上报目录内时，删除仍成功（主进程自行派生可信根），不会因单根判定被误拒。

#### Scenario: 续接节拍链引用阻止
Acceptance: A12

当待删 job 是续接节拍链的节点——被子 job 的 `continuation.sourceJobId` 指向，或被删 job 自身的 `continuation.scriptId` 命中已存续接脚本 id（含无子节点的尾节拍）——时，删除被阻止，提示续接脚本名称与节拍位置；文件与记录保持不变。

#### Scenario: 引用数据不可读时阻止
Acceptance: A13

任一引用存储 key 存在但 JSON 无法解析或顶层结构无效时，点击删除被阻止，提示「无法读取〈对应数据〉，为避免误删已取消删除」并提供重试；key 缺失视为无引用，可正常删除。