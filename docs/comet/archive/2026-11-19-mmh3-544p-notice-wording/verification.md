---
generated_from_state_version: 8
---

# 验证

## 当前结果

- 结果: **已归档**
- 验证情况: **已完成检查，验证结果已确认**
- 目标周期: 1
- 迭代: 1
- 验证器尝试次数: 1
- 完成时间: 2026-11-19T02:16:10.887Z
- 摘要: 24/24 通过。本 change 为单文件文案修复：git diff 191923c -- src electron scripts 仅显示 src/App.tsx:2485-2497 submitMmh3 通知分支一处改动，配对逻辑（mmh3TierForCanvas）与提交字段（recipe: tier）未动。A1/A2/A14 由独立探针实测——从 src/App.tsx 原样提出通知分支、用真实 mmh3TierForCanvas 求值——960×544+turbo8 得 tier=turbo8-544p 与通知「已配对到 544p 变体（turbo8-544p，8 步）」，1344×576+turbo8 得 tier=off 与通知「已回退到标准配方（引擎默认步数）」，两分支均不出现「30 步」。A3–A13、A15–A24 为完整能力 Spec 继承项，实现与已归档 mmh3-engine-v2-wiring（commit 191923c，35/35 pass）逐字节一致，历史证据见 docs/comet/archive/2026-11-19-mmh3-engine-v2-wiring/verification.md（逐项对应行 A15–A25、A26–A35）；本轮另行独立重跑双侧 tsc、eslint、locale-audit、G1–G8 门禁与 pnpm test 链内 31 个套件，全绿。遗留风险集中在通知文案无自动化门禁、build-web 未由验收者亲跑、以及 live 空闲实例 weights 为空这一继承行为。

## 验收

