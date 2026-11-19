---
generated_from_state_version: 10
---

# 验证

## 当前结果

- 结果: **已归档**
- 验证情况: **已完成检查，验证结果已确认**
- 目标周期: 1
- 迭代: 1
- 验证器尝试次数: 1
- 完成时间: 2026-11-19T04:05:45.503Z
- 摘要: 31/31 pass。范围核对：git diff b58e8f7 仅触及声明清单（engineHealth.ts/useEngineSelection.ts/EngineSelector.tsx/App.tsx 通知分支/mmh3Notice.ts 新/test-engine-status.cjs 新/package.json 测试链/docs/app-module-map.md 一行）+ Comet 产物，无清单外实现改动。新增项 A1–A6：判忙只认 generating/cancelling（S1/S1b/S2/S3+S1d 亲跑 PASS），实况探针以真实 :8888/:8889 空闲+空 weights 输入经现行 mmh3EngineHealth 得 ready+双实例未驻留注记（旧代码同输入按 diff 可见逻辑必判忙，缺陷坐实已修）；静默复查 15s 节律/hidden 暂停/visibilitychange 补查/silent 不置 checking/时间戳 aria-hidden（S4/S5 PASS）；通知纯函数逐字一致（S6 PASS）并接入 pnpm test 链。继承项 A7–A31：实现与 b58e8f7 一致（App.tsx 通知分支文案逐字保留），复用上轮 24/24 报告；被触碰面（A14 权重展示、A21 通知）由新套件重钉。静态腿独立重跑：双 tsc、eslint、G1–G8、locale-audit、workflows、h3-image 全 exit 0。Spec「定时复查的呈现约束」与 §14（顶层 dit/每配方 reason 纯文档、应用解析逐字段容忍）与实现一致；Spec 内仅剩 3 处「验收：」tag 且全部挂新增场景指向新编号 A1–A6，继承场景旧 tag 已清除。

## 验收

