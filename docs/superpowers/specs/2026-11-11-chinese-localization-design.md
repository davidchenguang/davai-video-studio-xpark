# Oyama AI Video Studio 中文本地化设计

日期：2026-11-11
状态：已按对抗性审查修订（第 2 轮），待用户确认

## 1. 意图与背景

Oyama AI Video Studio 目前的客户全部在国内，反馈希望使用中文。代码库中没有任何中文、没有任何 i18n 基础设施，全部界面文案是硬编码的英文字符串。

本设计的目标是：**把面向终端用户的界面文案整体转成简体中文，同时保持应用的可运行性、可维护性、全部提示词产出的逐字节不变，以及未来若需要英文版时的可回溯性。**

明确不做的事：不做语言切换、不引入 i18n 框架、不翻译提示词正文、不翻译开发者文档。

## 2. 现状

清点结果（TypeScript AST 扫描，显示口径：JSX 文本节点、界面属性、展示用对象属性、Error/状态文案、展示数组元素）：**约 2500 条唯一字符串，76 个文件**。字符串量前十：App.tsx 536、SettingsView.tsx 326、CharacterStudio.tsx 172、ContinueWorkspace.tsx 141、MobileApp.tsx 114、MovieEditor.tsx、SceneComposer.tsx、LocationStudio.tsx、SceneContextPanels.tsx、electron/main.ts。全部字符串字面量约 4700 处是上限口径（含提示词正文与标识符），不全是翻译对象；精确数字以批次 0 提取工具产出的 `en-US.json` 键数为准。

关键结构事实：

- 设置项通过 `settings:get` / `settings:save` IPC 持久化到 `userData/settings.json`，`loadSettings()` 用 `{...defaults, ...raw}` 合并。**本方案不引入语言设置项，此处零改动**，既有用户的 `settings.json` 不需要迁移。
- `AppSettings` 类型在 `src/types.ts` 与 `electron/main.ts` 各定义一份。本方案不改 `AppSettings`，因此不需要同步两处。
- 渲染外壳有 **3 个**：`src/App.tsx`（桌面，`src/main.tsx` 路由）、`src/MovieEditorWindow.tsx`（影片剪辑独立窗口）、`src/MobileApp.tsx`（LAN 手机端）。`src/browserMock.ts` 是 `pnpm dev:web` 的 mock 桥不是外壳，但其面向用户的 mock 文案照常翻译。
- **`src/lib/promptPresets.ts` 的 `insertion` 与 `keywords` 是从 `label` / `description` 派生的**：`preset()` 第 3 行 `keywords: \`${label} ${description} ${keywords}\`.toLowerCase().split(/\s+/)`，另有约 26 个预设族用 `Shot: ${label.toLowerCase()} composition; ${description.toLowerCase()} ...` 模板从 `label` / `description` 生成 `insertion`。"译 `label` 而不译 `insertion`"按字面无法实现——见 §5。
- **`keywords` 不是死字段**：`promptCommandScore`（`src/lib/promptPresets.ts:124`）把 `category + label + description + keywords + meta` 拼成检索串做模糊匹配，`searchPromptPresets` 的英文查询排序依赖它。
- **存在"既显示又进提示词"的字符串，且跨越多个文件**：
  - `src/lib/promptComposer.ts` 的 `MovieReferenceBinding.label`（如 `Character: ${name}`、`Wardrobe: ${name} for ${character.name}`、`Previous-shot continuity frame`）既显示在场景参考面板与场景编排下拉里，又被编进 `compiledPrompt`；同文件还有按 `Character:` / `Hair:` 前缀 strip、`item.label.split(' / ')[1]` 与 `'face close-up'` / `'full body'` 字面比较解析 label 的正则逻辑。
  - `src/lib/scenePromptState.ts` 的 `cameraOptions`（42 项）**一串三用**：存储值（`value(label)` 存进 `camera.shotSize.value`）、提示词文本（`h3SceneCompiler.ts` 的 `present()` 直接编进最终提示词）、显示文本（场景面板与下拉）。`suggestScene()` 用英文正则匹配这些选项文本。
  - `src/App.tsx` 有 `binding.label.replace(/^Character:\s*/, ...)` 式解析（约 :294）、把 label 编进 REFERENCE MAP 喂给 `buildPromptAssistantRequest`（约 :1441）；`src/components/SceneComposer.tsx:63` 把 `item.label` 传给 `applySceneCommand`；`src/components/SmartPromptEditor.tsx` 的 `insertion` 既在 :169 显示（预览面板）又在 :124 插入提示词。
- **存在"显示文本与存储值相同"的 `<option>`**：`src/components/ContinueWorkspace.tsx:395` 的 `<option value="wide shot">Wide</option>`（值进 `beat.shotSize`，最终进提示词）、`src/components/LibraryView.tsx:74` 的 `<option value="side camera angle">Side camera angle</option>`、`src/lib/promptComposer.ts` 的 `identityReferenceRole`（值直接进提示词）。
- **测试脚本断言英文界面文案**：`scripts/test-workflows.cjs:15`（`nodeStageLabel('VAEDecode','16') === 'Decoding video frames'`，界面进度文案）、`scripts/test-workflows.cjs:72-76`（`searchPromptPresets('dolly zoom')` 等英文查询，keywords 保持英文后无需变，但需补中文查询用例）、`scripts/test-continuation.cjs:103`（固定显示标签 `'Original'`；同行的 `'Walk to Window'` 等是 fixture 用户数据，不变）、`scripts/test-scene-compiler.cjs:106`（`applySceneCommand(state, 'shot', 'Wide Shot')` 以显示文本为入参）、`scripts/test-ui-e2e.cjs:109`（DOM 文本 `includes('Original')`）。链外三套 `test:ui-e2e` / `test:photo-edit-electron` / `test:clip-master` 同样有英文断言。

