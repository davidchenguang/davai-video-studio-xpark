# 目标

把 mmh3 引擎侧已落地并经真机验证的 v2 契约接线到 DavAi Video Studio，让「取消」「档位选择」「实例身份」「进度 ETA」「多锚点引导」这些用户可见行为与引擎实际能力一致，并补齐上一 change 声明保留的应用侧缺口：

1. **真中断（E1）**：取消按钮真正打断引擎任务——服务端以「当前步跑完」为粒度停止，不再是只能等跑完再丢弃产物的软取消；引擎不支持该能力时保留既有软取消降级路径（用户已确认的取舍）。
2. **配方以服务端为准（E2）**：档位可用性、每档所需文件、画布约束直接来自 `GET /v1/recipes`，应用不再手抄配方字段并自行判定。
3. **turbo8 档位修正（E3）**：1344×768 画布下 turbo8 改用 768p 变体 LoRA + shift-video 6 / shift-audio 3 + attention sol + attention-precision int8-fp8 + sparse-start 0；960×544 走独立的 turbo8-544p 条目；画布与 shift 成对换，不再用 544p 权重配 768p 画布；其他画布不提供 turbo8（用户已确认「按画布自动配对」）。
4. **实例实际权重可见（E12/E10）**：引擎徽标显示实例真正加载的 DiT 与其适配器（patch/LoRA），用户能据此分辨主实例与极速实例；digest 明确标注为「实例口径指纹、非完整性校验」；实例正忙时按「正忙」而非「异常/模型缺失」呈现。
5. **进度 ETA（E14）**：按引擎每步实测耗时（`step_seconds`）估算剩余时间，不再只有步数没有剩余时间。
6. **多锚点引导（E6）**：允许在非首尾帧锚定参考画面（运镜/分镜卡点），锚点以「帧序号 + 图片」成对表达。
7. **补上一 change 保留的应用侧缺口**：引擎新增/删除管理 UI、切换引擎时参数重置、提交失败文案的修复指引（R2）、工作区引擎记忆跨重启生效（R3）——四项均已由用户确认纳入本 change。

## 契约来源

引擎仓 `/home/dawo/orca/projects/mmh3/mmh3-davai`（分支 `feature/davai-integration`，HEAD `eba2c21`）的 `docs/server.md`、`docs/usage.md`、`docs/lightx2v-turbo.md`、`docs/fl2va.md`、`docs/davai-integration-gaps.zh.md`。逐条覆盖见「Source coverage」。

# 范围

## 目录结构

### 修改

- `electron/mmh3Api.ts` — 主进程 mmh3 HTTP 客户端：新增 interrupt 与 recipes 调用；任务状态解析支持 `cancelling`/`cancelled`（当前未知状态一律降级为 `queued`，会导致新状态永远轮询）；`/v1/status` 解析新增 `weights` 与 `cancelling`；job 解析透传 `step_seconds`；请求表单支持 `keyframe`/`frame-index` 字段。
- `electron/main.ts` — 注册新增 `mmh3:*` IPC 通道（现有 8 条通道只增不改）。
- `electron/preload.ts` — `window.minimax` 白名单增量暴露新增 mmh3 方法。
- `src/types.ts` — `DesktopApi` 新增方法声明；`Mmh3JobState`/`Mmh3Job`/`Mmh3Status` 类型扩展（与 `electron/mmh3Api.ts` 的同名定义保持同步，两处目前是重复定义）。
- `src/browserMock.ts` — 浏览器预览 mock 补齐新增 mmh3 方法。
- `src/lib/engine/mmh3Recipe.ts` — 档位→请求字段映射：turbo8 改 768p 变体 + shift 6/3 + sol + int8-fp8 + sparse-start 0；新增 turbo8-544p 条目；画布与档位配对；配方字段以 `/v1/recipes` 为准。
- `src/lib/engine/mmh3Task.ts` — 任务轮询与请求构造：终态判定纳入 `cancelling`/`cancelled`；提交支持多锚点文件字段；进度回报 `step_seconds`。
- `src/lib/engine/engineHealth.ts` — 引擎健康与就绪态：呈现实例实际权重与正忙语义。
- `src/lib/engine/engines.ts` — 引擎条目模型：支持用户自定义引擎的增删（预置条目不可删）。
- `src/lib/engine/useEngineSelection.ts` — 引擎选择 hook：重启后首屏不回落 comfy（R3）；切换引擎时参数重置。
- `src/components/SettingsView.tsx` — 引擎管理区块：新增/删除自定义引擎条目与确认。
- `src/components/EngineSelector.tsx` — 引擎选择器：实际权重徽标与画布-档位约束提示。
- `src/App.tsx` — H3 视频提交与取消：取消改为真中断（保留软取消降级）、ETA、锚点 UI。
- `src/components/H3ImageWorkspace.tsx` — H3 生图侧的取消与状态映射同步。
- `scripts/test-engine-routing.cjs` — 引擎路由与配方门禁增量扩展（通道映射表与配方字段断言需随新增能力更新）。
- `docs/app-module-map.md` — 同步引擎抽象模块边界变化。
- `docs/comet/changes/mmh3-engine-v2-wiring/specs/mmh3-engine-integration/spec.md` — 本需求完成后 capability `mmh3-engine-integration` 的完整行为规格。

