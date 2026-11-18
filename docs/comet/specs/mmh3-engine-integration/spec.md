# mmh3 第二引擎集成（mmh3-engine-integration）

## Capability

`mmh3-engine-integration` — 把部署在本机的 mmh3 推理服务（主实例 127.0.0.1:8888 / fast 实例 127.0.0.1:8889，两个 systemd user 服务，仅绑回环）接入应用，作为 H3 生视频与 H3 生图的用户可见可选引擎：引擎在设置中管理、在 H3 两处工作区可切换，mmh3 任务按其原生配方生成、产物落地本地并进媒体库；除 H3 视频与 H3 生图外的一切模型工作区行为零变化。

Phase 1 基础设施（本机 systemd 双实例、mmh3 自有模型目录）已在本 change 外交付并实机验证，本规格只约束应用侧行为。

## 完整行为规格

### 1. 引擎配置模型

设置文件新增两个可选字段，读写均经现有 `electron/main.ts` 设置通道（原子写）：

- `engines?: EngineConfig[]` — 缺省或为空时视同预置两条目。
- `activeEngineId?: string` — 缺省 `'comfy'`。

`EngineConfig`：

```ts
interface EngineConfig {
  id: string                  // 稳定标识，'comfy' | 'mmh3' 为预置 id
  label: string               // 用户可见名称
  kind: 'comfy' | 'mmh3'
  baseUrl: string             // comfy: ComfyUI 根 URL；mmh3: 主实例（默认 http://127.0.0.1:8888）
  token?: string              // comfy 可选 LAN/访问令牌；mmh3 条目留空
  fastBaseUrl?: string        // 仅 mmh3：fast 实例（默认 http://127.0.0.1:8889）
}
```

预置条目：

- `{ id: 'comfy', label: 'ComfyUI', kind: 'comfy', baseUrl: <comfyUrl 当前值> }` — **`settings.comfyUrl` 仍是该条目 baseUrl 的真源**：设置页编辑任一侧，另一侧同步；代码中一切非 H3 用途继续读 `settings.comfyUrl`，不经过 engines[]。
- `{ id: 'mmh3', label: 'mmh3 (本机)', kind: 'mmh3', baseUrl: 'http://127.0.0.1:8888', fastBaseUrl: 'http://127.0.0.1:8889' }`。

`loadSettings` 显式字段白名单同步新增 `engines`、`activeEngineId`，与 `src/types.ts` 类型一致；未知字段仍按现状丢弃。读取容忍旧设置文件（无新字段 → 全部默认，行为与改动前完全一致）。

#### Scenario: 首次启动无新字段

升级后首次启动（设置文件无 `engines`/`activeEngineId`）：H3 选择器默认显示 ComfyUI，其余一切工作区行为与本 change 之前**行为级一致**（行为等价，不做逐字节比对）。

### 1.1 镜像方向与单一写通道

`settings.comfyUrl` 永远是 ComfyUI baseUrl 的真源，engines[] 的 comfy 条目是其镜像。设置保存只有一条通道：编辑任一侧后保存，以本次编辑侧的值为准，两字段**一次原子写盘**；主进程中现有全部 ComfyUI 特权路径（system_stats、object_info、upload、prompt、cancel、history、LAN view 代理等十余处）继续直读 `settings.comfyUrl`，不经过 engines[]。首启迁移：设置文件无 `engines` 时由存量 `comfyUrl` 幂等合成预置条目；已有 `engines` 时不改写。

#### Scenario: 首启幂等合成

升级后首启（存量设置只有 `comfyUrl`）：合成 `engines=[comfy(镜像), mmh3(默认本机地址)]`、`activeEngineId='comfy'`；再次启动不重复改写；一切非 H3 行为与改动前一致。

#### Scenario: 保存单通道

设置页把 `comfyUrl` 从 A 改为 B 保存：一次写盘同时落 `comfyUrl=B` 与 `engines[comfy].baseUrl=B`；反向编辑 comfy 条目 baseUrl 同理；两次保存之间不存在不一致窗口，也不出现第二次写盘提示。

