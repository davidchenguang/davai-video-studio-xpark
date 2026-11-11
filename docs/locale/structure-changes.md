# 本地化之外的结构性改动清单（docs/locale/structure-changes.md）

验收项 A9「本地化之外没有其它改动」要求：`git diff 1a7ea28` 中除界面文案替换、显示/提示词层拆分、
测试脚本断言同步、审计/提取/parity 工具及其 fixture、`index.html` 的 `lang`、manifest 的 `description`
之外，不存在业务逻辑、组件结构、样式类名或数据结构的修改。

本文件逐条列出本次改动中**不属于字面量替换**的部分，供验收逐条核对。

## 核对方法

`scripts/locale-structure-check.cjs` 把每个文件的源码按 TypeScript AST 解析，把所有字符串字面量、
模板文本与 JSX 文本节点替换成占位符，再与基线 ref `1a7ea28` 的同名骨架逐行比对：
骨架不同 = 该文件存在字面量之外的改动。44 个文件存在骨架差异，全部在下表分类。
正则字面量不在空化范围内，因此第四节的守卫改动会出现在骨架差异里。

骨架差异**不等于**结构性改动：空化以「字面量 / 模板静态段 / JSX 文本节点」为单位，
译文长度变化会改变节点边界（例如 `<output>{state.duration}</output>` 的尾随空格变成
`<output>{state.duration} </output>`），于是只换了文案的文件也会出现骨架差异。
本文件因此把骨架差异分成两类逐个列出：

- **第一节到第五节**：真正需要逐条确认的改动（显示层拆分、显示映射、守卫逻辑、工具与配置）。
- **第六节**：只有字面量替换、骨架差异来自空化边界变化的文件，列出文件名以证明已核对。

第四节新增的守卫、第六节的文件清单都随每一轮改动同步维护；
`node scripts/locale-structure-check.cjs` 报告的文件数与本文件第一节引用的数字必须一致。

## 一、规格已声明的「显示/提示词层拆分」（A9 允许）

| 位置 | 改动 | 依据 |
| --- | --- | --- |
| `src/lib/promptPresets.ts` | `preset()` 签名从 `(category, id, label, description, insertion, keywords)` 改为 `(category, id, labelEn, labelZh, descriptionEn, descriptionZh, insertion, keywords)`，`insertion`/`keywords` 由英文源拼装 | 规格「双语字符串规则」第 1 条 |
| `src/lib/promptComposer.ts` | 新增 `identityReferenceRoleLabel` 显示映射；`MovieReferenceBinding` 增加 `promptLabel` 字段 | 规格「双语字符串规则」第 2 条 |
| `src/lib/scenePromptState.ts` | `bindSceneReferences` 改读 `binding.promptLabel ?? binding.label`；摄影选项拆成英文 `value` + 中文 `label` | 规格「双语字符串规则」第 3 条 |
| `src/types.ts` | `PromptPreset` 增加 `searchLabel?`、`MovieReferenceBinding` 增加 `promptLabel?` | 同上 |
| `src/components/SmartPromptEditor.tsx` | `SmartInsertOption` 增加 `searchLabel?: string` | 同上 |
| `src/App.tsx` | 参考绑定同时产出 `label`（显示）与 `promptLabel`（提示词） | 同上 |

## 二、显示层映射表（把英文存储值映射成中文显示文本）

这类改动只增加「英文值 → 中文」的一层查表，不改变任何存储值、提示词或控制流：

