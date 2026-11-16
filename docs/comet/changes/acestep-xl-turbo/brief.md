# 目标

为 ACE-Step 1.5 音乐工作区增加 **XL Turbo** 变体支持：把模型选择从「XL SFT / XL Base」两张固定卡改为一张**变体表**驱动的选择器（SFT 与 Turbo 为常驻选项，Base 仅作检测兜底），并让每个变体使用 Comfy-Org 官方模板为它规定的采样参数（Turbo 8 步 / CFG 1、Base 50 步 / CFG 6、SFT 50 步 / CFG 7）。

## 背景（事实已核实，来源见「验收示例」A2）

- ComfyUI 0.45.2（GB10 `192.168.20.80:8188`）自带 pip 包 `comfyui_workflow_templates_json`，内含 Comfy-Org 发布的 ACE-Step 1.5 官方模板：`audio_ace_step1_5_xl_turbo.json`、`audio_ace_step1_5_xl_base.json`、`audio_ace_step1_5_xl_sft.json`。三者的**模型与采样链路相同**（UNETLoader → ModelSamplingAuraFlow → KSampler → VAEDecodeAudio → SaveAudioAdvanced；DualCLIPLoader → TextEncodeAceStepAudio1.5 → KSampler；ConditioningZeroOut → KSampler；EmptyAceStep1.5LatentAudio → KSampler），差异只在权重文件名与采样参数；UI 模板里 turbo/base 另带说明与常量节点，不影响 API 图（应用侧 API 图的节点集合恒为 `ACE_STEP_REQUIRED_NODES`）。
- 官方模板参数逐项如下（`templates/index.json` 的说明为「the distilled 4B ACE-Step model… in just 8 inference steps without CFG」；同机 diffusers 实现亦注明 turbo 的 guidance 已蒸馏进权重，跑 CFG>1 会过度引导并被强制回落为 1.0）：

  | 变体 | 权重文件 | steps | cfg | sampler / scheduler / denoise | AuraFlow shift | TextEncode cfg_scale / temperature / top_p |
  | --- | --- | --- | --- | --- | --- | --- |
  | XL Turbo | `acestep_v1.5_xl_turbo_bf16.safetensors` | **8** | **1** | euler / simple / 1 | 3 | 2 / 0.85 / **0.9** |
  | XL Base | `acestep_v1.5_xl_base_bf16.safetensors` | 50 | 6 | euler / simple / 1 | 3 | 2 / 0.85 / **0.9** |
  | XL SFT | `acestep_v1.5_xl_sft_bf16.safetensors` | 50 | 7 | euler / simple / 1 | 3 | 2 / 0.85 / **1** |

- GB10 上三个 XL 权重（各约 9.29 GB）、`qwen_0.6b_ace15.safetensors`、`qwen_4b_ace15.safetensors`、`ace_1.5_vae.safetensors` **全部在位**；引擎 `/object_info/UNETLoader` 的可选列表里三个文件名均出现。Turbo 不需要下载。
- 应用现状：`src/lib/aceStepWorkflow.ts` 的 `inferAceStepSelections` 只按精确文件名识别 base 与 sft（Turbo 不在表内 → 模型卡上根本看不到它）；`buildAceStepWorkflow` 对所有变体写死同一套采样：`steps: 50`、`cfg: sft ? 7 : 6`、`top_p: 1`、AuraFlow `shift: 3`。即：**Base 的 `top_p` 与官方模板的 0.9 不一致**（既有偏差），Turbo 则完全缺失。
- 引擎侧没有 turbo 专属节点或参数：`TextEncodeAceStepAudio1.5` 的 `description` 为空、无 turbo 输入项；`ModelSamplingAuraFlow` 的节点默认 shift 是 1.73，但三个官方模板都显式覆盖为 3。

# 范围

## 目录结构

### 修改

- `src/lib/aceStepWorkflow.ts` — 引入变体表（每个变体的权重选择、steps、cfg、top_p 与展示文案）；`inferAceStepSelections` 增加 Turbo 文件名识别；`buildAceStepWorkflow` 改为按变体取采样参数（SFT 的产出必须与改动前逐字节一致）；新增「首个可用变体 / 可展示变体」的纯函数供工作区与设置页共用。
- `src/types.ts` — `AceStepModelSelection` 增加**可选**字段 `turbo?: string`；`AceStepGenerationOptions.model` 扩展为三个变体标识。新增变体类型导出。
- `src/components/AceStepWorkspace.tsx` — 模型选择器改为按可用变体渲染（SFT + Turbo 为常驻；仅当两者都缺失时动态露出 Base 卡）；卡片副标题改为变体表文案；生成摘要行显示**真实步数**；旧存档 `model: 'base'` 的迁移；标题区在仅检测到 Base 时给出提示；顶部 provider-note 文案更新。
- `src/App.tsx` — 提交路径按变体取权重文件、缺失时的报错文案、任务 `execution` 记录真实扩散模型文件名与「Euler + simple · N 步」。
- `src/components/SettingsView.tsx` — 「**ComfyUI 工作流导出**」的 ACE-Step 图改用「首个可用变体」（sft → turbo → base）而非写死 `ace.sft ? 'sft' : 'base'`（当前写法在只有 Turbo 在位的机器上会导出 `unet_name` 为空字符串的坏图）。设置页的「测试连接」只做连接探测与模型清单刷新、不构建 ACE-Step 图，本 change 不改它。
- `README.md` — ACE-Step 1.5 安装章节列出三个 XL 权重，并写明每个变体的官方采样参数（步数 / CFG）与 Turbo 的定位。
- `src/lib/workspaceTips.ts` — 应用内第 9 条安装提示（ACE-Step 1.5 音乐）补上 Turbo 权重文件名，与 README 口径一致。
- `docs/locale/keep-english.md` — 在「保留英文的模型变体名」小节增加 `XL Turbo` 的内容级豁免（沿用 `XL SFT` / `XL Base` 的既有写法）。
- `package.json` — 新增测试套件 `test:ace-step` 并接入 `test` 链。

