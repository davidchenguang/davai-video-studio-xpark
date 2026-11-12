# 测试断言同步清单（docs/locale/test-assertion-sync.md）

批次 0 建立的完整清点：`scripts/test-*.cjs` 中断言**值**含英文界面文案的位置。
断言第三参数（开发者说明）保持英文，不在本表范围。

处置取值：

- **改译** — 该断言值是界面文案，随对应批次译成中文。
- **保持** — 该断言值属品牌/存储值/用户数据/keep 术语，不译。
- **新增** — 本地化引入的新用例。

## 链内脚本（pnpm test）

### scripts/test-workflows.cjs

| 行 | 断言值 | 处置 | 批次 |
| --- | --- | --- | --- |
| 15 | `nodeStageLabel('VAEDecode','16') === 'Decoding video frames'` | **已译**为「正在解码视频帧」 | 阶段文案批次 ✅ |
| 40 | `solRuntimeLabel(...)` 匹配 `/correctness gate passed/i` | **已译**为匹配「正确性校验通过」；`parseSolRuntimeDiagnostics` 解析的运行时输出仍为英文，保持 | 阶段文案批次 ✅ |
| 60 | `firstFrameVisualAnchorInstruction(0)` 抛错匹配 `/valid picture number/i` | **已译**为匹配「图片序号」（`src/lib/referencePromptRules.ts:8`「首帧视觉锚定需要有效的图片序号。」） | 批次 5 ✅ |
| 61 | `openingFrameReframeInstruction(1,'')` 抛错匹配 `/camera angle/i` | **已译**为匹配「开场机位角度」（`src/lib/referencePromptRules.ts:15`「请选择开场机位角度。」） | 批次 5 ✅ |
| 100 | `buildMiniMaxWorkflow(...)` 抛错匹配 `/text-to-audio-video only/i` | **已译**为匹配「仅支持文字生成音视频」 | 批次 9 ✅ |
| 427 | `cpuVaeFallback.warnings` 匹配 `/CPU placement is unsupported/i` | **已译**为匹配「不支持视频 VAE 放在 CPU 上」（`src/lib/gpuRouting.ts` 组件标签译文） | 批次 10 ✅ |
| 72-76 | `searchPromptPresets('dolly zoom')` 等英文查询 | **保持且已新增**中文用例（「眩晕」「单一连续镜头」，均唯一命中） | 批次 2 ✅ |

### scripts/test-job-persistence.cjs

| 行 | 断言值 | 处置 | 批次 |
| --- | --- | --- | --- |
| 22 | `saved[1].error` 匹配 `/prompt ID/` | **已译**为匹配「提示词 ID」（`src/lib/jobPersistence.ts` 中断提交提示） | 批次 10 ✅ |

### scripts/test-continuation.cjs

| 行 | 断言值 | 处置 | 批次 |
| --- | --- | --- | --- |
| 103 | 段标签 `'Original'` | **已译**为「原始」（`src/lib/continuation.ts:84` 常量）；同行 `'Walk to Window'` 等为 fixture 用户数据，**保持** | 批次 3 ✅ |

### scripts/test-scene-compiler.cjs

| 行 | 断言值 | 处置 | 批次 |
| --- | --- | --- | --- |
| 106 | `applySceneCommand(state, 'shot', 'Wide Shot')` 的 label 入参 | **已译**为传中文 label「全景」，并**新增**英文 value 直传用例（localStorage 存量兼容） | 批次 3 ✅ |
| 107 | `camera.shotSize.value === 'Wide Shot'` | 保持（存储值断言，值必须仍是英文） | — |
| 206 | `buildMiniMaxWorkflow(...)` 抛错匹配 `/Frame 0 anchor/` | **已译**为匹配「原生帧 0 锚定」（场景冲突的中文错误消息） | 批次 5 ✅ |

### scripts/test-workspace-navigation.cjs

| 行 | 断言值 | 处置 | 批次 |
| --- | --- | --- | --- |
| 8 | 循环内用 `destination.label` 自查排序 | 自动跟随（语言无关） | — |
| 11-12 | `findWorkspaces('create image')`、`findWorkspaces('trim')` 英文查询 | **已译**（「生成图片」「修剪」） | 批次 1 ✅ |
| 16 | `findWorkspaces('photo edit')[0]` 英文查询 | **已译**（「图片编辑」（原「照片编辑」，2026-11-12 更名））——批次 1 执行时发现的清单遗漏，译后英文查询零命中会使 `[0]` 崩溃，必须同步 | 批次 1 ✅ |

### scripts/test-prompt-parity.cjs

