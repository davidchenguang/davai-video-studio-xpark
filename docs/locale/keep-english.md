# 保持英文的例外清单（docs/locale/keep-english.md）

记录扫描器口径下需要保持英文的位置。`scripts/locale-audit.cjs` 以此为漏译判定的白名单；
提示词层纯净检查（提示词/存储位不得含中文字符）不接受豁免。

条目格式（每行一条，`—` 后为理由）：

- \`path\` — 整个文件的界面文案判定豁免
- \`path:行号\` — 该行豁免
- \`path:prop=属性名\` — 该文件中此属性名位置的字符串豁免
- \`path:attr=属性名\` — 该文件中此 JSX 属性位置的字符串豁免
- \`path:content=原文\` — 该文件中此原文（逐字匹配）豁免；提示词层字面量比行号稳定，优先用这种写法

维护规则：随实现批次更新；新增豁免必须写明理由。本清单只豁免「漏译/术语」检查，
不豁免「中英空格」与「提示词层纯净」检查。

一行只能写一个目标路径：解析器只取行首第一个反引号块，同一行后面的路径会被静默忽略。
需要登记多个位置时请分行写；只作说明、不作豁免的条目请写成「登记备查，非豁免规则」的说明句，
不要以路径开头，避免被误当成整文件豁免。

## 提示词预览与 vision 指令

- src/lib/referenceAnalysis.ts 的 vision 指令（`fieldInstructions` 五条值与 `analyzeReferenceImage` / `analyzeSceneReference` 两个 prompt 模板）— 发给本地 vision 模型的英文指令。模型按英文指令返回 `shotSize` / `angle` 等英文枚举值，直接流入场景状态与提示词编译；译成中文会使模型返回中文值进入存储层，破坏提示词逐字节回归（A4）与「提示词层零 CJK」。**登记备查，非豁免规则**：该文件名命中扫描器的提示词上下文正则，这些 prompt 字面量本就被归入提示词层，由「提示词层纯净检查」直接约束（纯净检查不接受豁免）。同文件 `new Error(...)` 的用户可见文案属界面文案，照常翻译。
- `src/components/SmartPromptEditor.tsx` — 插入预览面板显示的是将要写入提示词编辑框的英文提示词本体（`results[active].insertion`），属提示词预览而非界面文案，保持英文。

## 数据与标识符（scanner 已归为 neutral，登记备查）

- `src/components/SceneComposer.tsx` 与 `src/components/SceneContextPanels.tsx` 的 `embeddedAudioDescription` 常量（`The video’s ambient sound texture; do not inherit speech or music.`，登记备查，非豁免规则）— 视频参考「使用视频音频 / 把内置环境声用作参考」写入的 `embeddedAudio.description`。该值是音频参考的提示词层描述，h3SceneCompiler 会把它编入提示词（`audioLayer` / `definitions`），按「提示词层保持英文」保持英文；实现中以模块级常量持有（VariableDeclaration 位置扫描器不归类），行级豁免因此不再需要。该字面量不在 parity fixture 的捕获范围内，由 `scripts/test-prompt-parity.cjs` 对基线 ref `1a7ea28` 的原文做逐字节断言。

以下位置的英文字符串不进入审计的 display 分类（扫描器按属性名/位置归为提示词层或标识符），
这里登记是为了人工核对时不被误当漏译：

- `src/lib/promptPresets.ts:prop=insertion` — 预设的提示词插入文本，发给模型，保持英文。
- `src/lib/promptPresets.ts:prop=keywords` — 预设的英文检索关键词，参与 `promptCommandScore`，保持英文。
- `src/lib/promptAutoTags.ts` — `##` 标签名与 `sectionLabels` 值是提示词语法结构，保持英文。
- `src/lib/scenePromptState.ts` — 摄影选项的英文枚举（`cameraOptions[].value` 与由其派生的 `cameraOptionValues`）同时是存储值与提示词文本，保持英文（中文只出现在配对的 `label` 显示层）；`bindSceneReferences` 写入的 `SceneReference.name`（取自 `binding.promptLabel ?? binding.label`）与 audio 参考的默认 `description: 'Sound texture'`（h3SceneCompiler 会把它编入提示词）同属存储/提示词层，保持英文。
- src/components/SceneComposer.tsx 与 src/components/SceneContextPanels.tsx 的摄影选项 `<select>`（登记备查，非豁免规则）— 选项 `value` 是英文存储值（`cameraOptions[].value`），显示文本读中文 `label`；存量英文值不在选项表时兜底 `<option>` 直接透出该存储值，属数据透出而非界面文案（这些位置是表达式，扫描器不命中字面量）。
- src/components/LocationStudio.tsx 的 `surveyCameras[].cameraLanguage`（登记备查，非豁免规则）— 该字段是发给 LTX 2.5 的运镜语言提示词，经 `onCreateWalkthrough` 的 `cameraLanguage` 进入提示词层，保持英文；同数组的 `label` 与 `note` 是界面文案，已译为中文。该字段原名 `prompt` 会被扫描器按 `prop:prompt` 归为界面文案（该文件名未命中提示词上下文正则），故改名为中性名，扫描器不再将其计入界面文案，无需豁免规则。
- `src/components/ClipMasterBeta.tsx` 写入 `ClipItem.name` 的 `Clip Master sequence`（登记备查，非豁免规则）— 应用自己生成的片段名，会存进 localStorage，存储值保持英文；界面显示由 `src/components/MovieEditor.tsx` 的 `clipDisplayNames` 映射为「片段工坊序列」（与 `trackDisplayNames` 同一套显示/存储分层做法）。
- `src/App.tsx` 写入角色 / 地点项目的 `Generated character turntable`、`Generated location walkthrough`（登记备查，非豁免规则）— 生成视频的 `MediaFile.name`，属存储值且不直接渲染；界面上的说法是「巡检」（角色）与「漫游」（地点）。
- 旧档案中以英文默认名保存的素材库项目名（`Hair design 3`、`Wardrobe 2`、`Accessory 1`、`Location 1`，登记备查，非豁免规则）— 用户 localStorage 里的既有数据，不迁移不改写；界面按用户数据原样透出。四个工作室「名字仍是默认值」的守卫正则已改为同时匹配中英文默认名（`/^(Hair design|发型设计) \d+$/i` 等 4 处，见 `docs/locale/structure-changes.md` 第四节），视觉模型的自动填充覆盖对旧档案仍然生效。`CharacterStudio.tsx:299` 组装提示词时的 `Hair design: ${name}.` 前缀是提示词层结构文本，保持英文。