### 新建

- `scripts/test-ace-step.cjs` — 覆盖变体表的官方参数值、Turbo 文件名识别、三个变体的图关键参数、SFT 图不回归、可用变体与兜底选择逻辑。

### 不建

- 不在 GB10 或本机安装/下载任何 ACE-Step 权重（Turbo 已在位）。
- 不修改引擎侧代码与 ComfyUI 模板。
- 不实现 ACE-Step 的参考音频（`ReferenceTimbreAudio`）、音频码开关之外的扩展采样参数等本轮未确认的特性。
- 不为 ACE-Step 单独标定阶段化进度权重。

# 非目标

- 不改动 prompt-parity 基线与夹具（`scripts/fixtures/prompt-parity-baseline.json` 仍钉在 `6a600eb`）：SFT 图一个字节都不动。
- 不给 Turbo 提供用户可调的 steps / CFG（第一版固定为官方值）。
- 不改 Music 3、Z-Image、H3 等其他工作流的模型选择与采样参数。
- 不把 Base 从代码里删除：它仍是「只装了 Base 的机器」的唯一可用路径。
- 不做音频转码、试听播放器的额外功能（产出仍是 FLAC，沿用现有播放器）。
- 不改设置页「测试连接」的行为：它只做连接探测与模型清单刷新，不构建 ACE-Step 图（本轮没有 ACE-Step 自检图可改）。

# 验收示例

- **A1 变体识别**：`inferAceStepSelections` 能从模型清单认出 `acestep_v1.5_xl_turbo_bf16.safetensors`；`AceStepModelSelection.turbo` 为可选字段，既有调用方（`scripts/lib/prompt-parity-harness.cjs` 的对象字面量）不需要修改即可继续编译与运行。
- **A2 官方采样参数**：Turbo 图的 KSampler 为 `steps: 8` / `cfg: 1` / `sampler_name: 'euler'` / `scheduler: 'simple'` / `denoise: 1`，`ModelSamplingAuraFlow` 为 `shift: 3`，`TextEncodeAceStepAudio1.5` 为 `cfg_scale: 2` / `temperature: 0.85` / `top_p: 0.9` / `top_k: 0` / `min_p: 0`；Base 为 `steps: 50` / `cfg: 6` / `top_p: 0.9`；SFT 为 `steps: 50` / `cfg: 7` / `top_p: 1`。三者与 Comfy-Org 官方模板逐项一致。
- **A3 SFT 不回归**：SFT 生成的图与改动前**逐字节一致**（`pnpm test:prompt-parity` 仍 PASS，基线 ref 仍是 `6a600eb`）。Base 仅 `top_p` 由 1 改为官方的 0.9 —— 这是本轮**显式确认的行为变更**（同样种子下 Base 的产出与改动前不同）。
- **A4 选择器与文案**：**SFT 与 Turbo 都在位时**工作区展示 **XL SFT** 与 **XL Turbo** 两张卡，副标题分别为「指令微调 · 官方 CFG 7」与「蒸馏加速 · 官方 8 步 · 无 CFG」；就绪 / 缺失徽标沿用现有规则；顶部提示改为「选择 XL SFT 或 XL Turbo。音乐设置与历史独立于视频项目。」；生成摘要行显示真实步数（如 `XL TURBO · 8 步 Euler · FLAC`）。**只有 Turbo 在位时**：SFT 卡以「缺失」徽标呈现且不可选、Turbo 卡就绪、Base 卡不露出、默认选中 Turbo。
- **A5 Base 兜底与默认选择**：只有在 SFT 与 Turbo **都缺失**时才动态露出 XL Base 卡并在标题区提示「仅检测到 XL Base」（此时 SFT 与 Turbo 两张常驻卡仍以「缺失」徽标呈现）；「首个可用变体」优先级为 sft → turbo → base；旧存档 `model: 'base'` 在 Base 不再可选时迁移到首个可用变体，在 Base 恰为唯一可用时保留。
- **A6 提交路径、工作流导出与任务元数据**：设置里的「**ComfyUI 工作流导出**」用首个可用变体构造 ACE-Step 图（当前写死 `ace.sft ? 'sft' : 'base'`，在只有 Turbo 在位的机器上会导出 `unet_name` 为空字符串的坏图——修正后导出 `unet_name: acestep_v1.5_xl_turbo_bf16.safetensors` 且 `steps: 8`）；设置里的「测试连接」只做连接与模型清单探测、不构建 ACE-Step 图，本 change 不改它；任务 `execution` 记录真实扩散模型文件名与「Euler + simple · N 步」；产出前缀沿用 `audio/ACE_Step_1.5_{variant}_{timestamp}`（turbo 产出为 `audio/ACE_Step_1.5_turbo_…`）。
- **A7 文档与本地化**：README 的 ACE-Step 1.5 章节列出三个 XL 权重文件与各自的官方采样参数；应用内安装提示（`src/lib/workspaceTips.ts` 第 9 条）同样列出 Turbo 权重文件名；`docs/locale/keep-english.md` 增加 `XL Turbo` 豁免行；`pnpm test:locale` 报告 0 处问题。
- **A8 回归**：新增 `scripts/test-ace-step.cjs` 覆盖变体表取值、Turbo 识别、三张图关键参数、SFT 图不回归、可用变体与兜底选择逻辑（含「仅 Turbo 在位」「仅 Base 在位」两种组合），并接入 `package.json` 的 `test` 链；`pnpm typecheck && pnpm lint && pnpm test && pnpm build:web` 全部通过。
- **A9 端到端**：在 GB10（`192.168.20.80:8188`）上真实跑通一条 XL Turbo（10 秒）：出音正常、采样确实为 8 步、产出为 FLAC、任务 `execution` 记录与所选变体一致；生成的 FLAC 拷回本机供试听。**「进度条不静止」不在本验收项内**：阶段化进度由另一个 change（`comfy-progress-truthfulness`）提供，尚未落地到本分支；若届时已落地并 rebase，则附带记录实际进度分布（Turbo 只有 8 步采样，采样阶段会快速前进）。

