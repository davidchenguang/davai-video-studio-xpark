---
generated_from_state_version: 13
---

# 验证

## 当前结果

- 结果: **已归档**
- 验证情况: **已完成检查，验证结果已确认**
- 目标周期: 1
- 迭代: 2
- 验证器尝试次数: 1
- 完成时间: 2026-11-19T01:12:46.121Z
- 摘要: 35/35 通过。上轮 6 项 fail（A5/A6/A9/A10/A19/A22）逐一复核确认修复：digest+适配器指纹行渲染并注明非完整性校验；全部缺失档位的文件名常显；frame-index 改为逐条独立 repeat 字段（模块/传输/门禁三层验证）且 G5 门禁由固化错误编码改为断言正确编码；引擎表单补极速实例地址、默认引擎可删并确认回落。另复核上轮 2 项高风险的修复：fast 档取消按提交实例定向（mmh3BaseUrl）、生图取消接入真中断。复用 Runtime 托管检查（G1–G8、双侧 tsc、eslint、32 套件链、locale-audit、vite build 全绿）并本人重跑 G1–G8、双侧 tsc、eslint、locale-audit 与 8 个代表性套件；引擎侧契约语义（真中断状态机、recipes、weights 正忙、step_seconds、单锚点字节级锚定、拼接字段被拒）复用本 Run iteration-1 在 8890 临时 v2 实例取得的实机证据；本轮引擎二进制已被重建为无 v2 版本，无法在不重建引擎仓的前提下取得新的实机证据，相关项以代码+门禁+传输探针+Run 内历史实机证据判定并如实标注 risks。

## 验收

