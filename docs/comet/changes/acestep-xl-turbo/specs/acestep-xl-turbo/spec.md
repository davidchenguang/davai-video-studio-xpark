# ACE-Step 1.5 XL Turbo 变体支持（acestep-xl-turbo）

## Capability

`acestep-xl-turbo` — ACE-Step 1.5 音乐工作区以一张**变体表**驱动模型选择与采样参数：常驻选项为 **XL SFT**（质量档，官方 50 步 / CFG 7）与 **XL Turbo**（速度档，官方 8 步 / CFG 1），**XL Base** 仅在两者都缺失时作为检测兜底露出；每个变体使用 Comfy-Org 官方模板为它规定的权重文件与采样参数，界面在提交前就显示该变体的真实步数与官方 CFG。

## 背景（事实已核实）

- ComfyUI 0.45.2（GB10 `192.168.20.80:8188`）的 pip 包 `comfyui_workflow_templates_json` 内含 Comfy-Org 发布的 ACE-Step 1.5 官方模板 `audio_ace_step1_5_xl_turbo.json` / `_base.json` / `_sft.json`。三者的模型与采样链路相同，差异仅在权重文件名与采样参数（UI 模板里 turbo/base 另带说明与常量节点，不影响 API 图）。
- 官方参数：Turbo = `steps 8` / `cfg 1` / euler / simple / denoise 1 / AuraFlow `shift 3` / TextEncode `cfg_scale 2` / `temperature 0.85` / `top_p 0.9`；Base = `steps 50` / `cfg 6` / `top_p 0.9`；SFT = `steps 50` / `cfg 7` / `top_p 1`。`templates/index.json` 对 Turbo 的说明是「the distilled 4B ACE-Step model… in just 8 inference steps without CFG」；同机 diffusers 实现注明 turbo 的 guidance 已蒸馏进权重，跑 CFG>1 会过度引导并被强制回落为 1.0。
- GB10 上三个 XL 权重与两个 Qwen ACE 编码器、`ace_1.5_vae` 全部在位；引擎 `/object_info/UNETLoader` 的列表里三个文件名均出现。
- 引擎侧没有 turbo 专属节点或输入（`TextEncodeAceStepAudio1.5` 的 `description` 为空）；`ModelSamplingAuraFlow` 节点默认 shift 为 1.73，三个官方模板都显式覆盖为 3。
- 应用现状：`inferAceStepSelections` 只识别 base 与 sft；`buildAceStepWorkflow` 写死 `steps 50`、`cfg sft?7:6`、`top_p 1`。Base 的 `top_p` 与官方 0.9 不一致（既有偏差），Turbo 完全缺失。

## 完整行为规格

### 1. 变体表是唯一参数来源

`src/lib/aceStepWorkflow.ts` 导出一张变体表，每个条目包含：变体标识、展示名、卡片副标题、步数、CFG、TextEncode 的 `top_p`，以及在模型清单中匹配该变体权重文件名的规则。

| 变体 | 权重文件 | steps | cfg | top_p | 卡片副标题 |
| --- | --- | --- | --- | --- | --- |
| `sft` | `acestep_v1.5_xl_sft_bf16.safetensors` | 50 | 7 | 1 | 指令微调 · 官方 CFG 7 |
| `turbo` | `acestep_v1.5_xl_turbo_bf16.safetensors` | 8 | 1 | 0.9 | 蒸馏加速 · 官方 8 步 · 无 CFG |
| `base` | `acestep_v1.5_xl_base_bf16.safetensors` | 50 | 6 | 0.9 | 基础模型 · 官方 CFG 6 |

约束：

- 步数、CFG、top_p **不得**在组件里另行硬编码，组件只能读表。
- 图里其余参数与官方模板保持一致：`TextEncodeAceStepAudio1.5` 的 `cfg_scale: 2` / `temperature: 0.85` / `top_k: 0` / `min_p: 0`，`ModelSamplingAuraFlow` 的 `shift: 3`，`KSampler` 的 `sampler_name: 'euler'` / `scheduler: 'simple'` / `denoise: 1`，`VAEDecodeAudio` → `SaveAudioAdvanced`（格式 FLAC），`EmptyAceStep1.5LatentAudio` 的秒数等于时长，`ConditioningZeroOut` 接文本编码输出。
- **SFT 路径的参数一个字节都不能变**：SFT 图被 `scripts/fixtures/prompt-parity-baseline.json` 逐字节钉在基线 `6a600eb` 上；若必须改动，走正规 re-pin，本轮不做。