| 编号 | 结果 | 来源 | 验收项 | 原因 |
| --- | --- | --- | --- | --- |
| A1 | passed | brief.md | A1：960×544 画布显式选择 Turbo 8 并提交：通知说明已配对到 turbo8-544p 变体（含 8 步语义），不出现「回退标准 30 步」表述；提交字段仍为 turbo8-544p 条目（`mmh3TierForCanvas('turbo8', 960, 544) === 'turbo8-544p'` 不回归）。 | 通过。独立探针 /tmp/w1-notice-probe.cjs 从 src/App.tsx:2487 原样提出 submitMmh3 的 tier 分支，用真实 mmh3TierForCanvas（src/lib/engine/mmh3Recipe.ts:194-197，本轮未改动）求值：960×544+turbo8 → tier='turbo8-544p'，通知='当前画布 960×544：Turbo 8 已配对到 544p 变体（turbo8-544p，8 步）。'，含 8 步语义，且不含「30」与「回退」。提交载荷仍为 recipe: tier（src/App.tsx:2502），配对逻辑与提交字段未动。live :8888 /v1/recipes 中 turbo8-544p available=true、missing=[]、options.steps=8、canvas=960×544。 |
| A2 | passed | brief.md | A2：未配对画布（如 1344×576）下带残留 turbo8 选择提交：通知说明已回退到标准配方（引擎默认步数），不固定写「30 步」；提交按 `off` 档进行。 | 通过。同一探针：1344×576+turbo8 → tier='off'，通知='当前画布 1344×576 不提供 turbo8（只支持 1344×768 与 960×544），已回退到标准配方（引擎默认步数）。'，明确「回退」到标准配方且不含「30」。提交按 off 档进行（MMH3_SERVER_RECIPE_MAP base→off，src/lib/engine/mmh3Recipes.ts:20；mmh3Task.ts:79-83 透传服务端 options）。live base 配方 steps=20，说明旧文案「标准 30 步」在引擎应答时连数值也不对。 |
| A3 | passed | specs/mmh3-engine-integration/spec.md | 首次启动无新字段 升级后首次启动（设置文件无 `engines`/`activeEngineId`）：H3 选择器默认显示 ComfyUI，其余一切工作区行为与本 change 之前**行为级一致**（行为等价，不做逐字节比对）。 | 通过（继承证据复用）。实现与已归档 change mmh3-engine-v2-wiring（commit 191923c，35/35 pass）逐字节一致：git diff 191923c -- src electron scripts 仅显示 src/App.tsx:2485 一处通知字符串改动。历史证据：docs/comet/archive/2026-11-19-mmh3-engine-v2-wiring/verification.md 行 A15（G6 断言 loadSettings 白名单含 engines/activeEngineId、缺省返回预置两条目）。本轮独立重跑 G1–G8 全 PASS。 |
| A4 | passed | specs/mmh3-engine-integration/spec.md | 首启幂等合成 升级后首启（存量设置只有 `comfyUrl`）：合成 `engines=[comfy(镜像), mmh3(默认本机地址)]`、`activeEngineId='comfy'`；再次启动不重复改写；一切非 H3 行为与改动前一致。 | 通过（继承证据复用）。对应 archived verification.md 行 A16（首启归一化纯函数幂等合成、comfyUrl 镜像、G6 断言）。实现未变（diff 仅通知串一处）；本轮 G6 随 test-engine-routing.cjs 重跑 PASS。 |
| A5 | passed | specs/mmh3-engine-integration/spec.md | 保存单通道 设置页把 `comfyUrl` 从 A 改为 B 保存：一次写盘同时落 `comfyUrl=B` 与 `engines[comfy].baseUrl=B`；反向编辑 comfy 条目 baseUrl 同理；两次保存之间不存在不一致窗口，也不出现第二次写盘提示。 | 通过（继承证据复用）。对应 archived verification.md 行 A17（设置页 updateEngine 一次 setSettings 同时落 comfyUrl 与 engines[comfy].baseUrl，原子写通道未改、无不一致窗口）。实现未变；G6 重跑 PASS。 |
| A6 | passed | specs/mmh3-engine-integration/spec.md | 引擎可见可管理 用户在设置页看到 ComfyUI 与 mmh3 两条预置条目，可改 mmh3 的 baseUrl 指向另一本机端口，保存后 H3 选择器随即使用新地址；不重启应用生效。 | 通过（继承证据复用）。对应 archived verification.md 行 A18（mmh3 预置条目 baseUrl 可编辑保存，engines 即时传播至 H3 选择器，无需重启）。实现未变。 |
| A7 | passed | specs/mmh3-engine-integration/spec.md | 自定义引擎可增删（验收：A10） 设置页新增一条名为「mmh3-实验」的自定义 mmh3 引擎（地址填本机另一端口）：保存后 H3 视频与 H3 生图的引擎选择器出现该条目，状态徽标按其地址独立预检；在设置页删除它并确认：条目消失，若它是当前选择则回落 ComfyUI，预置两条目始终存在且无删除入口。 | 通过（继承证据复用）。对应 archived verification.md 行 A19/A10（新增自定义条目含 fastBaseUrl；删除仅限自定义条目，当前默认可删并在确认后回落 ComfyUI；预置两条目恒存无删除入口；逐引擎按自身地址独立预检）。实现未变。 |
| A8 | passed | specs/mmh3-engine-integration/spec.md | 离线置灰 停掉本机 `mmh3.service` 后打开 H3 视频工作区：mmh3 选项在数秒内置灰、状态行显示离线原因；ComfyUI 选项不受影响且可正常生成。 | 通过（继承证据复用）。对应 archived verification.md 行 A20（engineHealth offline → 「⚠ 离线」徽标 + 选项置灰 + 状态行原因；ComfyUI 选项不受影响）。本 change 未触碰该路径。 |
| A9 | passed | specs/mmh3-engine-integration/spec.md | 模型缺失 mmh3 可达但实例的模型树缺某配方文件（如 patches 下无 FastH3 patch）：选择器显示 `○ 模型缺失` 并注明缺哪个文件；该档位不可提交，其余档位正常。 | 通过（继承证据复用）。对应 archived verification.md 行 A21（配方级 available=false → 「○ 模型缺失」+ missingTiersNote 点名缺失文件 + 该档不可提交，其余档正常）。实现未变。live :8888 /v1/recipes 九条配方 turbo8/turbo8-544p/base 均 available=true、missing=[]。 |
| A10 | passed | specs/mmh3-engine-integration/spec.md | 实际权重可见（验收：A5） mmh3 实例可达且空闲：状态行显示该实例实际加载的 DiT 文件名与适配器（如 `fastvideo_fasth3_8step_v2_pruned_int8_convrot.safetensors` + 其 patch/LoRA）；切到极速档时状态行显示的是 `:8889` 自己的权重而非主实例的；权重指纹旁注明「实例口径指纹，非完整性校验」；实例正在渲染时状态行显示「● 正忙」而非「模型缺失」。 | 通过（继承证据复用）。对应 archived verification.md 行 A22/A5（weightLine 渲染 DiT 文件名 + 适配器 + 「（实例口径指纹，非完整性校验）」；fast 实例权重独立呈现；busy 判定含 weights 无 dit 分支，src/lib/engine/engineHealth.ts:55-63,82）。实现未变。caveat 见 risks 第 3 条（live 空闲实例 weights 为空的组合未被历史证据覆盖）。 |
| A11 | passed | specs/mmh3-engine-integration/spec.md | Turbo 4 走 mmh3 选择 mmh3 + Turbo 4 档提交 1344×768/5 秒：请求发往 `http://127.0.0.1:8888/v1/generations`，multipart 含上表字段；完成后媒体库出现带 mmh3 徽标的 MP4。 | 通过（继承证据复用）。对应 archived verification.md 行 A23（Turbo 4 走 mmh3：iteration-1 实机出片、multipart 字段、媒体库 mmh3 徽标 MP4；G5 断言 fasth3 字段）。实现未变；G5 重跑 PASS。本轮未实机出片（不得扰动 8888/8889 常驻实例），引擎侧语义沿用归档 Run 的实机证据。 |
| A12 | passed | specs/mmh3-engine-integration/spec.md | fast 档路由第二实例 选择极速 fast 档提交：请求发往 `:8889`；主实例（:8888）不参与该任务；fast 档 UI 标注来源实例。 | 通过（继承证据复用）。对应 archived verification.md 行 A24（fast 档路由 fastBaseUrl 到 :8889、主实例不参与、GenerationJob.mmh3BaseUrl 定向取消）。实现未变。 |
| A13 | passed | specs/mmh3-engine-integration/spec.md | Turbo 8 画布配对（验收：A7） 画布为 1344×768 时选 Turbo 8：multipart 含 `lora=minimax_h3_fl2v_turbo_8step_v1.0_768p_comfyui_bf16.safetensors`、`steps=8`、`shift-video=6`、`shift-audio=3`、`attention=sol`、`attention-precision=int8-fp8`、`sparse-start=0`（配方快照门禁 G5 断言字段）。画布改为 960×544：Turbo 8 落到 `turbo8-544p` 条目（缺该 LoRA 时显示「模型缺失」并禁用提交）。画布改为 1344×576 或竖屏/方形：Turbo 8 不出现在可选档位中，选择处说明该档只支持 1344×768 / 960×544。 | 通过（继承证据复用 + 本轮复核）。对应 archived verification.md 行 A25（G5 快照逐字段断言 turbo8 768p LoRA/steps8/sol/int8-fp8/sparse-start0/shift6/3 与 turbo8-544p 544p LoRA/shift12/3，以及画布映射断言）。本轮探针复核 mmh3TierForCanvas('turbo8',960,544)==='turbo8-544p'；live :8888 /v1/recipes turbo8-544p options.steps=8、canvas=960×544。 |
| A14 | passed | specs/mmh3-engine-integration/spec.md | 配对结果通知如实（验收：A1、A2） 960×544 画布显式选择 Turbo 8 提交：通知说明已配对到 turbo8-544p 变体（8 步语义），不出现「回退标准 30 步」表述；提交字段仍为 turbo8-544p 条目。未配对画布（如 1344×576）带残留 turbo8 选择提交：通知说明已回退到标准配方（引擎默认步数），不固定写「30 步」；提交按 `off` 档进行。 | 通过（本 change 新增的 spec 场景，实测证据）。场景文本与 A1/A2 同义：960×544 → 「已配对到 544p 变体（turbo8-544p，8 步）」；1344×576 → 「已回退到标准配方（引擎默认步数）」；两分支均无「30 步」，提交字段分别仍为 turbo8-544p 与 off。由同一探针直接给出。 |
| A15 | passed | specs/mmh3-engine-integration/spec.md | PDMD 专属档 选择 PDMD 2 步档提交：multipart 含 `lora=minimax_h3_pdmd_2step_lora_rank128_bf16.safetensors`、`steps=2`、`shift-video=12`、`shift-audio=3`、`attention=sol`、`attention-precision=int8-fp8`、`sparse-start=0`；UI 徽标区分「mmh3 专属」，该档不出现在 ComfyUI 引擎选项中（G5 断言字段 + 实机抽测出片）。 | 通过（继承证据复用）。对应 archived verification.md 行 A26（G5 断言 PDMD lora minimax_h3_pdmd_2step_lora_rank128_bf16.safetensors/steps2/shift12/3/sol/int8-fp8/sparse-start0，且该档仅在 mmh3 选择器可见）。实现未变。 |
| A16 | passed | specs/mmh3-engine-integration/spec.md | 角色身份图同引擎 角色工作室的身份图批量生成提交点在 mmh3 引擎下按生图路径（§5）分派，不构造 ComfyUI graph。 | 通过（继承证据复用）。对应 archived verification.md 行 A27（G4 断言三处 H3 分派结构含角色身份图提交点，mmh3 下走生图路径不构造 ComfyUI graph）。实现未变；G4 重跑 PASS。 |
| A17 | passed | specs/mmh3-engine-integration/spec.md | mmh3 生图入库 mmh3 引擎下 1024×1024/6 步生图完成：PNG 落地本地 outputDirectory、登记 `GenerationJob`（`provider: 'h3image'`、`engineId: 'mmh3'`）、媒体库可见可删除，与 ComfyUI 生图条目同构。 | 通过（继承证据复用）。对应 archived verification.md 行 A28（iteration-1 实机 1024×1024/6 步生图：PNG 落 outputDirectory、GenerationJob provider='h3image'/engineId='mmh3'、媒体库可删，与 ComfyUI 条目同构）。实现未变。 |
| A18 | passed | specs/mmh3-engine-integration/spec.md | 排队可见 在 mmh3 已有一个 running 任务时再提交一个：第二个任务卡片显示排队位置；第一个完成后第二个自动开始并正常完成。排队状态以 `role="status"` 呈现并在状态变化时播报一次，不高频刷新。 | 通过（继承证据复用）。对应 archived verification.md 行 A29（mmh3QueueAhead 推导排队位置、卡片「排队中（前面还有 N 个）」、role=status 且状态变化播报一次不高频刷新）。实现未变。 |
| A19 | passed | specs/mmh3-engine-integration/spec.md | 真中断不落库（验收：A1、A2、A3） mmh3 任务运行中点取消：卡片转「正在停止（当前步跑完后生效）」，引擎进入 `cancelling` 后转 `cancelled` 终态；服务端完成后媒体库**不**出现该产物，远端副本被清理。若取消落在最后一步之后、引擎已返回 `done`，卡片显示完成并保留产物入库——不谎报取消成功。排队中的任务被取消时直接 `cancelled`、不起跑、不占 GPU。 | 通过（继承证据复用）。对应 archived verification.md 行 A30 及 A1-A3（iteration-1 实机：cancelling→cancelled、产物不落库、排队任务直接取消不起跑、末步窗口如实记 done 不谎报取消成功）。实现未变。live :8888/:8889 /v1/status 均含 cancelling 字段（v2 契约在线）。 |
| A20 | passed | specs/mmh3-engine-integration/spec.md | 旧引擎软取消降级（验收：A4） 对不支持 interrupt 的实例点取消：卡片转取消态并出现「mmh3 无法中断，仍在占用 GPU」提示；服务端完成后媒体库不出现该产物，远端副本被清理；界面不出现原始 HTTP 错误文案。 | 通过（继承证据复用）。对应 archived verification.md 行 A31（不支持 interrupt 的实例走软取消：卡片取消态 + 「mmh3 无法中断，仍在占用 GPU」、服务端跑完产物丢弃不入库、界面不出现原始 HTTP 错误文案）。实现未变。 |
| A21 | passed | specs/mmh3-engine-integration/spec.md | 降级标注 mmh3 任务的卡片与详情不出现「放大」等操作入口，原入口位置显示禁用态与原因 tooltip（禁用态与原因以 `role="status"` 呈现，仅在状态变化时播报）；同一产物拖入 ComfyUI 引擎的 H3 任务作首帧则正常可用。 | 通过（继承证据复用）。对应 archived verification.md 行 A32（mmh3 任务卡 preview「不可用 · mmh3 只回报步进进度」、upscale「不可用 · 依赖 ComfyUI 渲染管线」，禁用态与原因以 role=status 呈现；同一产物拖入 ComfyUI 引擎作首帧正常可用）。实现未变。 |
| A22 | passed | specs/mmh3-engine-integration/spec.md | 删除与引用检测照常 删除一条 mmh3 视频产物：文件进回收站、记录移除；当它被影片项目引用时删除被阻止并提示引用位置——与 ComfyUI 产物行为一致。 | 通过（继承证据复用）。对应 archived verification.md 行 A33（mmh3 产物走与 ComfyUI 同一 GenerationJob/媒体库管线，删除进回收站、被影片项目引用时阻止并提示引用位置，零额外分支）。实现未变。 |
| A23 | passed | specs/mmh3-engine-integration/spec.md | 交接释放 ComfyUI 刚完成一次 H3 生成后立刻选 mmh3 提交：应用先查队列（空）、发 `/free`、等 mmh3 确认可达，然后提交成功；状态行按序显示上述阶段。 | 通过（继承证据复用）。对应 archived verification.md 行 A34（prepareSubmit/MMH3_SUBMIT_STAGES 按序呈现查队列 → /free → 确认 mmh3 可达）。实现未变。 |
| A24 | passed | specs/mmh3-engine-integration/spec.md | 全量回归绿 `pnpm typecheck && pnpm lint && pnpm test && pnpm build:web` 在本 change 全部改动下通过；`test-engine-routing.cjs` 门禁逐条通过。 | 通过（本轮独立重跑，只读）。npx tsc --noEmit exit=0；npx tsc -p tsconfig.electron.json --noEmit exit=0；npx eslint . --max-warnings 0 exit=0；node scripts/locale-audit.cjs PASS（已认领文件 0 处问题）；node scripts/test-engine-routing.cjs G1–G8 全 PASS；pnpm test 链内 31 个套件逐个直跑全 PASS（工作区导航、场景编译、角色库、提示词标签、lm-studio、llm-stream、preload-sandbox、工作流、ace-step、h3-image、h3-node-detection、模型清单、ltx-ripple、fire-red-edit、续写、原子保存、影片编辑、comfy-cancel、comfy-job-state、live-preview-socket、进度阶段、任务持久化、任务呈现、旧浏览器存储、工作区持久化、媒体删除、locale、音乐词表、提示词对齐、主题、引擎路由）。vite build 未由本验收者重跑（写 dist/ 在只读验收禁止项内），A24 的 build-web 部分依赖 Runtime 托管检查与 archived verification 的 build-web 收据；本 change 对 src/App.tsx 仅字符串字面量改动，tsc/eslint 已覆盖语法与规范。 |

