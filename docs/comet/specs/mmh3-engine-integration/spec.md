# mmh3 第二引擎集成（mmh3-engine-integration）

## Capability

`mmh3-engine-integration` — 把部署在本机的 mmh3 推理服务（主实例 127.0.0.1:8888 / fast 实例 127.0.0.1:8889，两个 systemd user 服务，仅绑回环）接入应用，作为 H3 生视频与 H3 生图的用户可见可选引擎：引擎在设置中管理、可增删自定义条目、在 H3 两处工作区可切换，mmh3 任务按其原生配方生成、**可被真正打断**、配方与画布约束以服务端 `/v1/recipes` 为准、实例实际加载的权重在界面上可见、进度给出基于每步实测耗时的剩余时间、支持多锚点引导；产物落地本地并进媒体库；除 H3 视频与 H3 生图外的一切模型工作区行为零变化。

Phase 1 基础设施（本机 systemd 双实例、mmh3 自有模型目录）已在本 change 外交付并实机验证，本规格只约束应用侧行为。

引擎侧契约来源：`/home/dawo/orca/projects/mmh3/mmh3-davai`（分支 `feature/davai-integration`，HEAD `eba2c21`）的 `docs/server.md`、`docs/usage.md`、`docs/lightx2v-turbo.md`、`docs/fl2va.md`、`docs/davai-integration-gaps.zh.md`。

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

**自定义条目**：用户可在预置条目之外新增任意 `kind: 'mmh3'` 条目（id 由应用生成、不与预置 id 冲突），可删除；预置条目 `comfy`/`mmh3` 不可删除（可编辑 label/baseUrl/fastBaseUrl）。新增/删除只改 `engines[]`，不触碰 `comfyUrl` 镜像规则；删除自定义条目时若它是 `activeEngineId` 或某工作区的当前选择，删除后回落 ComfyUI 默认。

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

设置页（`src/components/SettingsView.tsx` 现有 `settings-engine` 区块，:253 起）的「渲染引擎」管理（沿用现有设置区块结构与表单 primitive）：

- 引擎条目列表：每条显示 label、kind、baseUrl（mmh3 额外显示 fastBaseUrl），可编辑。
- **新增引擎**：新增自定义 mmh3 条目（label、主实例地址、极速实例地址）；新增后不重启即出现在 H3 两处引擎选择器中，可立即选用。
- **删除引擎**：仅自定义条目可删除，删除前二次确认（说明该条目正被哪处选用时的回落去向）；预置 ComfyUI/mmh3 条目无删除入口。
- 默认引擎选择（写 `activeEngineId`）。
- mmh3 条目的 token 字段留空并附注「该引擎不校验令牌，安全由本机回环绑定保证」。
- 区块条目在设置搜索（`?` finder / settings search）中可检索到。

#### Scenario: 引擎可见可管理

用户在设置页看到 ComfyUI 与 mmh3 两条预置条目，可改 mmh3 的 baseUrl 指向另一本机端口，保存后 H3 选择器随即使用新地址；不重启应用生效。

#### Scenario: 自定义引擎可增删（验收：A10）

设置页新增一条名为「mmh3-实验」的自定义 mmh3 引擎（地址填本机另一端口）：保存后 H3 视频与 H3 生图的引擎选择器出现该条目，状态徽标按其地址独立预检；在设置页删除它并确认：条目消失，若它是当前选择则回落 ComfyUI，预置两条目始终存在且无删除入口。

### 3. H3 引擎选择器与预检

H3 视频工作区与 H3 生图工作区各有一个引擎选择器（下拉 + 状态徽标 + 状态行）：