## 3. 目标 / 非目标 / 反目标

### 目标

1. 所有面向终端用户的界面文案为简体中文（三个外壳 + Electron 原生对话框 + manifest description + `index.html` lang）。
2. 术语在全部文案中保持一致，由一份术语表驱动。
3. 有可自动执行的检查，能在 CI 与本地发现漏译、术语漂移和提示词层被污染；`test:locale` 与 `test:prompt-parity` 串进 `pnpm test` 链成为常驻门禁。
4. **全部提示词产出路径的输出与改动前逐字节一致**，由基线 fixture 回归保证。
5. 不改变任何业务逻辑、渲染行为、数据结构或用户数据，除 §5 明确允许的显示/提示词层拆分。
6. 英文原文存档可复现（钉死基线 ref），将来若需要英文版不必考古 git 历史。

### 非目标

- 不提供中英切换；不新增任何语言设置项或切换 UI。
- 不翻译提示词正文（见 §5）。
- 不翻译开发者面向的文档：`README.md`、`AGENTS.md`、`docs/` 下既有文档、代码注释、commit message。
- 不翻译品牌名：`<title>` 与 manifest `name` / `short_name` 中的 Oyama AI Video Studio 保留英文（keep 术语）。
- 不做视觉排版改造、不引入中文字体栈、不调整布局。中文文案普遍比英文短，个别标签会变长，实施中如出现溢出再做局部处理。Windows / macOS 系统默认中文字体的渲染可用性列入人工抽查确认项。Linux 打包目标（deb/appimage/tar）保留，但 **Linux 桌面的中文字形人工确认不在本期范围**：发行版是否预装 CJK 字体因发行版而异，属安装环境问题而非代码问题，发布说明注明字体依赖；若客户实际使用 Linux 桌面再补做该确认。

### 反目标（做到以下任一即视为失败）

- 界面上出现半中半英、或者 key / 占位符直接暴露给用户。
- 同一个英文词在不同页面被译成不同中文。
- **任何提示词产出路径的输出发生字节级变化**——与"中文字符进入提示词"同级、同为最高优先级的失败。
- 把存储枚举值（`<option value>`、状态字段、对象键）译掉，导致提示词拼装或状态判断出错；或 localStorage 里的英文存量值在新代码下失效。
- 为了"顺手"而改动与本地化无关的业务逻辑。
- 测试断言没有随译文同步，靠删除断言或跳过套件让 CI 变绿。

## 4. 方案对比

| 方案 | 做法 | 优点 | 缺点 | 结论 |
| --- | --- | --- | --- | --- |
| A. 原地直译 | 把 JSX 里的英文字面量直接换成中文字面量，不引入 `t()` | diff 即字符串替换，可逐条校对；零运行时开销；不新增系统 | 将来加英文需重新提取（有存档可依） | **采用** |
| B. 字典 + `t()` | 全部文案抽到 `src/i18n/zh-CN.ts`，组件内写 `t('key')` | 文案集中，未来加语言轻松；漏翻自动 fallback 成英文 | 约 2500 个 key 需命名；校对时看到 key 而非译文，文案与上下文分离，核对困难；引入本项目用不上的间接层 | 不采用 |
| C. 运行时按浏览器语言自动选 | A + 读取 `navigator.language` 自动决定 | 无需用户操作 | 仍是双语维护成本；本项目已明确只要中文 | 不采用 |

选择 **A** 的核心理由：这是一个本地优先、面向国内客户的单语言交付物。B 方案的一整套间接层在这个场景下没有消费者，且与 `AGENTS.md` 中 *"Reuse existing UI primitives... instead of introducing parallel systems"* 的约定相悖。A 方案让 diff 保持可读——评审者能直接看到译文，而不是 `t('renderSettings.saveAndRefresh')`。

## 5. 双语字符串规则

本项目里有一类字符串**既显示给用户，又原样进入提示词或状态存储**。**分层的单位是字符串的用途，不是所在文件**——这类字符串散布在 lib 与组件两侧，拆分必然跨文件。规则：拆成"显示层"与"提示词层"两份，而不是二选一。

| 层 | 语言 | 典型位置 |
| --- | --- | --- |
| 显示层 | 简体中文 | JSX 文本、界面属性、面板标题、选项显示文本 |
| 提示词层 | 英文 | 预设的 `insertion`、参考绑定模板、`##` 标签名、摄影选项 value、枚举存储值 |

拆分方式（按模块）：

