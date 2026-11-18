# 目标

把部署在本机的 mmh3 引擎（Rust 自研 MiniMax H3 推理服务，systemd user 双实例 127.0.0.1:8888/8889，仅绑回环）接入 DavAi Video Studio，作为 **H3 生视频与 H3 生图的用户可见可选引擎**，与 ComfyUI 并存、可切换；**其他所有模型工作区（Z-Image、LTX 2.3/2.5、LTX Ripple、ACE-Step、Music 3、FireRed、BiRefNet 等）行为零变化**。

完整设计共识已经过 7 轮结构化访谈（36 项决策）与用户逐项确认；Phase 1 基础设施（双 systemd 实例、mmh3 自有模型目录、三项实机验证）已于 2026-11-17 完成并在本 change 之外交付。本 change 承载应用侧全部实现（原 Phase 2 + Phase 3）。2026-11-18 用户决定把 mmh3 从 10.0.0.2 + SSH 隧道迁到本机直连（远端设备另有用途），拓扑变更同步落到本 brief 与完整目标规格。

# 范围

## 目录结构

### 新建

- `src/lib/engine/engines.ts` — 引擎配置模型与解析：`EngineConfig`（`id/label/kind/baseUrl/token?/fastBaseUrl?`）、`engines[]` 预置条目、`activeEngineId` 解析（缺省 comfy）、`comfyUrl` 兼容镜像规则、工作区级引擎记忆读写。
- `src/lib/engine/mmh3Recipe.ts` — H3 档位到 mmh3 请求字段的映射（off/turbo4/turbo8/fast/pdmd 与生图参数），纯函数、可单测。
- `src/lib/engine/engineHealth.ts` — 引擎健康预检：ComfyUI 查 `/object_info`，mmh3 查 `/v1/status`（models 数组），归一化为选择器可用的状态（就绪/模型缺失/离线）。
- `electron/mmh3Api.ts` — 主进程 mmh3 HTTP 客户端：multipart 提交（generations/images）、任务轮询、SSE 进度转发、产物下载到 `outputDirectory`、成功后 `DELETE` 远程副本；`/free` 交接序列（queue 空检查 + unload_models/free_memory）。
- `scripts/test-engine-routing.cjs` — 引擎路由回归门禁：断言非 H3 提交点仍走 `settings.comfyUrl`、`comfy:*` 通道与 `useLivePreview` 未被改动、H3 三处分派点存在。
- `docs/comet/changes/mmh3-engine-integration/specs/mmh3-engine-integration/spec.md` — 本需求完整行为规格。

### 修改

- `electron/main.ts` — `loadSettings` 白名单新增 `engines`、`activeEngineId`；注册 `mmh3:*` `ipcMain.handle` 通道（status/submit/job/download/release-comfy）；复用 atomicFile 写设置。
- `electron/preload.ts` — `window.minimax` 暴露 `mmh3*` 方法（contextBridge 白名单式暴露，不扩大权限面）。
- `src/types.ts` — `DesktopApi` 新增 mmh3 方法类型；`EngineConfig`；`GenerationJob` 增加可选 `engineId`（缺省即 ComfyUI）。
- `src/App.tsx` — H3 主生成（约 :2544）与角色身份图（约 :1958）两处提交点按引擎分派；mmh3 任务的进度/排队/软取消/失败状态处理；应用重启时未完成 mmh3 作业标记中断；引擎切换时的 `/free` 交接调用；H3 视频引擎选择器 UI。
- `src/components/H3ImageWorkspace.tsx` — H3 生图提交点（约 :281）按引擎分派；生图引擎选择器。
- `src/lib/jobPersistence.ts` — 读写容忍 `engineId` 字段（旧条目无此字段视为 ComfyUI）。
- `src/lib/h3Diagnostics.ts` — 栈报告按当前引擎取模型就绪数据（ComfyUI /object_info 或 mmh3 /v1/status）。
- `src/components/LibraryView.tsx` — 媒体库卡片/灯箱显示引擎来源徽标（ComfyUI / mmh3），纯增量展示。
- `src/components/SettingsView.tsx` — 现有 `settings-engine` 区块（:253）扩展为「渲染引擎」管理：条目列表、baseUrl/token 编辑、mmh3 条目「不校验令牌，安全由本机回环绑定保证」标注、默认引擎选择；comfyUrl 与 engines[] 镜像经此处的单一保存通道落盘。
- `package.json` — 注册 `test:engine-routing` 并追加进 `test` 链（现有 31 个 `test:*` 的接线惯例），保证 `pnpm test` 自动执行六条门禁。
- `docs/app-module-map.md` — 同步新增的引擎抽象模块边界（`src/lib/engine/*`、`electron/mmh3Api.ts`）归属。
- H3 特性相关 CSS（组件邻近样式文件）— 选择器、徽标、降级标注样式。

### 删除

（无删除项。）

### 明确不建