### 2. 设置页引擎区块

设置页（`src/components/SettingsView.tsx` 现有 `settings-engine` 区块，:253 起）新增「渲染引擎」管理（沿用现有设置区块结构与表单 primitive）：

- 引擎条目列表：每条显示 label、kind、baseUrl（mmh3 额外显示 fastBaseUrl），可编辑、可新增、可删除（预置条目不可删除，仅可编辑 baseUrl/label）。
- 默认引擎选择（写 `activeEngineId`）。
- mmh3 条目的 token 字段留空并附注「该引擎不校验令牌，安全由本机回环绑定保证」。
- 区块条目在设置搜索（`?` finder / settings search）中可检索到。

#### Scenario: 引擎可见可管理

用户在设置页看到 ComfyUI 与 mmh3 两条预置条目，可改 mmh3 的 baseUrl 指向另一本机端口，保存后 H3 选择器随即使用新地址；不重启应用生效。

### 3. H3 引擎选择器与预检

H3 视频工作区与 H3 生图工作区各有一个引擎选择器（下拉 + 状态徽标 + 状态行）：

- 取值：全局默认（`activeEngineId`）+ 工作区级记忆（localStorage，键独立于其他工作区）+ 本次会话覆盖。
- 徽标状态：`● 就绪`（健康检查通过且所需模型齐备）/ `○ 模型缺失`（可达但按引擎自报缺模型）/ `⚠ 离线`（不可达）。ComfyUI 健康检查查 `/object_info` 与现有 H3 模型清单；mmh3 查 `/v1/status`（`models` 数组对照配方所需文件）。检查经主进程（`comfy:*` 现有通道与新增 `mmh3:status`），节流（选择器打开或引擎切换时触发，不轮询轰炸）。
- 不可用的引擎选项**置灰且选不中**，状态行写明原因与修复指引（如「mmh3 离线：检查 mmh3.service 与 mmh3-fast.service」）。
- 切换引擎时若当前 H3 参数与目标引擎不兼容（详见 §4 配方），自动重置为该引擎默认并**明示改了什么**（一条 `role="status"` 提示，不弹模态）。

**预检刷新时机**：H3 工作区挂载时、引擎选择变更时、提交前（状态过期则重查）、设置保存后、该引擎任务失败后；**不做固定周期轮询**。每次检查结果带时间戳，状态行显示「检查于 HH:MM:SS」。任何对该引擎的连接错误（提交/下载/预检失败）使既有健康态失效并触发一次重查——不复制 `TODO(live-preview)` 中 socket 重连后不刷新 object_info 的已知缺陷。

**fast 实例建模与边界**：`:8889` 是同一 mmh3 引擎条目内的档位端点（`fastBaseUrl` 字段），**不是独立引擎条目**；其健康预检 = `/v1/status` 可达。mmh3 API 不暴露实例钉死的 DiT 文件，应用无法运行时校验 8889 实际加载的权重——错模防护以基础设施契约为准（本机 `mmh3-fast.service` 的 `--dit` 钉死 fastvideo 权重，Phase 1 交付物）；UI 在 fast 档标注来源实例。运行时错模检测记入非目标。

#### Scenario: 离线置灰

停掉本机 `mmh3.service` 后打开 H3 视频工作区：mmh3 选项在数秒内置灰、状态行显示离线原因；ComfyUI 选项不受影响且可正常生成。

#### Scenario: 模型缺失

mmh3 可达但实例的模型树缺某配方文件（如 patches 下无 FastH3 patch）：选择器显示 `○ 模型缺失` 并注明缺哪个文件；该档位不可提交，其余档位正常。

### 4. H3 生视频：配方映射与分派

App 的 H3 主生成提交点（`src/App.tsx` 约 :2544 的 `submitPrompt` 调用）与角色身份图提交点（约 :1958）改为按当前引擎分派：