## 保留英文的模型变体名（内容级豁免）

以下字符串是模型与权重的**型号名**，界面上必须与磁盘上的文件名对应，保持英文：

- `src/lib/h3Diagnostics.ts:content=FL2V Turbo 8 LoRA` — FL2V 的 Turbo 8 步 LoRA 型号，对应 `minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors`。
- `src/lib/h3Diagnostics.ts:content=Ref2V Turbo 8 LoRA` — Ref2V 的 Turbo 8 步 LoRA 型号。
- `src/lib/h3Diagnostics.ts:content=Ref2V Turbo 4 LoRA` — Ref2V 的 Turbo 4 步 LoRA 型号。
- `src/components/AceStepWorkspace.tsx:content=XL SFT` — ACE-Step 的 XL 版监督微调变体名。
- `src/components/AceStepWorkspace.tsx:content=XL Turbo` — ACE-Step 的 XL 版蒸馏加速变体名。
- `src/components/AceStepWorkspace.tsx:content=XL Base` — ACE-Step 的 XL 基础版变体名。

同文件里的「文本编码器」「视频 VAE」「音频 VAE」是界面文案，已译为中文，不受本节影响。

## 浏览器预览 mock 的示例数据

`src/browserMock.ts` 是 `pnpm dev:web`（非 Electron）下的假桥接层。它返回的记录是**模拟模型产出与用户数据**的样例
（角色、场景、镜头及其提示词），按项目惯例「用户数据与提示词本体保持用户语言」处理，保持英文。