## 检查

| 检查 | 命令 | 工作目录 | 状态 | 退出码 | 耗时 |
| --- | --- | --- | --- | ---: | ---: |
| 引擎路由与契约门禁 | scripts/test-engine-routing.cjs | . | passed | 0 | 345 ms |
| 渲染进程类型检查 | tsc --noEmit | . | passed | 0 | 7351 ms |
| 主进程类型检查 | tsc -p [REDACTED] --noEmit | . | passed | 0 | 927 ms |
| ESLint（零警告） | eslint . --max-warnings 0 | . | passed | 0 | 3198 ms |
| 界面文案审计 | scripts/locale-audit.cjs | . | passed | 0 | 608 ms |
| 渲染端构建 | vite build | . | passed | 0 | 2610 ms |
| 工作流构建回归套件 | scripts/test-workflows.cjs | . | passed | 0 | 351 ms |

### Builder 报告的证据

以下为 Builder 报告，不等同于 Runtime 检查凭据或独立验收结果。

- lint-app: passed — npx eslint src/App.tsx --max-warnings 0 通过
- typecheck-renderer: passed — npx tsc --noEmit 通过
- locale-audit: passed — PASS：已认领文件 0 处问题（App.tsx 的 keep-english 登记均为 content= 口径，无行号漂移）
- engine-routing-gates: passed — G1–G8 全 PASS（G5 配方快照断言不受影响）
- 已知限制: A1/A2 为通知文案行为，本轮证据为代码审读 + 窄检查；G5 门禁不覆盖通知字符串（App.tsx 组件不在 ts-loader 套件驱动范围内），建议验收以代码定位核对。
- 已知限制: A3–A24 复用 mmh3-engine-v2-wiring 第 2 轮验收证据的前提是本 change 对应实现未变：本 change 仅改 src/App.tsx 一处通知字符串，其余文件与 191923c 工作树一致。