- 引擎为 ComfyUI：**代码路径与现状完全一致**（构造 H3 graph → `comfy:submit-prompt`），不引入任何行为差异。
- 引擎为 mmh3：经 `mmh3:submit`（主进程 multipart POST `/v1/generations`）提交，字段由 `src/lib/engine/mmh3Recipe.ts` 从当前 H3 草稿推导：

| 应用档位 | mmh3 请求字段 | 说明 |
| --- | --- | --- |
| 原生 off | `sampler=euler, schedule=uniform, steps=<N>, shift-video=12, shift-audio=3` | 不带 patch/lora |
| Turbo 4 | `patch=minimax_h3_fasth3_vsa_datafree_patch_rank64.safetensors, steps=4, attention=vsa, attention-precision=int8-fp8`（shift 12/3） | 默认 FastH3 patch；lightx2v 4step LoRA（`lora=minimax_h3_fl2v_turbo_4step_v1.3_768p_comfyui_bf16.safetensors, steps=4`）作为「同权重对照」选项 |
| Turbo 8 | `lora=minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors, steps=8`（shift 12/3） | 与 ComfyUI 同一份权重 |
| 极速 fast | 提交目标改为 `fastBaseUrl`（:8889），`steps=8, attention=dense, attention-precision=int8-fp8` | 整体 DiT 由第二实例钉死；主实例无法按请求换 DiT |
| PDMD 2 步（mmh3 专属） | `lora=minimax_h3_pdmd_2step_lora_rank128_bf16.safetensors, steps=2, shift-video=12, shift-audio=3, attention=sol, sparse-start=0` | 带 mmh3 专属徽标，不占用 ComfyUI turbo 语义 |

公共字段：`prompt`、`seed`、`width`、`height`、`frames`（按现有 H3 时长/帧率换算）、首尾帧参考图（有则作为 `first-frame`/`last-frame` 文件上传）。mmh3 档位带独立配方徽标，UI 明示「mmh3 配方与 ComfyUI 输出不等价」。

带 VSA 门的 checkpoint 必须显式传 `attention`（不依赖服务端默认值）。

#### Scenario: Turbo 4 走 mmh3

选择 mmh3 + Turbo 4 档提交 1344×768/5 秒：请求发往 `http://127.0.0.1:8888/v1/generations`，multipart 含上表字段；完成后媒体库出现带 mmh3 徽标的 MP4。

#### Scenario: fast 档路由第二实例

选择极速 fast 档提交：请求发往 `:8889`；主实例（:8888）不参与该任务；fast 档 UI 标注来源实例。

#### Scenario: Turbo 8 路由

选择 mmh3 + Turbo 8 提交：multipart 含 `lora=minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors`、`steps=8`，发往主实例 :8888（配方快照门禁 G5 断言字段）。

#### Scenario: PDMD 专属档

选择 PDMD 2 步档提交：multipart 含 `lora=minimax_h3_pdmd_2step_lora_rank128_bf16.safetensors`、`steps=2`、`shift-video=12`、`shift-audio=3`、`attention=sol`、`sparse-start=0`；UI 徽标区分「mmh3 专属」，该档不出现在 ComfyUI 引擎选项中（G5 断言字段 + 实机抽测出片）。

#### Scenario: 角色身份图同引擎

角色工作室的身份图批量生成提交点在 mmh3 引擎下按生图路径（§5）分派，不构造 ComfyUI graph。

### 5. H3 生图与参考图编辑

H3 生图提交点（`src/components/H3ImageWorkspace.tsx` 约 :281）按引擎分派：

- ComfyUI：现状不变。
- mmh3：经 `mmh3:submit-image`（POST `/v1/images`）提交，字段：`prompt`、`width`、`height`、`steps`、`seed`（对照现有 H3 生图默认 6 步）。
- mmh3 的多参考图编辑（≤16 张 reference 上传，`reference` 重复字段按序）排在本 change 实现顺序的**最后**；此前 H3 生图工作区在 mmh3 引擎下的编辑模式按能力降级处理（§7）。

#### Scenario: mmh3 生图入库

