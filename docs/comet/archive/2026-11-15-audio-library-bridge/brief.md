# 目标

音乐模块（ACE-Step、MiniMax Music 3）完成的音频目前已登记进共享 jobs 并在队列历史中可见（`mediaType: 'audio'` 的 `GenerationJob`，`src/App.tsx:2200`、`src/App.tsx:2237`），但媒体库在 `src/components/LibraryView.tsx:21` 用 `job.mediaType !== 'audio'` 把音频显式排除，用户离开音乐工作区后只能在队列里找回音轨，媒体库的「图片与视频」筛选也覆盖不到第三种媒体。本需求让已完成的音频 job 进入媒体库：与视频、图片混排展示（按媒体筛选区分），音频卡片可内嵌播放、可打开文件、可一键定位磁盘上的 `audio/` 留存，提示词搜索与排序照常生效。

现状事实（已当场核实）：

- 音频 job 完成时已有 `outputUrl`（minimax-media 短 URL）与 `localOutputPath`（`<输出目录>\audio\` 下的留存文件）：通用完成分支 `src/App.tsx:1051-1085` 对 audio 生效，`resolveOutput` 把 ComfyUI 报告的输出解析成本地路径。
- 磁盘留存由两个工作流的 `SaveAudioAdvanced` 节点用 `filename_prefix: audio/…` 固定：ACE-Step → `audio/ACE_Step_1.5_<model>_<时间戳>`（FLAC，`src/components/AceStepWorkspace.tsx:84`、`src/lib/aceStepWorkflow.ts:56`）；Music 3 → `audio/MiniMax_Music3_<时间戳>`（MP3 V0，`src/components/Music3Workspace.tsx:172`、`src/lib/music3Workflow.ts:22`）。无需改动保存路径。
- 队列已渲染音频卡片：内嵌 `<audio controls>`、「音乐 · Music 3 / ACE-Step · N 秒 · 音频」meta（`src/components/JobsView.tsx:59-60`）；样式类 `job-audio` 已存在。
- 媒体库工具栏的「媒体」筛选当前是 `'all' | 'video' | 'image'` 三态（`src/components/LibraryView.tsx:12`）；「图片与视频」下拉文案与排除 audio 的过滤器一致。
- 来源标签：图片走共享 `imageSourceLabel`；音频在队列是硬编码三元表达式。`src/lib/jobPresentation.ts` 是两视图共享标签的既有归属地。
- 上一 change（image-library-bridge）已把「视频库」更名为「媒体库」并在 9 个文件落地；本需求沿用「媒体库」命名与既有卡片/灯箱结构，不新起子系统。

# 范围

## 目录结构

### 新建

无。

### 修改

- `src/components/LibraryView.tsx` — 核心改动点：
  - `:21` 放开 audio 过滤（`available` 收录 `mediaType === 'audio'` 且有 `outputUrl` 的 job）；
  - `:12` 媒体筛选状态扩展为 `'all' | 'video' | 'image' | 'audio'`，`filtered` 的媒体谓词按三分支改写（`video` 排除 image/audio、`image` 仅 image、`audio` 仅 audio——现有二分支 `image ? … : 非 image` 在放开后会让「视频」筛选漏进音频，必须改）；下拉加「音频」选项，「图片与视频」（all 项现文案）改为「全部媒体」；
  - 音频卡片结构（结构决定，仿队列形态避免交互控件嵌进 button）：
    - 媒体区仍是 `button.library-card-media`，点击开灯箱；音频时渲染 `Music2` 图标占位（视觉形态同空态图标位），不内嵌播放器——`<audio controls>` 嵌在 button 内是无效 HTML 且点击会冒泡触发灯箱；
    - 卡片 body 放内嵌 `<audio controls preload="metadata">`（队列 `job-audio` 的形态：src 为 `outputUrl`），不显示时长角标/「帧书签」/RIFE 区块/「下一镜头帧约束」；
    - 卡片 small 行与灯箱 footer 对音频整体替换为「N 秒音频」——不复用「W × H · …」结构（音频 job 恒 `width:0/height:0`，直接拼会出现「0 × 0 · N 秒音频」）；
  - 操作区保留「预览」「打开文件」「在文件夹中显示」（audio + `localOutputPath` 时）；`localOutputPath` 缺失的音频条目不显示后者且不报错。
- `src/lib/jobPresentation.ts` — 新增共享 `audioSourceLabel(provider)`：`music3` → 「Music 3」、`acestep` → 「ACE-Step」、其余 → 「音乐」（中性兜底），供 LibraryView 与 JobsView 复用。
- `src/components/JobsView.tsx` — 音频 meta 标签改用共享 `audioSourceLabel`（`:60`）：`music3`/`acestep` 分支展示结果与现状逐字一致（「音乐 · Music 3」/「音乐 · ACE-Step」，「音乐 · 」前缀仍在 JobsView 拼接）；兜底值「音乐」为标签本身时不再拼前缀（避免「音乐 · 音乐」）。现状三元没有中性兜底（未知 provider 一律落「音乐 · ACE-Step」），现实数据 provider 恒为 acestep/music3，行为差异仅存在于理论未知值，接受。
- `src/styles/creation-workspaces.css` — 库音频卡片补最小样式：`.library-card audio` 全宽/适宜高度（对齐队列 `job-audio` 的 36px 形态，去掉 420px 上限），一条规则即可；不建新文件。
- 空态首跑文案「完成的视频与图片会自动保存在本设备上」补「与音频」（`:54`，顺手修正）。
- 提供方筛选保持不动（仍只有 全部/MiniMax H3/LTX 2.5）：music3/acestep 音频在「全部提供方」下可见，在 MiniMax H3/LTX 2.5 下不显示——与既有 Ref2VA 图片行为一致，按来源筛选音频的需求出现时再扩（YAGNI）。A5 验证口径含「全部媒体 + 全部提供方下音频可见」。

### 删除

无。

### 明确不建

- 不新建音频留存目录或改 `filename_prefix` — `audio/` 约定已工作，历史文件照旧。
- 不做音频波形图、封面图、专辑元数据 — 用 `Music2` 图标占位即可，属于视觉增强非本需求。
- 不做音频专属筛选区/分区显示 — 用户已确认混排 + 筛选。
- 不把音频加进「帧书签」候选（`videos` 列表继续排除音频）— 帧书签语义只对视频成立。
- 不动移动端 `MobileApp.tsx` — 手机端无媒体库入口。
- 不为历史音频补登记 — 只对已有 jobs 记录生效（历史音频本就已在 jobs 里，天然可见）。

# 非目标

- 不改变音频的生成、排队、取消、失败展示与队列内嵌播放行为（队列照旧）。
- 不改变 `SaveAudioAdvanced` 输出位置、文件名与格式（FLAC/MP3）。
- 不给音乐工作区增加「发送到媒体库」类手动操作 — 完成即入库，与图片/视频一致。
- 不处理视频/图片卡片自身的行为变化（尾帧参考、RIFE、帧书签等维持原样）。

# 验收示例

- 用 ACE-Step 或 Music 3 完成一次音频生成后，媒体库默认「全部媒体」视图中出现该音频卡片，卡片上有来源标签（裸标签：Music 3 / ACE-Step，不带「音乐 · 」前缀——前缀仅队列拼接）、时长与内嵌音频播放器（位于卡片 body，媒体区按钮点击开灯箱，播放器不在按钮内）；「媒体」筛选选「音频」只显示音频条目，选「视频」「图片」时音频不出现；全部提供方 + 全部媒体下音频可见。
- 音频卡片与灯箱可播放：卡片 body 内嵌播放器与灯箱大播放器的 src 都是该 job 的 `outputUrl`（minimax-media 短 URL），可正常播放、可暂停；卡片 small 行与灯箱 footer 显示「N 秒音频」（不出现「0 × 0 ·」前缀，音频 job 恒 width/height 为 0，该行整体替换）；灯箱 Esc/点击背景可关闭。
- 音频卡片操作区有「打开文件」（新标签页打开 outputUrl）与「在文件夹中显示」（调用 `showOutput(localOutputPath)`，资源管理器定位到 `audio/` 下的留存文件）；`localOutputPath` 缺失的音频条目不显示后者且不报错。
- 音频来源标签与队列一致：媒体库显示裸标签、队列显示「音乐 · <裸标签>」，两处的标签分量来自同一共享映射函数（music3 → 「Music 3」、acestep → 「ACE-Step」、未知或缺失 → 「音乐」，兜底值在队列不拼前缀，避免「音乐 · 音乐」）；提示词搜索对音频条目生效（搜 tags/caption 命中）。
- 排序、计数与既有筛选不回归：音频按 `createdAt` 参与最新/最早排序；工具栏「共 N 个素材」计数包含音频；视频与图片的既有卡片行为（帧书签、RIFE、尾帧参考、图片筛选、来源标签）不变；「MiniMax H3」「LTX 2.5」提供方筛选下音频与既有非 minimax/ltx25 内容一致地不显示。