### 明确不建

- 不新建独立的 mmh3 HTTP 客户端模块——沿用 `electron/mmh3Api.ts`，保持主进程单点网络出口。
- 不新建 mmh3 的 SSE 通道——引擎的 SSE 事件流是可选通道，现有轮询已足够，本次不引入第二种进度通道。
- 不为 mmh3 新建 ComfyUI API-format graph builder——mmh3 走 HTTP 表单，与 `src/lib/*Workflow.ts` 体系无关。
- 不做手机端（MobileApp/LAN）的 mmh3 契约接线——与上一 change 口径一致，首期保持 ComfyUI。
- 不建独立的「引擎契约测试服务」或 mock 层——实机验证用临时端口起真实引擎二进制。

## Source coverage

| 来源条目与位置 | 读取状态 | 需要保留的内容 | Spec 位置 | 验收 ID | 覆盖状态 | 理由或替代关系 |
| --- | --- | --- | --- | --- | --- | --- |
| S1：`docs/server.md` 的 interrupt 端点与任务状态机 | complete | 202/409 语义；`cancelling`/`cancelled` 状态与转移；末步窗口；排队任务直接 cancelled；取消任务无产物、产物端点 409；SSE 事件序列 | specs §13 | A1、A2、A3、A4 | covered | 当前有效需求 |
| S2：`docs/server.md` 的 `/v1/status` 字段（含 `weights`/`cancelling`） | complete | 字段形状；busy 时缺 dit 条目；digest 非校验和；两实例靠 weights + recipes 分辨 | specs §13、§15 | A5 | covered | 当前有效需求 |
| S3：`docs/server.md` 的 `/v1/recipes` | complete | 九条配方；options 键名即表单字段、值可原样拷贝；canvas 约束；available/missing 判定口径；ref2va/taomate 特殊约束 | specs §14 | A6 | covered | 当前有效需求 |
| S4：`docs/server.md` 的 keyframe/frame-index 字段 | complete | 成对配对、取值域、互斥对象、画布决定规则、`<Picture n>` 与秒数对齐、校验时机与错误文案 | specs §17 | A9 | covered | 当前有效需求 |
| S5：`docs/usage.md` 的 `step_seconds`、采样器结论、精度组合表 | complete | 每步耗时定义（顶层 `seconds` 仍是总时长）；采样器无需用户侧选项；生图不接受 `linear-precision` | specs §16 | A8 | covered | 当前有效需求 |
| S6：`docs/lightx2v-turbo.md` 的 Turbo 文件↔画布对照 | complete | 768p/544p 变体与 shift 配对；画布与 shift 成对换 | specs §14、§4 | A7 | covered | 当前有效需求 |
| S7：`docs/fl2va.md` 的 Keyframes anywhere | complete | 任意帧锚定语义与实机证据（红/蓝双锚） | specs §17 | A9 | covered | 当前有效需求 |
| S8：`docs/davai-integration-gaps.zh.md` §12 通知义务 | complete | 新增端点→DavAi 加 IPC 通道；既有 `mmh3:*` 只增不改 | specs §13、§14 | A1、A6 | covered | 当前有效需求 |
| S9：引擎侧第二实例成文说明（`docs/server.md` 的 A second server） | complete | 慢/快档=两端口；请求不带机器级模型选项；`--idle-unload`/`--vram-budget` 各守其份；客户端用 weights + recipes 分辨实例 | specs §15 | A5 | covered | 当前有效需求 |
| S10：应用侧既有实现与门禁（`electron/mmh3Api.ts`、`src/lib/engine/*`、`src/App.tsx`、`src/components/SettingsView.tsx`、`scripts/test-engine-routing.cjs`） | complete | 现有 8 条通道与单一写通道；配方字段断言；状态降级行为；画布阶梯（含 960×544 与 1344×768） | specs §2、§4、§10 | A6、A7、A14 | covered | 实现落点依据 |