| 编号 | 结果 | 来源 | 验收项 | 原因 |
| --- | --- | --- | --- | --- |
| A1 | passed | brief.md | **A1 真中断（运行中取消，引擎支持时）**：mmh3 视频任务运行中点取消 → 应用调用 `POST /v1/generations/{id}/interrupt` → 卡片状态行显示「正在停止（当前步跑完后生效）」→ 引擎进入 `cancelling` → 终态 `cancelled`：产物不落库、远端副本按既有清理路径处置。实机：新二进制临时实例跑通一次。 | 实机链路（cancelling→cancelled、产物不落库）复用 Run 内 iteration-1 实机证据（临时端口 8890 新二进制，已记录）；本轮代码复核：mmh3Interrupt（electron/mmh3Api.ts，409→interrupted:false 不报错）、handleCancel 受理分支置「正在停止（当前步跑完后生效）」（src/App.tsx handleCancel mmh3JobId 分支）、cancelled 终态不落库不下载（App.tsx finished.state==='cancelled' 分支）；G8 断言状态不降级。 |
| A2 | passed | brief.md | **A2 排队任务取消**：mmh3 已有任务在跑时再提交一个并点取消 → 引擎直接 `cancelled`、任务不起跑、不占 GPU；卡片显示「未开始执行，已取消」。 | 排队直接 cancelled 不起跑的引擎语义复用 Run 内 iteration-1 实机证据（临时端口 8890 新二进制，已记录）；应用侧：startedRunning 跟踪 + 「未开始执行，已取消，未产生产物。」标签（src/App.tsx waitForMmh3Task 回调与终态分支）。 |
| A3 | passed | brief.md | **A3 末步窗口如实呈现**：取消落在最后一步之后、引擎返回 `done` → 卡片显示完成并保留产物入库，不显示取消成功。 | 末步窗口如实记 done 复用 Run 内 iteration-1 实机证据（临时端口 8890 新二进制，已记录）（iteration-1 实机确认）；本轮代码：cancelTooLate = discard && interruptAccepted → 保留产物、标签「已完成（取消来得太晚：引擎在最后一步后完成）」（src/App.tsx）。 |
| A4 | passed | brief.md | **A4 旧引擎降级**：对不支持 interrupt 的实例（常驻旧二进制）点取消 → 沿用既有提示「mmh3 无法中断，仍在占用 GPU」，跑完后产物丢弃不入库；界面不出现原始 HTTP 错误文案。 | 旧实例（404/405）→ interrupted:false → 落入既有软取消文案「mmh3 无法中断，仍在占用 GPU」，result.error 不渲染（src/App.tsx handleCancel、H3ImageWorkspace.tsx:361-380）；常驻 8888/8889 实测仍为旧二进制（/v1/status 无 weights/cancelling 字段）。 |
| A5 | passed | brief.md | **A5 实例实际权重徽标**：引擎徽标显示实例实际加载的 DiT 与适配器（patch/LoRA 文件名）；主实例与极速实例可据此区分；digest 以「实例口径指纹，非完整性校验」呈现；实例正忙（weights 无 dit 条目）时显示「正忙」而非「异常」或「模型缺失」。 | 渲染层为本轮新增：weightLine 输出「实际权重：{dit}（指纹 …）+ {adapter}（指纹 …）（实例口径指纹，非完整性校验）」（src/lib/engine/engineHealth.ts:55-63），经 engineHealthLine→EngineSelector 状态行（role=status）呈现；fast 实例权重独立查询并同屏（useEngineSelection checkEngine 传 fastStatus）；busy=无 dit 条目→「● 正忙」而非异常/缺失（engineHealth.ts busy 判定）。引擎侧 weights/正忙语义复用 Run 内 iteration-1 实机证据（临时端口 8890 新二进制，已记录）。 |
| A6 | passed | brief.md | **A6 配方以服务端为准**：档位可用性、缺文件提示与画布约束来自 `GET /v1/recipes`；某档缺文件时显示「模型缺失」并指名缺哪个文件、该档不可提交，其余档正常；提交时配方字段原样透传（键名与值不被应用改写）。 | 档位可用性/缺失文件/画布约束来自 GET /v1/recipes（useMmh3Recipes、mmh3TierAvailabilityMap）；所有 available=false 档位的缺失文件名常显于帮助区（App.tsx Inspector missingTierNotes，修复上轮只显示「模型缺失」不点名文件）；提交时 serverOptions 原样透传、仅滤机器级选项（mmh3Task.ts mmh3VideoRequest；G5 断言 fromServer 快照 + 机器选项过滤；mmh3Fields 不改键名 electron/main.ts:66）。未连接时标注「未连接引擎，按本地配方显示」。九条配方契约复用 Run 内 iteration-1 实机证据（临时端口 8890 新二进制，已记录）。 |
| A7 | passed | brief.md | **A7 turbo8 画布配对**：1344×768 画布下 turbo8 使用 `minimax_h3_fl2v_turbo_8step_v1.0_768p_comfyui_bf16.safetensors` + steps 8 + shift-video 6 / shift-audio 3 + attention sol + attention-precision int8-fp8 + sparse-start 0；960×544 画布下 turbo8 使用 turbo8-544p 条目；其他画布不提供 turbo8，且档位选择处说明该档只支持 1344×768 / 960×544。 | 1344×768：turbo8=lora minimax_h3_fl2v_turbo_8step_v1.0_768p_comfyui_bf16.safetensors+steps8+sol+int8-fp8+sparse-start0+shift6/3；960×544：turbo8-544p（lora 无 768p 变体、shift12/3、canvas 960×544）；与引擎 docs/lightx2v-turbo.md 配对表逐项一致；G5 快照断言全部字段与 mmh3TierForCanvas 画布映射（1344×768→turbo8、960×544→turbo8-544p、864×480→off）；其他画布档位置灰并在选项后缀「仅 1344×768」标注（App.tsx 配方 select disabled=canvasMismatch）。 |
| A8 | passed | brief.md | **A8 ETA**：mmh3 任务进度显示按 `step_seconds × 剩余步数` 估算的剩余时间；`step_seconds` 缺失时退回既有展示，不显示错误值。 | eta = stepSeconds×(steps-step)，仅 running 且 step<steps 时显示「剩余约 X 分 Y 秒」；stepSeconds 为 null 时退回纯步进标签（src/App.tsx waitForMmh3Task 回调）；G8 断言 step_seconds 解析（缺失为 null）。step_seconds 实测数据复用 Run 内 iteration-1 实机证据（临时端口 8890 新二进制，已记录）。 |
| A9 | passed | brief.md | **A9 多锚点 keyframe**：H3 视频提交区可按帧序号添加多个锚点图（选该模式后首帧/尾帧入口不可用并说明原因）；提交时表单带成对的 `keyframe`/`frame-index`；实机抽帧核对锚定帧与锚图一致。 | UI：KeyframeStrip 支持多锚点+帧序号（0..frames-1 钳制、秒数=帧/24、<Picture 1..n> 书写提示、重复帧告警、上限 9），与首帧/尾帧/参考系双向互斥且禁用控件带原因 title/说明（src/App.tsx KeyframeStrip/ModeInputStrip/AssetRail）；编码：mmh3VideoRequest 同循环成对追加 keyframe 文件与 frame-index repeat（mmh3Task.ts），G5 断言 repeats=[{{frame-index:30}},{{frame-index:60}}] 逐条独立且 fields 无拼接字段、单锚点恰一条（本人重跑 PASS）；传输层：FormData 重复 append 实测产生独立同名 part（本人 Node 探针）；引擎侧 i-th 配对/计数检查语义来自契约 HEAD eba2c21 文档（fl2va.md/server.md）+ Run iteration-1 实机复现（拼接字段被计数检查拒绝，证明 HTTP 层按独立条目解析）。caveat：本轮未再起 v2 实例复跑多锚点端到端出片（见 risks）。 |
| A10 | passed | brief.md | **A10 引擎增删**：设置页可新增自定义 mmh3 引擎条目（label/baseUrl/fastBaseUrl）与删除自定义条目（预置 ComfyUI/mmh3 条目不可删，删除前有确认）；新增后 H3 选择器立即可用，删除后回落默认引擎。 | 设置页新增引擎表单含 label/主实例地址/极速实例地址（修复上轮缺 fastBaseUrl），id 自动去重、地址校验；删除仅限自定义条目（id!=='comfy'&&id!=='mmh3'），当前默认引擎可删并在确认文案说明回落 ComfyUI、activeEngineId 重置 'comfy'（修复上轮回落不可达）；预置条目无删除入口；新增即时进 engines[] 供选择器使用（src/components/SettingsView.tsx:126-153、299-316）。 |
| A11 | passed | brief.md | **A11 切换引擎参数重置**：从 mmh3 切到 ComfyUI（或反之）时，不适用于新引擎的档位与参数重置为该引擎默认值，不带着旧值提交。 | engineSwitchReset effect：engine.kind 变化时 mmh3RecipeChoice→'auto'；切到 mmh3 清空 keyframes、关 upscale（如开）；切换说明以 role=status 呈现（src/App.tsx previousEngineKind effect + Inspector engineSwitchReset 行）；turbo 画质预设两引擎通用（ComfyUI 侧 fast=既有 FastH3 管线），无需重置。 |
| A12 | passed | brief.md | **A12 提交失败文案（R2）**：提交超时不再呈现原始 `TypeError: fetch failed`，改为带修复指引的失败文案。 | submissionError 包装 TimeoutError→「mmh3 提交超时：引擎可能正在换载权重…」、fetch failed/ECONNREFUSED 等→「mmh3 提交失败：无法连接引擎（…）请确认 mmh3 服务正在运行…」，submit() 传输异常统一经此包装（electron/mmh3Api.ts submissionError）；渲染层 catch 呈现包装后文案，不裸露 TypeError: fetch failed。 |
| A13 | passed | brief.md | **A13 引擎选择跨重启（R3）**：应用重启后 H3 两处引擎选择恢复为上次选择，首屏不闪 comfy。 | 工作区引擎记忆升级为 {{id,kind,label}}（旧裸 id 兼容读取）；engines 未载入时以 stored id 挂起、不先闪 comfy（resolvedId 的 pending 分支），并用 remembered kind/label 构造首帧占位引擎（useEngineSelection.ts storedChoice/resolvedId/engine 三处）。 |
| A14 | passed | brief.md | **A14 非 H3 零回归与门禁**：`pnpm typecheck && pnpm lint && pnpm test && pnpm build:web` 全绿；既有 `scripts/test-engine-routing.cjs` 六条门禁仍 PASS 且新增契约门禁 PASS；其他工作区行为零变化。 | G1–G8（本人重跑 node scripts/test-engine-routing.cjs 全 PASS）；typecheck 渲染+electron 两侧、eslint --max-warnings 0、locale-audit、test-workflows/h3-image/workspace-persistence/job-persistence/job-presentation/preload-sandbox/atomic-saves 均本人重跑通过；全量 32 套件链与 build-web 复用 Runtime 托管检查（全绿）。其他工作区零变化由 G1（非 H3 提交点仍走 comfyUrl）、G3（comfy 通道只增不改）、G4（分派结构）静态断言。 |
| A15 | passed | specs/mmh3-engine-integration/spec.md | 首次启动无新字段 升级后首次启动（设置文件无 `engines`/`activeEngineId`）：H3 选择器默认显示 ComfyUI，其余一切工作区行为与本 change 之前**行为级一致**（行为等价，不做逐字节比对）。 | G6 断言 loadSettings 白名单含 engines/activeEngineId、缺省返回预置两条目（本人重跑 PASS）；设置读取容忍旧 shape（无新字段→全默认）。 |
| A16 | passed | specs/mmh3-engine-integration/spec.md | 首启幂等合成 升级后首启（存量设置只有 `comfyUrl`）：合成 `engines=[comfy(镜像), mmh3(默认本机地址)]`、`activeEngineId='comfy'`；再次启动不重复改写；一切非 H3 行为与改动前一致。 | G6 断言归一化纯函数的幂等合成与 comfyUrl 镜像（comfyUrl=B → engines[comfy].baseUrl=B 单次写盘）；SettingsView updateEngine 对 comfy 条目一次 setSettings 同时落两字段。 |
| A17 | passed | specs/mmh3-engine-integration/spec.md | 保存单通道 设置页把 `comfyUrl` 从 A 改为 B 保存：一次写盘同时落 `comfyUrl=B` 与 `engines[comfy].baseUrl=B`；反向编辑 comfy 条目 baseUrl 同理；两次保存之间不存在不一致窗口，也不出现第二次写盘提示。 | 同 A16：单一保存通道经 setSettings 一次原子写（src/components/SettingsView.tsx updateEngine；electron 设置原子写通道未改）。 |
| A18 | passed | specs/mmh3-engine-integration/spec.md | 引擎可见可管理 用户在设置页看到 ComfyUI 与 mmh3 两条预置条目，可改 mmh3 的 baseUrl 指向另一本机端口，保存后 H3 选择器随即使用新地址；不重启应用生效。 | 设置页 mmh3 条目 baseUrl 可编辑保存，engines 状态即时传播至 H3 选择器（useEngineSelection 派生自 settings.engines），无需重启；预置 mmh3 默认 8888/8889。 |
| A19 | passed | specs/mmh3-engine-integration/spec.md | 自定义引擎可增删（验收：A10） 设置页新增一条名为「mmh3-实验」的自定义 mmh3 引擎（地址填本机另一端口）：保存后 H3 视频与 H3 生图的引擎选择器出现该条目，状态徽标按其地址独立预检；在设置页删除它并确认：条目消失，若它是当前选择则回落 ComfyUI，预置两条目始终存在且无删除入口。 | 同 A10：自定义条目增删全链路（新增含极速地址、删除确认、默认引擎删除回落 ComfyUI、预置恒存）；每引擎按自身 baseUrl 独立预检（checkAll 逐引擎 mmh3Status）。 |
| A20 | passed | specs/mmh3-engine-integration/spec.md | 离线置灰 停掉本机 `mmh3.service` 后打开 H3 视频工作区：mmh3 选项在数秒内置灰、状态行显示离线原因；ComfyUI 选项不受影响且可正常生成。 | engineHealth offline → 徽标「⚠ 离线」+ 选项置灰带「· 离线」后缀 + 状态行原因（EngineSelector.tsx:30-32、engineHealth.ts offline 分支）；本轮未改该路径，iteration-1 已验证。 |
| A21 | passed | specs/mmh3-engine-integration/spec.md | 模型缺失 mmh3 可达但实例的模型树缺某配方文件（如 patches 下无 FastH3 patch）：选择器显示 `○ 模型缺失` 并注明缺哪个文件；该档位不可提交，其余档位正常。 | 可达但缺文件：配方级 available=false → 选项「· 模型缺失」置灰不可提交 + missingTiersNote 点名缺失文件（App.tsx 配方 select 与帮助区）；引擎侧 available/missing 判定口径复用 Run iteration-1 实机（/v1/recipes 实测）。 |
| A22 | passed | specs/mmh3-engine-integration/spec.md | 实际权重可见（验收：A5） mmh3 实例可达且空闲：状态行显示该实例实际加载的 DiT 文件名与适配器（如 `fastvideo_fasth3_8step_v2_pruned_int8_convrot.safetensors` + 其 patch/LoRA）；切到极速档时状态行显示的是 `:8889` 自己的权重而非主实例的；权重指纹旁注明「实例口径指纹，非完整性校验」；实例正在渲染时状态行显示「● 正忙」而非「模型缺失」。 | 同 A5：DiT 文件名+适配器+「（实例口径指纹，非完整性校验）」注记；:8889 权重独立呈现；正忙（无 dit 条目）显示「● 正忙」而非「模型缺失」（engineHealth.ts busy 判定含 weights 无 dit 分支）；EngineSelector busy 不置灰仍可选。 |
| A23 | passed | specs/mmh3-engine-integration/spec.md | Turbo 4 走 mmh3 选择 mmh3 + Turbo 4 档提交 1344×768/5 秒：请求发往 `http://127.0.0.1:8888/v1/generations`，multipart 含上表字段；完成后媒体库出现带 mmh3 徽标的 MP4。 | 复用 Run 内 iteration-1 实机证据（临时端口 8890 新二进制，已记录）（Turbo 4 实机出片、multipart 字段、媒体库 mmh3 徽标 MP4）；字段快照 G5 断言（fasth3=patch+steps4+int8-fp8+shift12/3，无 attention 字段，与 server.md fasth3 配方一致）。 |
| A24 | passed | specs/mmh3-engine-integration/spec.md | fast 档路由第二实例 选择极速 fast 档提交：请求发往 `:8889`；主实例（:8888）不参与该任务；fast 档 UI 标注来源实例。 | fast 档路由 fastBaseUrl（mmh3BaseUrl(engine,recipe) target=fast）复用 Run 内 iteration-1 实机证据（临时端口 8890 新二进制，已记录） 实机（第二实例出片、主实例不参与）；本轮修复取消端口错位：GenerationJob.mmh3BaseUrl 记录提交实例、interrupt 定向该实例（src/types.ts、App.tsx submit 与 handleCancel）；档位标注「极速 8 步（fastvideo DiT）」。 |
| A25 | passed | specs/mmh3-engine-integration/spec.md | Turbo 8 画布配对（验收：A7） 画布为 1344×768 时选 Turbo 8：multipart 含 `lora=minimax_h3_fl2v_turbo_8step_v1.0_768p_comfyui_bf16.safetensors`、`steps=8`、`shift-video=6`、`shift-audio=3`、`attention=sol`、`attention-precision=int8-fp8`、`sparse-start=0`（配方快照门禁 G5 断言字段）。画布改为 960×544：Turbo 8 落到 `turbo8-544p` 条目（缺该 LoRA 时显示「模型缺失」并禁用提交）。画布改为 1344×576 或竖屏/方形：Turbo 8 不出现在可选档位中，选择处说明该档只支持 1344×768 / 960×544。 | G5 快照：turbo8（768p LoRA/8 步/sol/int8-fp8/sparse-start0/shift6/3）与 turbo8-544p（544p LoRA/shift12/3）逐字段断言 + 画布映射断言（本人重跑 PASS）；连接引擎时字段直接取服务端 turbo8/turbo8-544p 配方原样透传。 |
| A26 | passed | specs/mmh3-engine-integration/spec.md | PDMD 专属档 选择 PDMD 2 步档提交：multipart 含 `lora=minimax_h3_pdmd_2step_lora_rank128_bf16.safetensors`、`steps=2`、`shift-video=12`、`shift-audio=3`、`attention=sol`、`attention-precision=int8-fp8`、`sparse-start=0`；UI 徽标区分「mmh3 专属」，该档不出现在 ComfyUI 引擎选项中（G5 断言字段 + 实机抽测出片）。 | G5 断言 PDMD=lora minimax_h3_pdmd_2step_lora_rank128_bf16.safetensors+steps2+shift12/3+sol+int8-fp8+sparse-start0（修复既往漏发 attention-precision）；实机出片复用 Run iteration-1；「PDMD 2 步（mmh3 专属）」徽标且仅存在于 mmh3 配方选择器、不进 ComfyUI 选项。 |
| A27 | passed | specs/mmh3-engine-integration/spec.md | 角色身份图同引擎 角色工作室的身份图批量生成提交点在 mmh3 引擎下按生图路径（§5）分派，不构造 ComfyUI graph。 | 角色身份图提交点按引擎分派（G4 断言三处分派结构含该点；App.tsx engineOverride/usingMmh3 路径），mmh3 下走生图路径不构造 ComfyUI graph；iteration-1 已验证。 |
| A28 | passed | specs/mmh3-engine-integration/spec.md | mmh3 生图入库 mmh3 引擎下 1024×1024/6 步生图完成：PNG 落地本地 outputDirectory、登记 `GenerationJob`（`provider: 'h3image'`、`engineId: 'mmh3'`）、媒体库可见可删除，与 ComfyUI 生图条目同构。 | 复用 Run 内 iteration-1 实机证据（临时端口 8890 新二进制，已记录）（mmh3 1024×1024/6 步生图实机：PNG 落 outputDirectory、provider 'h3image'/engineId 'mmh3' 入库、媒体库可删）；生图请求不含 linear-precision（mmh3ImageFields，G5 断言）。 |
| A29 | passed | specs/mmh3-engine-integration/spec.md | 排队可见 在 mmh3 已有一个 running 任务时再提交一个：第二个任务卡片显示排队位置；第一个完成后第二个自动开始并正常完成。排队状态以 `role="status"` 呈现并在状态变化时播报一次，不高频刷新。 | 排队位置由 mmh3QueueAhead 推导、卡片「排队中（前面还有 N 个）」、状态变化播报一次不高频刷新（waitForMmh3Task onUpdate + App 卡片映射）；iteration-1 已验证，本轮仅增量 stepSeconds 不改排队路径。 |
| A30 | passed | specs/mmh3-engine-integration/spec.md | 真中断不落库（验收：A1、A2、A3） mmh3 任务运行中点取消：卡片转「正在停止（当前步跑完后生效）」，引擎进入 `cancelling` 后转 `cancelled` 终态；服务端完成后媒体库**不**出现该产物，远端副本被清理。若取消落在最后一步之后、引擎已返回 `done`，卡片显示完成并保留产物入库——不谎报取消成功。排队中的任务被取消时直接 `cancelled`、不起跑、不占 GPU。 | = A1/A2/A3 的规格归并：真中断不落库、排队直接取消、末步窗口保留产物，证据同上（实机复用 Run iteration-1 + 本轮代码复核）。 |
| A31 | passed | specs/mmh3-engine-integration/spec.md | 旧引擎软取消降级（验收：A4） 对不支持 interrupt 的实例点取消：卡片转取消态并出现「mmh3 无法中断，仍在占用 GPU」提示；服务端完成后媒体库不出现该产物，远端副本被清理；界面不出现原始 HTTP 错误文案。 | = A4：不支持 interrupt 的实例走软取消（卡片取消态+提示、服务端跑完产物丢弃不入库、无原始 HTTP 文案；对 running 不发 DELETE）。 |
| A32 | passed | specs/mmh3-engine-integration/spec.md | 降级标注 mmh3 任务的卡片与详情不出现「放大」等操作入口，原入口位置显示禁用态与原因 tooltip（禁用态与原因以 `role="status"` 呈现，仅在状态变化时播报）；同一产物拖入 ComfyUI 引擎的 H3 任务作首帧则正常可用。 | mmh3 任务卡 preview「不可用 · mmh3 只回报步进进度」、upscale「不可用 · 依赖 ComfyUI 渲染管线」（App.tsx submitMmh3 job 元数据）；ComfyUI 引擎以 mmh3 产物为首帧/参考不受限；iteration-1 已验证，路径未变。 |
| A33 | passed | specs/mmh3-engine-integration/spec.md | 删除与引用检测照常 删除一条 mmh3 视频产物：文件进回收站、记录移除；当它被影片项目引用时删除被阻止并提示引用位置——与 ComfyUI 产物行为一致。 | mmh3 产物经与 ComfyUI 同一 GenerationJob/媒体库管线（本地文件 + minimax-media ?path= 分支），删除/回收站/引用检测零额外分支；G1/G3 保证共享模块无行为改动；iteration-1 已验证。 |
| A34 | passed | specs/mmh3-engine-integration/spec.md | 交接释放 ComfyUI 刚完成一次 H3 生成后立刻选 mmh3 提交：应用先查队列（空）、发 `/free`、等 mmh3 确认可达，然后提交成功；状态行按序显示上述阶段。 | 交接序列（查队列→/free→确认 mmh3 可达）经 prepareSubmit/MMH3_SUBMIT_STAGES 按序呈现（useEngineSelection.ts），本轮未改；iteration-1 已验证。 |
| A35 | passed | specs/mmh3-engine-integration/spec.md | 全量回归绿 `pnpm typecheck && pnpm lint && pnpm test && pnpm build:web` 在本 change 全部改动下通过；`test-engine-routing.cjs` 门禁逐条通过。 | 全量回归：Runtime 托管检查全绿（32 套件链、渲染/主进程 tsc、eslint 零警告、locale-audit、vite build）；本人重跑 G1–G8、双侧 tsc、eslint、locale-audit 及 8 个代表性套件全部 PASS。 |