mmh3 引擎下 1024×1024/6 步生图完成：PNG 落地本地 outputDirectory、登记 `GenerationJob`（`provider: 'h3image'`、`engineId: 'mmh3'`）、媒体库可见可删除，与 ComfyUI 生图条目同构。

### 6. 任务生命周期（mmh3 任务）

mmh3 任务的进度、排队与终止语义：

- **进度**：主进程轮询任务（`GET /v1/generations/{id}`，秒级间隔）并推给渲染进程；`step/steps` 映射为现有进度条语义；实时预览帧不可用，预览区显示步进进度 + 完成后的首帧静帧（下载后取首帧或直接显示产物）。
- **排队**：提交即入 mmh3 服务端队列；任务卡片显示「排队中（前面还有 N 个）」（N 由 `GET /v1/generations` 列表推导；`role="status"`，状态变化播报一次、不高频刷新）。
- **软取消**：取消按钮把本地任务标记为取消态并提示「mmh3 无法中断，仍在占用 GPU」（`role="status"`）；任务在服务端跑完后丢弃产物、不登记入库；对服务端不发 DELETE（running 任务 DELETE 返回 409，不做无效调用——仅在产物下载完成或任务终态后清理）。**竞态顺序**：取消标记只在产物下载开始前可置；下载已开始则等下载完成，随后丢弃本地文件（含 `.part`）并 DELETE 远端；终态由单一状态路径推进，不出现悬挂中间态。
- **失败**：任务失败为终态，错误信息原样呈现并附修复指引；**不自动回落 ComfyUI**，不自动重试。
- **队列历史**：mmh3 任务与 ComfyUI 任务在同一队列/历史中混排，`engineId` 缺省即 ComfyUI；持久化读写容忍无该字段的旧记录。
- **重启恢复**：应用重启时，仍在 queued/running 的 mmh3 作业标记为「已中断」（终态失败变体，注明原因），不悬挂、不自动重提（mmh3 任务 id 跨服务重启失效）。**孤儿清理**：启动时（mmh3 引擎已配置）best-effort `GET /v1/generations` 列出远端任务，已终态的未知任务直接 DELETE；running 的留待结束后由下次启动收走；清理失败只记录告警，不阻塞启动。

#### Scenario: 排队可见

在 mmh3 已有一个 running 任务时再提交一个：第二个任务卡片显示排队位置；第一个完成后第二个自动开始并正常完成。排队状态以 `role="status"` 呈现并在状态变化时播报一次，不高频刷新。

#### Scenario: 软取消不落库

mmh3 任务 running 时点取消：卡片转取消态、出现「仍在占用 GPU」提示；服务端完成后媒体库**不**出现该产物，远端副本被清理。

### 7. 能力降级

对 mmh3 任务，以下 ComfyUI 专属能力在 UI 中**禁用并标注原因**（非隐藏）：

实时预览帧、生成中精修/续改、H3 放大、LTX 放大、RTX 放大、运镜续接（凡以 mmh3 产物为输入的 ComfyUI 后处理链入口）。标注文案说明「该能力依赖 ComfyUI 渲染管线」。以 mmh3 产物为输入的**新** ComfyUI 任务不受限（可正常把 mmh3 产物当参考图/首帧提交给 ComfyUI 任务）。

#### Scenario: 降级标注

mmh3 任务的卡片与详情不出现「放大」等操作入口，原入口位置显示禁用态与原因 tooltip（禁用态与原因以 `role="status"` 呈现，仅在状态变化时播报）；同一产物拖入 ComfyUI 引擎的 H3 任务作首帧则正常可用。

### 8. 产物落地与媒体库

- mmh3 任务完成后，主进程 `GET /v1/generations/{id}/video|image` 流式下载到本地 `outputDirectory`（先写 `<name>.part`，完成后原子 rename 为正式文件名，沿用 atomicFile 模式；文件名沿用现有留存命名规则，带 `mmh3` 前缀或等价标识），**下载成功后才写 `outputUrl` 并登记 job**；随后 `DELETE /v1/generations/{id}` 清理远端副本与上传暂存。
- 本地文件经现有 `minimax-media://` 的 `?path=` 本地文件分支服务（与 `comfy:save-output-image` 留存文件同一通路），该分支的 `Range`/206 语义**必须继续满足**（视频 seek、音频 scrub 依赖）；**不修改 `comfy` 远程分支**。
- 媒体库卡片与灯箱显示引擎来源徽标（ComfyUI / mmh3）；删除、引用检测、缩略图、手机端播放沿用现有媒体库行为，零额外分支。