#### Scenario: 三个变体按官方模板出图
Acceptance: A2

Turbo 图的 KSampler 为 `steps: 8` / `cfg: 1`、TextEncode `top_p: 0.9`；Base 为 `steps: 50` / `cfg: 6` / `top_p: 0.9`；SFT 为 `steps: 50` / `cfg: 7` / `top_p: 1`，三者与 Comfy-Org 官方模板逐项一致。

#### Scenario: SFT 图不回归
Acceptance: A3

SFT 生成的图与改动前逐字节一致（`pnpm test:prompt-parity` 仍 PASS，基线 ref 仍为 `6a600eb`）。Base 仅 `top_p` 由 1 改为 0.9——已确认的行为变更，同样种子下 Base 的产出与改动前不同。

### 2. 识别与模型清单

`inferAceStepSelections` 增加 Turbo 权重识别（文件名规则 `acestep_v1.5_xl_turbo_bf16(.safetensors)`，大小写不敏感），与既有 base / sft 的识别方式一致（按 `kind === 'diffusion_models'` 过滤后取首个匹配项）。

- `AceStepModelSelection.turbo` 为**可选**字段：类型上仍允许只装 SFT/Base 的机器，既有调用方（如 `scripts/lib/prompt-parity-harness.cjs` 的对象字面量）无需修改。
- 识别只依赖引擎/本地合并后的模型清单，不依赖固定的绝对路径。

#### Scenario: Turbo 被识别
Acceptance: A1

模型清单含 `acestep_v1.5_xl_turbo_bf16.safetensors` 时，识别结果里 Turbo 项为该文件名；既有 base/sft/编码器/VAE 识别不受影响。

### 3. 选择器、卡片与文案

- 工作区的模型选择器渲染「**可展示变体**」：常驻 SFT 与 Turbo；**只有当 SFT 与 Turbo 都缺失、而 Base 在位时**，才额外露出 XL Base 卡，并在标题区给出「仅检测到 XL Base」的提示（此时 SFT 与 Turbo 两张常驻卡仍以「缺失」徽标呈现，合计三张卡；两列栅格会换行，属排版问题）。
- 每张卡的副标题来自变体表（SFT「指令微调 · 官方 CFG 7」、Turbo「蒸馏加速 · 官方 8 步 · 无 CFG」、Base「基础模型 · 官方 CFG 6」），就绪 / 缺失徽标沿用现有规则（文件是否识别到）。
- 顶部 provider-note 的文案为「选择 XL SFT 或 XL Turbo。音乐设置与历史独立于视频项目。」
- 生成摘要行显示变体与**真实步数**（如 `XL TURBO · 8 步 Euler · FLAC`），不再写死 50 步。
- 「重置音乐」回到默认变体（首个可用变体）。

#### Scenario: 选择器呈现 SFT 与 Turbo
Acceptance: A4

SFT 与 Turbo 都在位时，工作区呈现 XL SFT 与 XL Turbo 两张卡，副标题为变体表文案；生成摘要行显示真实步数。只有 Turbo 在位时，SFT 卡以「缺失」徽标呈现且不可选、Turbo 卡就绪、Base 卡不露出、默认选中 Turbo。只有 Base 在位时，Base 卡额外露出并提示「仅检测到 XL Base」。

### 4. 可用变体、默认选择与旧存档迁移

- 「首个可用变体」优先级固定为 **sft → turbo → base**。
- 旧存档（`acestep.workspace` 的 `model: 'base'`）在 Base 不再可展示时迁移到首个可用变体；Base 恰为唯一可用变体时保留 `base`。
- 工作区状态读取必须容忍旧形状（只有 `sft` / `base` 两种取值），不得因新变体而崩溃。