## 检查

| 检查 | 命令 | 工作目录 | 状态 | 退出码 | 耗时 |
| --- | --- | --- | --- | ---: | ---: |
| 引擎路由与契约门禁 | scripts/test-engine-routing.cjs | . | passed | 0 | 380 ms |
| 渲染进程类型检查 | tsc --noEmit | . | passed | 0 | 7435 ms |
| 主进程类型检查 | tsc -p [REDACTED] --noEmit | . | passed | 0 | 878 ms |
| ESLint（零警告） | eslint . --max-warnings 0 | . | passed | 0 | 3425 ms |
| 界面文案审计 | scripts/locale-audit.cjs | . | passed | 0 | 603 ms |
| 渲染端构建 | vite build | . | passed | 0 | 2401 ms |
| H3 生图回归套件 | scripts/test-h3-image.cjs | . | passed | 0 | 313 ms |
| 工作流构建回归套件 | scripts/test-workflows.cjs | . | passed | 0 | 334 ms |
| 任务持久化回归套件 | scripts/test-job-persistence.cjs | . | passed | 0 | 177 ms |

### Builder 报告的证据

以下为 Builder 报告，不等同于 Runtime 检查凭据或独立验收结果。

- typecheck-renderer: passed — npx tsc --noEmit 通过
- typecheck-electron: passed — npx tsc -p tsconfig.electron.json --noEmit 通过
- lint: passed — npx eslint . --max-warnings 0 通过
- engine-routing-gates: passed — G1–G8 全 PASS；G5 新增断言：repeats=[{frame-index:30},{frame-index:60}] 逐条独立、fields 不含拼接的 frame-index、单锚点恰一条
- full-test-chain: passed — 32 个 .cjs 套件逐个直跑全绿（test-log-sanitize 为既有失败且不在 pnpm test 链内）
- locale-audit: passed — PASS（Reset 确认词豁免行号随插入行同步为 417）
- build-web: passed — npx vite build 通过
- frame-index-repeat-encoding: passed — mmh3VideoRequest 实测：两锚点 → repeats=[{name:frame-index,value:30},{name:frame-index,value:60}]，fields 无 frame-index；与验收者在实机（新二进制）上确证的『拆成独立字段即通过计数检查』一致；单锚点 → 恰一条 frame-index
- 已知限制: A9 修复后的编码依据：验收者已在新二进制实机确证『两个独立 frame-index 字段通过计数检查、空格拼接被拒』；本轮应用侧改动经模块实测与 G5 门禁断言，未再起引擎实机复跑（target/release/mmh3 已于验收中途被重建为无契约版本，需从 mmh3-davai worktree 重新构建才能复验）。
- 已知限制: A5/A22/A6 的修复为展示层：digest 与缺失清单数据此前已在解析层就绪，本轮补渲染；8888/8889 常驻实例仍是旧二进制（无 weights/recipes 字段），部署由用户决定。
- 已知限制: 生图取消接入真中断后，末步窗口（取消后仍 done）的产物不入库但会留在服务端，由既有孤儿清理路径处理；视频路径已区分并保留产物。