- 取值：全局默认（`activeEngineId`）+ 工作区级记忆（localStorage，键独立于其他工作区）+ 本次会话覆盖。工作区级记忆**跨应用重启生效**：重启后首屏即显示上次选择，不先闪 ComfyUI 再纠正（R3 修补）。
- 徽标状态：`● 就绪`（健康检查通过且所需模型齐备）/ `○ 模型缺失`（可达但按引擎自报缺模型）/ `● 正忙`（可达但实例正忙、无从核对权重）/ `⚠ 离线`（不可达）。ComfyUI 健康检查查 `/object_info` 与现有 H3 模型清单；mmh3 查 `/v1/status`。检查经主进程（`comfy:*` 现有通道与 `mmh3:status`），节流（选择器打开或引擎切换时触发，不轮询轰炸）。
- **实际权重展示**：mmh3 实例可达时，状态行展示该实例当前实际加载的 DiT 文件名与其适配器（patch/LoRA 文件名），用户据此分辨主实例与极速实例各持有什么权重；权重指纹（digest）以「实例口径指纹」呈现并注明**非完整性校验**（它只说明两个文件不同，不说明某个文件完好）。实例正忙（服务端此时不返回 dit 条目）时显示「● 正忙」而非「模型缺失」或「异常」。
- 不可用的引擎选项**置灰且选不中**，状态行写明原因与修复指引（如「mmh3 离线：检查 mmh3.service 与 mmh3-fast.service」）。
- 切换引擎时若当前 H3 参数与目标引擎不兼容（详见 §4 配方与 §18 参数重置），自动重置为该引擎默认并**明示改了什么**（一条 `role="status"` 提示，不弹模态）。

**预检刷新时机**：H3 工作区挂载时、引擎选择变更时、提交前（状态过期则重查）、设置保存后、该引擎任务失败后；**不做固定周期轮询**。每次检查结果带时间戳，状态行显示「检查于 HH:MM:SS」。任何对该引擎的连接错误（提交/下载/预检失败）使既有健康态失效并触发一次重查——不复制 `TODO(live-preview)` 中 socket 重连后不刷新 object_info 的已知缺陷。

**fast 实例建模与边界**：`:8889` 是同一 mmh3 引擎条目内的档位端点（`fastBaseUrl` 字段），**不是独立引擎条目**；其健康预检 = `/v1/status` 可达。fast 实例与主实例靠端口区分，客户端用 `/v1/status` 的 `weights` 与 `/v1/recipes` 判别二者各自持有的权重与配方（§15）；应用不发送任何机器级模型选项（`dit`/`text-encoder`/`models`/`devices` 等），换权重由实例自身承担。

#### Scenario: 离线置灰

停掉本机 `mmh3.service` 后打开 H3 视频工作区：mmh3 选项在数秒内置灰、状态行显示离线原因；ComfyUI 选项不受影响且可正常生成。

#### Scenario: 模型缺失

mmh3 可达但实例的模型树缺某配方文件（如 patches 下无 FastH3 patch）：选择器显示 `○ 模型缺失` 并注明缺哪个文件；该档位不可提交，其余档位正常。

#### Scenario: 实际权重可见（验收：A5）

mmh3 实例可达且空闲：状态行显示该实例实际加载的 DiT 文件名与适配器（如 `fastvideo_fasth3_8step_v2_pruned_int8_convrot.safetensors` + 其 patch/LoRA）；切到极速档时状态行显示的是 `:8889` 自己的权重而非主实例的；权重指纹旁注明「实例口径指纹，非完整性校验」；实例正在渲染时状态行显示「● 正忙」而非「模型缺失」。

### 4. H3 生视频：配方映射与分派

App 的 H3 主生成提交点（`src/App.tsx` 约 :2544 的 `submitPrompt` 调用）与角色身份图提交点（约 :1958）改为按当前引擎分派：

- 引擎为 ComfyUI：**代码路径与现状完全一致**（构造 H3 graph → `comfy:submit-prompt`），不引入任何行为差异。
- 引擎为 mmh3：经 `mmh3:submit`（主进程 multipart POST `/v1/generations`）提交，字段由 `src/lib/engine/mmh3Recipe.ts` 从当前 H3 草稿推导；**档位定义与可用性以服务端 `/v1/recipes` 为准**（§14），下表是服务端的等价展开：