| 断言 | 处置 | 批次 |
| --- | --- | --- |
| fixture 逐字节比对（16 个捕获段） | 保持（提示词层基线） | 批次 0 ✅ |
| **新增**：两个组件文件里的 `embeddedAudioDescription` 常量必须与基线 ref `1a7ea28` 的原文逐字节一致 | **新增**——该字面量在组件层、fixture 捕获不到它，而 h3SceneCompiler 会把它原样编入提示词；没有这条断言时它既不受漏译检查也不受提示词纯净检查约束 | 批次 10 ✅ |

### 其余链内脚本

`test-scene`、`test-character-library`、`test-prompt-auto-tags`、`test-lm-studio-api`、`test-llm-stream`、`test-preload-sandbox`、`test-model-inventory`、`test-ltx-ripple`、`test-fire-red-edit`、`test-atomic-saves`、`test-movie-editor`、`test-comfy-cancel`、`test-comfy-job-state`、`test-job-persistence`、`test-legacy-browser-storage`、`test-workspace-persistence`：断言值均为存储值、图节点名、路径或 fixture 用户数据，**无界面文案断言，无需改动**（批次 0 全量 grep 核对）。

## 链外脚本（需单独本地跑通，验收 A8）

### scripts/test-ui-e2e.cjs

| 行 | 断言值 | 处置 | 批次 |
| --- | --- | --- | --- |
| 95 | `includes('Oyama AI Video Studio')` | 保持（品牌名） | — |
| 98 | `'Browse workspaces'`、`'Offline · Set up'` | **已译**（浏览工作区、离线 · 去设置） | 批次 8 ✅ |
| 100 | 按钮 `'Generate'` | **已译**（「生成」） | 批次 8 ✅ |
| 103 | `'Live preview off'` | **已译**（「实时预览已关闭」） | 批次 8 ✅ |
| 106 | `'Open Continue workspace'` | **已译**（「打开续接工作区」） | 批次 8 ✅ |
| 109 | aria-label `'Sequence player'`、`'Original'` | **已译**（「序列播放器」、「原始」） | 批次 5 ✅ |
| 112 | `'From Beat 1'` | **已译**（「来自 节拍 1」，含序号模板） | 批次 5 ✅ |
| 114 | `'Generate Beat 1 first'` | **已译**（「请先生成 节拍 1」） | 批次 5 ✅ |
| 116 | `'hard cut to a new camera angle'` | **保持**（提示词正文，进模型） | — |
| 120 | `'No finished renders yet'` | **已译**（「还没有已完成的渲染」） | 批次 5 ✅ |
| 121 | aria-label `'Close source video picker'` | **已译**（「关闭来源视频选择器」） | 批次 5 ✅ |
| 125/138 | `clickText('Photo Edit')` | **已译**（「图片编辑」（原「照片编辑」，2026-11-12 更名）——侧边栏 `WorkspaceSidebar` 的标签；工作区查找器里的名字是「图片编辑 · FireRed」，两者不同） | 批次 7 ✅ |
| 127 | `'FireRed'` | 保持（品牌名） | — |
| 129 | `'Quality'` | **已译**（「画质」） | 批次 7 ✅ |
| 131 | `'Turbo'` | 保持（keep 术语） | — |
| 135 | `'Back to Ripple'` | **已译**（「返回 Ripple」） | 批次 7 ✅ |
| 140 | `'Use as Ripple replacement'` | **已译**（「用作 Ripple 替换帧」） | 批次 7 ✅ |
| 143 | `'H3 Video'` | **已译**（「H3 视频」） | 批次 8 ✅ |
| 153/156/161/163/224 | `textarea[aria-label="Video prompt"]` | **已译**为「视频提示词」（`H3PromptEditor` 的参数默认值 `ariaLabel = '视频提示词'`） | 批次 5 ✅ |
| 162 | 工具栏 `'Auto tag'` | **已译**（「自动标签」） | 批次 5 ✅ |
| 180 | `'Add an approved identity image'` | **已译**（「请先在角色工作室添加已确认的身份图片」） | 批次 5 ✅ |
| 178 | `clickText('References')` | **已译**（「参考图」） | 批次 8 ✅ |
| 179-223 | `'Test Character'` | **保持**（测试自己造的 fixture 角色名） | — |
| 180 | `'Needs Reference'` | **已译**（「需要参考图」） | 批次 4 ✅ |
| 208 | 分区页签 `'Source'` | **已译**（「来源」） | 批次 8 ✅ |
| 212/214 | aria-label `'Edit clip.mp4'`、`'Remove … from this shot'` | **已译**（「剪辑片段 motion.mp4」、「从本镜头移除 ${name}」） | 批次 5 ✅ |
| 228/265 | aria-label `'Find workspace setting'` | **已译**（「查找工作区设置」） | 批次 8 ✅ |
| 224 | 模式按钮 `'References'` | **已译**（「参考图」——`videoModeLabels` 的显示文本） | 批次 11 ✅ |
| 231 | 搜索查询 `'Character name'` | **已译**（「角色名称」——工作区设置搜索的 searchableText 只含 DOM 中文标签，无英文别名，英文查询零命中） | 批次 11 ✅ |
| 232 | `'Character name'` | **已译**（「角色名称」） | 批次 4 ✅ |
| 235-242 | 检查器页签 `'Hair'`/`'Wardrobe'`/`'Identity'`/`'References'` 与对应 `aria-label` | **已译**（发型/服装/身份/参考图；发型检查器/服装检查器/身份检查器/参考图检查器） | 批次 4 ✅ |
| 245/247 | aria-label `'Remove profile.png from character'` | **已译**（「从角色移除 profile.png」） | 批次 6 ✅ |
| 250 | aria-label `'Remove primary image from character'` | **已译**（「从角色移除主图」） | 批次 6 ✅ |
| 253/254/257 | 分区页签 `'Generate'`、`'Characters'` | **已译**（生成、角色） | 批次 4 ✅ |
| 269 | `'No generations have been queued.'` | **已译**（「还没有生成任务入队。」） | 批次 8 ✅ |
| 270 | `clickText('Renders')` | **已译**（「视频库」） | 批次 8 ✅ |
| 272 | `'Your finished renders will live here'` | **已译**（「完成的渲染会出现在这里」） | 批次 8 ✅ |
| 275 | `'ComfyUI'` | 保持（品牌名） | — |