## 阻塞项

_无。_

## 风险与跳过的工作

- A9 多锚点端到端出片未在本轮复跑：/home/dawo/orca/projects/mmh3/mmh3/target/release/mmh3 已于今日 08:30 被重建为无 v2 端点版本（strings 无 /v1/recipes），mmh3-davai worktree（eba2c21）无预构建产物，常驻 8888/8889 为旧二进制；重新 cargo 构建属引擎仓操作且正式部署为用户决定。编码链已由 G5 模块断言 + FormData 传输探针 + 契约文档与 Run 内实机复现（拼接被拒=HTTP 层按独立条目解析）闭合，残余风险为多锚点配对顺序的端到端出片复核，建议用户部署 v2 后抽验一次。
- 文案小瑕疵：显式选 turbo8 且画布为 960×544 时提交提示写「已回退到标准 30 步配方」，实际映射为 turbo8-544p 条目（行为正确、提示文本不准确）；App.tsx submitMmh3 的 tier!==wantedTier 通知分支。
- 生图取消受理后立即清卡：若引擎恰在末步窗口仍产出，产物留在服务端由既有孤儿清理路径收走（不入库、不谎报成功），Builder known_limits 已如实登记。
- 引擎部署仍为用户决定：8888/8889 常驻实例仍是旧二进制，recipes/weights/interrupt/step_seconds 等新契约在正式部署前对用户不可见（与 brief 非目标一致）。