#### Scenario: 仅装 Base 的机器仍可用
Acceptance: A5

只有 Base 在位时，选择器露出 XL Base 卡并提示「仅检测到 XL Base」，该机器仍可生成；默认选择为 base；旧存档 `model: 'base'` 不被迁移掉。

### 5. 提交路径、工作流导出与任务元数据

- `src/App.tsx` 的 ACE-Step 提交路径按变体取权重文件；缺权重/编码器/VAE 时的报错文案列出实际缺少的文件。
- 任务 `execution` 记录真实扩散模型文件名与采样描述（形如 `Euler + simple · 8 步`）。
- 产出前缀沿用 `audio/ACE_Step_1.5_{variant}_{timestamp}`（Turbo 产出为 `audio/ACE_Step_1.5_turbo_…`），保存格式统一 FLAC。
- 设置里的「**ComfyUI 工作流导出**」用**首个可用变体**构造 ACE-Step 图（不再写死 `ace.sft ? 'sft' : 'base'`）。设置里的「测试连接」只做连接探测与模型清单刷新，不构建 ACE-Step 图，本 change 不改它。
- 应用内安装提示（`src/lib/workspaceTips.ts` 第 9 条）与 README 同步列出三个 XL 权重。

#### Scenario: 提交与导出走同一个变体规则
Acceptance: A6

工作流导出使用首个可用变体：只有 Turbo 在位的机器导出的是 `unet_name: acestep_v1.5_xl_turbo_bf16.safetensors` 且 `steps: 8` 的有效图（改动前会导出 `unet_name` 为空字符串的坏图）；任务记录里的扩散模型文件名与步数与所选变体一致；Turbo 产出文件名前缀为 `audio/ACE_Step_1.5_turbo_…`。

### 6. 文档、本地化与回归

- `README.md` 的 ACE-Step 1.5 安装章节列出三个 XL 权重文件与各自的官方采样参数（步数 / CFG），并说明 Turbo 的定位。
- `src/lib/workspaceTips.ts` 第 9 条安装提示同样列出三个 XL 权重文件名。
- `docs/locale/keep-english.md` 在「保留英文的模型变体名」小节新增 `XL Turbo` 的内容级豁免（沿用 `XL SFT` / `XL Base` 的写法：`src/components/AceStepWorkspace.tsx:content=XL Turbo`）。
- 新增 `scripts/test-ace-step.cjs` 并接入 `package.json` 的 `test` 链，覆盖：变体表的官方取值、Turbo 文件名识别、三张图的关键参数、SFT 图不回归、可用变体与兜底选择逻辑（含「仅 Turbo 在位」「仅 Base 在位」两种组合）。

#### Scenario: 文档与本地化就位
Acceptance: A7

README 列出三个权重与官方参数；应用内安装提示列出 Turbo 权重；locale 豁免含 `XL Turbo`；`pnpm test:locale` 报告 0 处问题。

#### Scenario: 既有检查全部通过
Acceptance: A8

`pnpm typecheck && pnpm lint && pnpm test && pnpm build:web` 通过；`pnpm test:prompt-parity` 仍 PASS 且基线 ref 未变；新增 `pnpm test:ace-step` 覆盖上述断言。

### 7. 端到端

#### Scenario: 在 GB10 上真实跑通一条 Turbo
Acceptance: A9

在 `192.168.20.80:8188` 上提交一条 XL Turbo（10 秒）任务：出音正常、采样确实为 8 步、产出为 FLAC、任务 `execution` 记录与所选变体一致；生成的 FLAC 拷回本机供试听。

**进度不在本验收项内**：阶段化进度由另一个 change（`comfy-progress-truthfulness`）提供，本分支（基于 `main@a95d796`）尚不含该实现；本 change 不引入也不依赖它。若该机制在验证前已落地并 rebase 到本分支，则附带记录实际进度分布（Turbo 只有 8 步采样，采样阶段会快速前进）。

**已知限制**：Base 兜底露出时选择器呈现三张卡（SFT / Turbo / Base），两列栅格会换行显示——仅影响排版。