#### Scenario: 删除与引用检测照常

删除一条 mmh3 视频产物：文件进回收站、记录移除；当它被影片项目引用时删除被阻止并提示引用位置——与 ComfyUI 产物行为一致。

### 9. 引擎切换交接序列

引擎从 ComfyUI 切到 mmh3（全局默认变更或工作区选择变更后的**首次 mmh3 提交**前）执行一次：

1. `GET {comfyUrl}/queue` — running 与 pending 非空时**不自动 /free**，提示「等待 ComfyUI 队列清空后重试」（用户可在 ComfyUI 侧清队列后重试提交）。
2. 队列空 → `POST {comfyUrl}/free` `{"unload_models":true,"free_memory":true}`（经主进程）。
3. 确认 mmh3 `GET /v1/status` 可达后放行提交。

**/free 失败语义**：步骤 1 队列非空 → **阻塞**提交并提示「等待 ComfyUI 队列清空后重试」（用户可在 ComfyUI 侧清队列后重试）；步骤 2 `/free` 调用失败或 10s 超时 → **不阻塞**提交，状态行警告「ComfyUI 显存未释放，mmh3 可能加载失败」并附指引（稍后重试或检查 ComfyUI）；随后 mmh3 侧加载失败按 §6 普通失败路径呈现，不回落。

切换是显式用户动作；状态行说明「正在释放 ComfyUI 显存…」。切回 ComfyUI **不**对 mmh3 做任何释放（依赖服务端 idle-unload 自动回收；用现有 `davai_h3_preload` 机制预热不阻塞用户）。两实例共存上限（main 全套 ~72GB + fast ~51GB 超 128GB UMA，且 mmh3 现与 ComfyUI 同机）以提示文案覆盖：fast 档提交前若 main 实例刚持有全套模型，提示「mmh3 fast 实例可能需要先等待模型释放」并在失败时给出重试指引，不做自动编排。

#### Scenario: 交接释放

ComfyUI 刚完成一次 H3 生成后立刻选 mmh3 提交：应用先查队列（空）、发 `/free`、等 mmh3 确认可达，然后提交成功；状态行按序显示上述阶段。

### 10. 隔离不变量与回归门禁

硬性不变量（`scripts/test-engine-routing.cjs` 断言；套件注册为 `package.json` 的 `test:engine-routing` 并追加进 `test` 链，`pnpm test` 自动执行，逐条输出 PASS）：

| 门禁 | 断言内容 | 对应验收 |
| --- | --- | --- |
| G1 | 非 H3 提交点（LTX 2.3/2.5、Ripple、ACE-Step、Music 3、Z-Image、FireRed、BiRefNet、诊断、基准等全部 `submitPrompt` 调用）静态扫描仍传 `settings.comfyUrl`/现有 ComfyUI 通道 | A3、A27 |
| G2 | `useLivePreview` 的 WS URL 仍由 `comfyUrl` 推导，未引用 engines[] | A27（**仅门禁覆盖，无独立验收项**） |
| G3 | `comfy:*` IPC 通道集合与 preload 方法名只增不改（不删除、不改签名）；共享模块无行为分支改动 | A3、A27 |
| G4 | H3 三处分派点（App 的 H3 主生成、App 的角色身份图、H3ImageWorkspace 生图）存在引擎分派结构——**按结构匹配（导出函数/调用形态），不使用行号**，避免本次重构移动行号导致门禁失效 | A16、A17、A20、A21 |
| G5 | `mmh3Recipe` 纯函数对 off/Turbo4/Turbo8/fast/PDMD 五档 + 生图的输出字段快照符合 §4/§5 表格 | A7、A16、A17、A18、A19、A21 |
| G6 | `loadSettings` 白名单含 `engines`、`activeEngineId`；缺省路径返回预置两条目；**写入侧镜像**：设置归一化纯函数（单一保存通道的可测内核）被断言——`comfyUrl` 改为 B 后，返回的 `engines[comfy].baseUrl` 同为 B | A10、A11、A12、A27 |

