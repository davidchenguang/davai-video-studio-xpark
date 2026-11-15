# H3-Image 档位设计决策记录

> 日期：2026-11-15。本文记录「图片 · H3-Image」双档位（专用模型 / 视频同款）重设计的决策与理由，供后续会话与贡献者追溯。实现见 `src/lib/h3Image.ts`、`src/components/H3ImageWorkspace.tsx`；外部调研依据见 `docs/h3-image-tiers-research.md`；实测基线见 `docs/image-model-research.md`（bench5）。

## 背景与问题

工作区原有两个平级单选档位：`dedicated`（MiniMax 官方 H3-Image 图像 DiT，6 步蒸馏）与 `fl2va`（复用 H3 视频 DiT + 8 步 Turbo LoRA 出静帧）。用户调研与对抗性审查暴露的问题：

1. 档位本质是「机器装了哪套权重」的兼容回退，却被呈现为平级的创作选择，且未说明取舍（fl2va 经视频 VAE 解码单帧可能偏软）。
2. 步数控件（4–12）与官方固定配方冲突（官方 API 对非 6 步/非 CFG 1 直接返回 400）。
3. 静态署名「由 MiniMax-H3-Image 生成」在 fl2va 出图时不成立（许可署名义务绑定实际使用的权重）。
4. 4K 画幅两档共用，但视频模型原生仅 768p 级，选 4K 只是烧时间与显存。
5. 编辑能力：官方 H3-Image 支持编辑/16 参考图，但 bench5 实测本地图编辑失败（白页乱码），编辑已归 FireRed。

## 决策清单

| # | 决策 | 结论 |
|---|---|---|
| 1 | 档位定位 | 自动选档 + 高级手动覆盖；不作为主界面创作选择 |
| 2 | 专用模型步数 | 锁定官方 6 步，移除步数输入 |
| 3 | 编辑/参考图 | 不做；编辑归 FireRed，待上游修复或专项实验后重评 |
| 4 | 自动选档规则 | `专用（资产+0.45 节点）> 视频同款（资产齐全）> 专用安装引导` |
| 5 | 手动覆盖 | 独立持久化（`tierOverride: null \| 'dedicated' \| 'fl2va'`）；可用即尊重；不可用静默回退自动，不丢弃覆盖值 |
| 6 | 入口与状态 | radio 移入「模型组件 · 高级」（图例「模型来源」）；主面板只读状态行 +「在高级选项中切换」 |
| 7 | 档位文案 | 专用=「官方 6 步 · 原生 16MP · 更快」；视频同款=「兼容」徽标 + 明示单帧解码偏软 |
| 8 | 视频同款步数 | 锁定 8 步；不加 Turbo 强度旋钮（社区 20–50 步/降强度配方未在本仓验证） |
| 9 | 署名 | 动态：专用→「由 MiniMax-H3-Image 生成」；视频同款→「由 MiniMax H3 视频模型生成」 |
| 10 | 分辨率门禁 | 4096 档仅专用；fl2va 上限 2048 |
| 11 | 名称与迁移 | 导航/页头保持「图片 · H3-Image」；旧 `tier` 值一律迁移为显式覆盖 |

## 对抗性审查补充（A1–A4）

审查文件原在临时目录，要点固化于此：

- **A1 署名绑定快照**：`tier` 并入 job/result 快照（同 `resolution` 先例），署名跟随 `result.tier`。否则生成后切档会把旧图标成新档位模型。
- **A2 收敛覆盖启动**：`clampH3ImageResolution` 不只用于手动切换，auto 翻档（含启动恢复）同样执行；`RenderSize` 对表外值防御渲染（「非预设档位」option），不依赖上游时序。原发场景：存储 4096 画幅 + 启动自动落在 fl2va → select 空白。
- **A3 瞬时/稳定信号**：引擎断连/重启后 `info` 短暂为空，auto 若用空信号重估会把专用误判为未就绪并连锁触发不可逆画幅降级。busy 期间冻结解析（继承 `switchTier` 的 busy 守卫）；仅 `connected && signals.models.length > 0` 时重估；离线时状态行「引擎离线」优先。
- **A4 判定源统一**：徽标/状态行/生成门禁/auto 四处共用 `h3ImageTierReady`（object_info choices + `hasInput(0.45 节点)`），替代原先三套不一致的判定（regex 徽标、精确列表门禁、h3ImageStackReport）。

实现细节默认值（已采纳）：切到 fl2va 时超限画幅自动收敛到同比例最近档并提示，切回不恢复 4K；`steps` 不再写入存储；收敛逻辑抽为 `h3Image.ts` 纯函数供单测。

## 明确不做

- 不扩展编辑/参考图（bench5 失败，归 FireRed）；不加 Turbo 强度控制；不做「H3-Image 首帧 vs 视频模型首帧喂 H3 视频」A/B（`docs/image-model-research.md` 风险清单第 5 条，独立后续）；不改工作区名称；不动 Z-Image 定位。

## 已知遗留

- Electron 五状态实测（仅专用/仅视频/双装/双缺/ComfyUI<0.45）+ busy 中断连未做，需连真实引擎。
- `docs/image-model-research.md` 称 fl2va 路径出自「官方 image_*_t2i 模板子图」，与外部一手来源（官方图像模板仅 0.45+ 的 H3-Image T2I/Edit）关系未澄清，沿用「官方」措辞前需确认。
- `pnpm test` 的 locale audit 在 main 基线上即 FAIL（47 处），与本次无关。