`src/App.tsx`（`referenceRoleDisplayLabels`）、`src/components/SceneComposer.tsx`（`anchorLabels`、
`videoRoleLabels`、`cameraValueLabel()`、`suggestionEvidenceLabels`、`cameraBehaviorLabels`）、
`src/components/SceneContextPanels.tsx`（`mediaKindLabels`：文件类型徽标 image/video/audio 的中文显示）、`src/components/ScratchpadWorkspace.tsx`（`toolLabels`）、
`src/components/ContinueWorkspace.tsx`（`beatStatusLabels`、`replacementRoleLabels`）、
`src/components/CharacterStudio.tsx`（`skinToneLabels`、`hairPresetLabels`、`hairTextureLabels`、
`hairLengthLabels`、`characterVisualStyleLabels`、`accessoryCategoryLabels`、`jobStatusLabels`）、
`src/components/HairStudio.tsx`、`src/components/AccessoryStudio.tsx`、
`src/components/CharacterReferenceList.tsx`（`referenceTypeLabels`）、
`src/components/CharacterLibraryPanel.tsx`（`filterLabels`）、
`src/components/CharacterDialogueModal.tsx`（选项改为 `{ value, label }` 对，显示中文、存储英文）、
`src/components/JobsView.tsx`、`src/components/LibraryView.tsx`、`src/App.tsx`（视频历史条）消费 `src/lib/jobPresentation.ts` 里的 `jobStatusLabels`、`generationModeLabels`（任务状态 / 生成模式的枚举值随任务持久化，映射表放在既有的任务展示辅助模块，`?? 原值` 兜底未知枚举）、
`src/components/LocationStudio.tsx`（`jobStatusLabels`）、
`src/components/MovieEditor.tsx`（`trackDisplayNames`、`clipDisplayNames`）、
`src/components/ReferenceHandoffInspector.tsx`（`referenceTypeLabels`、`referenceRoleLabels`：参考图类型与角色的中文显示，
替代原先的 `file.referenceType.replace('-', ' ')` 字符串拼接）、
`src/lib/videoResolutions.ts`（`VIDEO_RESOLUTION_ORIENTATION_LABELS`：H3 分辨率下拉框的画幅方向显示名
方形 / 横屏 / 竖屏 / 超宽，与 `src/App.tsx` 里该下拉框的 optgroup 标题同口径）、
`src/lib/music3Vocabulary.ts`（Music 3 的流派 / 调性 / 情绪走向 / 关键词 / 风格描述预设的中文显示映射，
英文原值仍留在同一模块的 `music3*` 值列表里，见下）、
`src/lib/gpuRouting.ts`（组件标签的中英空格辅助函数）。

数据文件里的显示文案（不是映射表，而是直接写进元组的显示半区）：

- `src/lib/characterPresets.ts` — 角色外貌 / 声音 / 表演预设元组的第二段（显示标签）译为中文；
  第一段（存储值 `custom`、`hero` 等）与第三段（提示词描述，进入 `description` / `voiceNotes`）保持英文。
- `src/lib/movieHandoff.ts` — `movieFrameTargets` 元组的第二段（显示标签）译为中文；
  第一段（存储值，进入续接载荷并持久化）保持英文，`H3 Ref2VA` / `H3 I2V` / `LTX 2.5` 按 keep-english 登记保留。

## 三、中文没有复数形态，去掉英文单复数三元

形如 `count === 1 ? ' clip' : ' clips'` 的英文复数分支在中文下没有意义，相应位置删掉三元的一个分支，
计数与文案本身不变。涉及 `src/App.tsx`、`src/MobileApp.tsx`、`src/components/AccessoryStudio.tsx`、
`AssetLibraryRail.tsx`、`CharacterLibraryPanel.tsx`、`CharacterStudio.tsx`、`ClipMasterBeta.tsx`、
`ContinueWorkspace.tsx`、`FrameBookmarkStudio.tsx`、`JobsView.tsx`、`MovieEditor.tsx`、
`VideoCompare.tsx`、`WardrobeStudio.tsx`、`WorkspaceProjectManager.tsx`、`SceneIssues.tsx`、
`ZImageWorkspace.tsx` 等。

## 四、必须逐条确认的三处逻辑改动

