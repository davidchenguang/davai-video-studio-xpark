# 本地化验收记录（docs/locale/verification-report.md）

对应 Comet Native change `chinese-localization` 的验收项 A1–A10。
基线 ref：`1a7ea28`；工作区：`.worktrees/chinese-localization`（分支 `comet/chinese-localization`）。

命令全部在上述 worktree 内执行，pnpm 需先 `export PATH="/Users/dawo/.local/share/nodejs/node-v26.12.1-darwin-arm64/bin:$PATH"`。

## 门禁结果

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 漏译 / 术语 / 提示词层纯净 / 中英空格 | `node scripts/locale-audit.cjs`（= `pnpm test:locale`） | 0 处问题 |
| Music 3 双语层完整性 | `node scripts/test-music3-vocabulary.cjs`（= `pnpm test:music3-vocabulary`） | 185 个提示词值全部有中文显示标签，提示词层无中文 |
| 提示词逐字节回归 | `node scripts/test-prompt-parity.cjs`（= `pnpm test:prompt-parity`） | 16 个捕获段与 `1a7ea28` 逐字节一致 |
| 英文原文快照可复现 | `node scripts/extract-locale.cjs --ref 1a7ea28 --out /tmp/en-US-regen.json` + `diff` | 与 `docs/locale/en-US.json` 逐字节一致（1496 条界面文案 / 86 个文件；第 15 轮扫描口径扩展后从基线重提，原 1483 条） |
| 类型检查 | `pnpm typecheck` | 通过 |
| 代码风格 | `pnpm lint` | 通过，无新增警告 |
| 单元与集成测试 | `pnpm test`（22 套，含 `test:locale`、`test:music3-vocabulary`、`test:prompt-parity`） | 全部通过 |
| 渲染构建 | `pnpm build:web` | 通过 |
| 字面量之外的结构改动 | `node scripts/locale-structure-check.cjs` | 44 个文件存在字面量之外的改动，逐条归类见 `docs/locale/structure-changes.md` |
| 界面走查（A10） | `node scripts/locale-walkthrough.cjs --out docs/locale/evidence/walkthrough-batch12` | 22 个外壳全部命中；19 个 needle 字符串 0 命中；0 处横向溢出；全应用可见英文仅 13 条（全部 keep-english 登记 + 1 条用户数据） |

## 链外脚本

| 脚本 | 状态 | 说明 |
| --- | --- | --- |
| `pnpm test:ui-e2e` | 通过 | 用本机 Chrome 驱动 127.0.0.1:5173（worktree 的 `pnpm dev:web`）；批次 11 补同步两处断言：标题栏重置后的模式按钮文本 `'References'`→「参考图」（224 行），设置搜索查询 `'Character name'`→「角色名称」（231 行，searchableText 只含 DOM 中文标签，英文查询零命中）。重跑整条链 PASS |
| `pnpm test:photo-edit-electron` | **环境受限未执行** | 脚本第 89 行用 ffmpeg 生成 13 秒测试片、第 132 行起用 ffprobe 取元数据；本机没有 ffmpeg/ffprobe（无 Homebrew、无 `C:/FFMPEG`），脚本在准备素材阶段即 ENOENT 退出，一条断言都没跑到 |
| `pnpm test:clip-master` | **环境受限未执行** | 第 22–23 行用 ffmpeg 生成测试片、第 30 行用 ffprobe 探测流信息，同样缺 ffmpeg |

两处是「机器上缺少 ffmpeg」，不是本地化缺陷；在装有 ffmpeg 的机器上必须各补跑一次。

## 人工抽查（A10）

见下方「人工抽查记录」。

## 人工抽查记录（A10）

走查脚本已收进仓库：`scripts/locale-walkthrough.cjs`。它通过 CDP 驱动真实 Electron 应用
（worktree 构建，CDP 端口 9333），进入全部 20 个侧边栏目的地与影片剪辑、手机两种外壳，
逐个截图（`docs/locale/evidence/walkthrough-batch12/*.png`）、收集界面文案里的英文短语、
在宽幅与 900×700 两种视口检查横向溢出，并断言「此前漏译的 16 个字符串」不再出现在 DOM 里；
结果写入同目录的 `report.json`。批次 12 的一次性脚本已由它取代。