- 不为 mmh3 新建 ComfyUI API-format graph builder——mmh3 走 HTTP 表单，与 `src/lib/*Workflow.ts` 体系无关。
- 不做手机端（MobileApp/LAN）的 mmh3 接入——首期 LAN 手机端保持 ComfyUI。
- 不做 mmh3 实时预览帧、硬取消、放大/续接路径——服务端无对应能力，UI 以禁用+标注原因降级。
- 不做自动回落（mmh3 失败不自动改投 ComfyUI）。
- 不改 Phase 1 基础设施（本机 systemd 双实例、mmh3 模型目录）——本仓库不含这些内容。

# 非目标

- 「其他工作区零变化」是**行为级**不变量：共享模块（`jobPersistence`、`LibraryView`、App shell）只允许向后兼容读取与纯增量展示（徽标），不改现有行为分支；G1/G3 门禁含对应静态断言。
- 不做 mmh3 实例所载权重的运行时校验（API 不暴露所钉 DiT；以 systemd 服务契约与 UI 标注为准）。
- 不改变 ComfyUI 路径的任何现有行为：H3 turbo 档位语义、默认采样器（`res_multistep`+`simple`）、Turbo 4 的 shift 12/3（与 768p 训练 shift 6/3 的疑点记入后续审计，不在本 change 处理）、服务启动参数。
- 不修改 `comfy:*` IPC 通道、`useLivePreview` 的 WebSocket 指向、`settings.comfyUrl` 的语义。
- 不把 mmh3 设为默认引擎；默认始终 ComfyUI。
- 不为 mmh3 实现鉴权/token 校验（服务无鉴权；安全边界 = 实例仅绑本机回环）。
- 不在本 change 内处理两 mmh3 实例共存的显存上限自动化（main ~72GB + fast ~51GB 超 128GB UMA，且现与 ComfyUI 同机）——切换时先释放/等待 idle-unload 的提示逻辑覆盖，进一步自动化另行立项。

# 验收示例

1. **mmh3 视频端到端**：选择 mmh3 引擎，H3 视频档位 Turbo 4，1344×768/5 秒，热态（服务已加载模型）提交到产物出现在媒体库 ≤90s；产物为可播放的带音频 MP4，卡片带 mmh3 徽标，可删除且删除后引用检测照常生效。
2. **mmh3 生图端到端**：H3 生图 1024×1024/6 步 ≤25s（热态），PNG 入库同上。
3. **非 H3 零回归**：`pnpm typecheck && pnpm lint && pnpm test && pnpm build:web` 全绿；`scripts/test-engine-routing.cjs` 六条门禁通过；Z-Image/LTX/ACE-Step/Music3 提交仍构造 ComfyUI graph 并发往 `settings.comfyUrl`。
4. **预检与降级**：停掉本机 mmh3 实例后，H3 两处选择器在数秒内置灰 mmh3 选项并显示离线原因；强行提交已有任务时硬失败并给出修复指引（检查 mmh3.service / mmh3-fast.service），不静默、不回落。
5. **软取消**：mmh3 任务进行中点取消——任务标记取消态并提示「mmh3 无法中断，仍在占用 GPU」，跑完后丢弃产物且不登记入库。
6. **重启恢复**：mmh3 任务进行中重启应用——该作业在队列历史中标记为中断/失败，不悬挂、不自动重提。
7. **Turbo 8 与 PDMD 档路由**：mmh3 引擎下 Turbo 8 档请求字段为 `lora=minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors, steps=8`（发往主实例）；PDMD 档为 `lora=minimax_h3_pdmd_2step_lora_rank128_bf16.safetensors, steps=2, attention=sol, sparse-start=0` 且带 mmh3 专属徽标——由配方快照门禁断言字段，PDMD 档实机抽测一次出片。
8. **门禁接线**：`pnpm test` 链包含 `test:engine-routing`（package.json 追加），六条门禁逐条输出 PASS；门禁与验收编号的映射见 spec §10。
9. **环境前置（时效阈值绑定）**：验收 1/2 的 ≤90s / ≤25s 以本机 GB10 双实例（与 ComfyUI 同机）为参考环境，「热态」= 同一实例在 idle-unload 窗口内已服务过生成（`/v1/status` 的 `models` 非空）；执行前置判定：`systemctl --user is-active mmh3.service mmh3-fast.service` = active，且 `curl` 8888/8889 两端口 `/v1/status` 均 200。

# 约束与不变量