| 应用档位 | mmh3 请求字段 | 说明 |
| --- | --- | --- |
| 原生 off | `sampler=euler, schedule=uniform, steps=<N>, shift-video=12, shift-audio=3` | 不带 patch/lora |
| Turbo 4 | `patch=minimax_h3_fasth3_vsa_datafree_patch_rank64.safetensors, steps=4, attention-precision=int8-fp8`（shift 12/3，即服务端 `fasth3` 配方；VSA 门由 patch 自带语义） | 默认 FastH3 patch；lightx2v 4step LoRA（服务端 `turbo` 配方：`lora=minimax_h3_fl2v_turbo_4step_v1.2_768p_comfyui_bf16.safetensors, steps=4, shift-video=6, shift-audio=3, attention=sol, attention-precision=int8-fp8, sparse-start=0`，1344×768 画布）作为「同权重对照」选项；该 LoRA 本机未下，按「模型缺失」降级 |
| Turbo 8（1344×768） | `lora=minimax_h3_fl2v_turbo_8step_v1.0_768p_comfyui_bf16.safetensors, steps=8, shift-video=6, shift-audio=3, attention=sol, attention-precision=int8-fp8, sparse-start=0` | 768p 变体 + 6/3 shift（与画布成对）；**不得**再用 544p 变体配 768p 画布 |
| Turbo 8（960×544） | 服务端 `turbo8-544p` 条目的 `options` 原样透传 | 544p 变体与其 shift 同用；该变体 LoRA 未在本机就位时按「模型缺失」处理（§14） |
| 极速 fast | 提交目标改为 `fastBaseUrl`（:8889），`steps=8, attention=dense, attention-precision=int8-fp8` | 整体 DiT 由第二实例钉死；主实例无法按请求换 DiT |
| PDMD 2 步（mmh3 专属） | 服务端 `pdmd` 配方原样：`lora=minimax_h3_pdmd_2step_lora_rank128_bf16.safetensors, steps=2, shift-video=12, shift-audio=3, attention=sol, attention-precision=int8-fp8, sparse-start=0` | 带 mmh3 专属徽标，不占用 ComfyUI turbo 语义；补齐既往 DavAi 漏发的 `attention-precision` |

公共字段：`prompt`、`seed`、`width`、`height`、`frames`（按现有 H3 时长/帧率换算）、首尾帧参考图（有则作为 `first-frame`/`last-frame` 文件上传）、多锚点参考图（见 §17）。mmh3 档位带独立配方徽标，UI 明示「mmh3 配方与 ComfyUI 输出不等价」。

**画布与档位配对**：受训画布约束的档位（turbo8 系）**按当前画布配对**——1344×768 用 `turbo8`、960×544 用 `turbo8-544p`；其他画布（超宽、竖屏、方形及阶梯中其余尺寸）**不提供 turbo8**，档位选择处说明「该档位仅支持 1344×768 / 960×544」。用户改画布时，turbo8 自动落到该画布对应的条目或被移除，不带着不匹配的权重提交。

**采样器与精度**：服务端默认的 euler + uniform + shift 12/3 即官方管线等价物，**用户侧不暴露采样器选项**；生图请求不发送 `linear-precision`（服务端 DiT 固定 INT8 linear，发送该字段会被拒绝）。

带 VSA 门的 checkpoint 必须显式传 `attention`（不依赖服务端默认值）。

#### Scenario: Turbo 4 走 mmh3

选择 mmh3 + Turbo 4 档提交 1344×768/5 秒：请求发往 `http://127.0.0.1:8888/v1/generations`，multipart 含上表字段；完成后媒体库出现带 mmh3 徽标的 MP4。

#### Scenario: fast 档路由第二实例

选择极速 fast 档提交：请求发往 `:8889`；主实例（:8888）不参与该任务；fast 档 UI 标注来源实例。

#### Scenario: Turbo 8 画布配对（验收：A7）

画布为 1344×768 时选 Turbo 8：multipart 含 `lora=minimax_h3_fl2v_turbo_8step_v1.0_768p_comfyui_bf16.safetensors`、`steps=8`、`shift-video=6`、`shift-audio=3`、`attention=sol`、`attention-precision=int8-fp8`、`sparse-start=0`（配方快照门禁 G5 断言字段）。画布改为 960×544：Turbo 8 落到 `turbo8-544p` 条目（缺该 LoRA 时显示「模型缺失」并禁用提交）。画布改为 1344×576 或竖屏/方形：Turbo 8 不出现在可选档位中，选择处说明该档只支持 1344×768 / 960×544。

#### Scenario: PDMD 专属档

选择 PDMD 2 步档提交：multipart 含 `lora=minimax_h3_pdmd_2step_lora_rank128_bf16.safetensors`、`steps=2`、`shift-video=12`、`shift-audio=3`、`attention=sol`、`attention-precision=int8-fp8`、`sparse-start=0`；UI 徽标区分「mmh3 专属」，该档不出现在 ComfyUI 引擎选项中（G5 断言字段 + 实机抽测出片）。