- **命中**：22 个外壳全部进入成功（`status: ok`），没有 `not-found`。
- **溢出**：两种视口下 `scrollWidth` 均未超过 `innerWidth`，0 处横向溢出。
- **must-not-render 名单（19 个字符串）**：`Square ·` / `Landscape ·` / `Portrait ·` /
  `Ultrawide` / `Custom appearance` / `Cinematic lead` / `Period drama` / `Custom voice` /
  `Save frame only` / `first-frame input` / `native Frame 0 anchor` /
  `Approve a location image` / `multi-GPU parallel` / `Standard decoded frame` /
  `LTX sampling` / `LTX latent` / `sampling preview stream` / `C major` / `Pop`
  （后两个是第 15 轮补的，见下）—— 0 命中。
- **英文短语甄别**（走查脚本只收集不含中文的可见文本节点）：
  - 品牌 / 模型 / 引擎 / 硬件名（`Oyama AI Video Studio`、`MiniMax H3`、`MiniMax H3 Extender`、
    `LTX Ripple`、`Z-Image Turbo`、`XL Base / XL SFT`、`NVIDIA GB10`、`NVIDIA Sol Engine`、
    `Kitchen INT8`、`LM Studio`、`FL2V Turbo / FL2VA NVFP4 / Ref2V Turbo / Ref2VA NVFP4`、
    `INT8 ConvRot`、`Install via Git URL`）——keep-english 已登记，保留。
  - 音乐 · Music 3 的提示词表单值（`C major` 等）：这些输入框绑定的是提示词内容本身
    （`Draft.key` / `Draft.genre` 原样进入 Music 3 提示词），按「提示词正文保持英文」
    保留英文；界面上的中文在提示词之外——字段标签、下拉建议、芯片按钮、预设卡片都是中文
    （详见下一节）。
  - 队列页约 23 条（`Prompt disappeared from the ComfyUI queue and history`、
    `fetch failed. …` 等）：当前源码全文检索零命中，且对应位置的现行为中文
    （`App.tsx:1091`「提示词已从 ComfyUI 队列与历史中消失。」、`:1062`「…请检查 ComfyUI
    和配置的输出文件夹。」等）——这些条目是主检出（未翻译分支）在同一 `userData` 里
    持久化的任务记录，`comfyActivity` 消息随任务序列化进存储，界面按数据原样回放；
    `Error invoking remote method 'comfy:history'` 是 Electron IPC 错误前缀、
    `TypeError: fetch failed` 是 Node undici 的错误正文，都不是应用文案。保留。
  - `Hair design`（发型库默认名）：**真实漏译**，已修复——四个素材库默认项目名改为中文
    （`发型设计 N` / `服装 N` / `配饰 N` / `地点 N`，同 MovieEditor 的 `未命名影片` 先例），
    「默认名」正则守卫改为双语兼容，详见 `docs/locale/structure-changes.md` 第四节。
  - `Untitled movie`：`src/browserMock.ts` 的示例数据（keep-english 已登记）；桌面端
    `MovieEditor` 本体已是「未命名影片」。
- **走查脚本的已知限制**：英文收集只扫可见文本节点，并跳过 `textarea` / `input` / `code` /
  `pre` 以及类名含 `prompt` / `code` / `mono` / `tag` 的元素——这些位置按设计属于提示词层。
  第 15 轮起收集器额外读取每个关闭态 `<select>` 的选中项文本（option 文本节点无
  client rects，TreeWalker 扫不到）；`innerText` 断言（must-not-render 名单）同样覆盖
  关闭态下拉的选中项。未挂载的组件（如命令面板里的排序下拉）仍不采集——这类位置靠
  源码侧的 `locale-audit` 元组 / 字面量规则兜底。走查仍是抽查兜底，主门禁是 `locale-audit`。