- `src/lib/promptPresets.ts`：`preset()` 停止从 `label` / `description` 派生 `insertion` 与 `keywords`。每个预设族的数据元组显式携带英文术语与英文描述，`insertion` 由这些英文源拼装；`label` / `description` 存中文；`keywords` 由英文源生成。英文检索靠 keywords 仍然可用，中文检索靠 `label` / `description` 命中。
- `src/lib/promptComposer.ts`：`MovieReferenceBinding` 增加独立于 `label` 的提示词片段字段；`label` 用于显示，片段字段用于拼装 `compiledPrompt`。函数内按 `Character:` / `Hair:` 等前缀 strip、`split(' / ')[1]` 与 `'face close-up'` / `'full body'` 字面比较的解析逻辑，改读提示词层字段，解析行为不变。
- `src/lib/scenePromptState.ts` + `src/lib/h3SceneCompiler.ts`：摄影选项从一串三用拆成英文 `value`（存储 + 提示词）与中文 `label`（显示）；`value()` / `suggestScene()` 继续匹配英文值，`present()` 继续输出英文值；localStorage 中的英文存量值原样兼容。
- 调用侧显示与拼装分流：`src/App.tsx`（`binding.label` 前缀解析、REFERENCE MAP 拼装）、`src/components/SceneComposer.tsx`（`applySceneCommand` 调用）、`SceneContextPanels.tsx`、`SmartPromptEditor.tsx`、`CreatePromptPanel.tsx`、`VideoPromptModal.tsx`、`ReferenceHandoffInspector.tsx`——显示路径读中文 label，提示词拼装路径读英文层。
- `SmartPromptEditor` 的插入预览面板（:169 显示 `insertion`）显示的是将要写入的英文提示词本体，属**提示词预览**而非界面文案，登记进 `docs/locale/keep-english.md` 保持英文。
- `<option>` 与状态枚举：**只译显示文本，存储值保持英文**。当 `value` 与显示文本原本相同（如 `value="side camera angle"`）时，把显示文本拆成独立字面量，`<option value="side camera angle">侧向机位</option>`。
- 对象键与状态字段：只用于程序判断的键名不译；同一份数据既要显示又要存储时，按本节拆成两个字段。

**结构改动的许可边界**：允许且仅允许为上述拆分目的改动数据结构与调用点；每处此类改动都被 §8.4 的提示词逐字节回归覆盖。除此之外不新增字段、不改数据结构。

## 6. 术语政策

三条规则：

1. **领域动作与名词** → 译成中文。
2. **品牌、型号、协议名** → 保留英文不译。
3. **用户自己的数据** → 完全不动。

### 6.1 术语表结构（`docs/locale/glossary.md`）

术语表是审计脚本的唯一输入，每条一行 Markdown 表格：

| 英文 | 中文 | 类别 | 备注 |
| --- | --- | --- | --- |
| prompt | 提示词 | translate | |
| render | 渲染 | translate | |
| Turbo 8 | Turbo 8 | keep | 品牌型号，保留英文 |
| H3 | H3 | keep | |

类别取值及其在审计脚本中的行为：

- `translate` — 界面文案中出现其未译英文形式即报错（词边界匹配，大小写不敏感）。
- `keep` — 保留英文。**自动豁免漏译检查（即英文 token 白名单）**；出现在界面文案时写法必须与术语表一致（大小写与连字符敏感）。
- `data` — 不翻译。既不检查未译形式，也不豁免漏译检查；仅用于标注用户数据来源（如"角色名"），实际判定由 §7.1 的例外清单负责。

术语表内容分四组：

**核心术语（translate）**：prompt→提示词、render→渲染、seed→种子、scene→场景、beat→节拍、shot→镜头、shot size→景别、camera angle→机位角度、camera movement→运镜、clip→片段、continuity→连贯性、keyframe→关键帧、take→条、first frame→首帧、last frame→尾帧。

**摄影枚举（translate）**：代码中实际存在的取值逐条对应。

| 枚举值 | 中文 |
| --- | --- |
| `wide shot` / `Wide` | 全景 |
| `medium shot` / `Medium` | 中景 |
| `close-up` / `Close-Up` | 近景 |
| `extreme close-up` / `Extreme Close-Up` | 特写 |
| `full-body` / `Full Body` | 全身 |
| `cowboy` | 七分身 |
| `over-the-shoulder` / `Over-the-Shoulder` | 过肩 |
| `eye-level angle` / `Eye Level` | 平视 |
| `low angle` / `Low Angle` | 仰拍 |
| `high angle` / `High Angle` | 俯拍 |
| `overhead` / `Overhead` | 顶视 |
| `dutch angle` / `Dutch Angle` | 斜角 |
| `profile` | 侧面 |
| `three-quarter` / `Three-Quarter` | 四分之三侧 |
| `locked-off camera` / `Locked` | 固定机位 |
| `slow pan` / `Pan` | 慢摇 |
| `tracking shot` / `Tracking` | 跟拍 |
| `handheld camera` / `Handheld` | 手持 |
| `racking focus` / `Rack Focus` | 变焦对焦 |
| `whip pan` | 甩镜 |
| `steadicam` | 斯坦尼康 |

**品牌与型号（keep）**：H3、Ref2VA、FL2VA、Turbo 8、Turbo 4、LoRA、ComfyUI、ACE-Step、Music 3、LTX 2.5、LTX Ripple、Z-Image、FireRed、BiRefNet、SageAttention、Kitchen INT8、Sol-Attn、VRAM、VAE、SDXL、Qwen、Ollama、LM Studio、NSFW、GPU、API、JSON、Oyama AI Video Studio。

**常用界面动词（translate）**：Generate→生成、Save→保存、Cancel→取消、Delete→删除、Close→关闭、Apply→应用、Reset→重置、Load→加载、Export→导出、Import→导入、Add→添加、Remove→移除、Edit→编辑、Copy→复制、Retry→重试、Start→开始、Stop→停止、Pause→暂停、Preview→预览、Download→下载、Open→打开、Browse→浏览、Select→选择、Confirm→确认、Warning→警告、Error→错误、Success→成功、Loading→加载中、Connected→已连接、Offline→离线。