同文件的**报错文案**是界面文案，照常翻译（「请在桌面端应用中上传图片。」等）；
`getComfyStatus` 的 `error: 'Preview mode'` 与各处 `thinking:` 状态提示也是界面文案，已译为中文。

**模型产出一律保持英文**：`generateWithOllama`、`generatePromptCompletion`、`generateWithOllamaVision`、
`generateStructuredWithOllama` 返回的正文都是「模型写出来的提示词 / 答复」，桌面端真实链路里本地模型收到的是
英文指令、返回的也是英文正文；mock 若译成中文，浏览器预览就会与桌面应用表现不一致，也会让
`scripts/test-ui-e2e.cjs` 的行内补全断言（`with a slow, steady camera move.`）失效。

- `src/browserMock.ts:prop=description` — 角色 / 地点示例描述。
- `src/browserMock.ts:prop=wardrobe` — 角色示例服装。
- `src/browserMock.ts:prop=voiceNotes` — 角色示例声音说明。
- `src/browserMock.ts:prop=title` — 场景 / 镜头示例标题。
- `src/browserMock.ts:prop=summary` — 场景示例摘要与 mock 生成的说明。
- `src/browserMock.ts:prop=prompt` — 镜头示例提示词本体。

## 续接工作区与提示词工坊的提示词层（批次 5 登记）

以下位置的英文是**提示词本体**或**存储枚举**，保持英文；扫描器已按属性名/位置把它们归入提示词层或标识符，
此处登记备查，避免人工抽查时被误当漏译：

- `src/components/ScratchpadWorkspace.tsx` 的 `toolInstructions` 六个英文正文（登记备查，非豁免规则）— 六个工具发给本地模型的英文指令；界面显示名走同文件的 `toolLabels` 映射（润色／扩展／精简／加 H3 标签／镜头时间线／声音处理）。
- `src/components/ContinueWorkspace.tsx` 的 `insertCutCue` 模板 `At X seconds, hard cut to a new camera angle; continue the action without a dissolve.`（登记备查，非豁免规则）— 注入节拍提示词的英文模板，用户点击后原样写进提示词编辑框（`scripts/test-ui-e2e.cjs` 第 115 行断言依赖它）。
- `src/components/ContinueWorkspace.tsx` 景别／机位角度／运镜下拉的 `<option value>`（wide shot、medium shot、close-up、extreme close-up、eye-level angle、low angle、high angle、over-the-shoulder angle、locked-off camera、slow pan、tracking shot、handheld camera）（登记备查，非豁免规则）— 存储枚举值，会进入编译后的提示词；选项标签显示中文。
- `src/components/ContinueWorkspace.tsx` 的 `planned`/`queued`/`running`/`completed`/`failed`/`cancelled` 与 `method`/`mode`/`dialogueMode`/`sourceMode`（登记备查，非豁免规则）— 存储层枚举，界面通过 `beatStatusLabels` / `replacementRoleLabels` 显示中文。
- `src/lib/continuation.ts` 的 `'Source character'`、`'Untitled-Video'`、`Beat-${index}`（登记备查，非豁免规则）— 角色兜底名与文件名兜底，文件名层保持 ASCII。
- `src/lib/scenePromptState.ts` 的 `suggestScene()` 建议项 `evidence`（`Wide Shot`、`camera backs away`、`found footage`、`handheld` 等）（登记备查，非豁免规则）— 推断理由只在建议弹窗里显示，场景状态与提示词编译都不用它；显示层由 `src/components/SceneComposer.tsx` 的 `suggestionEvidenceLabel()` 映射成中文。
- `src/lib/scenePromptState.ts` 的相机行为句 `Subtle handheld tremble, autofocus breathing, responsive auto-exposure and low-light sensor noise.`（登记备查，非豁免规则）— `camera.behavior` 会被 `h3SceneCompiler` 原样编入提示词，属提示词层；建议弹窗里的显示走 `src/components/SceneComposer.tsx` 的 `cameraBehaviorLabels`。