## 独立验收后的修复轮次

### 第 13 轮：A5 的三处裸显示

独立 Verifier 验收 A5 时发现三处「枚举值即显示值」的裸显示（扫描器的 JSX 表达式盲区）：

| 位置 | 原样 | 修复 |
| --- | --- | --- |
| `src/App.tsx:3671`（H3 视频历史条） | `{item.status}` | `jobStatusLabels[item.status] ?? item.status` |
| `src/components/LibraryView.tsx:65`（素材卡） | `${job.mode}` | `${generationModeLabels[job.mode] ?? job.mode}` |
| `src/components/SceneContextPanels.tsx:53`（参考图检查器头部徽标） | `{reference.file.kind}` | `mediaKindLabels[reference.file.kind] ?? reference.file.kind` |

两张映射表（`jobStatusLabels`、`generationModeLabels`）与 JobsView 原有副本合并，落在
`src/lib/jobPresentation.ts`（既有的任务展示辅助模块，`JobsView`/`App`/`LibraryView` 均已
import 该模块）；这样组件文件不再导出常量，`react-refresh/only-export-components` 保持零警告。
`mediaKindLabels` 仿照 SceneContextPanels 顶部既有的 `videoRoleLabels` 等映射，同文件同模式。

修复后全部窄检查重跑通过：`locale-audit`（0 处）、`prompt-parity`（16 段逐字节一致）、
`typecheck`、`lint`（0 警告）、`pnpm test`（21 套全过）、`build:web`、
`locale-structure-check`（43 文件，新增两处即本修复的 `jobPresentation.ts` 与
`LibraryView.tsx`，已并入 structure-changes.md 二节）。

### 第 14 轮：独立 Verifier 的三条发现

独立 Verifier 判定 FAIL，给出三条按优先级排列的发现。逐条处理如下。

**（1）六处显示文案漏译** —— 已修：

| 位置 | 原样 | 修复 |
| --- | --- | --- |
| `src/lib/videoResolutions.ts` | `orientation` 直接透出英文存储值 | 新增 `VIDEO_RESOLUTION_ORIENTATION_LABELS`：方形 / 横屏 / 竖屏 / 超宽 |
| `src/lib/characterPresets.ts` | 预设元组的显示半区仍是英文 | 全部译为中文（存储值与提示词描述半区保持英文） |
| `src/lib/movieHandoff.ts` | 交接目标元组的显示半区仍是英文 | 全部译为中文（存储 id 保持英文） |
| `src/App.tsx` | 「请先确认一张地点基础图…」 | 译为中文 |
| `src/App.tsx` | 「H3 多 GPU 并行 · Kitchen INT8」 | 译为中文 |
| `src/App.tsx` | 执行信息条的 `LTX sampling` / `Standard decoded frame` / `LTX latent` / `off` | 译为中文；采样器与调度器名（`Euler ancestral`、`Official 8 + 3 sigmas`、`Simple · 8 steps`、`Licon MSR`）按 keep-english 登记保留 |

`src/lib/useLivePreview.ts` 的「LTX 采样预览流」与 `src/lib/renderActivity.ts` 的 Tiny VAE
不兼容提示也在本轮一并译为中文。

**（2）扫描器盲区** —— 已修。`scripts/lib/locale-scan.cjs` 增加四类分类规则：元组数组、
显示工厂函数里的条件分支、显示 sink 的调用实参、显示属性上的模板表达式。扩展后
`locale-audit` 的扫描量从 3748 条字面量升到 4748 条（4035 条界面文案 / 713 条提示词位），
漏译 0 处、术语 0 处、提示词层纯净 0 处、中英空格 0 处。