注意 `LoRA`、`VRAM` 等在中文界面里通常也直接用英文缩写，中文用户对此的认知度高于"低秩自适应"这种全译。

### 6.2 `beat` 的处理

译作 **节拍**，不译作"情节点"。

理由：本应用中的 beat 不是叙事意义上的"情节转折"，而是一个**带独立时长、独立运镜、独立提示词的可渲染单元**——`ContinueWorkspace` 按 beat 逐段渲染再拼接。用"情节点"会让用户误以为它描述剧情。"节拍"是中文编剧 / 分镜语境的通行说法，且两字词在 `Add a beat` → `添加节拍` 这类短标签上不占空间。首次出现的位置借用界面已有的小字说明带一句解释。

## 7. 翻译边界

### 7.1 不翻译的内容

| 内容 | 位置 | 理由 |
| --- | --- | --- |
| 提示词预设的 `insertion` | `src/lib/promptPresets.ts` | 发给模型的指令文本。镜头语言术语（`locked-off camera`、`over-the-shoulder`、`racking focus`）译成中文后语义模糊，直接影响生成质量；且 LTX 2.5 / ACE-Step / Z-Image 对英文提示词的遵循度更可靠。 |
| 预设的 `keywords` | `src/lib/promptPresets.ts` | 参与 `promptCommandScore` 的检索串。保留英文使英文检索仍然可用；中文检索靠 `label` / `description` 命中。 |
| 参考绑定模板（提示词片段字段） | `src/lib/promptComposer.ts` | 编进 `compiledPrompt` 的英文片段。 |
| `##` 标签名 | `src/lib/promptAutoTags.ts` | 提示词的语法结构，不是界面文案。`sectionLabels` 的值（`scene` / `soundscape` / `music`）同理。 |
| vision 分析指令 | `src/lib/referenceAnalysis.ts` | 发给本地 vision 模型的英文指令（`fieldInstructions` 五条值与 `analyzeReferenceImage` / `analyzeSceneReference` 两个 prompt 模板）。模型按英文指令返回 `shotSize` / `angle` 等英文枚举值，直接流入场景状态与提示词编译；译成中文会使模型返回中文值进入存储层，同时破坏 parity 与「提示词层零 CJK」。同文件的用户可见 Error 文案照常翻译。 |
| 摄影选项英文 value | `src/lib/scenePromptState.ts` 等 | 存储值 + 提示词文本；显示层另配中文 label。 |
| 插入预览面板 | `src/components/SmartPromptEditor.tsx` | 显示的是将要写入的英文提示词本体，属提示词预览。 |
| 存储枚举值 | `<option value>`、`beat.shotSize`、`identityReferenceRole` 等 | 会进入状态并参与提示词拼装。 |
| 模型文件名、节点名、路径、URL | 全库 | 标识符。 |
| 错误堆栈与日志 | `electron/main.ts` 等 | 诊断信息；`showErrorBox` 的标题与正文译，堆栈不译。 |
| 用户数据 | 全库 | 项目名、角色名、服装名、素材文件名等一律不动。 |
| 品牌名 | `index.html` `<title>`、manifest `name`/`short_name` | keep 术语。 |

### 7.2 需要翻译的内容

`promptPresets.ts` 的 `label` 与 `description`；`workspaceTips.ts` 的全部 `title` / `description` / `tips` 以及 `setupGuide`；`workspaceNavigation.ts` 的 `label` / `description` / `group`；全部 JSX 文本节点与 UI 相关属性；`src/lib` 与 `electron/` 中会呈现给用户的错误、进度与状态文案（含 `nodeStageLabel` 的阶段文案）；Electron 原生对话框标题与文件类型过滤器名；`showErrorBox` 标题正文；`index.html` 的 `lang="zh-CN"`；`public/manifest.webmanifest` 的 `description`。

## 8. 工具链

### 8.1 扫描器

提取与审计共用一个扫描模块 `scripts/lib/locale-scan.cjs`，用 TypeScript 自带的 AST（`typescript` 已是 devDependency）遍历 `src/**/*.tsx`、`src/**/*.ts`、`electron/**/*.ts`，把每个字符串字面量归类：

**归类为"界面文案"的位置：**

- JSX 文本节点
- JSX 属性：`placeholder`、`title`、`aria-label`、`alt`、`label`、`summary`、`aria-description`
- 对象字面量中属性名为 `label`、`note`、`title`、`description`、`message`、`text`、`hint`、`help`、`heading`、`caption` 的字符串值
- `new Error(...)` / `throw new Error(...)` 的参数
- 字符串数组元素（用于 `options` / `tips` 这类展示数组）——由调用点的变量名与所在结构判定

**归类为"提示词层"或"标识符"的位置：**

- 属性名为 `insertion`、`keywords`、`prompt`、`scene`、`compiledPrompt`、`value` 的字符串值
- 对象键、`id` / `name` / `key` / `type` / `role` 等标识符位置
- `<option>` 的 `value` 属性
- `options={[[value, label], …]}` 这类选项元组的**值位**：`SelectField` 的契约是 `[optionValue, text, optionDisabled?]`，值位是直接落到 DOM 的存储键，与 `<option value>` 同层；标签位仍归界面文案
- 文件路径、URL、模型文件名、ComfyUI 节点名、CSS 类名

**扫描器对两类都无歧义的位置**（例如 `MovieReferenceBinding.label` 这种既是显示又是提示词的字段）不做自动判断，交给 §8.3 的例外清单显式声明。

