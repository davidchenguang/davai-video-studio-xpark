# 目标

修复 mmh3 引擎状态行在真实使用中的两个缺陷（2026-11-19 Electron 实机冒烟坐实）：

1. **误报正忙**：判忙把「`weights` 里没有 dit 条目」也算忙。引擎带 `--idle-unload`，空闲卸载模型后 `weights` 为空数组或缺 dit，必然误判——界面显示「● 正忙 · mmh3 正在生成（队列 0 个）」，而引擎实际空闲（`generating=null`、`queued=0`）。正忙应由 `generating`/`cancelling` 非空判定；`weights` 只用于展示实际权重。
2. **状态定格**：健康检查只在工作区挂载与引擎列表变化时触发，从不周期刷新。一次误判会永久显示，直到用户重新进入工作区；真实生成期间状态行同样不会更新（用户既可能看到「就绪」其实在生成，也可能看到「正忙」其实空闲）。改为温和的定期刷新（间隔 15s），保留「不做高频轮询」的初衷。

同时把档位配对通知文案抽成可测函数并补门禁，使「空闲不判忙」与「档位文案」两类行为以后能被自动拦住（此前同类问题只能靠人工发现）。

来源：change `mmh3-544p-notice-wording` 第 2 轮验收登记的风险第 3 条（空闲 `--idle-unload` 实例 `weights: []` 被判忙），经 2026-11-19 Electron 实机冒烟（`davai-video-studio-verify-w1` 同源方法）在真实界面上复现并坐实；用户确认后开本 change。

# 范围

## 目录结构

### 新建

- src/lib/engine/mmh3Notice.ts — 档位-画布配对通知文案的纯函数（按 wanted tier 与实际解析出的 tier 返回文案），供 App.tsx 调用与门禁断言。
- scripts/test-engine-status.cjs — 门禁套件：判忙语义（空闲/生成中/取消中/权重为空）与档位通知文案断言。

### 修改

- src/lib/engine/engineHealth.ts — 正忙判定改为只看 `generating`/`cancelling`；空闲且未驻留权重时状态为就绪并在状态行说明原因；新增健康刷新间隔常量。
- src/lib/engine/useEngineSelection.ts — 按间隔定时重查引擎健康状态（组件挂载期间），使状态行不再定格。
- src/App.tsx — 通知分支改为调用 `mmh3Notice` 的纯函数（文案语义不变，仍是「如实描述配对结果」）。
- scripts/test-engine-routing.cjs — 门禁随判忙语义调整（原 G 断言如与新语义冲突则更新断言口径）。
- docs/locale/keep-english.md — 若新增豁免条目则登记。

### 明确不建

- 不改引擎侧任何行为（`--idle-unload`、`/v1/status` 语义都不动）。
- 不改档位可用性、缺失提示与画布约束逻辑（已在上一 change 验收通过）。
- 不做秒级轮询、不做 WebSocket 推送式健康更新；间隔固定 15s，仅在工作区挂载期间。
- `/v1/recipes` 2026-11-19 新增的顶层 `dit` 与每配方 `reason` 字段：本 change 只把契约文档补进 Spec（§14，解析已逐字段容忍、应用不受影响），`reason` 的界面展示与 `dit` 的徽标运用留给后续 change。

## Source coverage

| 来源条目与位置 | 读取状态 | 需要保留的内容 | Spec 位置 | 验收 ID | 覆盖状态 | 理由或替代关系 |
| --- | --- | --- | --- | --- | --- | --- |
| S1：`mmh3-544p-notice-wording` 第 2 轮验收报告 risks 第 3 条（空闲 `--idle-unload` 实例 `/v1/status` 返回 `weights: []`，`engineHealth.ts:82` 以「weights 非 null 且无 dit」判忙 → 误报「正忙」） | complete | 判忙依据改为 `generating`/`cancelling` | specs/mmh3-engine-integration/spec.md 状态语义段（正忙语义、徽标状态、实际权重展示） | A1、A2、A3 | covered | 当前有效需求 |
| S2：项目记忆「mmh3 状态行会定格在误报的『正忙』」（memo-3458a4b6）成因②（健康快照 never on a timer，一次误判永久定格，2026-11-19 冒烟中 11:08:57 重新进入工作区才恢复） | complete | 健康检查需温和定期刷新 | specs/mmh3-engine-integration/spec.md 预检刷新时机段 | A4 | covered | 当前有效需求 |
| S3：2026-11-19 Electron 实机冒烟实测（状态行「● 正忙 · mmh3 正在生成（队列 0 个）」而 8888 `generating=null`；重新进入工作区后恢复「● 就绪」并显示 dit 与 turbo8 768p LoRA 指纹） | complete | 判忙与刷新两条行为的真实界面证据 | specs/mmh3-engine-integration/spec.md 相关场景 | A1、A2、A4 | covered | 当前有效需求 |
| S4：上一 change 已验收的档位通知文案语义（配对到 turbo8-544p 如实说明；未配对画布回退标准配方不写死步数）+ 该轮验收 risks 第 1 条（通知文案无自动化门禁） | complete | 文案语义不变，仅改为可测函数并补门禁 | specs/mmh3-engine-integration/spec.md 画布与档位配对段 | A5、A6 | covered | 行为沿用，新增可测性要求 |

# 非目标

- 不改引擎侧契约（`/v1/status` 的 `weights` 语义、`--idle-unload` 行为）。
- 不改引擎选择器、徽标集合与状态行版式（仅状态取值与文案语义）。
- 不引入新的状态枚举值（如「空闲未驻留权重」独立态）——复用「就绪」并在状态行说明原因。
- 不改其它工作区（ComfyUI 路径的健康检查行为不变）。

# 验收示例

- A1：引擎空闲（`generating=null`、`cancelling=null`）且 `/v1/status` 的 `weights` 为空数组或不含 dit：状态徽标为「● 就绪」，状态行说明实例当前未驻留权重（空闲已卸载），**不得**出现「正在生成」或「正忙」。fast 实例（`fastBaseUrl`）同一口径。
- A2：引擎正在生成（`generating` 非空）：状态徽标为「● 正忙」，状态行说明正在生成。
- A3：引擎已受理停止（`cancelling` 非空、`generating` 为空）：状态徽标为「● 正忙」，状态行说明「已受理停止，跑完当前步即停」。
- A4：健康状态随引擎实际状态变化而更新：引擎从空闲变为占用、或从占用变为空闲后，状态行在 ≤30 秒内反映新状态，无需重新进入工作区或手动刷新。定时复查**静默进行**（不置 checking、不禁用引擎下拉、不显示 spinner）；「检查于 HH:MM:SS」时间戳不进 `aria-live` 播报，复查未改变状态+详情时读屏不重播；`document.hidden` 期间暂停复查。
- A5：档位配对通知文案（可测函数）：960×544 画布 + turbo8 → 文案说明已配对到 turbo8-544p（含 8 步语义），不含「回退」「30 步」；未配对画布（如 1344×576）→ 文案说明已回退到标准配方（引擎默认步数），不含「30 步」。
- A6：门禁套件覆盖上述判忙与文案行为，纳入 `pnpm test` 链（由 scripts 链式调用），使同类回归被自动拦住。