| 编号 | 结果 | 来源 | 验收项 | 原因 |
| --- | --- | --- | --- | --- |
| A1 | passed | brief.md | A1：引擎空闲（`generating=null`、`cancelling=null`）且 `/v1/status` 的 `weights` 为空数组或不含 dit：状态徽标为「● 就绪」，状态行说明实例当前未驻留权重（空闲已卸载），**不得**出现「正在生成」或「正忙」。fast 实例（`fastBaseUrl`）同一口径。 | engineHealth.ts:93 判忙只认 generating/cancelling 非空；:95 weights 空或无 dit 时 residentNote=「当前未驻留权重（空闲已卸载）。」；:98-106 fast 实例同口径（驻留/未驻留/生成中三态注记，不参与主实例判忙）。亲跑 node scripts/test-engine-status.cjs：S1（idle+weights=[] → ready、detail 含未驻留、无正在生成/正忙）、S1b（idle+无 dit weights → ready）、S1d（fast 三态+不判忙）全 PASS。实况探针：真实 :8888/:8889（均 generating=null、cancelling=null、weights=[]）经现行 mmh3EngineHealth → state=ready、detail=「mmh3 服务可达，当前未驻留权重（空闲已卸载）。极速实例当前未驻留权重（空闲已卸载）。」 |
| A2 | passed | brief.md | A2：引擎正在生成（`generating` 非空）：状态徽标为「● 正忙」，状态行说明正在生成。 | engineHealth.ts:93,110-112：generating 非空 → state=busy（● 正忙）、detail=「mmh3 正在生成…（队列 N 个）」。S2 PASS（亲跑）。 |
| A3 | passed | brief.md | A3：引擎已受理停止（`cancelling` 非空、`generating` 为空）：状态徽标为「● 正忙」，状态行说明「已受理停止，跑完当前步即停」。 | 判忙含 cancelling（engineHealth.ts:93）；:112 cancelling 时 detail 追加「（已受理停止，跑完当前步即停）」，generating 为空时仍 busy。S3 PASS（亲跑，断言「已受理停止」与「跑完当前步即停」均在）。 |
| A4 | passed | brief.md | A4：健康状态随引擎实际状态变化而更新：引擎从空闲变为占用、或从占用变为空闲后，状态行在 ≤30 秒内反映新状态，无需重新进入工作区或手动刷新。定时复查**静默进行**（不置 checking、不禁用引擎下拉、不显示 spinner）；「检查于 HH:MM:SS」时间戳不进 `aria-live` 播报，复查未改变状态+详情时读屏不重播；`document.hidden` 期间暂停复查。 | engineHealth.ts:43 ENGINE_HEALTH_REFRESH_MS=15000 < TTL 30000（15s tick ≤30s 上界）；useEngineSelection.ts：setInterval 15s、tick 内 if(!document.hidden) 才 runChecks({silent:true})、visibilitychange 回前台即刻补查、silent 分支不 setChecking，cleanup 撤定时器与监听；EngineSelector.tsx:27 下拉 disabled=disabled\|\|checking、:37 spinner 仅 checking、:39-44 播报只含 engineHealthAnnouncement（无检查于），时间戳 engineHealthStamp 在 aria-hidden span。S4（stamp 含检查于/announcement 不含）、S5（15s 常量、hidden 门、silent 不置 checking、stamp aria-hidden）亲跑 PASS。caveat：无头环境未实跑 15s DOM tick，按口径以结构+常量断言为准。 |
| A5 | passed | brief.md | A5：档位配对通知文案（可测函数）：960×544 画布 + turbo8 → 文案说明已配对到 turbo8-544p（含 8 步语义），不含「回退」「30 步」；未配对画布（如 1344×576）→ 文案说明已回退到标准配方（引擎默认步数），不含「30 步」。 | src/lib/engine/mmh3Notice.ts:22/26 纯函数；git diff b58e8f7 -- src/App.tsx 显示两条文案与原内联版逐字一致。S6 亲跑 PASS：paired（960×544+turbo8→turbo8-544p）含「turbo8-544p」「8 步」、不含「回退」「30 步」；fallback（1344×576→off）含「标准配方」「引擎默认步数」、不含「30 步」；tier 未变时返回 null。 |
| A6 | passed | brief.md | A6：门禁套件覆盖上述判忙与文案行为，纳入 `pnpm test` 链（由 scripts 链式调用），使同类回归被自动拦住。 | scripts/test-engine-status.cjs 断言 S1–S6（含 S5 对 useEngineSelection/EngineSelector 的结构断言与 S6 对 App.tsx 委托的断言）；package.json test 链尾新增 test:engine-status（pnpm test 由 scripts 链式调用）；套件亲跑 exit 0。 |
| A7 | passed | specs/mmh3-engine-integration/spec.md | 首次启动无新字段 升级后首次启动（设置文件无 `engines`/`activeEngineId`）：H3 选择器默认显示 ComfyUI，其余一切工作区行为与本 change 之前**行为级一致**（行为等价，不做逐字节比对）。 | 继承复用：git diff b58e8f7 --stat 仅 6 修改文件 + 2 新增（mmh3Notice.ts、test-engine-status.cjs）+ docs/comet/changes/ 产物，无清单外实现改动；上轮 24/24 pass（docs/comet/archive/2026-11-19-mmh3-544p-notice-wording/verification.md 行 A3：loadSettings 白名单缺省返回预置、首启默认 ComfyUI）；本轮 G6 随 test-engine-routing.cjs 重跑 PASS。 |
| A8 | passed | specs/mmh3-engine-integration/spec.md | 首启幂等合成 升级后首启（存量设置只有 `comfyUrl`）：合成 `engines=[comfy(镜像), mmh3(默认本机地址)]`、`activeEngineId='comfy'`；再次启动不重复改写；一切非 H3 行为与改动前一致。 | 继承复用（上轮行 A4：首启幂等合成 engines/activeEngineId、再次启动不重复改写）；实现未变（diff 范围核对）；G6 重跑 PASS。 |
| A9 | passed | specs/mmh3-engine-integration/spec.md | 保存单通道 设置页把 `comfyUrl` 从 A 改为 B 保存：一次写盘同时落 `comfyUrl=B` 与 `engines[comfy].baseUrl=B`；反向编辑 comfy 条目 baseUrl 同理；两次保存之间不存在不一致窗口，也不出现第二次写盘提示。 | 继承复用（上轮行 A5：updateEngine 一次写盘同时落 comfyUrl 与 engines[comfy].baseUrl，无不一致窗口）；实现未变。 |
| A10 | passed | specs/mmh3-engine-integration/spec.md | 引擎可见可管理 用户在设置页看到 ComfyUI 与 mmh3 两条预置条目，可改 mmh3 的 baseUrl 指向另一本机端口，保存后 H3 选择器随即使用新地址；不重启应用生效。 | 继承复用（上轮行 A6：mmh3 baseUrl 可编辑、engines 即时传播 H3 选择器、免重启）；实现未变。 |
| A11 | passed | specs/mmh3-engine-integration/spec.md | 自定义引擎可增删 设置页新增一条名为「mmh3-实验」的自定义 mmh3 引擎（地址填本机另一端口）：保存后 H3 视频与 H3 生图的引擎选择器出现该条目，状态徽标按其地址独立预检；在设置页删除它并确认：条目消失，若它是当前选择则回落 ComfyUI，预置两条目始终存在且无删除入口。 | 继承复用（上轮行 A7：自定义引擎增删、删除回落 ComfyUI、预置恒存、按地址独立预检）；实现未变。 |
| A12 | passed | specs/mmh3-engine-integration/spec.md | 离线置灰 停掉本机 `mmh3.service` 后打开 H3 视频工作区：mmh3 选项在数秒内置灰、状态行显示离线原因；ComfyUI 选项不受影响且可正常生成。 | 继承复用（上轮行 A8：offline → ⚠ 离线+置灰+原因）；engineHealth.ts offline 分支（:76-88）本 change 未触碰（diff 可见）。 |
| A13 | passed | specs/mmh3-engine-integration/spec.md | 模型缺失 mmh3 可达但实例的模型树缺某配方文件（如 patches 下无 FastH3 patch）：选择器显示 `○ 模型缺失` 并注明缺哪个文件；该档位不可提交，其余档位正常。 | 继承复用（上轮行 A9：配方 available=false → ○ 模型缺失+点名缺失文件+不可提交）；withMissingModel（:128-142）未改动。 |
| A14 | passed | specs/mmh3-engine-integration/spec.md | 实际权重可见 mmh3 实例可达且空闲：状态行显示该实例实际加载的 DiT 文件名与适配器（如 `fastvideo_fasth3_8step_v2_pruned_int8_convrot.safetensors` + 其 patch/LoRA）；切到极速档时状态行显示的是 `:8889` 自己的权重而非主实例的；权重指纹旁注明「实例口径指纹，非完整性校验」；实例正在渲染时状态行显示「● 正忙」而非「模型缺失」。 | 实现面被本 change 触及，行为已由新套件重钉：S1c PASS（weightLine 渲染 DiT 文件名+适配器+指纹+「实例口径指纹，非完整性校验」，weightLine 函数本 change 未改）；S1d PASS（fast 实例权重独立呈现）；S2 PASS（渲染中显示 ● 正忙而非模型缺失）。空闲未驻留形态按 A1/A15 新口径呈现未驻留注记（S1/S1b）。继承证据：上轮行 A10。 |
| A15 | passed | specs/mmh3-engine-integration/spec.md | 空闲实例不误报正忙（验收：A1、A2、A3） mmh3 实例空闲（`generating=null`、`cancelling=null`）且 `weights` 为空数组或不含 dit（引擎 `--idle-unload` 空闲卸载后的常态）：状态徽标为「● 就绪」，状态行说明「当前未驻留权重（空闲已卸载）」，不出现「正在生成」「正忙」或「模型缺失」。`generating` 非空时徽标为「● 正忙」且状态行说明正在生成；`cancelling` 非空（已受理停止）时徽标为「● 正忙」且状态行说明「已受理停止，跑完当前步即停」。fast 实例（`fastBaseUrl`）同一口径：空闲未驻留权重时其权重行同样说明「未驻留」，不参与判忙、不显示为正忙。 | Spec 场景=A1–A3 汇总：S1/S1b/S2/S3/S1d 亲跑全 PASS + 实况探针（真实空闲+空 weights 输入 → ready+双实例未驻留注记，无「正忙」「正在生成」「模型缺失」）。 |
| A16 | passed | specs/mmh3-engine-integration/spec.md | 状态行自行跟上引擎状态（验收：A4） 引擎状态在两次检查之间改变（空闲→占用、或占用→空闲）：不重新进入工作区、不手动刷新，状态行在 30 秒内反映新状态（含「检查于 HH:MM:SS」时间戳更新）；一次误判不得永久定格。 | Spec 场景=A4：15s tick、hidden 暂停、回前台补查、时间戳更新（stamp 随 checkedAt 变化）、误判活不过一个 tick（useEngineSelection.ts diff + S5 结构断言）。 |
| A17 | passed | specs/mmh3-engine-integration/spec.md | 档位通知文案可测（验收：A5、A6） 档位-画布配对通知由纯函数给出：960×544 画布 + turbo8 → 文案说明已配对到 turbo8-544p（含 8 步语义），不含「回退」与「30 步」；未配对画布（如 1344×576）→ 文案说明已回退到标准配方（引擎默认步数），不含「30 步」。该行为由门禁套件断言，纳入 `pnpm test` 链。 | Spec 场景=A5/A6：纯函数 mmh3TierNotice + 门禁 S6 PASS + package.json 纳入 pnpm test 链。 |
| A18 | passed | specs/mmh3-engine-integration/spec.md | Turbo 4 走 mmh3 选择 mmh3 + Turbo 4 档提交 1344×768/5 秒：请求发往 `http://127.0.0.1:8888/v1/generations`，multipart 含上表字段；完成后媒体库出现带 mmh3 徽标的 MP4。 | 继承复用（上轮行 A11：Turbo4 走 :8888、multipart 字段、媒体库 mmh3 徽标 MP4，实机出片证据沿用归档 Run）；G5 重跑 PASS；本轮按禁令不扰动实例、不提交生成。 |
| A19 | passed | specs/mmh3-engine-integration/spec.md | fast 档路由第二实例 选择极速 fast 档提交：请求发往 `:8889`；主实例（:8888）不参与该任务；fast 档 UI 标注来源实例。 | 继承复用（上轮行 A12：fast 档路由 :8889、主实例不参与、UI 标注来源实例）；实现未变；S1d 另证 fast 实例独立建模未回退。 |
| A20 | passed | specs/mmh3-engine-integration/spec.md | Turbo 8 画布配对 画布为 1344×768 时选 Turbo 8：multipart 含 `lora=minimax_h3_fl2v_turbo_8step_v1.0_768p_comfyui_bf16.safetensors`、`steps=8`、`shift-video=6`、`shift-audio=3`、`attention=sol`、`attention-precision=int8-fp8`、`sparse-start=0`（配方快照门禁 G5 断言字段）。画布改为 960×544：Turbo 8 落到 `turbo8-544p` 条目（缺该 LoRA 时显示「模型缺失」并禁用提交）。画布改为 1344×576 或竖屏/方形：Turbo 8 不出现在可选档位中，选择处说明该档只支持 1344×768 / 960×544。 | 继承复用（上轮行 A13：turbo8 字段快照、turbo8-544p 配对、非受训画布不出现在可选档）；G5 配方快照断言重跑 PASS。 |
| A21 | passed | specs/mmh3-engine-integration/spec.md | 配对结果通知如实 960×544 画布显式选择 Turbo 8 提交：通知说明已配对到 turbo8-544p 变体（8 步语义），不出现「回退标准 30 步」表述；提交字段仍为 turbo8-544p 条目。未配对画布（如 1344×576）带残留 turbo8 选择提交：通知说明已回退到标准配方（引擎默认步数），不固定写「30 步」；提交按 `off` 档进行。 | 继承复用（上轮行 A1/A2/A14 实测探针证据）；本 change 将文案抽为纯函数 mmh3Notice.ts，diff 比对逐字一致且 S6 断言 App.tsx 委托调用、组件内无硬编码步数残留。 |
| A22 | passed | specs/mmh3-engine-integration/spec.md | PDMD 专属档 选择 PDMD 2 步档提交：multipart 含 `lora=minimax_h3_pdmd_2step_lora_rank128_bf16.safetensors`、`steps=2`、`shift-video=12`、`shift-audio=3`、`attention=sol`、`attention-precision=int8-fp8`、`sparse-start=0`；UI 徽标区分「mmh3 专属」，该档不出现在 ComfyUI 引擎选项中（G5 断言字段 + 实机抽测出片）。 | 继承复用（上轮行 A15：PDMD 字段 steps=2/shift-video=12 等 G5 断言 + 实机抽测）；实现未变。 |
| A23 | passed | specs/mmh3-engine-integration/spec.md | 角色身份图同引擎 角色工作室的身份图批量生成提交点在 mmh3 引擎下按生图路径（§5）分派，不构造 ComfyUI graph。 | 继承复用（上轮行 A16：角色身份图按生图路径分派）；App.tsx 身份图提交点本 change 未触碰（diff 仅通知分支与 import）。 |
| A24 | passed | specs/mmh3-engine-integration/spec.md | mmh3 生图入库 mmh3 引擎下 1024×1024/6 步生图完成：PNG 落地本地 outputDirectory、登记 `GenerationJob`（`provider: 'h3image'`、`engineId: 'mmh3'`）、媒体库可见可删除，与 ComfyUI 生图条目同构。 | 继承复用（上轮行 A17：h3image provider+engineId 登记入库、媒体库同构）；h3-image 套件本轮亲跑 PASS。 |
| A25 | passed | specs/mmh3-engine-integration/spec.md | 排队可见 在 mmh3 已有一个 running 任务时再提交一个：第二个任务卡片显示排队位置；第一个完成后第二个自动开始并正常完成。排队状态以 `role="status"` 呈现并在状态变化时播报一次，不高频刷新。 | 继承复用（上轮行 A18：排队位置显示、自动接续、role=status 单次播报）；实现未变。 |
| A26 | passed | specs/mmh3-engine-integration/spec.md | 真中断不落库 mmh3 任务运行中点取消：卡片转「正在停止（当前步跑完后生效）」，引擎进入 `cancelling` 后转 `cancelled` 终态；服务端完成后媒体库**不**出现该产物，远端副本被清理。若取消落在最后一步之后、引擎已返回 `done`，卡片显示完成并保留产物入库——不谎报取消成功。排队中的任务被取消时直接 `cancelled`、不起跑、不占 GPU。 | 继承复用（上轮行 A19：取消语义 cancelling→cancelled、产物不落库、done 后不谎报取消、排队取消不起跑）；实现未变；本轮不实机复跑（禁扰动实例）。 |
| A27 | passed | specs/mmh3-engine-integration/spec.md | 旧引擎软取消降级 对不支持 interrupt 的实例点取消：卡片转取消态并出现「mmh3 无法中断，仍在占用 GPU」提示；服务端完成后媒体库不出现该产物，远端副本被清理；界面不出现原始 HTTP 错误文案。 | 继承复用（上轮行 A20：软取消降级提示、无原始 HTTP 错误文案）；实现未变。 |
| A28 | passed | specs/mmh3-engine-integration/spec.md | 降级标注 mmh3 任务的卡片与详情不出现「放大」等操作入口，原入口位置显示禁用态与原因 tooltip（禁用态与原因以 `role="status"` 呈现，仅在状态变化时播报）；同一产物拖入 ComfyUI 引擎的 H3 任务作首帧则正常可用。 | 继承复用（上轮行 A21：mmh3 卡片无放大入口、禁用态+原因 role=status）；实现未变。 |
| A29 | passed | specs/mmh3-engine-integration/spec.md | 删除与引用检测照常 删除一条 mmh3 视频产物：文件进回收站、记录移除；当它被影片项目引用时删除被阻止并提示引用位置——与 ComfyUI 产物行为一致。 | 继承复用（上轮行 A22：删除入回收站、引用阻止、与 ComfyUI 产物一致）；实现未变；media-deletion 套件属 pnpm test 链，托管绿。 |
| A30 | passed | specs/mmh3-engine-integration/spec.md | 交接释放 ComfyUI 刚完成一次 H3 生成后立刻选 mmh3 提交：应用先查队列（空）、发 `/free`、等 mmh3 确认可达，然后提交成功；状态行按序显示上述阶段。 | 继承复用（上轮行 A23：先查队列→/free→等可达→提交，状态行按序显示）；useEngineSelection 交接路径本 change 未改（diff 仅新增定时器与 runChecks 拆分，checkEngine 逻辑未动）。 |
| A31 | passed | specs/mmh3-engine-integration/spec.md | 全量回归绿 `pnpm typecheck && pnpm lint && pnpm test && pnpm build:web` 在本 change 全部改动下通过；`test-engine-routing.cjs` 门禁逐条通过。 | 独立重跑全绿：npx tsc --noEmit exit 0；npx tsc -p tsconfig.electron.json --noEmit exit 0；npx eslint . --max-warnings 0 exit 0；node scripts/test-engine-status.cjs、test-engine-routing.cjs（G1–G8）、locale-audit.cjs、test-workflows.cjs、test-h3-image.cjs 全 exit 0。build-web 与 pnpm test 全链由 Runtime 托管检查背书（刚全绿；验证者禁写 dist/ 故未自跑 build）。 |