## 保留英文的品牌、文件名与节点名（登记备查）

以下位置是品牌缩写、模型文件名、ComfyUI 目录与节点类名，属技术标识而非界面文案，保持英文。
它们多为单词或路径形态，审计的漏译判定（需两个以上英文单词）本就不会命中，此处登记备查，
以免人工抽查时被误当漏译：

- `src/components/FrameBookmarkStudio.tsx` 的 `LTX` chip — 模型品牌缩写。
- `src/components/ReferencePrepStudio.tsx` 的 `birefnet.safetensors`、`ComfyUI/models/background_removal/`、节点名 `LoadBackgroundRemovalModel` / `RemoveBackground` / `JoinImageWithAlpha` / `MaskToImage` — 真实文件名、ComfyUI 目录与节点类名，用户需要照抄到 ComfyUI 节点图里。

## 确认令牌与诊断透传

- `electron/main.ts:469` — 恢复出厂设置的确认令牌是英文字符串 `Reset`，与 `factoryResetSettings` 的 `confirmation !== 'Reset'` 程序判断及设置页输入框绑定，用户需逐字输入英文单词；译文保留该 token，豁免术语检查（reset→重置）。
- `src/components/SettingsView.tsx:content=ollama pull qwen3:latest` — 需要用户复制到终端执行的命令示例。CLI 程序名在真实命令行中就是小写 `ollama`，改成术语表里的 `Ollama` 会让命令无法执行，因此按实际写法保留小写。

`electron/main.ts` 中 `minimax-media://` 协议处理器各 `new Response(...)` 的错误正文（如 `Media file is empty`、`Thumbnail is unavailable`）只出现在浏览器网络层诊断里，不作为界面文案渲染；扫描器将其归为 neutral，无需豁免登记，保持英文。FFmpeg/FFprobe stderr、ComfyUI 服务器返回的 error 正文、异常堆栈与文件路径同样原样透传，不译。

## 设置页的提示词本体与逐字命令（批次 8b 登记）

以下 `src/components/SettingsView.tsx` 的英文命中都是**有意保留**：提示词本体写入 ComfyUI 工作流或发给引擎（提示词层），命令与路径需要用户逐字照抄，或与程序判断逐字匹配。原文均从源文件核对。

提示词本体（`prop:prompt`，进入 `buildMiniMaxWorkflow` / `buildLtx25Workflow` 的 `prompt` 入参，受提示词 parity 保护）：

- `src/components/SettingsView.tsx:content=A polished chrome sphere rotates slowly on a dark studio pedestal under one soft overhead light. Locked camera, clean reflections, ambient room tone, no dialogue, no text.` — Sol Engine 测试渲染的提示词本体，`submitPrompt` 原样发送（182 行）。
- `src/components/SettingsView.tsx:content=GPU placement diagnostic. Static studio color chart, locked camera, ambient tone, no dialogue.` — GPU 放置诊断的测试提示词本体（200 行）。
- `src/components/SettingsView.tsx:content=Describe the shot. Attach reference media in ComfyUI before queueing.` — Ref2VA 工作流导出模板的占位提示词，写入导出的 API JSON（219 行）。
- `src/components/SettingsView.tsx:content=Describe one continuous cinematic shot.` — H3 与 LTX 2.5 工作流导出模板共用的占位提示词（222、234 行两处）。

逐字命令、路径与文件名（用户照抄到终端或 ComfyUI 节点图）：