## 阻塞项

_无。_

## 风险与跳过的工作

- 通知文案没有自动化门禁：App.tsx 组件不在 ts-loader 套件驱动范围内，G1–G8 不覆盖通知字符串；本次验收探针放在 /tmp 未入库，同类文案回归不会被 CI 拦住。建议后续在 scripts/ 补一条针对 submitMmh3 tier 通知分支的门禁（后续项，非本 change 范围）。
- vite build 未由验收者重跑（写 dist/ 属只读验收禁止项），A24 的 build-web 部分依赖 Runtime 托管检查与 archived verification 的 build-web 收据。
- live 环境观察（继承行为，非本 change 引入，engineHealth.ts 未被本 diff 触碰）：空闲的 :8888/:8889 的 /v1/status 返回 weights: []，而 src/lib/engine/engineHealth.ts:82 以「weights 非 null 且无 dit 条目」判忙，故空闲但无驻留模型的实例可能显示「● 正忙」而非实际权重行。archived 验收时 8888/8889 仍是旧二进制（无 weights 字段），该组合未被历史证据覆盖，建议作为后续项单独跟踪。
- 引擎侧证据时效：live 8888/8889 提供 v2 契约（/v1/recipes 九条、weights/cancelling 字段齐全，turbo8 与 turbo8-544p 均 available=true），但引擎源码树已被重建为无 v2 端点版本，且本轮未做实机出片（不得扰动常驻实例），A11/A12/A15/A17/A18/A19/A20 的引擎侧语义沿用 archived Run iteration-1 的实机证据。
- A2 文案写「引擎默认步数」的口径说明：引擎应答时取服务端 base 配方（live steps=20），引擎不可达时本地表兜底 30（src/lib/engine/mmh3Recipe.ts:75）；后者本无法完成提交，故新文案不误导，也符合「不固定写 30 步」的要求。