**（3）`structure-changes.md` 的枚举不全** —— 已修。44 个存在字面量之外改动的文件全部逐条
落到「一 / 二 / 三 / 四 / 六」各节；核对方法一节说明了骨架差异的粒度成因（译文长度变化
改变空化后的节点边界）。本轮新增的三个文件（`src/lib/music3Vocabulary.ts`、
`scripts/test-music3-vocabulary.cjs`、`docs/locale/evidence/walkthrough-batch12/`）不在基线里，
`locale-structure-check.cjs` 不会报它们，已在 structure-changes.md 第八节单列说明。

### 第 14 轮附带发现：Music 3 的「既显示又进提示词」文案

走查脚本在音乐 · Music 3 工作区发现约 89 条英文短语同时出现在界面上（芯片按钮、三个
`<datalist>` 的建议、预设卡片的调性）并原样进入 Music 3 提示词。按「显示 / 提示词分层」
规则做了拆分：

- 提示词层不动：`src/lib/music3Vocabulary.ts` 的 `music3Genres` / `music3Keys` /
  `music3Progressions` / `music3KeywordGroups` / `music3MetadataPresets` 仍是英文原值，
  仍写入 `Draft`、写进 localStorage、原样进入提示词。
- 显示层给中文：同一模块新增 `music3GenreLabels` / `music3KeyLabels` /
  `music3ProgressionLabels` / `music3KeywordLabels` / `music3MetadataLabels` 映射表；
  芯片按钮显示中文、点击后仍插入英文原值；`<datalist>` 的选项用 `label` 与文本内容给中文、
  仍以 `value` 写回英文原值；预设卡片的调性半区改走显示映射。
- 机器校验：新增 `scripts/test-music3-vocabulary.cjs`（= `pnpm test:music3-vocabulary`），
  断言 185 个提示词值逐一有中文显示标签、标签不含英文单词、映射表无悬空键、提示词层无中文。
- 提示词逐字节回归仍然通过（16 段与 `1a7ea28` 一致），说明拆分没有碰到提示词。

术语口径同步写进 `docs/locale/glossary.md`（新增「音乐术语」一节）：流派 57 项的中文写法、
调性的 `C major` → `C 大调` 写法、声音预设标题按作品名保留英文流派名的说明。

### 第 14 轮附带修复：画幅方向用词统一

H3 分辨率下拉用的是「横屏 / 竖屏」，而 `RenderSize.tsx` 与 `Ltx25Workspace.tsx` 的方向
下拉用的是「横向 / 竖向」。两处方向下拉统一为「横屏 / 竖屏」（与 H3 侧同口径），
`<option>` 的 `value` 不变。Z-Image 的**图片**画幅是另一套词表（`宽屏 · 16:9`、
`照片横向 · 3:2`、`竖幅 · 4:5` 等），保持原样并写进 glossary。

### 第 15 轮：独立 Verifier 的 A3 判定（两处枚举裸显示）

第 15 轮独立 Verifier 判 FAIL（仅 A3，其余九项 PASS）：两处在实机 DOM 里确认的枚举值
裸显示，都位于自动门禁与走查收集器都看不见的位置。

| 位置 | 原样 | 修复 |
| --- | --- | --- |
| `src/components/Music3Workspace.tsx:167`（正在播放卡片） | `{draft.genre}` / `{draft.key}` 直接透出（实机显示 `Pop` / `120 BPM · C major · …`） | 改走 `music3GenreLabels` / `music3KeyLabels` 显示映射，带 `?? 原值` 兜底；空值仍显示「自定义音色 / 自定义调性」 |
| `src/components/AceStepWorkspace.tsx:112`（调性下拉） | `<option>{key}</option>` 裸渲染 24 个英文调性 | `keys` 改为 `[英文原值, 中文标签]` 元组表（与同文件 `languages` 同形态），`<option>` 以 `value` 写回英文原值 |

为什么此前看不见：JSX 表达式里的裸标识符（`{draft.key}`）不在扫描器的字面量分类里（登记过的
已知限制）；关闭态 `<select>` 的 option 文本节点没有 client rects，走查收集器的 TreeWalker 也
扫不到。本轮补两处兜底：走查收集器现在直接读取每个 `<select>` 的选中项文本；
`MUST_NOT_RENDER` 名单补 `C major` / `Pop`（`FIND_MISSED` 用 `innerText`，能同时覆盖
正在播放条与关闭态下拉的选中项）。