### 8.2 提取工具

`scripts/extract-locale.cjs` — 一次性使用，产出 `docs/locale/en-US.json`：

```json
{ "_meta": { "baseline": "1a7ea28" }, "src/components/FormFields.tsx": { "12": "Save preset" } }
```

键为 `文件路径:行号`，值为该位置的英文原文。**从基线 Git ref `1a7ea28` 提取**（临时 checkout 该 ref 后运行），`_meta.baseline` 记录来源，使快照可复现重建。**行号在文件改动后会漂移，因此该文件仅作存档与人工对照用，不是运行时依赖，审计脚本也不读它。**

### 8.3 审计工具

`scripts/locale-audit.cjs` — 挂在 `pnpm test:locale`（并串进 `pnpm test`）里。每次**重新扫描当前源码**，不读 `en-US.json`。

四类检查：

1. **漏译检查**：在归类为界面文案、且未在例外清单登记的位置上，字面量以大写字母开头、含至少两个英文单词、不含任何中日韩字符即判为漏译；含术语表 translate 类术语的未译英文形式同样判为漏译。
2. **术语一致性检查**：由术语表驱动。`translate` 类的未译英文形式不得出现在界面文案中（词边界匹配，大小写不敏感）；`keep` 类出现在界面文案时写法必须与术语表一致（大小写与连字符敏感）。
3. **提示词层纯净检查**：归类为"提示词层"的位置上，字面量不得含任何中日韩字符。这一条把"中文字符进入提示词"从风险变成机器保证。
4. **中英空格检查**：界面文案中，中文字符与拉丁字母或数字紧邻（中间无空格）时报错。

**例外清单** `docs/locale/keep-english.md`：记录扫描器无法自动判定的位置（如 `SmartPromptEditor` 的插入预览、双语字段拆分后的提示词层取值点，以及 §7.1 表中逐条列出的位置）。每条写明文件、位置或属性名、以及保持英文的理由。这个文件由实现者随改动维护，是审计脚本的输入之一，**也是 A1 判定口径中的白名单**。

脚本以非零退出码报告问题，并打印 `文件:行号` 便于定位。

### 8.4 提示词逐字节回归（parity）

`scripts/test-prompt-parity.cjs` + `scripts/fixtures/prompt-parity-baseline.json`，挂 `pnpm test:prompt-parity` 并串进 `pnpm test`。

fixture 在批次 0 从基线 ref `1a7ea28` 生成：临时 checkout 该 ref（`git worktree add --detach` 到临时目录，用后删除），用固定输入（固定项目名、角色名、种子、摄影选项）捕获全部提示词产出路径的输出。改动后的代码对同一批输入必须产出**逐字节一致**的结果（深比较序列化后的字符串与图对象）。覆盖：

- `compileScene` 与 `present()`（`src/lib/h3SceneCompiler.ts`）
- `composeReferenceInstructions` / `buildPromptAssistantRequest` 等组合函数（`src/lib/promptComposer.ts`）
- `applySceneCommand` / `suggestScene` / `value()`（`src/lib/scenePromptState.ts`），含"中文 label 选择"与"英文存量 value 直传"两条路径
- `autoTagPrompt`（`src/lib/promptAutoTags.ts`）
- `analyzeReferenceImage` / `analyzeSceneReference` 的 vision 指令与 `fieldInstructions`（`src/lib/referenceAnalysis.ts`，含"中文 label 选择"与"英文存量 value 直传"两条路径之外的第三个风险点：指令被误译会使 vision 模型返回中文枚举值）
- 全部 `src/lib/*Workflow.ts` 图构建器的 prompt 输入字段
- `searchPromptPresets` 英文查询的命中集合与排序

fixture 输入固定、无时间与随机因素，生成后不再手改。这一测试把 §5 的全部结构改动置于机器保证之下：任何一处拆分改动了提示词输出，测试立刻变红。

### 8.5 术语表文件

`docs/locale/glossary.md` — 人读为主、脚本可解析。除术语表外，文件开头还有一个**全局排版规则**小节，记录中英空格规则等与单个术语无关的约定。审计脚本按这个表工作，因此**改术语表就能改检查规则**，不需要改脚本。

## 9. 实施批次

按依赖与风险从低到高推进，每批结束跑 `pnpm typecheck && pnpm lint && pnpm test`。下表是**完整划分**，每个文件只出现一次。