| 位置 | 改动 | 为什么必要 | 行为是否与基线一致 |
| --- | --- | --- | --- |
| `src/lib/continuation.ts` | 新增私有 `asciiFilenamePart()`：原名含非 ASCII 且清洗后不含字母时回退到 `Untitled-Video` / `Beat-N` | 默认节拍名改为中文后，文件名清洗会得到纯数字（`节拍 1` → `1`） | **一致**：中文默认名经该函数得到 `beat1-Beat-1`，与基线英文默认名 `Beat 1` 的输出文件名逐字节相同；`continuationFilenamePart()` 的对外行为未变 |
| `electron/main.ts` | 上传超限的判定正则增加 `ComfyUI 返回了 413` | 通用 ComfyUI 请求助手（`electron/main.ts:546`）的错误正文已译为中文，413 会以 `ComfyUI 返回了 413` 出现 | **一致**：只扩展匹配，不改变原有英文匹配 |
| `src/components/ContinueWorkspace.tsx` | `nextBeatName()` 同时避让 `节拍 N` 与 `beat N` 两种写法 | 默认名中文化后，旧草稿里已有的英文名仍是用户数据，重名判定要覆盖两种写法 | **一致**：仅避免生成重名，不改写任何已有名称 |
| `src/components/HairStudio.tsx`、`src/components/WardrobeStudio.tsx`、`src/components/AccessoryStudio.tsx`、`src/components/LocationStudio.tsx` | 「名字仍是默认值」的正则守卫同时接受中英文两种默认名（`/^(Hair design|发型设计) \d+$/i` 等 4 处） | 四个素材库的默认项目名改为中文（同 MovieEditor 的 `未命名影片` 先例）；旧档案里以英文默认名保存的项目仍要能被视觉模型自动填充覆盖 | **一致**：只扩大匹配集合，中文分支只匹配新默认名，不影响用户自命名 |
| `src/components/Music3Workspace.tsx` | `MusicPreset` 类型里的 `name: string` 字段改名为 `title: string`，20 个预设对象同步改名 | 预设的英文名被译为中文后，`name` 会与「用户给草稿取的名字」混淆；改名只影响模块内字面量 | **一致**：`applyPreset()`（第 145 行附近）从不读取该字段，预设对象是模块内常量、不持久化；界面读的是改名后的 `title` |
| `src/components/ReferenceHandoffInspector.tsx` | 新增 `referenceTypeLabels` / `referenceRoleLabels` 两个显示映射，替代 `file.referenceType.replace('-', ' ')` | 参考图类型与角色原本直接透出英文存储值（`full-body`、`lighting-style`），属半中半英 | **一致**：只改显示文本，存储值与提交给模型的角色判定不变 |
| `src/components/Music3Workspace.tsx`、`src/lib/music3Vocabulary.ts`（新增模块） | Music 3 的流派 / 调性 / 情绪走向 / 人声与编曲关键词 / 风格描述预设从组件里的模块级常量移到新模块 `src/lib/music3Vocabulary.ts`，并为每个值补一份中文显示映射：芯片按钮显示中文、点击后仍插入英文原值；三个 `<datalist>` 的选项用 `label` + 文本内容给中文、仍以 `value` 写回英文原值；预设卡片里的调性半区改走显示映射 | 走查发现 Music 3 工作区的芯片按钮与下拉建议直接显示英文提示词短语（`airy head voice`、`restrained opening, …` 等），属「既显示又进提示词」的双语场景 | **一致**：英文原值一字未改，仍写入 `Draft`、写进 localStorage、原样进入 Music 3 提示词；`scripts/test-prompt-parity.cjs` 的 16 段提示词逐字节不变。界面上的输入框仍显示英文原值（输入框绑定的是提示词内容本身，与提示词正文同一口径） |
| `src/components/RenderSize.tsx`、`src/components/Ltx25Workspace.tsx` | 方向下拉的显示词由「横向 / 竖向」改为「横屏 / 竖屏」 | H3 分辨率下拉（`src/lib/videoResolutions.ts` 与 `src/App.tsx` 的 optgroup）用的是「横屏 / 竖屏」，两处口径不一致 | **一致**：只改 `<option>` 的显示文本，`value` 仍是 `landscape` / `portrait` 等存储值 |
| `src/components/AceStepWorkspace.tsx`、`src/components/Music3Workspace.tsx`（第 15 轮） | ① ACE-Step 的 `keys` 从 24 个字符串的数组改为 `[英文原值, 中文标签]` 元组表（与同文件既有的 `languages` 同一形态），`<option>` 以 `value` 写回英文原值、以标签文本显示中文；② Music 3 右侧「正在播放」卡片的流派 / 调性从裸透出 `draft.genre` / `draft.key` 改为走 `music3GenreLabels` / `music3KeyLabels` 显示映射（带 `?? 原值` 兜底，空值仍显示「自定义音色 / 自定义调性」） | 第 15 轮独立 Verifier 在实机 DOM 里确认的两处 A3 残留：枚举值直接渲染成界面英文，而自动门禁与走查的收集器都看不见这两个位置 | **一致**：`state.keyScale` / `draft.genre` / `draft.key` 的存储值与提交内容不变（`prompt-parity` 16 段逐字节一致）；旧 localStorage 里的英文 `keyScale` 在新代码下加载后 `<select>` 按 `value` 匹配仍然选中 |