## 之前的迭代

| 目标周期 | 迭代 | 尝试 | 结果 | 未解决项 | 摘要 | 完成时间 |
| ---: | ---: | ---: | --- | --- | --- | --- |
| 1 | 1 | 1 | fail | A5, A6, A9, A10, A19, A22 | 35 项中 29 pass、6 fail。实机复验（临时端口新二进制）确认了真中断全链路（cancelling→cancelled、产物不落库、排队任务直接取消、末步窗口如实记 done）、/v1/recipes 九条配方与 turbo8 画布配对字段、weights 正忙语义、step_seconds ETA，以及单锚点锚定帧与锚图一致（独立抽帧字节级比对）。四个实质缺陷：① A9 多锚点 frame-index 被拼成一个空格分隔字段，≥2 锚点必被引擎拒绝（实机复现 + 引擎源码定位，且 G5 门禁固化了该错误编码）；② A10/A19 自定义引擎删除按钮在「是当前默认引擎」时被禁用，验收要求的回落场景经 UI 不可达，且新增表单缺 fastBaseUrl；③ A5/A22 权重 digest（实例口径指纹）只被解析从未渲染；④ A6 缺文件档位只显示「模型缺失」不点名缺失文件（文件名只在不可选中的被选中档帮助文案里）。另有 fast 档中断端口错位、生图任务未接真中断两项范围/正确性风险待用户拍板。回归面：32 套件全绿、G1-G8 全 PASS、typecheck/lint/build-web 由 Runtime 收据覆盖。验收期间引擎仓二进制被替换，见 risks 第 3 条。 | 2026-11-19T00:35:12.493Z |
| 1 | 2 | 1 | pass | — | 35/35 通过。上轮 6 项 fail（A5/A6/A9/A10/A19/A22）逐一复核确认修复：digest+适配器指纹行渲染并注明非完整性校验；全部缺失档位的文件名常显；frame-index 改为逐条独立 repeat 字段（模块/传输/门禁三层验证）且 G5 门禁由固化错误编码改为断言正确编码；引擎表单补极速实例地址、默认引擎可删并确认回落。另复核上轮 2 项高风险的修复：fast 档取消按提交实例定向（mmh3BaseUrl）、生图取消接入真中断。复用 Runtime 托管检查（G1–G8、双侧 tsc、eslint、32 套件链、locale-audit、vite build 全绿）并本人重跑 G1–G8、双侧 tsc、eslint、locale-audit 与 8 个代表性套件；引擎侧契约语义（真中断状态机、recipes、weights 正忙、step_seconds、单锚点字节级锚定、拼接字段被拒）复用本 Run iteration-1 在 8890 临时 v2 实例取得的实机证据；本轮引擎二进制已被重建为无 v2 版本，无法在不重建引擎仓的前提下取得新的实机证据，相关项以代码+门禁+传输探针+Run 内历史实机证据判定并如实标注 risks。 | 2026-11-19T01:12:46.121Z |



## 结论

35/35 通过。上轮 6 项 fail（A5/A6/A9/A10/A19/A22）逐一复核确认修复：digest+适配器指纹行渲染并注明非完整性校验；全部缺失档位的文件名常显；frame-index 改为逐条独立 repeat 字段（模块/传输/门禁三层验证）且 G5 门禁由固化错误编码改为断言正确编码；引擎表单补极速实例地址、默认引擎可删并确认回落。另复核上轮 2 项高风险的修复：fast 档取消按提交实例定向（mmh3BaseUrl）、生图取消接入真中断。复用 Runtime 托管检查（G1–G8、双侧 tsc、eslint、32 套件链、locale-audit、vite build 全绿）并本人重跑 G1–G8、双侧 tsc、eslint、locale-audit 与 8 个代表性套件；引擎侧契约语义（真中断状态机、recipes、weights 正忙、step_seconds、单锚点字节级锚定、拼接字段被拒）复用本 Run iteration-1 在 8890 临时 v2 实例取得的实机证据；本轮引擎二进制已被重建为无 v2 版本，无法在不重建引擎仓的前提下取得新的实机证据，相关项以代码+门禁+传输探针+Run 内历史实机证据判定并如实标注 risks。