| 批次 | 范围 | 命中量级 | 备注 |
| --- | --- | --- | --- |
| 0 ✅ | 工具链：`scripts/lib/locale-scan.cjs`、`scripts/extract-locale.cjs`、`scripts/locale-audit.cjs`、`scripts/test-prompt-parity.cjs`、`scripts/fixtures/prompt-parity-baseline.json`、`docs/locale/glossary.md`、`docs/locale/keep-english.md`、`docs/locale/en-US.json`、`docs/locale/test-assertion-sync.md`；`package.json` 挂 `pnpm test:locale` 与 `pnpm test:prompt-parity`。**同时全量清点 `scripts/test-*.cjs` 中断言英文界面文案的位置，建断言同步清单。** | 0 | 先从 `1a7ea28` 提取存档（1268 条 / 82 文件）、生成 parity fixture（16 个捕获区块），再建审计脚本。审计采用按文件认领的渐进门禁：文件一旦出现中文界面文案即视为已认领，已认领文件必须全绿；批次 0 时全部文件未认领，审计报告待译计数但通过（剩余 3138 处），parity 全绿——以此验证工具本身有效且 `pnpm test` 在批间保持可用 |
| 1 ✅ | `src/lib/workspaceTips.ts`、`src/lib/workspaceNavigation.ts`（253 条文案；含 test-workspace-navigation 11/12/16 行断言与 ui-e2e 导航断言同步；定名见 glossary「工作区与应用内定名」节） | ~257 | 长句为主，是译文质量的风向标 |
| 2 ✅ | `src/lib/promptPresets.ts`（236 条双语化；`PromptPreset.searchLabel` 英文检索层 + `promptCommandScore` 双语双查层级，英文排序逐字节保持） | 约 120 条预设 | 按 §5 拆分显示层与提示词层；`promptPresetCategories` 的 `label` 一并译；英文查询排序靠 parity 与 test-workflows 双重把关 |
| 3 ✅ | 双语拆分主战场：`src/lib/promptComposer.ts`、`src/lib/scenePromptState.ts`、`src/lib/promptAutoTags.ts`、`src/lib/referencePromptRules.ts`，及调用侧 `src/App.tsx` 双语点、`SceneComposer.tsx`、`SceneContextPanels.tsx`、`SmartPromptEditor.tsx` 的分流改动 | ~80 | `MovieReferenceBinding.promptLabel` + `scenePromptState.cameraOptions[]{value,label}` + `cameraOptionValues` + `cameraValueFor()` 三处拆分落地；parity 全程绿。`h3SceneCompiler.ts`、`referenceAnalysis.ts`、`continuation.ts`、`CreatePromptPanel.tsx`、`VideoPromptModal.tsx`、`ReferenceHandoffInspector.tsx` 的**文案**未在此批完成，已移入批次 5 / 4b |
| 4 🔄（拆 4a/4b） | 共享组件。**4a**：`WorkspaceSidebar`、`WorkspaceSectionTabs`、`Workspace`、`WorkspaceNavigator`、`WorkspaceProjectManager`、`WorkspaceTips`、`ErrorBoundary`、`VideoPlayer`、`ReliableVideo`、`VideoExportButtons`、`MovieMediaThumbnail`、`AssetLibraryRail`、`SceneIssues`、`JobsView`、`LegacyMigrationControl`、`RenderSize`、`FrameResolutionControl`、`ImageCrop`、`ui/index.tsx`。**4b**：`CharacterDialogueModal`、`CharacterLibraryPanel`、`CharacterReferenceList`、`CharacterReadiness`、`ReferenceApprovalModal`、`VideoCompare`、`VideoReferenceClipper`、`ReferenceHandoffInspector`、`VideoPromptModal`、`SmartPromptEditor` | ~180 | `FormFields.tsx` 无 display 命中，无需翻译。`SmartPromptEditor` 的插入预览面板按例外清单保持英文 |
| 5 🔄 | 生成工作区：`SceneComposer`（剩余文案）、`SceneContextPanels`、`CreatePromptPanel`、`H3PromptEditor`、`ReferenceSourcePanel`、`ContinueWorkspace`、`ScratchpadWorkspace` + `src/lib/h3SceneCompiler.ts`、`src/lib/referencePromptRules.ts`、`src/lib/referenceAnalysis.ts`、`src/lib/continuation.ts` | ~330 | `ContinueWorkspace` 的 `<option value>` 拆显示文本；`test-continuation.cjs` 段标签断言由本批独占同步 |
| 6 ✅ | 素材工作区：`CharacterStudio`、`HairStudio`、`WardrobeStudio`、`AccessoryStudio`、`LocationStudio`、`ReferencePrepStudio`、`FrameBookmarkStudio` | ~380 | 视觉风格等 `<option>` 补 `value=` 后再拆显示文本，旧英文存储值不受影响；`LocationStudio.surveyCameras[].prompt` 改名 `cameraLanguage`（原名会被扫描器误判为界面文案），显示字段 `name` 改名 `label` |
| 7 🔄 | 审阅与剪辑：`LibraryView`、`ClipMasterBeta`、`MovieEditor`、`MovieEditorWindow.tsx`、`PhotoEditWorkspace`、`Ltx25Workspace`、`LtxRippleWorkspace`、`ZImageWorkspace`、`Music3Workspace`、`AceStepWorkspace` | ~420 | `LibraryView` 的同值 `<option>` 拆显示文本 |
| 8 🔄（拆 8a/8b） | 大屏。**8a**：`src/App.tsx`（717 条 display）。**8b**：`src/components/SettingsView.tsx`（448 条 display） | ~545 | `App.tsx` 多处超长单行 JSX，单文件独占一个 agent，避免同文件并发写冲突；双语点已在批次 3 改完 |
| 9 🔄 | 其它入口：`src/MobileApp.tsx`、`src/browserMock.ts`（面向用户的 mock 文案）、`src/main.tsx`、`index.html`（lang）、`public/manifest.webmanifest`（description），并接管批次 3/5 遗留的 `src/lib` 小文件（`h3Diagnostics`、`useLivePreview`、`llmProvider`、`workflow`、`fireRedEditWorkflow`、`ltxRippleWorkflow`、`ltxRippleBatch` 等 Error 文案） | ~115 | `browserMock.ts` 的多数命中是路径与节点名，误报需人工排除 |
| 10 ✅ | `electron/main.ts`、`electron/legacyBrowserStorage.ts`、`electron/comfyCancellation.ts`：错误/进度/状态文案、原生对话框标题与过滤器名、`showErrorBox` 标题正文；堆栈与路径保留 | ~95 | 扫描器新增 `insideDialogFilters()`：对话框 `filters[].name` 是原生对话框可见文本，判为 display（此前被归入提示词层，中文过滤器名会误报「提示词层 CJK 污染」）。连带后果：`main.ts:546` 的 `ComfyUI returned ${status}` 译为中文后，`main.ts:1391` 的 413 重试正则必须同时匹配中英文两种形式 |