## 五、工具与配置的附带改动

| 位置 | 改动 | 依据 |
| --- | --- | --- |
| `package.json` | 新增 `test:locale`、`test:prompt-parity` 并串进 `pnpm test` | A9 允许「审计/提取/parity 工具」 |
| `scripts/lib/locale-scan.cjs`、`scripts/locale-audit.cjs`、`scripts/extract-locale.cjs`、`scripts/locale-list.cjs`、`scripts/lib/locale-blind.cjs`、`scripts/locale-blind.cjs`、`scripts/test-prompt-parity.cjs`、`scripts/capture-prompt-parity.cjs`、`scripts/fixtures/prompt-parity-baseline.json` | 新增或扩展审计、提取、盲区清单与提示词回归工具 | A9 允许 |
| `scripts/test-ts-loader.cjs` | 支持宿主脚本通过 `global.__TS_LOADER_EXTRA_GLOBALS__` 向沙箱注入额外全局对象 | parity harness 需要注入桩对象 |
| `scripts/lib/locale-scan.cjs`（批次 12 扩展） | 新增四类分类规则：① 元组数组（`[[存储值, 显示标签, 提示词?], …]`，标签位与含 CJK 的兄弟位归显示层，其余归提示词层）；② 显示工厂函数（名字以 `Label/Labels/Text/Title/Heading/Caption/Hint/Note/Description` 结尾）内的条件分支字面量；③ 显示 sink 调用实参（`setMessage`/`setFailure`/`setError`/`onNotice`/`showNotice`/`Promise.resolve`，排除 `success`/`error` 等 tone 枚举）；④ UI 属性上的模板表达式（该规则当时是死规则——见下一行的第 15 轮修正） | 批次 11 的独立验收发现扫描器存在盲区：元组标签、条件分支、消息实参与模板表达式四类显示字符串既未进显示层清单、也不在提示词层清单里，等于完全不可见。补齐后 `test:locale` 才能真正检测这一类漏译 |
| `scripts/lib/locale-scan.cjs`（第 15 轮修正） | JSX 属性统一解包 `JsxExpression` 包装后分类：`attr={'文本'}` 与 `` attr={`文本 ${x}`} `` 的 initializer 是 `JsxExpression` 而非字符串/模板字面量，原规则从未命中（第 15 轮独立 Verifier 指出的死规则）；模板表达式只取静态段（head 与各 span 的字面量），`${…}` 内部是代码（如 `provider === 'ollama'` 的存储比较），不再当作界面文案参与术语与大小写检查 | 修正后扫描量 4748 → 4903 条字面量（界面文案 4035 → 4165、提示词/存储 713 → 738）；`docs/locale/en-US.json` 基线快照按新口径重提为 1496 条（原 1483 条），重提后与基线 ref 逐字节可复现 |
| `scripts/locale-walkthrough.cjs`（第 15 轮修正） | ① 英文收集器补扫关闭态 `<select>` 的选中项文本（option 文本节点无 client rects，TreeWalker 扫不到——ACE-Step 调性下拉的残留正是藏在这里）；② MUST_NOT_RENDER 名单补 `C major` / `Pop`（Music 3 正在播放条与 ACE-Step 调性下拉的枚举裸显示） | 第 15 轮独立 Verifier 在实机 DOM 里确认的两处 A3 残留都位于自动门禁看不见的位置；补扫后走查证据覆盖这类盲区 |
| `scripts/locale-walkthrough.cjs`（批次 12 新增） | 仓库内可复跑的 A10 走查脚本：通过 CDP 驱动真实 Electron 渲染进程，逐个进入侧边栏 20 个目的地与影片剪辑、手机两种外壳，截图、收集残留英文短语、检查 900×700 窄屏横向溢出，并断言「此前漏译的 16 个字符串」不再出现在 DOM 中 | 走查此前靠一次性临时脚本完成，无法复跑、证据不可审计。改为仓库内脚本后，验收证据随代码一起留存 |
| `scripts/test-music3-vocabulary.cjs`（批次 12b 新增） | 校验 Music 3 的双语层：185 个提示词层英文值逐一有中文显示标签、标签本身不含英文单词、映射表无悬空键、提示词层不含中文字符 | 双语层是「显示中文 + 提示词英文」的手工约定，没有机器校验就容易在后续改动里把某一侧写错 |
| `package.json`（批次 12b） | 新增 `test:music3-vocabulary` 并串进 `pnpm test` | 与 `test:locale`、`test:prompt-parity` 一样纳入常驻门禁 |
| `scripts/extract-locale.cjs` | `_meta.note` 改为英文（`file:line`） | 快照文件是机器读写的离线归档，元信息保持英文，避免与「显示层必须中文」的规则冲突 |
| `eslint.config.mjs` | `ignores` 增加 `.claude`、`.worktrees` | 主检出目录里的 `.worktrees/` 是一份完整副本，不排除会让 `pnpm lint` 重复 lint 整个工作树 |
| `index.html` | `lang="zh-CN"` | A9 允许 |
| `public/manifest.webmanifest` | `description` 译为中文（`name`/`short_name` 保留英文） | A9 允许 |
| `scripts/test-*.cjs` | 断言值同步为中文 | A9 允许「测试脚本断言同步」 |