## 检查

| 检查 | 命令 | 工作目录 | 状态 | 退出码 | 耗时 |
| --- | --- | --- | --- | ---: | ---: |
| 引擎状态门禁 | scripts/test-engine-status.cjs | . | passed | 0 | 223 ms |
| 引擎路由与契约门禁 | scripts/test-engine-routing.cjs | . | passed | 0 | 352 ms |
| 渲染进程类型检查 | tsc --noEmit | . | passed | 0 | 7266 ms |
| 主进程类型检查 | tsc -p [REDACTED] --noEmit | . | passed | 0 | 913 ms |
| ESLint（零警告） | eslint . --max-warnings 0 | . | passed | 0 | 3188 ms |
| 界面文案审计 | scripts/locale-audit.cjs | . | passed | 0 | 594 ms |
| 渲染端构建 | vite build | . | passed | 0 | 2348 ms |
| 工作流构建回归套件 | scripts/test-workflows.cjs | . | passed | 0 | 342 ms |
| H3 生图回归套件 | scripts/test-h3-image.cjs | . | passed | 0 | 310 ms |

### Builder 报告的证据

以下为 Builder 报告，不等同于 Runtime 检查凭据或独立验收结果。

- engine-status-gates: passed — S1–S6 全 PASS（新套件）
- typecheck-renderer: passed — npx tsc --noEmit 通过
- typecheck-electron: passed — npx tsc -p tsconfig.electron.json --noEmit 通过
- lint: passed — npx eslint . --max-warnings 0 通过
- locale-audit: passed — PASS：已认领文件 0 处问题
- engine-routing-gates: passed — G1–G8 全 PASS（与判忙新语义零冲突，审查已预判）
- key-suites: passed — workflows/h3-image/job-persistence/preload-sandbox/job-presentation/workspace-persistence 六套件全 PASS
- build-web: passed — npx vite build ✓ built in 2.14s
- 已知限制: A4 的「≤30 秒反映」与静默约束证据为门禁 S5 的结构断言 + 常量断言（15s 节律、document.hidden 门、silent 不置 checking、时间戳 aria-hidden）；UI 层的实机 15s 自行刷新未在无头环境复跑（15s < ENGINE_HEALTH_TTL_MS 30s，提交前新鲜度重查自洽）。建议验收可在真机二次进入工作区观察一次状态行自更新。
- 已知限制: busy 语义按对抗性审查确认：cancelling 态保留既有前缀「mmh3 正在生成（已受理停止，跑完当前步即停）」，A3 的说明语义即此后缀。
- 已知限制: 继承项 A7–A31 复用 b58e8f7 验收证据的前提是其余实现未变：本 change 改 engineHealth.ts / useEngineSelection.ts / EngineSelector.tsx / App.tsx（仅通知调用）/ mmh3Notice.ts（新）/ scripts/test-engine-status.cjs（新）/ package.json（测试链接线）/ app-module-map.md，其余与 b58e8f7 一致。