#### Scenario: 角色身份图同引擎

角色工作室的身份图批量生成提交点在 mmh3 引擎下按生图路径（§5）分派，不构造 ComfyUI graph。

### 5. H3 生图与参考图编辑

H3 生图提交点（`src/components/H3ImageWorkspace.tsx` 约 :281）按引擎分派：

- ComfyUI：现状不变。
- mmh3：经 `mmh3:submit-image`（POST `/v1/images`）提交，字段：`prompt`、`width`、`height`、`steps`、`seed`（对照现有 H3 生图默认 6 步）；不发送 `linear-precision`。
- mmh3 的多参考图编辑（≤16 张 reference 上传，`reference` 重复字段按序）排在本 change 实现顺序的**最后**；此前 H3 生图工作区在 mmh3 引擎下的编辑模式按能力降级处理（§7）。

#### Scenario: mmh3 生图入库

mmh3 引擎下 1024×1024/6 步生图完成：PNG 落地本地 outputDirectory、登记 `GenerationJob`（`provider: 'h3image'`、`engineId: 'mmh3'`）、媒体库可见可删除，与 ComfyUI 生图条目同构。

### 6. 任务生命周期（mmh3 任务）

mmh3 任务的进度、排队与终止语义：

- **进度**：主进程轮询任务（`GET /v1/generations/{id}`，秒级间隔）并推给渲染进程；`step/steps` 映射为现有进度条语义；`step_seconds` 用于剩余时间估算（§16）；实时预览帧不可用，预览区显示步进进度 + 完成后的首帧静帧（下载后取首帧或直接显示产物）。
- **排队**：提交即入 mmh3 服务端队列；任务卡片显示「排队中（前面还有 N 个）」（N 由 `GET /v1/generations` 列表推导；`role="status"`，状态变化播报一次、不高频刷新）。引擎的 `generating` 在取消受理瞬间即变 null，新任务可立即提交并排在收尾的当前步之后。
- **真中断**：取消按钮对运行中/排队中的任务调用 `POST /v1/generations/{id}/interrupt`（§13）：受理返回 202 与任务 JSON，卡片显示「正在停止（当前步跑完后生效）」；引擎状态 `cancelling` 表示已受理、正在跑完当前步（768p 一步约 14s），`cancelled` 为终态（`error` 为 `cancelled by the client`）。终态为 `cancelled` 的任务**产物不落库**、远端副本按既有清理路径处置。
- **软取消降级**：引擎不支持 interrupt（常驻实例仍是旧构建，端点返回 404/405）时，沿用既有软取消路径与文案「mmh3 无法中断，仍在占用 GPU；产物会被丢弃，不会入库。」；任务在服务端跑完后丢弃产物、不登记入库；对服务端不发 DELETE（running 任务 DELETE 返回 409，不做无效调用——仅在产物下载完成或任务终态后清理）。界面不出现原始 HTTP 错误文案。
- **取消竞态顺序**：取消标记只在产物下载开始前可置；下载已开始则等下载完成，随后丢弃本地文件（含 `.part`）并 DELETE 远端；终态由单一状态路径推进，不出现悬挂中间态。
- **失败**：任务失败为终态，错误信息原样呈现并附修复指引；**不自动回落 ComfyUI**，不自动重试。提交阶段的超时/传输错误呈现为带修复指引的失败文案，不裸露底层 `TypeError: fetch failed`（R2 修补）。
- **队列历史**：mmh3 任务与 ComfyUI 任务在同一队列/历史中混排，`engineId` 缺省即 ComfyUI；持久化读写容忍无该字段的旧记录。
- **重启恢复**：应用重启时，仍在 queued/running 的 mmh3 作业标记为「已中断」（终态失败变体，注明原因），不悬挂、不自动重提（mmh3 任务 id 跨服务重启失效）。**孤儿清理**：启动时（mmh3 引擎已配置）best-effort `GET /v1/generations` 列出远端任务，已终态的未知任务直接 DELETE；running 的留待结束后由下次启动收走；清理失败只记录告警，不阻塞启动。

#### Scenario: 排队可见

在 mmh3 已有一个 running 任务时再提交一个：第二个任务卡片显示排队位置；第一个完成后第二个自动开始并正常完成。排队状态以 `role="status"` 呈现并在状态变化时播报一次，不高频刷新。