| 11 | 审计归零 + 断言同步收尾 + 全量验证 | — | 见 §11；链外三套 e2e 此刻跑通 |

### 9.1 分类器盲区与盲区扫描（批次 6/3 收尾时补入）

按语法位置分类必然漏掉三类用户可见字符串：`return '…'` 直接返回的显示文本，`{ '161': 'Preparing motion context' }` 这类"枚举/ID → 显示文本"的查表值，以及 `function C({ ariaLabel = 'Video prompt' })` 这类**参数默认值**（它是调用方不传时的可见文本）。`scripts/lib/locale-scan.cjs` 无法判定它们，因此新增 `scripts/lib/locale-blind.cjs` 与 `scripts/locale-list.cjs --blind` 作为**人工扫查工作单**，不作为自动门禁——盲区里既有该译的界面文案，也有必须保持英文的存储值、文件名与节点名。

盲区扫描量级：全树 1407 处，其中多词英文 468 处；已认领文件内 334 处，主要集中在 `Music3Workspace.tsx`（226 处音乐预设数据）、`App.tsx`（86 处提示文案与参考图类型）与 `electron/main.ts`（11 处 HTTP 头与目录名，合法保留英文）。

由此补译的、任何批次都不归属的 `src/lib` 文件：`renderProgress.ts`（12 条渲染阶段标签）、`ltx25Resolutions.ts`（5 条画质档位）、`attentionBackend.ts`（4 条注意力后端标签）、`solDiagnostics.ts`（5 条 Sol 运行时状态）、`renderActivity.ts`（1 条）。这批标签原先既不被扫描器命中、也不在任何批次范围内。

批次 8 之后建议插入一次人工抽查（§11.3），因为此时全量界面已经可见。

### 9.2 选项元组的两半（批次 11 收尾时补入）

`options={[[value, label], …]}`（`SelectField` 契约 `[optionValue, text, optionDisabled?]`）与 `<option value="…">` 是同一种东西的两条写法：**值位是直接落到 DOM 的存储键**，标签位才是界面文案。分类器最初把两者都算作界面文案，于是「值位被译成中文」这种破坏 A5（存储枚举保持英文）的错误不会被任何检查捕获，而术语检查又会把 `balanced`、`stable`、`off` 这类值位误报成术语漂移。

修正方式：`scripts/lib/locale-scan.cjs` 识别选项元组，值位归提示词层（受纯净检查约束，中文即报错），标签位归界面文案。修正后重新从 `1a7ea28` 提取 `docs/locale/en-US.json`，内容与修正前逐字节一致（同一行上标签在前的去重规则掩盖了归类差异），A6 的可复现性不受影响。

### 9.3 双语拆分与扫描器归类冲突（批次 11 收尾时补入）

扫描器按**属性名**归类，因此有两类位置会与「显示层译中文、提示词层留英文」的规则正面冲突：

- **`name` 属性**：`name` 属于 `STORAGE_PROPS`，一律归提示词层。凡是「其实只用于显示」的 `name` 字段（如 `src/components/Music3Workspace.tsx` 的音乐预设名——只作按钮文案、React `key` 与内存比较，既不持久化也不进模型），中文值会被纯净检查判错。
  处置：把该字段改名成扫描器归为界面文案的属性名（本例用 `title`），属**局部**改名，不改行为、不改数据结构语义、不进持久层。同理，`LocationStudio.tsx` 的 `target = 'reference'` 这类**参数默认值**若是存储值就保持英文。
- **提示词上下文文件里的 `text` / `message` / `prompt` 属性**：这些文件命中扫描器的提示词上下文正则，同样的属性名一律归提示词层。`src/components/SceneComposer.tsx` 的对白占位符表（`text: '台词'`）因此被判错——它的值其实是 `placeholder` 显示文本。
  处置：把显示文本放到扫描器归为界面文案的位置（JSX `placeholder` 属性本身），或换一个不叫 `text` 的属性名，避免在提示词上下文文件里使用这三个属性名承载界面文案。
- **组件文件里的 `description` 属性**：反过来，`description` 属于 `DISPLAY_PROPS`，在组件层一律归界面文案；但 `src/components/SceneComposer.tsx` 与 `src/components/SceneContextPanels.tsx` 写入 `embeddedAudio.description` 的默认值（`The video’s ambient sound texture; do not inherit speech or music.`）会被 `h3SceneCompiler` 原样编进提示词（`clean(audio.description)` → `overall_soundscape` / `subject_definitions`），译成中文会破坏 A4。
  处置：把该字面量提取为**模块级常量**（`const embeddedAudioDescription = '…'`）——扫描器不归类 `VariableDeclaration` 位置，这条提示词层文本因此既不进漏译检查也不进纯净检查；再由 `scripts/test-prompt-parity.cjs` 对基线 ref `1a7ea28` 的原文做逐字节断言，补上 fixture 捕获不到的那一段。

这三类都不是「漏译」，而是**归类与显示语义不一致**；修归类（改名／换位置／提取常量），不要为了让检查通过而把中文退回英文。