现有全部测试套件（`pnpm test`）保持通过；不修改任何现有断言的语义。

#### Scenario: 全量回归绿

`pnpm typecheck && pnpm lint && pnpm test && pnpm build:web` 在本 change 全部改动下通过；`test-engine-routing.cjs` 六条断言逐条通过。

### 11. 引擎对比工具（实现顺序末位）

H3 视频工作区提供「双引擎对比」入口：以当前草稿参数分别在两引擎各提交一次（串行，先 ComfyUI 后 mmh3 或按空闲度），完成后并排展示两个产物、各自耗时与引擎/配方徽标。它复用 §4-§8 的全部路径，不新增提交通道；位于实现顺序最后，**验收账本为 A1–A27（唯一）**，对比工具本身不设独立验收项。

### 12. 实机验收（实机执行视角 + 环境前置）

**执行前置（每轮验收先做）**：`systemctl --user is-active mmh3.service mmh3-fast.service` 返回 active，且 `curl -fsS http://127.0.0.1:8888/v1/status` 与 `http://127.0.0.1:8889/v1/status` 均返回 200。**参考环境**：本机 GB10 双实例（与 ComfyUI 同机，systemd user 服务，仅绑回环）。**热态定义**：同一 mmh3 实例在 idle-unload 窗口内已服务过至少一次生成（`/v1/status` 的 `models` 非空）；时效阈值（≤90s / ≤25s）仅对该参考环境与热态有效。

**A1–A27 是本 change 的唯一验收账本**；以下六条只是**实机执行视角**的归并视图（每条标注其对应账本编号，不另立编号）：

1. mmh3 引擎 + Turbo 4 档，1344×768/5 秒视频，服务热态（模型已加载）提交到媒体库出现 ≤90s。（A1、A16）
2. mmh3 引擎 H3 生图 1024×1024/6 步，热态 ≤25s。（A2、A21）
3. `pnpm typecheck && pnpm lint && pnpm test && pnpm build:web` 全绿 + `test-engine-routing.cjs` 六条门禁通过（§10）。（A3、A8、A27）
4. mmh3 产物进媒体库、可删除、引用检测生效（§8）。（A25）
5. mmh3 不可达时 H3 两处选择器置灰并给出修复指引；强提交路径（如任务已提交后实例停止）硬失败有指引，不静默（§3、§6）。（A4、A14）
6. 本机 mmh3 双实例实机跑通一次视频 + 一次生图（§4、§5 的端到端 Scenario 实测）。（A16–A21、A25）

## 约束

- 渲染进程不得新增任何 Node/filesystem/network 直连——mmh3 一切网络与文件操作在主进程 `electron/mmh3Api.ts`，经 preload 白名单暴露。
- mmh3 网络防呆（参照 `electron/lmStudioApi.ts` 范式）：仅允许 http/https 端点；提交 15s / 轮询 5s 超时；下载流式且大小上限 8GiB；`.part` + 原子 rename 落盘；配置错误不得拖垮主进程。
- 「非 H3 零变化」是行为级不变量：共享模块（`jobPersistence`、`LibraryView`、App shell）只允许向后兼容读取与纯增量展示（徽标），不改现有行为分支；G1/G3 门禁静态断言。
- 复用现有 UI primitive、主题 token、CSS 分层规则；新样式放 H3 特性邻近文件。
- 实时状态遵循 `role="status"`/`aria-live="polite"` 约定，不播报高频步进计时。
- 存储读取容忍旧 shape（设置、jobs、localStorage 三处）。
- `AGENTS.md` 的范围与工作协议适用；模块边界变化同步 `docs/app-module-map.md`。