- `src/components/SettingsView.tsx:content=CUDA_VISIBLE_DEVICES=0,1 python main.py --use-ck-attention` — H3 Parallel 安装步骤的启动命令（267 行）。
- `src/components/SettingsView.tsx:content=LTX-2.5-Licon-MSR-V1.safetensors` — 模型文件名（321 行）。
- `src/components/SettingsView.tsx:content=ComfyUILTX25MSRICLoRALoader` — ComfyUI 节点类名（321 行）。
- `src/components/SettingsView.tsx:content=ComfyUILTX25MSRMultiReferenceGuide` — ComfyUI 节点类名（321 行）。
- `src/components/SettingsView.tsx:content=C:\Users\James\Documents\ComfyUI\.venv\Scripts\python.exe` — 用户机器上的真实解释器路径，逐字展示（357 行）。
- `src/components/SettingsView.tsx:content=python -c "import sys; print(sys.executable)"` — 终端命令示例（358 行）。
- `src/components/SettingsView.tsx:content=python -c "import torch; print(torch.__version__); print(torch.version.cuda); print(torch.cuda.get_device_name())"` — 终端命令示例（358 行）。
- `src/components/SettingsView.tsx:content=python -c "import triton; print('Triton:', triton.__version__)"` — 终端命令示例（363 行）。
- `src/components/SettingsView.tsx:content=correctness gate PASS` — Sol 自检输出中的逐字匹配串，用户需在日志里按原文查找（363 行）。
- `src/components/SettingsView.tsx:content=MiniMaxH3Cache` — Sol 指南第 07 步要求检测到的注意力后端节点名（364 行）。

标识符与确认令牌：

- `src/components/SettingsView.tsx:109` — `settingsSections` 数组的 id 半区 `'reset'`：DOM 锚点 / 滚动定位键（存储标识符，非界面文案；译文半区是「恢复出厂设置」）。
- `src/components/SettingsView.tsx:352` — 恢复出厂设置确认词 `Reset`：必须与 `electron/main.ts` 的 `confirmation !== 'Reset'` 逐字匹配，用户需输入英文单词（与已有的 `electron/main.ts:469` 登记同一 token）。

## 批次 12：扫描器补强后的新登记

批次 12 扩展了 `scripts/lib/locale-scan.cjs` 的分类能力（元组数组、显示工厂函数的三元分支、
消息接收方调用参数、显示属性上的模板字符串），原先落在盲区里的显示文案现在会进入审计。
下面这些是扩展后仍然保留英文的位置，逐条说明理由。

- `src/lib/workspaceTips.ts:content=安装较新的本地 ComfyUI，并让它在设置中显示的地址上持续运行（默认 http://127.0.0.1:8188）。在「设置 → 模型位置」中，把 diffusion_models、text_encoders、vae、loras、vae_approx 与 clip_vision 指向你的 ComfyUI 模型文件夹，然后选择输出文件夹并点击「测试连接 / 重新扫描」。` — 首次配置引导正文里的 ComfyUI 模型目录名（`vae`、`vae_approx`、`loras`、`text_encoders`、`clip_vision` 等）必须与磁盘上的真实文件夹名逐字一致，术语表里的 `VAE` 是显示口径，目录名按实际写法保留小写。
- `src/components/PhotoEditWorkspace.tsx:content=Turbo` — 图片编辑（原「照片编辑」，2026-11-12 更名）的渲染档位名。FireRed 的 Turbo 档与 H3 的 `Turbo 8 · 均衡`、`Turbo 4 · 实验` 是同一套档位命名，译成中文会与 H3 画质预设里的「极速」混淆，故保留英文并在此登记。
- `src/App.tsx:content=Euler ancestral` — ComfyUI 采样器名（`Euler ancestral`），显示在任务执行信息条上，与 H3 链路显示的 `euler + simple` 同属采样器 / 调度器标识符，保持英文。
- `src/App.tsx:content=Official 8 + 3 sigmas` — LTX 官方两阶段工作流的调度器名（`Official 8 + 3 sigmas` / `Official distilled 8 sigmas` / `Simple · 8 steps`），是 ComfyUI 调度器标识符，保持英文。
- `src/App.tsx:content=Simple · 8 steps` — 同上，LTX Ripple 链路的调度器名。
- `src/App.tsx:content=Licon MSR` — LTX 放大 LoRA 型号名。