**附带：扫描器死规则修正**（Verifier risk #2）。上一轮登记的「UI 属性上的模板表达式」规则
从未命中过——`` attr={`…`} `` 的 initializer 是 `JsxExpression` 而非 `TemplateExpression`，
属于死规则、文档夸大了覆盖面。本轮统一解包 `JsxExpression` 后分类，`attr={'文本'}` 与模板
形式都进入扫描；模板表达式只取静态段（`${…}` 内部是代码，如 `provider === 'ollama'` 的存储
比较，不应当作界面文案做术语与大小写检查——解包后首跑就在 `ScratchpadWorkspace.tsx:88` 抓到
这类误报，静态段修正后消除）。扫描量 4748 → 4903 条字面量（界面文案 4035 → 4165、提示词/存储
713 → 738），`locale-audit` 仍 0 处问题。口径变化使基线快照从 1483 条重提为 1496 条
（`docs/locale/en-US.json`，重提后与基线 ref 逐字节可复现；快照是离线归档，没有任何测试回读）。

**附带：走查脚本退出修复**。脚本成功路径不关闭 CDP WebSocket，进程在打印完报告后悬挂不退出
（此前多轮「仍在运行」的走查后台任务即由此堆积）。成功路径现在显式关闭 socket 并 `exit(0)`。

**附带：发布说明落点**。仓库内没有发布说明文件，brief 要求的「发布说明注明 CJK 字体依赖」
落在新文件 `docs/locale/release-notes.md`（Linux 各发行版的 CJK 字体安装提示，Windows/macOS
默认带中文字体）。

本轮走查由单一进程干净跑完（清掉了此前互相干扰的多个残留走查进程）：22 个外壳全部命中、
19 个 needle 字符串 0 命中、0 处横向溢出；全应用可见英文仅 13 条——12 条 keep-english 已
登记的品牌 / 型号 / 硬件名，加上本地化之前持久化的影片项目名 `Untitled movie`。上一轮报告
里队列页回放的 ~23 条英文任务记录本次不再渲染：那批持久化任务在两轮之间已不在当前
`userData` 里，类别仍按用户数据保留登记。

## 本轮门禁重跑结果

| 检查 | 结果 |
| --- | --- |
| `node scripts/locale-audit.cjs` | 0 处问题（4165 条界面文案 / 738 条提示词位，第 15 轮口径） |
| `node scripts/test-music3-vocabulary.cjs` | PASS（185 个提示词值全部有中文显示标签） |
| `node scripts/test-prompt-parity.cjs` | PASS（16 段与 `1a7ea28` 逐字节一致） |
| `node scripts/extract-locale.cjs --ref 1a7ea28` + `diff` | 与 `docs/locale/en-US.json` 逐字节一致（1496 条 / 86 个文件，第 15 轮新口径重提后可复现） |
| `pnpm typecheck` | 通过 |
| `pnpm lint` | 通过，0 警告 |
| `pnpm test` | 22 套全过 |
| `pnpm build:web` | 通过 |
| `node scripts/locale-structure-check.cjs` | 44 个文件，逐条归类见 `docs/locale/structure-changes.md` |
| `node scripts/locale-walkthrough.cjs` | 22 个外壳全部命中、19 个 needle 0 命中、0 处溢出；可见英文 13 条（12 条 keep-english + 1 条用户数据） |


## 中文修订轮（zh-locale-revision，2026-11-12）

本地化合入后的译文精修轮，分支 `zh-locale-revision`（基线 `a41e5c5`，中心口径提交 `e652a86` + 本轮代理修订）。
七组并行评审（App 壳层 / 导航与手机端 / 设置与 Electron / 角色工作室 / 场景与提示词 / 续接与影片剪辑 / 生成工作区）
对照英文基线逐条复核全部 4165 条界面文案，只改显示层中文。