### scripts/test-photo-edit-electron.cjs

| 行 | 断言值 | 处置 | 批次 |
| --- | --- | --- | --- |
| 59/93/182/210 | 导航 `'Photo Edit'` | **已译**（「图片编辑」（原「照片编辑」，2026-11-12 更名）） | 批次 7 ✅ |
| 66 | `'Quality'` | **已译**（「画质」） | 批次 7 ✅ |
| 68 | `'Turbo'` | 保持（keep 术语） | — |
| 96 | `'could not be decoded'` | **已译**（「无法解码」） | 批次 7 ✅ |
| 76 | aria-label `'Ripple edit length'` | **已译**（「Ripple 编辑长度」） | 批次 7 ✅ |
| 177 | `'FireRed Photo Edits'` | 保持（输出目录名，`electron/main.ts` 的 `folders` 映射，属存储层） | — |
| 180 | `/configured output folder/` | 保持（`electron/main.ts` 的 `minimax-media://` 错误正文，不作界面文案渲染） | — |
| 211 | `'Waiting to reconnect'` | **已译**（「正在等待重连」） | 批次 7 ✅ |

### scripts/test-clip-master.cjs

断言值均为媒体元数据与存储值，**无界面文案断言，无需改动**（批次 0 全量 grep 核对）。

## 链外脚本的本地可跑性

| 脚本 | 前置条件 | 本机状态 |
| --- | --- | --- |
| `test:ui-e2e` | Vite 正在 127.0.0.1:5173 提供 worktree 页面 + 一个 Chromium/Edge 可执行文件 | 可跑：worktree 的 `pnpm dev:web` 常驻，`E2E_BROWSER_PATH` 指向本机 Chrome |
| `test:photo-edit-electron` | Electron 可执行文件 + **ffmpeg/ffprobe**（脚本第 89 行用 ffmpeg 生成 13 秒测试片，第 132 行起用 ffprobe 取元数据） | **环境受限**：本机没有 ffmpeg/ffprobe（无 Homebrew、无 `C:/FFMPEG`），脚本在准备素材时就以 ENOENT 失败，走不到断言 |
| `test:clip-master` | **ffmpeg/ffprobe**（第 22-23 行生成测试片，第 30 行探测流信息） | **环境受限**：同上 |

两处失败都是「机器上缺少 ffmpeg」而不是本地化缺陷：脚本在准备测试素材阶段就退出，一条断言都没执行。
为避免把它误读成「没跑通」，在装有 ffmpeg 的机器上必须再各跑一次；本次验收把它们记为
**环境受限未执行**，而不是通过。

## 维护规则

- 每完成一个批次，同步更新对应断言并在本表勾销（将「改译」改为「已译」）。
- 归档前（批次 11）本表所有「改译」行必须清零，且三套链外脚本本地跑通一次。