## 10. 实施位置与基线

本地化在独立 Git worktree 中进行：

- 工作副本：`.worktrees/chinese-localization/`
- 变更分支：`comet/chinese-localization`
- 基线分支：`feature/model-inventory`；**基线 ref：`1a7ea28`**（en-US.json 快照与 parity fixture 都从它生成，`_meta.baseline` 与 fixture 内均记录）

`feature/model-inventory` 已包含 Turbo 4 可用性门控与远程模型清单的改动（`src/App.tsx`、`src/components/FormFields.tsx`、`src/components/SettingsView.tsx`、`src/lib/workspaceTips.ts`、`src/lib/modelSelection.ts`、`src/lib/comfyInfo.ts`、`src/lib/h3Diagnostics.ts`、`electron/main.ts`、`src/browserMock.ts`、`package.json`）。这些改动里新增的界面文案（`Quality & sampling`、`Quality preset`、`Sampling steps`、`Base recipe`、扩展后的 "Model locations" 说明、重写后的 setupGuide 第 2/3 条）**必须一并翻译**，不能因为基线已提交就漏掉。批次 8 的 `App.tsx` 与 `SettingsView.tsx` 因此排在最后。

worktree 的工作区在开始时是干净的，不存在需要避让的未提交改动。

## 11. 验收标准

验收项 A1–A10 的完整定义见 `docs/comet/changes/chinese-localization/brief.md` 的「验收示例」。此处为执行口径：

### 11.1 自动检查

```
pnpm typecheck && pnpm lint && pnpm test && pnpm build:web
```

全部通过，且 `pnpm test` 中的 locale 审计报告 **0 个漏译、0 个术语不一致、0 个提示词层污染、0 个中英空格问题**，prompt parity 报告 **0 处字节差异**。

链外脚本 `pnpm test:ui-e2e`、`pnpm test:photo-edit-electron`、`pnpm test:clip-master` 断言更新后各本地跑通一次。

### 11.2 界面抽查

在 Electron 应用中逐个走完 19 个视图（`create`、`continue`、`scratchpad`、`ltx25`、`ltxripple`、`photoedit`、`music`、`zimage`、`referenceprep`、`characters`、`hair`、`wardrobes`、`accessories`、`locations`、`queue`、`library`、`clipmaster`、`movie`、`settings`），确认：

- 无半中半英残留
- 无因中文变长导致的截断、溢出、按钮挤压
- 无因中文变短导致的布局塌陷（尤其 `WorkspaceSidebar` 的导航项、`SettingsView` 的分区侧栏）
- 空态、加载态、成功态、失败态、禁用态文案都已翻译

同时抽查 `MovieEditorWindow`（独立窗口）与 LAN 手机端（`MobileApp`）两个外壳；在最小支持布局与常见桌面尺寸各查一遍；在 Windows 与 macOS 各确认一次中文默认字体渲染正常。Linux 打包目标保留，但 Linux 桌面的中文字形人工确认不在本期范围（见 §3 非目标），发布说明注明 CJK 字体依赖。

### 11.3 人工抽查（需要客户或你本人参与）

在批次 8 完成后，从下列位置各挑 3 条由你确认措辞：

- `SettingsView` 的性能 / GPU 路由分区（术语密度最高）
- `src/lib/workspaceTips.ts` 的 `setupGuide`（长句，风格最容易跑偏）
- `src/lib/promptPresets.ts` 的 label（界面标签与模型指令的措辞边界）

## 12. 留给实现者的注意事项

- **不要用 sed 式全局替换。** JSX 里存在 `{'...'}`、模板字符串、条件表达式和三元，需要逐处判断。例如 `SettingsView.tsx` 大量内容写在单行内，一个 `>` 可能既是 JSX 边界也是比较运算符。
- **每改一处双语拆分点，立即跑 `pnpm test:prompt-parity`。** 该测试红 = 提示词输出变了字节 = 最高优先级回归。不要攒批。
- **行号会漂移。** `en-US.json` 的键是提取时刻的行号，编辑文件后即失效，仅用于人工对照与将来生成英文版。
- **保持 JSX 结构不动。** 只替换字面量，不调整标签嵌套、不改 className、不动 `aria-*` 属性的语义结构。
- **`aria-label` 与 `title` 要译，但 `id` / `name` / `key` / `value` / `type` / `data-*` 不要译。** 后者可能被代码逻辑引用或进入提示词。
- **`<option>` 的显示文本与 `value` 要分开。** 当两者原本相同时，把显示文本拆成独立字面量。
- **不要翻译 `promptAutoTags.ts` 的标签名。** 它们是提示词语法。
- **localStorage 存量兼容。** 旧工作区里存的 `beat.shotSize` 等是英文值，新读取路径必须原样接受（parity 的"英文 value 直传"路径覆盖这一点）。
- **测试断言随批次同步，不要拖到最后。** 批次 0 建清单，每批更新对应断言；禁止靠删断言让测试变绿。
- **警惕中英混排的空格。** 中文与英文/数字之间统一加一个空格（`Turbo 8 模式`），审计脚本会检查这一条。
- **不引入新依赖。** 全部脚本用 Node 内置模块与已装的 `typescript` 实现，与现有 `scripts/test-*.cjs` 的风格保持一致。
- **每批结束跑一次 `pnpm lint`。** ESLint 的 `--max-warnings 0` 会在出现未使用变量等问题时直接失败，翻译过程容易引入这类问题。