## 中文修订轮（zh-locale-revision）新增登记

- `src/App.tsx:content=Ctrl+F` — 标题栏搜索按钮的键盘快捷键标识（`<kbd>`），与 3471 行 aria/title 的 `Ctrl+F` 写法一致。`Ctrl` 与 `F` 是两个拉丁词，漏译判定会命中，按快捷键标识豁免。
- `src/components/Ltx25Workspace.tsx:content=采样器 Euler ancestral · CFG 1` 等含「采样器 / 调度器」中文前缀的写法 — ComfyUI 采样器 / 调度器标识符，与批次 12 的 `src/App.tsx:content=Euler ancestral`、`Official 8 + 3 sigmas` 同族；中文前缀使其含 CJK、通过漏译判定，无需单独豁免，登记备查以免被误改回中文译名。

## 批次 12b：Music 3 提示词层

批次 12 的走查（`scripts/locale-walkthrough.cjs`）发现 Music 3 工作区里，界面上的芯片按钮与下拉建议
直接显示了英文提示词短语。按「显示 / 提示词分层」规则做了拆分：提示词层保留英文，显示层给中文
（映射表在 `src/lib/music3Vocabulary.ts`）。下面这些英文值是提示词层与存储层，必须保持英文。

这些位置由扫描器归为提示词/存储位或 neutral，本来就不在漏译检查范围内；这里按「登记备查」的口径
写明理由，方便后来者知道它们是刻意保留英文，而不是漏翻。

- `src/lib/music3Vocabulary.ts` 的 `music3Genres` — 流派原值（`Pop`、`Synth-pop`、`Trap` 等）。写入
  `Draft.genre`、进入 localStorage、并原样进入 Music 3 提示词；界面上的中文来自 `music3GenreLabels`
  （没有通行中文译名的流派专名在显示层也保留英文，见 `docs/locale/glossary.md` 的「音乐术语」一节）。
- `src/lib/music3Vocabulary.ts` 的 `music3Keys` — 调性原值（`C major`、`D Dorian` 等）。同上，
  显示层为 `music3KeyLabels`。
- `src/lib/music3Vocabulary.ts` 的 `music3Progressions` — 情绪走向原值（`restrained opening, lift into
  the chorus, spacious outro` 等）。同上，显示层为 `music3ProgressionLabels`。
- `src/lib/music3Vocabulary.ts` 的 `music3KeywordGroups` — 人声 / 编曲关键词原值，点击芯片后原样插入
  提示词输入框。显示层为 `music3KeywordLabels`。
- `src/lib/music3Vocabulary.ts` 的 `music3MetadataPresets` — 全局风格描述预设原值。显示层为
  `music3MetadataLabels`。
- `src/components/Music3Workspace.tsx` 的 `musicPresets` 各条目的 `genre` / `key` / `progression` /
  `metadata` / `vocals` / `arrangement` 半区 — 预设数据本身是提示词内容，点击后整体写入草稿并进入
  提示词；条目的 `title` / `mood` 半区是显示层，已译为中文。
- `src/components/Music3Workspace.tsx` 的 `lyricTags` — `[Intro]`、`[Verse]` 等段落标记，是 Music 3
  唯一会执行的结构指令，必须与模型约定逐字一致，保持英文。
- `src/components/Music3Workspace.tsx` 的 `lyricTemplates` 值半区 — 段落结构模板正文，写入歌词框并
  进入提示词；键半区（`流行歌结构`、`电子曲结构` 等）是显示层，已译为中文。