# 非目标

- **「其他工作区零变化」是行为级不变量**：共享模块（`jobPersistence`、`LibraryView`、App shell）只做向后兼容读取与纯增量展示，不改现有行为分支。
- 不改 ComfyUI 路径的任何现有行为：`comfy:*` IPC 通道、`useLivePreview` 的 WebSocket 指向、`settings.comfyUrl` 语义、H3 档位语义与默认采样器。
- **不部署新引擎二进制**：8888/8889 常驻实例仍跑旧构建，部署到 `/home/dawo/mmh3/bin` 并重启是用户决定；本 change 的实机验证用临时端口起新二进制，不动常驻实例。
- 不合并引擎侧分支到 master，不改引擎仓代码。
- 不补 lightx2v turbo4（v1.2）LoRA——按用户口径挂起；turbo8 的 768p LoRA 已由引擎侧代下入库。
- 不做 E8（Ref2VA 的 reference-video 验证）——本机缺 ref2va DiT+LoRA，等条件具备。
- 不做 E6b（运镜续接的 ComfyUI 图）——等用户提供或授权构造。
- 不向用户暴露采样器选项（E4 结论：引擎默认 euler+uniform+shift 12/3 即官方管线等价物）。
- 不在生图请求传 `linear-precision`（E5：服务端固定 INT8 linear，拒绝该字段）。
- 不把 `weights` 的 digest 当作完整性校验展示（E12：digest 只说明两个文件不同，不说明文件完好）。
- 不做 mmh3 实时预览帧、放大/续接等依赖 ComfyUI 管线的后处理。
- 不引入 mmh3 的 SSE 进度通道——沿用既有轮询。

# 验收示例

1. **A1 真中断（运行中取消，引擎支持时）**：mmh3 视频任务运行中点取消 → 应用调用 `POST /v1/generations/{id}/interrupt` → 卡片状态行显示「正在停止（当前步跑完后生效）」→ 引擎进入 `cancelling` → 终态 `cancelled`：产物不落库、远端副本按既有清理路径处置。实机：新二进制临时实例跑通一次。
2. **A2 排队任务取消**：mmh3 已有任务在跑时再提交一个并点取消 → 引擎直接 `cancelled`、任务不起跑、不占 GPU；卡片显示「未开始执行，已取消」。
3. **A3 末步窗口如实呈现**：取消落在最后一步之后、引擎返回 `done` → 卡片显示完成并保留产物入库，不显示取消成功。
4. **A4 旧引擎降级**：对不支持 interrupt 的实例（常驻旧二进制）点取消 → 沿用既有提示「mmh3 无法中断，仍在占用 GPU」，跑完后产物丢弃不入库；界面不出现原始 HTTP 错误文案。
5. **A5 实例实际权重徽标**：引擎徽标显示实例实际加载的 DiT 与适配器（patch/LoRA 文件名）；主实例与极速实例可据此区分；digest 以「实例口径指纹，非完整性校验」呈现；实例正忙（weights 无 dit 条目）时显示「正忙」而非「异常」或「模型缺失」。
6. **A6 配方以服务端为准**：档位可用性、缺文件提示与画布约束来自 `GET /v1/recipes`；某档缺文件时显示「模型缺失」并指名缺哪个文件、该档不可提交，其余档正常；提交时配方字段原样透传（键名与值不被应用改写）。
7. **A7 turbo8 画布配对**：1344×768 画布下 turbo8 使用 `minimax_h3_fl2v_turbo_8step_v1.0_768p_comfyui_bf16.safetensors` + steps 8 + shift-video 6 / shift-audio 3 + attention sol + attention-precision int8-fp8 + sparse-start 0；960×544 画布下 turbo8 使用 turbo8-544p 条目；其他画布不提供 turbo8，且档位选择处说明该档只支持 1344×768 / 960×544。
8. **A8 ETA**：mmh3 任务进度显示按 `step_seconds × 剩余步数` 估算的剩余时间；`step_seconds` 缺失时退回既有展示，不显示错误值。
9. **A9 多锚点 keyframe**：H3 视频提交区可按帧序号添加多个锚点图（选该模式后首帧/尾帧入口不可用并说明原因）；提交时表单带成对的 `keyframe`/`frame-index`；实机抽帧核对锚定帧与锚图一致。
10. **A10 引擎增删**：设置页可新增自定义 mmh3 引擎条目（label/baseUrl/fastBaseUrl）与删除自定义条目（预置 ComfyUI/mmh3 条目不可删，删除前有确认）；新增后 H3 选择器立即可用，删除后回落默认引擎。
11. **A11 切换引擎参数重置**：从 mmh3 切到 ComfyUI（或反之）时，不适用于新引擎的档位与参数重置为该引擎默认值，不带着旧值提交。
12. **A12 提交失败文案（R2）**：提交超时不再呈现原始 `TypeError: fetch failed`，改为带修复指引的失败文案。
13. **A13 引擎选择跨重启（R3）**：应用重启后 H3 两处引擎选择恢复为上次选择，首屏不闪 comfy。
14. **A14 非 H3 零回归与门禁**：`pnpm typecheck && pnpm lint && pnpm test && pnpm build:web` 全绿；既有 `scripts/test-engine-routing.cjs` 六条门禁仍 PASS 且新增契约门禁 PASS；其他工作区行为零变化。