## 阻塞项

_无。_

## 风险与跳过的工作

- UI 层 15 秒自动刷新未在实机无头复跑：证据为 S5 结构断言 + 常量断言（15s<TTL 30s、hidden 门、silent 不置 checking、时间戳 aria-hidden）。建议真机二次进入工作区观察一次状态行自更新（与 Builder knownLimit 一致）。
- 验收时两实例均空闲且 weights=[]：驻留权重、生成中、取消中的实况组合本轮不可观察，由套件 fixture（S1c/S2/S3/S1d）与归档证据覆盖。
- build-web 未由验证者亲跑（禁写 dist/），复用 Runtime 托管绿与 Builder 记录；pnpm test 全链同理以托管绿 + 本轮逐套件亲跑佐证。
- A18–A26 实机生成/取消流沿用归档 Run 证据（本轮禁扰动 8888/8889，不得提交生成任务）。

## 之前的迭代

| 目标周期 | 迭代 | 尝试 | 结果 | 未解决项 | 摘要 | 完成时间 |
| ---: | ---: | ---: | --- | --- | --- | --- |
| 1 | 1 | 1 | pass | — | 31/31 pass。范围核对：git diff b58e8f7 仅触及声明清单（engineHealth.ts/useEngineSelection.ts/EngineSelector.tsx/App.tsx 通知分支/mmh3Notice.ts 新/test-engine-status.cjs 新/package.json 测试链/docs/app-module-map.md 一行）+ Comet 产物，无清单外实现改动。新增项 A1–A6：判忙只认 generating/cancelling（S1/S1b/S2/S3+S1d 亲跑 PASS），实况探针以真实 :8888/:8889 空闲+空 weights 输入经现行 mmh3EngineHealth 得 ready+双实例未驻留注记（旧代码同输入按 diff 可见逻辑必判忙，缺陷坐实已修）；静默复查 15s 节律/hidden 暂停/visibilitychange 补查/silent 不置 checking/时间戳 aria-hidden（S4/S5 PASS）；通知纯函数逐字一致（S6 PASS）并接入 pnpm test 链。继承项 A7–A31：实现与 b58e8f7 一致（App.tsx 通知分支文案逐字保留），复用上轮 24/24 报告；被触碰面（A14 权重展示、A21 通知）由新套件重钉。静态腿独立重跑：双 tsc、eslint、G1–G8、locale-audit、workflows、h3-image 全 exit 0。Spec「定时复查的呈现约束」与 §14（顶层 dit/每配方 reason 纯文档、应用解析逐字段容忍）与实现一致；Spec 内仅剩 3 处「验收：」tag 且全部挂新增场景指向新编号 A1–A6，继承场景旧 tag 已清除。 | 2026-11-19T04:05:45.503Z |