## 之前的迭代

| 目标周期 | 迭代 | 尝试 | 结果 | 未解决项 | 摘要 | 完成时间 |
| ---: | ---: | ---: | --- | --- | --- | --- |
| 1 | 1 | 1 | pass | — | 24/24 通过。本 change 为单文件文案修复：git diff 191923c -- src electron scripts 仅显示 src/App.tsx:2485-2497 submitMmh3 通知分支一处改动，配对逻辑（mmh3TierForCanvas）与提交字段（recipe: tier）未动。A1/A2/A14 由独立探针实测——从 src/App.tsx 原样提出通知分支、用真实 mmh3TierForCanvas 求值——960×544+turbo8 得 tier=turbo8-544p 与通知「已配对到 544p 变体（turbo8-544p，8 步）」，1344×576+turbo8 得 tier=off 与通知「已回退到标准配方（引擎默认步数）」，两分支均不出现「30 步」。A3–A13、A15–A24 为完整能力 Spec 继承项，实现与已归档 mmh3-engine-v2-wiring（commit 191923c，35/35 pass）逐字节一致，历史证据见 docs/comet/archive/2026-11-19-mmh3-engine-v2-wiring/verification.md（逐项对应行 A15–A25、A26–A35）；本轮另行独立重跑双侧 tsc、eslint、locale-audit、G1–G8 门禁与 pnpm test 链内 31 个套件，全绿。遗留风险集中在通知文案无自动化门禁、build-web 未由验收者亲跑、以及 live 空闲实例 weights 为空这一继承行为。 | 2026-11-19T02:16:10.887Z |



