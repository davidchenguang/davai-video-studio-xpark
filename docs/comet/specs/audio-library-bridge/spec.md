# 音频成果入库（audio-library-bridge）

## Capability

`audio-library-bridge` — 音乐模块（ACE-Step、MiniMax Music 3）完成的音频 job 进入媒体库，与视频、图片混排展示，按媒体筛选区分，可内嵌播放、可定位磁盘 `audio/` 留存；来源标签与队列共享同一映射。

## 完整行为规格

### 1. 音频进入媒体库

媒体库的候选集合从「非音频」改为「有 `outputUrl` 的 job 全量」：`src/components/LibraryView.tsx` 的 `available` 过滤器移除 `job.mediaType !== 'audio'` 条件。音频 job（`mediaType: 'audio'`、provider `music3`/`acestep`）因此与视频、图片混排进入同一网格，按 `createdAt` 参与现有最新/最早排序，提示词搜索照常命中音频的 prompt（tags/caption）。

约束：

- 不新增任何登记逻辑：音频 job 仍由音乐工作区在提交时创建（`src/App.tsx:2200`、`:2237`），完成分支（`src/App.tsx:1051-1085`）写 `outputUrl` 与 `localOutputPath`，媒体库只消费既有 jobs 状态。
- `outputUrl` 必须是 minimax-media 短 URL；沿用 jobs 里的既有值，不产生 data URL。

#### Scenario: 完成的音频出现在媒体库
Acceptance: A1

ACE-Step 或 Music 3 完成一次音频生成后（或 jobs 中存在已完成的音频记录时），媒体库默认「全部媒体」视图出现该音频卡片；「媒体」筛选选「音频」只显示音频条目，选「视频」或「图片」时音频不出现；「全部提供方」下音频可见，「MiniMax H3」「LTX 2.5」提供方筛选下音频不显示（提供方下拉不扩，与既有非 minimax/ltx25 内容一致）。

### 2. 音频卡片与灯箱

音频卡片与视频/图片卡片同构，但**媒体区不含交互控件**（结构决定，避免 `<audio controls>` 嵌入 button 的无效 HTML 与点击冒泡）：

- 媒体区：仍是 `button.library-card-media`，点击开灯箱；音频时渲染 `Music2` 图标占位（视觉形态同空态图标位），不内嵌播放器、不显示视频时长角标、不进入「帧书签」候选（`videos` 列表继续排除音频）、不渲染 RIFE 区块。
- 卡片 body（`library-card-body`，仿队列 job-audio 形态）：标题与 meta 之后放内嵌 `<audio controls preload="metadata">`，src 为该 job 的 `outputUrl`；库内播放器样式为全宽、高约 36px（新增 `.library-card audio` 规则，不沿用队列 `job-audio` 的 420px 上限——那是队列行布局的约束）。
- 卡片 meta：来源标签（裸标签，见 §3）+ 「N 秒音频」。卡片 small 行对音频**整体替换**为「N 秒音频」，不复用「W × H · …」结构——音频 job 恒 `width:0/height:0`（`src/App.tsx:2202`、`:2237`），直接拼接会渲染出「0 × 0 · N 秒音频」。
- 卡片操作区：「预览」（打开灯箱）、「打开文件」（`<a target="_blank">` 打开 outputUrl）、「在文件夹中显示」（仅 `localOutputPath` 存在时渲染，调用 `window.minimax.showOutput(job.localOutputPath)`；缺失时不显示且不报错）。
- 灯箱：`media-lightbox-stage` 对音频渲染大播放器（同一 `outputUrl`），header 显示标题、footer 对音频整体显示「N 秒音频」（同样不出现「W × H ·」前缀）；Esc、点击背景、「关闭」按钮退出，与其他媒体一致。灯箱不渲染视频专属的「下一镜头帧约束」区。

约束：

- 音频卡片不提供帧书签/RIFE/尾帧参考入口；这些操作在音频 job 上语义不成立。
- 视频与图片卡片的既有行为（帧书签、RIFE、尾帧参考、lightbox alt、来源标签）不变。

#### Scenario: 音频卡片与灯箱可播放
Acceptance: A2

卡片 body 内嵌播放器与点击「预览」打开的灯箱播放器的 src 都是该 job 的 `outputUrl`，可播放可暂停；卡片 small 行与灯箱 footer 显示「N 秒音频」且不出现「0 × 0 ·」前缀；Esc 或点击背景可关闭灯箱；点击媒体区按钮开灯箱，播放器交互不冒泡触发灯箱（播放器不在按钮内）。

#### Scenario: 音频可定位磁盘留存
Acceptance: A3

音频卡片操作区有「打开文件」与「在文件夹中显示」；后者调用 `showOutput(job.localOutputPath)`，资源管理器定位到 `<输出目录>\audio\` 下的留存文件；`localOutputPath` 缺失的音频条目不显示该按钮且点击流程无报错。

### 3. 音频来源标签共享映射

`src/lib/jobPresentation.ts` 新增共享函数 `audioSourceLabel(provider)`：

- `music3` → 「Music 3」
- `acestep` → 「ACE-Step」
- 其余（含 undefined 与未知值）→ 「音乐」（中性兜底）

展示规则（两视图共用同一函数，前缀拼接不同）：

- 媒体库（`LibraryView.tsx`）：显示裸标签（「Music 3」/「ACE-Step」/「音乐」），与图片卡片显示 `imageSourceLabel` 裸标签的方式一致。
- 队列（`JobsView.tsx:60`）：保持现状格式「音乐 · <裸标签>」；**当裸标签为兜底值「音乐」时不拼前缀**（渲染「音乐」而非「音乐 · 音乐」）。现状三元对未知 provider 一律落「音乐 · ACE-Step」、没有中性兜底，现实数据 provider 恒为 acestep/music3，此差异仅存在于理论未知值，接受。

约束：

- 不改变 `imageSourceLabel` 及其现有映射；媒体筛选 all 项文案从「图片与视频」改为「全部媒体」（含音频后原文案不再准确）。

#### Scenario: 音频来源标签一致
Acceptance: A4

媒体库显示裸标签、队列显示「音乐 · <裸标签>」（兜底值「音乐」时队列不拼前缀），两处的标签分量来自同一共享函数：provider 为 `music3` 时媒体库显示「Music 3」、队列显示「音乐 · Music 3」；`acestep` 时分别为「ACE-Step」与「音乐 · ACE-Step」；未知或缺失 provider 时两处均显示「音乐」。

### 4. 筛选与计数不回归

媒体筛选状态扩展为 `'all' | 'video' | 'image' | 'audio'`，`filtered` 的媒体谓词按三分支改写：`video` 排除 image/audio、`image` 仅 image、`audio` 仅 audio、`all` 不筛。现有实现是二分支（`image ? image : 非 image`），放开 audio 后若保持二分支，「视频」筛选会漏入音频——必须改写为三分支。工具栏「共 N 个素材」的计数基于新的 `available`（含音频）。既有视频/图片行为不回归：

- 图片筛选仍只显示图片，视频筛选仍只显示视频；
- 排序、提示词搜索对全部媒体一致生效；
- 空态：无任何素材时显示首跑引导（文案含视频、图片与音频），有素材但筛选无结果时显示「没有符合这些筛选条件的结果」+「清除筛选」。

#### Scenario: 筛选与计数不回归
Acceptance: A5

音频条目参与最新/最早排序与「共 N 个素材」计数；「视频」「图片」筛选结果与音频进入前一致（视频筛选不含音频）；提示词搜索能同时命中视频、图片、音频条目；全部媒体 + 全部提供方下音频可见。