#### Scenario: 真中断不落库（验收：A1、A2、A3）

mmh3 任务运行中点取消：卡片转「正在停止（当前步跑完后生效）」，引擎进入 `cancelling` 后转 `cancelled` 终态；服务端完成后媒体库**不**出现该产物，远端副本被清理。若取消落在最后一步之后、引擎已返回 `done`，卡片显示完成并保留产物入库——不谎报取消成功。排队中的任务被取消时直接 `cancelled`、不起跑、不占 GPU。

#### Scenario: 旧引擎软取消降级（验收：A4）

对不支持 interrupt 的实例点取消：卡片转取消态并出现「mmh3 无法中断，仍在占用 GPU」提示；服务端完成后媒体库不出现该产物，远端副本被清理；界面不出现原始 HTTP 错误文案。

### 7. 能力降级

对 mmh3 任务，以下 ComfyUI 专属能力在 UI 中**禁用并标注原因**（非隐藏）：

实时预览帧、生成中精修/续改、H3 放大、LTX 放大、RTX 放大、运镜续接（凡以 mmh3 产物为输入的 ComfyUI 后处理链入口）。标注文案说明「该能力依赖 ComfyUI 渲染管线」。以 mmh3 产物为输入的**新** ComfyUI 任务不受限（可正常把 mmh3 产物当参考图/首帧提交给 ComfyUI 任务）。

#### Scenario: 降级标注

mmh3 任务的卡片与详情不出现「放大」等操作入口，原入口位置显示禁用态与原因 tooltip（禁用态与原因以 `role="status"` 呈现，仅在状态变化时播报）；同一产物拖入 ComfyUI 引擎的 H3 任务作首帧则正常可用。

### 8. 产物落地与媒体库

- mmh3 任务完成后，主进程 `GET /v1/generations/{id}/video|image` 流式下载到本地 `outputDirectory`（先写 `<name>.part`，完成后原子 rename 为正式文件名，沿用 atomicFile 模式；文件名沿用现有留存命名规则，带 `mmh3` 前缀或等价标识），**下载成功后才写 `outputUrl` 并登记 job**；随后 `DELETE /v1/generations/{id}` 清理远端副本与上传暂存。被取消的任务不落库；引擎对已取消任务的产品端点返回 409，应用按既有终态路径处理。
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
| G1 | 非 H3 提交点（LTX 2.3/2.5、Ripple、ACE-Step、Music 3、Z-Image、FireRed、BiRefNet、诊断、基准等全部 `submitPrompt` 调用）静态扫描仍传 `settings.comfyUrl`/现有 ComfyUI 通道 | A14 |
| G2 | `useLivePreview` 的 WS URL 仍由 `comfyUrl` 推导，未引用 engines[] | A14（**仅门禁覆盖，无独立验收项**） |
| G3 | `comfy:*` IPC 通道集合与 preload 方法名只增不改（不删除、不改签名）；共享模块无行为分支改动 | A14 |
| G4 | H3 三处分派点（App 的 H3 主生成、App 的角色身份图、H3ImageWorkspace 生图）存在引擎分派结构——**按结构匹配（导出函数/调用形态），不使用行号**，避免重构移动行号导致门禁失效 | A14 |
| G5 | `mmh3Recipe` 纯函数对 off/Turbo4/Turbo8/fast/PDMD 五档 + 生图的输出字段快照符合 §4/§5 表格（含 turbo8 的 768p 变体、shift 6/3、sol、int8-fp8、sparse-start=0） | A6、A7 |
| G6 | `loadSettings` 白名单含 `engines`、`activeEngineId`；缺省路径返回预置两条目；**写入侧镜像**：设置归一化纯函数（单一保存通道的可测内核）被断言——`comfyUrl` 改为 B 后，返回的 `engines[comfy].baseUrl` 同为 B | A10、A14 |
| G7 | **mmh3 通道只增不改**：既有 8 条 `mmh3:*` 通道的集合与 preload 方法名不变；新增通道（interrupt、recipes 等）只做增量且在 preload、`DesktopApi`、浏览器 mock 三处齐备 | A1、A6、A14 |
| G8 | **任务状态解析不降级新状态**：`cancelling`/`cancelled` 被识别为引擎状态而非回落 `queued`；轮询以 `cancelled`/`done`/`failed` 为终态 | A1、A2 |