### 修订内容

- **语义修正**（误译/漏译/直译腔）：`Studio settings` 误译「工作区设置」（指整个应用）、「identity survey」漂成
  「形象巡检」（App 同句为「身份巡检」）、`better encoding` 误译「画质更好」、"Assigned reference set" 译成
  界面上不存在的「角色素材库与媒体」（SceneIssues 提示同步指名悬空）、`referenceAnalysis.ts` 两处 new Error 英文漏译、
  「对于…来说过长」等直译腔、「isolated」误译「隔离」、Music 3 预设五处错译（Progressive→渐进、Cloud rap 漏字等）。
- **术语统一**：「已审核」→「已确认」（App.tsx 独有变体 30+ 处归零）、「图像」→「图片」（electron/main.ts 8 处）、
  「分段/分块」、「生产命令/生产提示词命令」→「制作指令」、「生成来源」→「生成的素材」、「更换」→「替换」（Replace）。
- **跨组裁断**（负责人统一）：省略号全树统一单 `…`（69 处 `……` 归零）；「采用建议」→「使用建议」（3:1）；
  「个已选中」→「个已选」；`Ctrl-F`→`Ctrl+F`（keep-english 登记 content 豁免）；「仅作参考」→「仅参考」（11:2，
  为复合词定语）、「角色细节参考」→「角色细节参考图」（与角色工作室区块同名）。
- **术语表**：新增 identity survey、isolated、workflow sections、angle survey、dismiss、replace、use suggestion、
  reference only、character detail references、chunk、润色语境 refine、generation defaults、browser profile、
  runtime capability gate、opening frame 口语语境、assembly & canonical sources、assigned reference set 等条目；
  keep-english 登记 `Ctrl+F` 与 Ltx25Workspace 采样器/调度器中文前缀写法。
- **promptPresets / referenceAnalysis 等提示词层、存储值、标识符、文件名、CLI、节点类名零改动**（越界检测器逐文件
  多重集比对通过）。

### 门禁结果

| 检查 | 结果 |
| --- | --- |
| `node scripts/locale-audit.cjs` | 0 处问题（4165 条界面文案 / 738 条提示词位） |
| `node scripts/test-prompt-parity.cjs` | PASS（16 段与 `1a7ea28` 逐字节一致） |
| 越界检测（`/tmp/locale-packet/check-prompt-layer.cjs`，多重集比对非显示字面量） | PASS（41 个改动文件提示词层/存储层与 HEAD 逐字节一致） |
| `node scripts/locale-structure-check.cjs` | 44 个文件（较上轮 45 少 1：`CreatePromptPanel.tsx` 的 JSX 空格修正使骨架恢复与英文基线一致，属改善，见 structure-changes.md） |
| 术语漂移复测（对照英文基线重新配对） | 同英多译组 83 → 56，剩余逐条核为配对噪声 / 元组 value 半区 / data 行例外 / 量词差异 |
| `pnpm typecheck` | 通过 |
| `pnpm lint` | 通过，0 警告 |
| `pnpm test` | 22 套全过 |
| `pnpm build:web` | 通过 |
| `node scripts/locale-walkthrough.cjs --out /tmp/locale-packet/walkthrough-final` | 22 个外壳全部命中、0 处横向溢出、0 处侧栏丢失、回归 needle 0 命中；残留英文全部为 keep-english 登记的品牌/型号/硬件名与用户数据透出 |

### 遗留登记（超出「只改字符串」边界，未在本轮处理）

- `App.tsx` 的 `turbo8Profile`、`JobsView.tsx` 的 `jobStatusLabels[status] ?? status` 等枚举兜底会裸露英文值
  （stable / euler-beta 等）；修复需加值→标签映射，属代码结构变更。
- `main.ts:1561` 的 `需要受支持的 ${kind} 文件`，`${kind}` 是存储值会透出英文；建议渲染层映射中文标签。
- `Character ${index}` 默认项目名中文化需同步改守卫正则（参照其余四个库的双语守卫做法）。