## 六、只有字面量替换、骨架差异来自空化边界变化的文件

下列文件的 `locale-structure-check.cjs` 报告骨架差异，但逐条核对 `git diff 1a7ea28 -- <file>`
后确认**只有字符串字面量（含模板静态段与 JSX 文本节点）被替换**：译文长度变化改变了空化后的
节点边界，骨架因此错位。它们不涉及业务逻辑、组件结构、样式类名或数据结构。

`src/components/AceStepWorkspace.tsx`（第 15 轮起移出本节——`keys` 从字符串数组改为
`[英文原值, 中文标签]` 元组表，见 §四）、`src/components/AssetLibraryRail.tsx`、
`src/components/ClipMasterBeta.tsx`、`src/components/CreatePromptPanel.tsx`、
`src/components/FrameBookmarkStudio.tsx`、`src/components/Ltx25Workspace.tsx`、
`src/components/LtxRippleWorkspace.tsx`、`src/components/ReferencePrepStudio.tsx`、
`src/components/ReferenceSourcePanel.tsx`、`src/components/SceneIssues.tsx`、
`src/components/SettingsView.tsx`、`src/components/VideoCompare.tsx`、
`src/components/WorkspaceProjectManager.tsx`、`src/components/ZImageWorkspace.tsx`、
`src/lib/h3SceneCompiler.ts`

（批次 12 复核：逐个查看 `git diff 1a7ea28` 的增删行，均为中文文案替换，例如
`setBusy('Reading source clip')` → `setBusy('正在读取源片段')`、
`aria-label="Reference inputs"` → `aria-label="参考输入"`、
`{ prompt.length } character prompt` → `{ prompt.length } 字符提示词`。）

## 七、明确不属于本清单的文件

`docs/locale/en-US.json`（基线英文快照）、`docs/locale/evidence/`（走查截图与报告）、
`docs/comet/`、`docs/superpowers/` 不计入 A9 判定。

## 八、本轮新增文件在结构检查里的位置

`scripts/locale-structure-check.cjs` 只比较基线 ref 里已存在的文件（`git diff --name-only <ref>`），
因此本轮新增的文件不会出现在它的报告里，需要单独说明：

| 新增文件 | 性质 | 依据 |
| --- | --- | --- |
| `src/lib/music3Vocabulary.ts` | 纯新增的词汇模块：Music 3 的提示词层英文原值 + 显示层中文映射，不含任何渲染逻辑 | A9 允许「显示 / 提示词层拆分」；已列入 §二 与 §四 |
| `scripts/test-music3-vocabulary.cjs` | 测试脚本（`.cjs` 不在结构检查的扫描范围内） | A9 允许「审计 / 提取 / parity 工具」 |
| `docs/locale/release-notes.md`（第 15 轮新增） | 发布说明素材：Linux 打包的 CJK 字体依赖说明（仓库内此前没有发布说明文件） | brief「发布说明注明 CJK 字体依赖」的落点；`docs/locale/` 下的文档不计入 A9 判定（§七） |
| `docs/locale/evidence/walkthrough-batch12/` | 走查截图与 `report.json` | A9 允许的证据目录（§七） |