现有全部测试套件（`pnpm test`）保持通过；不修改任何现有断言的语义。

#### Scenario: 全量回归绿

`pnpm typecheck && pnpm lint && pnpm test && pnpm build:web` 在本 change 全部改动下通过；`test-engine-routing.cjs` 门禁逐条通过。

### 11. 引擎对比工具（实现顺序末位）

H3 视频工作区提供「双引擎对比」入口：以当前草稿参数分别在两引擎各提交一次（串行，先 ComfyUI 后 mmh3 或按空闲度），完成后并排展示两个产物、各自耗时与引擎/配方徽标。它复用 §4-§8 的全部路径，不新增提交通道；位于实现顺序最后，**验收账本为 A1–A14（唯一）**，对比工具本身不设独立验收项。

### 12. 实机验收（实机执行视角 + 环境前置）

**执行前置（每轮验收先做）**：常驻实例 `systemctl --user is-active mmh3.service mmh3-fast.service` 返回 active，且 `curl -fsS http://127.0.0.1:8888/v1/status` 与 `http://127.0.0.1:8889/v1/status` 均返回 200。**参考环境**：本机 GB10 双实例（与 ComfyUI 同机，systemd user 服务，仅绑回环）。**热态定义**：同一 mmh3 实例在 idle-unload 窗口内已服务过至少一次生成（`/v1/status` 的 `models` 非空）；时效阈值（≤90s / ≤25s）仅对该参考环境与热态有效。

**新契约（真中断、`/v1/recipes`、`weights`、`step_seconds`、keyframe）只存在于新构建**：验收在**临时端口**用新二进制起的实例上进行（如 `:8931`），不替换、不重启 8888/8889 常驻实例；常驻实例用于验证旧引擎降级路径（§6）与兼容性。

**A1–A14 是本 change 的唯一验收账本**；以下六条只是**实机执行视角**的归并视图（每条标注其对应账本编号，不另立编号）：

1. 新二进制临时实例上跑通一次真中断（运行中取消 → `cancelling` → `cancelled`，产物不入库）与一次排队取消。（A1、A2）
2. 取消落在末步之后时如实呈现完成并保留产物；常驻旧实例上取消沿用软取消文案且不裸露 HTTP 错误。（A3、A4）
3. 引擎状态行显示实例实际 DiT 与适配器，指纹注明非完整性校验；实例正忙显示「正忙」。（A5）
4. 档位可用性与缺文件提示来自 `/v1/recipes`；turbo8 在 1344×768 用 768p 变体 + shift 6/3，在 960×544 用 turbo8-544p，其他画布不提供 turbo8。（A6、A7）
5. mmh3 任务进度显示按 `step_seconds × 剩余步数` 估算的剩余时间；多锚点提交被引擎正确锚定（实机抽帧核对）。（A8、A9）
6. 设置页可增删自定义引擎条目；切换引擎重置不适用参数；重启后引擎选择保持；提交超时有修复指引文案；`pnpm typecheck && pnpm lint && pnpm test && pnpm build:web` 全绿且门禁逐条 PASS。（A10–A14）

### 13. 真中断与取消（E1）

新增 `mmh3:interrupt` IPC 通道（**既有 8 条 `mmh3:*` 只增不改**）→ 主进程 `POST {base}/v1/generations/{id}/interrupt`：

- **受理语义**：202 返回任务 JSON；任务已处于终态（`done`/`failed`/`cancelled`）时返回 409——应用据此判定「已结束，无需中断」，不弹错误、不重试。
- **状态语义**：引擎新增两个状态——`cancelling`（已受理停止、正在跑完当前步）与 `cancelled`（终态）。取消任务的 `error` 为 `cancelled by the client`；**state 即机器可读原因**，在引擎侧落地原因分类字段前不另设 reason 字段。
- **应用映射**：`cancelling` → 任务卡片状态行「正在停止（当前步跑完后生效）」（`role="status"`，状态变化时播报一次）；`cancelled` → 终态取消，产物不落库。
- **排队任务**：被 interrupt 的排队任务直接 `cancelled`，**从不起跑**，不占 GPU。
- **末步窗口**：最后一步之后（VAE 解码/写盘阶段）的 interrupt 来不及，任务照常 `done`——取消按钮在该窗口内可能得到完成而非取消，应用据此如实呈现完成并保留产物。
- **产物语义**：取消任务不落任何产物（远端任务目录为空）；应用请求其产物端点会得到 409「that generation was cancelled」，按既有终态路径处理。
- **状态轮询**：`/v1/status` 新增 `cancelling` 字段（任务 id 或 null）；`generating` 在停止受理的瞬间即变 null（实测 <1s），新任务可立即提交并排在收尾的当前步之后。
- **适用范围**：视频（`/v1/generations`）与生图（`/v1/images`）任务都可中断。
- **降级**：引擎不支持该端点（404/405）时走 §6 的软取消路径；不把原始 HTTP 错误透给用户。