## 结论

31/31 pass。范围核对：git diff b58e8f7 仅触及声明清单（engineHealth.ts/useEngineSelection.ts/EngineSelector.tsx/App.tsx 通知分支/mmh3Notice.ts 新/test-engine-status.cjs 新/package.json 测试链/docs/app-module-map.md 一行）+ Comet 产物，无清单外实现改动。新增项 A1–A6：判忙只认 generating/cancelling（S1/S1b/S2/S3+S1d 亲跑 PASS），实况探针以真实 :8888/:8889 空闲+空 weights 输入经现行 mmh3EngineHealth 得 ready+双实例未驻留注记（旧代码同输入按 diff 可见逻辑必判忙，缺陷坐实已修）；静默复查 15s 节律/hidden 暂停/visibilitychange 补查/silent 不置 checking/时间戳 aria-hidden（S4/S5 PASS）；通知纯函数逐字一致（S6 PASS）并接入 pnpm test 链。继承项 A7–A31：实现与 b58e8f7 一致（App.tsx 通知分支文案逐字保留），复用上轮 24/24 报告；被触碰面（A14 权重展示、A21 通知）由新套件重钉。静态腿独立重跑：双 tsc、eslint、G1–G8、locale-audit、workflows、h3-image 全 exit 0。Spec「定时复查的呈现约束」与 §14（顶层 dit/每配方 reason 纯文档、应用解析逐字段容忍）与实现一致；Spec 内仅剩 3 处「验收：」tag 且全部挂新增场景指向新编号 A1–A6，继承场景旧 tag 已清除。