## 结论

24/24 通过。本 change 为单文件文案修复：git diff 191923c -- src electron scripts 仅显示 src/App.tsx:2485-2497 submitMmh3 通知分支一处改动，配对逻辑（mmh3TierForCanvas）与提交字段（recipe: tier）未动。A1/A2/A14 由独立探针实测——从 src/App.tsx 原样提出通知分支、用真实 mmh3TierForCanvas 求值——960×544+turbo8 得 tier=turbo8-544p 与通知「已配对到 544p 变体（turbo8-544p，8 步）」，1344×576+turbo8 得 tier=off 与通知「已回退到标准配方（引擎默认步数）」，两分支均不出现「30 步」。A3–A13、A15–A24 为完整能力 Spec 继承项，实现与已归档 mmh3-engine-v2-wiring（commit 191923c，35/35 pass）逐字节一致，历史证据见 docs/comet/archive/2026-11-19-mmh3-engine-v2-wiring/verification.md（逐项对应行 A15–A25、A26–A35）；本轮另行独立重跑双侧 tsc、eslint、locale-audit、G1–G8 门禁与 pnpm test 链内 31 个套件，全绿。遗留风险集中在通知文案无自动化门禁、build-web 未由验收者亲跑、以及 live 空闲实例 weights 为空这一继承行为。