- 渲染进程无 Node 特权：所有 mmh3 HTTP/下载走主进程 `mmh3:*` 通道，不绕过 preload bridge。
- `settings.comfyUrl` 永远是 ComfyUI 引擎的 baseUrl 来源（engines[] 中 comfy 条目镜像它；编辑任一侧保持同步）。
- `GenerationJob.engineId` 缺省即 ComfyUI；持久化读取容忍无此字段的旧记录。
- mmh3 产物必须落地本地 `outputDirectory` 后才登记 `outputUrl`（沿用 `minimax-media://` 的 `?path=` 本地文件分支，不改 `comfy` 远程分支；必须继续满足 `Range`/206）；下载先写 `.part` 再原子 rename（沿用 atomicFile 模式）；下载成功后删除远端副本。
- mmh3 网络防呆（参照 `electron/lmStudioApi.ts` 范式）：仅允许 http/https 端点；提交/轮询分别设超时（15s/5s）；下载流式且设大小上限（8GiB）；配置错误不拖垮主进程。
- 引擎切换到 mmh3 前执行交接序列：`GET {comfy}/queue` 确认空 → `POST /free {"unload_models":true,"free_memory":true}` → 确认 mmh3 可达；切换是显式用户动作且有提示。切回 ComfyUI 不卸载 mmh3（靠 idle-unload 自动回收）。
- 实时状态用 `role="status"` / `aria-live="polite"` 描述当前引擎与阶段，不播报高频帧/计时。
- `loadSettings` 白名单新增字段须与 `src/types.ts` 类型同步。

# 关键决定

（全部经用户 2026-11-17 确认；完整 36 项见 spec 与会话记录）

- 引擎建模：`engines[]` + `activeEngineId` 全局默认 + H3 视频/生图两处工作区级记忆与本次覆盖；预置 ComfyUI 与 mmh3 两条目。
- 配方映射（mmh3 路径）：off→`euler+uniform` N 步 shift 12/3；Turbo 4→FastH3 patch 4 步 vsa int8-fp8（lightx2v 4step 同权重 LoRA 作对照选项）；Turbo 8→lightx2v 8step LoRA 同权重；极速 fast→fastvideo 整体 DiT（本机 `mmh3-fast.service` 监听 127.0.0.1:8889，直接呈现在 `fastBaseUrl` 默认 `http://127.0.0.1:8889`，8 步 dense）——`--dit` 是 mmh3 机器级选项、请求不可指定，故 fast 档路由到第二实例；PDMD 2 步为 mmh3 专属极速档（sol + sparse-start 0）。
- mmh3 画质用其原生配方 + 独立徽标，不承诺与 ComfyUI 等价；不兼容参数切换引擎时自动重置并明示改了什么。
- 排队交给 mmh3 服务端队列，应用读队列位置显示「前面还有 N 个」。
- 预览降级为步进进度 + 完成首帧静帧；精修/放大/续接/RTX 放大等 ComfyUI 专属能力对 mmh3 任务禁用并标注原因。
- 引擎对比工具（同参数双引擎并排 + 耗时差）排在本 change 末位实现，兼作验收工具。
- 失败不自动回落；预检不可用即置灰不可选。
- **comfyUrl 镜像方向**：`settings.comfyUrl` 永远是 ComfyUI baseUrl 真源，engines[] 的 comfy 条目是其镜像；设置保存走单一通道（以本次编辑侧为准，两字段一次原子写盘，无第二次写盘提示）；首启由存量 comfyUrl 幂等合成预置条目（已有 engines 时不改写）；main.ts 现有十余个 ComfyUI 特权路径继续直读 comfyUrl。
- **fast 实例建模**：`:8889` 是同一 mmh3 引擎条目内的档位端点（`fastBaseUrl` 字段），不是独立引擎条目；其健康预检 = `/v1/status` 可达。mmh3 API 不暴露实例钉死的 DiT，**不做运行时错模检测**——错模防护以基础设施契约为准（本机 `mmh3-fast.service` 的 `--dit` 钉死，属 Phase 1 交付物），UI 在 fast 档标注来源实例（记入非目标）。
- **降级判定时机**：预检触发点 = H3 工作区挂载、引擎选择变更、提交前（状态过期则重查）、设置保存后、该引擎任务失败后；不做固定周期轮询；检查结果带时间戳（「检查于 HH:MM:SS」）；任何对该引擎的连接错误使既有健康态失效并触发重查——不复制 `TODO(live-preview)` 中 socket 重连后不刷新 object_info 的已知缺陷。
- **/free 失败语义**：ComfyUI 队列非空 → 阻塞提交并给指引；`/free` 调用失败或 10s 超时 → 不阻塞提交，状态行警告「ComfyUI 显存未释放，mmh3 可能加载失败」并附指引；mmh3 侧随后失败按普通失败路径呈现，不回落。
- **软取消竞态**：取消标记只在产物下载开始前可置；下载已开始则等下载完成，随后丢弃本地文件（含 `.part`）并 DELETE 远端；终态由单一状态路径推进，无悬挂中间态。
- **重启孤儿清理**：应用启动时（mmh3 引擎已配置）best-effort 列出远端 generations，DELETE 已终态的未知任务；running 的留待结束后由下次启动收走；清理失败不阻塞启动。

# 验证要求

- 本 change 完成前必须实际运行：`pnpm typecheck`、`pnpm lint`、`pnpm test`（含接线后的 `test:engine-routing`）、`pnpm build:web`。
- UI 验证需在 Electron 实机最小布局与典型桌面尺寸各过一遍 H3 视频/生图两屏的空、加载、成功、失败、禁用态。
- 实机验收在本机 mmh3 双实例在线时执行（验收示例 1/2/4/5/6/7）；执行前按验收示例 9 的步骤确认双实例在位。