# 约束与不变量

- 渲染进程零 Node/filesystem/network 直连——新增能力全部落在 `electron/mmh3Api.ts`，经 preload 白名单暴露。
- mmh3 网络防呆（沿用 `electron/lmStudioApi.ts` 范式）：仅 http/https；提交 15s / 轮询 5s 超时；下载流式且大小上限 8GiB；`.part` + 原子 rename 落盘；配置错误不拖垮主进程。
- 既有 `mmh3:*` IPC 通道只增不改（引擎仓 §12.4），新增通道只做增量；`scripts/test-engine-routing.cjs` 的通道映射表与配方字段断言同步更新。
- 存储读取容忍旧 shape（settings、jobs、localStorage 三处）。
- 实时状态遵循 `role="status"` / `aria-live="polite"` 约定，不播报高频步进计时。
- 复用现有 UI primitive、主题 token 与 CSS 分层规则；新样式放 H3 特性邻近文件。
- 模块边界变化同步 `docs/app-module-map.md`。
- `AGENTS.md` 的范围与工作协议适用。

# Decisions

- 2026-11-18 用户决定：先验收归档 `mmh3-engine-integration`，再开本 change 接线引擎侧契约（不在原 change 内扩范围）。
- 2026-11-18 用户决定：接线契约以引擎仓 `feature/davai-integration`（eba2c21）文档与真机验证结论为准。
- 2026-11-18 用户决定：不拆分 Supervisor 子任务——全部接线项集中在 mmh3 引擎同一核心区（mmh3Api / mmh3Recipe / 引擎 UI），协同成本高于拆分价值，按单个 Native Change 推进。
- 2026-11-18 用户决定（Q1）：实机验收用临时端口起新二进制，不动 8888/8889 常驻实例；正式部署由用户另行决定。
- 2026-11-18 用户决定（Q2）：取消走真中断，同时保留软取消降级——引擎不支持时沿用既有「mmh3 无法中断，仍在占用 GPU」提示；末步窗口拿到 `done` 时如实显示完成并保留产物。
- 2026-11-18 用户决定（Q3）：turbo8 按画布自动配对——1344×768 用 turbo8(768p)、960×544 用 turbo8-544p、其他画布不提供 turbo8 并说明支持范围。
- 2026-11-18 用户决定（Q4）：四项全纳入——多锚点 keyframe UI（E6）、引擎新增/删除管理 UI、切换引擎时参数重置、R2/R3 已知限制修补。
- 2026-11-18 用户决定：768p turbo8 LoRA 由引擎侧代下（已完成）；turbo4 LoRA 挂起。