### 14. 配方以服务端为准（E2）

新增 `mmh3:recipes` IPC 通道 → 主进程 `GET {base}/v1/recipes`，响应 `{"recipes":[…]}`，九条：`fasth3`/`pdmd`/`turbo`/`turbo8`/`turbo8-544p`/`taomate`/`dmad`/`ref2va`/`base`。

- **字段即表单**：每条配方的 `options` **键名即 `POST /v1/generations` 的表单字段名**，值可原样拷进请求；应用据此提交，不再手抄字段（既往 PDMD 档漏发 `attention-precision` 一类分歧由服务端配方根治）。
- **可用性**：`available` 判定该配方**自身**所需文件（DiT + patch/LoRA；文本编码器与 VAE 为全机共享，不重复计入）是否齐备；`missing` 列出缺失文件名。`available=false` 的档位在选择器显示「模型缺失」并指名缺哪个文件、**不可提交**，其余档位正常。
- **画布约束**：`canvas` 仅对受训约束的配方给出（`turbo`/`turbo8`/`ref2va` = 1344×768；`turbo8-544p` = 960×544），并附「shift 与画布配对」的注记——画布与 shift 必须成对换。
- **配方专属注记**：`ref2va` 的 DiT 由请求携带 `reference`/`reference-audio`/`reference-video` 字段触发切换；`taomate` 用 `schedule` 而非 `steps`，且 `lora-mode` 必须保持 `adapter`。
- **服务端优先**：引擎可达时，档位选项、可用性与画布约束以服务端配方为准；引擎不可达时回落到应用内置的本地配方常量，并在状态行标注「未连接引擎，按本地配方显示」。
- **用户侧不暴露采样器**：服务端默认 euler + uniform + shift 12/3 即官方管线等价物。

### 15. 实例实际权重与双实例分辨（E12/E10）

`/v1/status` 顶层新增 `weights` 数组（与 `models` 同一口气返回，均为数组）：

```ts
type Mmh3Weight = {
  kind: 'text_encoder' | 'video_vae' | 'image_vae' | 'audio_vae' | 'latent_upscaler' | 'dit'
  file: string      // 实际读入的文件名（basename）
  bytes: number
  digest: string    // 16 位十六进制
}
```

- `dit` 条目额外带 `adapters: [{ file, bytes, digest, strength, mode }]`，按施加顺序列出它穿戴的 patch/LoRA；`mode` 为 `adapter` 或 `merge`。
- **指纹不是校验和**：digest 是「safetensors 布局 + 抽样权重」的 64 位哈希，足以区分同架构的两个微调，但**不说明某个文件完好**。界面以「实例口径指纹」呈现并注明非完整性校验，**不得**展示为完整性校验结果。
- **正忙语义**：运行中 DiT 被 run 借走时，`models` 与 `weights` **都不含 dit** 条目；文件未被本进程读过时该条目不命名文件。采样权重的时机避开 `generating`/`cancelling` 中的时刻；缺失 dit 条目按「正忙」呈现，**不**按「异常」或「模型缺失」呈现。
- **双实例分辨**：慢档/快档是两个端口而非一个服务器换权重——客户端用 `/v1/status` 的 `weights` 与 `/v1/recipes` 判别两实例各自持有的权重与配方；应用不发送任何机器级模型选项。

### 16. 进度 ETA（E14）

- 任务 JSON 与 SSE 事件新增 `step_seconds`：刚完成那一步的耗时秒数（已剔除 draft 放大时间）；**顶层 `seconds` 仍是任务总时长**（结束后才有值），二者语义不同、不可混用。
- 应用侧剩余时间估算 = `step_seconds × 剩余步数`（本机 GB10 768p 每步约 14s 量级）。
- `step_seconds` 缺失（首步未完成、或旧引擎不返回该字段）时退回既有展示，**不显示错误值、不显示 NaN**。
- 剩余时间随既有进度节奏刷新，不作为高频状态播报项（`role="status"` 只在状态变化时播报一次）。