# 关键决定

- **D1 选项集合**：选择器常驻 **XL SFT + XL Turbo** 两张卡；Base 只在两者都缺失时动态露出（兜底），不与另两个并列。
- **D2 参数策略**：变体表按 Comfy-Org 官方模板**写死**，第一版不暴露用户可调的 steps / CFG。
- **D3 定位**：Turbo 是速度档，卡片与生成摘要都显示真实步数，让用户在提交前看到速度 / 质量取舍。
- **D4 命名与格式**：产出前缀沿用现有模板（加 turbo 取值）；保存格式统一 FLAC（官方模板里 turbo/base 用 mp3 属模板默认，非硬要求）。
- **D5 兜底优先级**：sft → turbo → base；旧存档 `model: 'base'` 迁移到首个可用变体。
- **D6 Base 的 top_p**：由 1 修正为官方的 0.9，作为**已确认的行为变更**写入本 brief。
- **D7 归属**：本需求是独立 change（`acestep-xl-turbo`），在独立 worktree（`.worktrees/acestep-xl-turbo`，分支 `comet/acestep-xl-turbo`）开发，与 `comfy-progress-truthfulness` 完全解耦。
- **D8 文档与本地化**：README 三行权重 + 官方参数；locale 豁免新增 `XL Turbo` 一行；应用内安装提示（第 9 条）同步补 Turbo 权重名。
- **D9 设置页的 ACE-Step 图**：只有「ComfyUI 工作流导出」会构建 ACE-Step 图，改为用首个可用变体；「测试连接」不涉及 ACE-Step 图，不改（避免把验收项写成无法执行的动作）。

# 约束

- **不得改动 SFT 路径的任何参数**：SFT 图被 prompt-parity 基线逐字节钉住；若确需改动，必须走正规 re-pin（改 4 个文件），本轮不做。
- **变体表是唯一参数来源**：步骤数、CFG、top_p 不得散落在组件里硬编码；组件只读表。
- **不得让用户选择 Base 却跑出别的配方**：提交的权重文件与采样参数必须来自同一个变体条目。
- **已知限制**：阶段化进度（文本编码 0.65 / 采样 0.35、95% 上限）由另一个 change（`comfy-progress-truthfulness`）提供，**本分支（基于 main@a95d796）尚不含该实现**，本 change 不引入也不依赖它；Turbo 只有 8 步采样，若进度机制落地，其采样阶段会快速前进。Base 兜底露出时选择器会呈现三张卡（SFT / Turbo / Base），两列栅格会换行显示——仅影响排版，不影响功能。
- 保持 `pnpm dev:web`（浏览器 mock 桥）可用；保持 Music 3 与其他工作流不回归。
- 不把真实令牌、凭据写入仓库或持久化脚本。