### 17. 多锚点引导（E6）

`POST /v1/generations` 新增两个可重复请求字段：

- `keyframe`：文件字段（与 `first-frame` 同类，上传后落到任务目录），可重复。
- `frame-index`：文本字段，可重复；第 i 个 `frame-index` 属于第 i 个 `keyframe`，取值 0 到 `frames-1`。

约束（服务端在 run 启动时校验，错误原因进任务 `error`）：

- 键值对数量必须相等（文案 "pass one --frame-index for every --keyframe, in the same order"）；不得越界（"past the N frames"）；任意两个锚点不得锚同一帧（"distinct --frame-index"）。
- `keyframe` 与 `first-frame`/`last-frame` **互斥**（锚点自带锚点，含 0 与末帧——first/last 语义可用 `keyframe` + `frame-index` 0/`frames-1` 完整表达）；与 reference 系互斥（沿用既有 keyframe 家族约束）；与 draft-steps 的互斥不变。
- 无 `width`/`height` 时**第一个锚点定画布**（与 `first-frame` 现行为一致）；第一张拉伸铺满、其余 cover 居中裁剪。
- prompt 按出现顺序称 `<Picture 1..n>`，对齐行写各自秒数（`frame/24`，如 124 帧视频的第 60 帧 = 2.50s）。

**应用侧**（H3 视频提交区）：

- 新增「多锚点」模式：按帧序号添加多张锚点图；界面显示每个锚点对应的秒数，并提示 prompt 中按 `<Picture 1..n>` 与秒数对齐书写。
- 选该模式后首帧/尾帧入口**禁用并说明原因**（与引擎侧的互斥约束一致），reference 系同理。
- 提交时 multipart 带成对的 `keyframe`/`frame-index`；**不合法组合由引擎在 run 启动时 fail**，应用呈现引擎给出的错误文案（不自行重复校验导致口径分叉）。

### 18. 应用侧收窄项修补

- **引擎增删**（§1、§2）：设置页可新增/删除自定义 mmh3 引擎条目；预置条目不可删；删除前二次确认；删除后若影响当前选择则回落默认引擎。
- **切换引擎参数重置**（§3）：从 mmh3 切到 ComfyUI（或反之）时，不适用于新引擎的档位与参数**重置为该引擎默认值**，并明示改了什么；不带着旧引擎的参数提交。
- **提交失败文案**（R2）：提交阶段的超时/传输错误呈现为带修复指引的失败文案（如「mmh3 提交超时：引擎正在换载权重，请稍后重试或查看引擎日志」），不裸露底层 `TypeError: fetch failed`。
- **工作区引擎记忆跨重启**（R3）：工作区级引擎选择在应用重启后恢复为上次选择，首屏不闪 ComfyUI。

## 约束

- 渲染进程不得新增任何 Node/filesystem/network 直连——mmh3 一切网络与文件操作在主进程 `electron/mmh3Api.ts`，经 preload 白名单暴露。
- mmh3 网络防呆（参照 `electron/lmStudioApi.ts` 范式）：仅允许 http/https 端点；提交 15s / 轮询 5s 超时；下载流式且大小上限 8GiB；`.part` + 原子 rename 落盘；配置错误不得拖垮主进程。
- 既有 `mmh3:*` IPC 通道**只增不改**（引擎仓 §12.4）；新增能力一律走新增通道，不改既有通道签名。
- 「非 H3 零变化」是行为级不变量：共享模块（`jobPersistence`、`LibraryView`、App shell）只允许向后兼容读取与纯增量展示（徽标），不改现有行为分支；G1/G3 门禁静态断言。
- 复用现有 UI primitive、主题 token、CSS 分层规则；新样式放 H3 特性邻近文件。
- 实时状态遵循 `role="status"`/`aria-live="polite"` 约定，不播报高频步进计时。
- 存储读取容忍旧 shape（设置、jobs、localStorage 三处）。
- `AGENTS.md` 的范围与工作协议适用；模块边界变化同步 `docs/app-module-map.md`。
