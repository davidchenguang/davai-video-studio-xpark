# 主题选项设计（墨绿 / 蓝色 / Comfy 黄 / 亮色）

日期：2026-11-12 · 状态：已与需求方逐项确认 · 分支：`theme-options`

## 意图与动机

在设置中新增主题选项，让用户在保留当前墨绿主题的同时，可以选用另外三套配色：

- **蓝色（经典）**：upstream 仓库的原始配色（设计图 `Readmescreenshots/studio-workspace-dark-blue.png`）。
- **Comfy 黄**：comfy.org / ComfyUI 色系（深紫底 `#211927` + 标志黄 `#F2FF59` 强调）。
- **亮色**：浅灰底 + 白面板的完整亮色模式。

动机：个人偏好与使用环境（强光环境需要亮色）；蓝色主题是 upstream 的原生观感，还原成本极低；Comfy 黄与用户日常使用的 ComfyUI 视觉语言一致。

## 目标 / 非目标 / 反目标

**目标**

1. 四个主题覆盖**所有界面**：桌面壳、全部工作区（create/continue/scratchpad/ltx25/ltxripple/photoedit/music/zimage/referenceprep/角色·发型·服装·配饰·场景工作室/queue/library/clipmaster/movie/settings）、电影编辑器独立窗口、LAN 手机伴侣页。
2. 切换**即时生效并持久化**（同 uiScale 先例），无需点「保存设置」。
3. 主窗口与电影编辑器窗口**实时同步**（storage 事件模式）。
4. 手机伴侣页**跟随全局主题**（加载时获取；不做实时推送）。
5. 默认墨绿主题：除已知蓝色残留界面统一为墨绿外，**其余界面无可辨差异**。
6. 亮色主题一次性做完整——不逐屏打补丁。

**非目标**

- 不做「跟随系统」外观模式（需要时日后单独立项）。
- 不做每设备独立主题。
- 不做用户自定义色板 / 主题编辑器。
- 不重排现有 CSS 级联、不拆除 `!important` 覆盖体系（方案 B 已否决）。
- 不改动任何布局规则——本设计只改**颜色的来源**（硬编码 → 变量）与变量值。

**反目标（出现即算失败）**

- 墨绿主题出现清单之外的任何可辨视觉变化。
- 亮色主题下媒体预览区变亮（见「豁免清单」）。
- 遗留文件里留下「半换」状态：硬编码色要么改成 `var()` 引用，要么进入豁免清单并有注释说明，不允许第三种状态。

## 方案（已选定 A）

- **A. `data-theme` 属性 + 覆盖层扩展（选定）**。墨绿主题的现役实现本来就是 `studio-refresh.css` 的一层 `!important` 变量覆盖，且 `tokens.css` 至今保留 upstream 蓝色的原始变量值。顺着这个现成机制：`<html data-theme="blue|comfy|light">` 切换；绿主题保持现状零改动；新增 `src/styles/themes.css` 以同强度（`!important` + 更高特异性 `:root[data-theme="…"]`）定义另外三个主题的覆盖块，import 顺序放在 `studio-refresh.css` **之后**。同时把约 20 个遗留样式文件里的硬编码深色改写为 `var()` 引用——这是亮色主题完整性的前提，也是唯一触碰遗留文件的动作。
- **B. 全量 token 重构（否决）**：终态最干净，但要重排整个级联，墨绿观感的回归验证成本与「保留当前主题」目标正面冲突。
- **C. 亮色逐屏补丁（否决）**：不碰遗留文件最省事，但补丁无限膨胀且永远追着硬编码色跑，与「一次做完整」相悖。

## 约束

- **级联顺序不可变**：`src/styles.css` 的 import 顺序、`src/main.tsx` 的 import 顺序保持不变；`themes.css` 只允许追加到 `studio-refresh.css` 之后（`src/styles/README.md` 同步更新）。
- **渲染器零特权**：纯 CSS/设置变更，不涉及文件、进程、网络特权操作（LAN 端点除外，见下）。
- **设置读取端容忍旧形状**：已存在的设置 JSON 没有 `theme` 字段 → 视为墨绿；非法值回落墨绿。
- **持久化走 AppSettings JSON 原子写入**（现有 `electron/atomicFile.ts` 路径，`loadSettings`/`saveSettings` 既有校验模式）。
- **本地化**：新增设置文案需进 zh-CN 文案层（`pnpm test:locale` 守护）。
- 验证命令：`pnpm typecheck && pnpm lint && pnpm test && pnpm build:web`。

## 已定决策（与需求方逐项确认）

| # | 决策 |
|---|------|
| D1 | 架构选 A：`data-theme` + 覆盖层，绿主题零改动，遗留文件做「硬编码色 → var()」机械清理 |
| D2 | 切换即时生效并持久化（同 uiScale 先例，不依赖「保存设置」按钮） |
| D3 | 控件形态：`FormFields` 的 `SelectField` 下拉，放在「显示与操作」区（`settings-display`），uiScale 旁边 |
| D4 | Comfy 黄 = 深紫底 `#211927` + 黄强调 `#F2FF59`（comfy.org 实测主色），不是黄色浅底 |
| D5 | 亮色强调色 = 加深品牌绿（`#3e7a1e` 一档，保品牌血缘；具体值实现者按 AA 对比度微调） |
| D6 | 墨绿回归标准 = 逐屏截图对比无可辨差异；例外 = 已知蓝色残留界面墨绿化（见豁免与例外清单） |
| D7 | 媒体预览区在亮色主题下保持深色（色彩判断环境不随主题） |
| D8 | 下拉文案：「墨绿（默认）／蓝色（经典）／Comfy 黄／亮色」 |
| D9 | 交付：`theme-options` 分支分段提交（机制 → 清理 → 三主题 → 验证），完成后停下等需求方逐屏验收，不自行合并 |
| D12 | 蓝色残留界面**顺手完成墨绿化**（scene-composer 系的旧蓝面板/按钮、production-workspace 里的蓝绿混杂归一为墨绿）；这是墨绿主题唯一允许的可见变化 |
| D13 | 不加「跟随系统」选项 |
| D14 | 手机页跟随全局主题 |

## 实现者拍板的技术默认（需求方已知情，可否决）

- **设置字段**：`AppSettings` 新增 `theme: 'green' | 'blue' | 'comfy' | 'light'`（`src/types.ts` 与 `electron/main.ts` 两处类型同步）；`loadSettings` 按 uiScale 的既有模式做白名单校验，缺省/非法回落 `'green'`；`browserMock.ts` 的默认设置补 `theme: 'green'`。
- **应用点**：主题值 → `document.documentElement.dataset.theme`。应用方：`App.tsx`（桌面）、`MovieEditorWindow.tsx`（独立窗口）、`MobileApp.tsx`（手机页）。`data-theme="green"` 时不写属性或写属性均可，但 CSS 不为 green 定义覆盖块（现状即绿）。
- **跨窗口实时同步**：主题值镜像写入 `localStorage` 键（如 `minimax.theme`），`MovieEditorWindow` 监听 `storage` 事件实时应用——复用 `MOVIE_HANDOFF_KEY` 的现成模式。
- **手机页获取主题**：LAN 服务器（`electron/main.ts` 的 `/api/lan/*`，走既有 token 鉴权）新增一个小端点（如 `GET /api/lan/appearance` → `{ theme }`），`MobileApp` 加载时拉取并应用；刷新后生效，不做实时推送。
- **color-scheme**：每主题声明 `color-scheme`（三个深色主题 `dark`、亮色 `light`），让原生滚动条、表单控件、`<select>` 弹层跟随主题。
- **语义色**：`--oy-success/--oy-warning/--oy-danger` 及对应语义变量仅在对比度不达标的主题中调整（预判：亮色主题的 warning 黄需要加深）。
- **对比度**：文本对比度按 WCAG AA 把关（正文 ≥ 4.5:1，大字/非文本 ≥ 3:1）。
- **窗口底色**：亮色主题下 BrowserWindow 的原生背景色是否跟随（影响启动闪烁），实现者可自行决定并验证。

## 主题色板基准

| 主题 | 底色 | 面板 | 强调 | 来源 |
|------|------|------|------|------|
| 墨绿（默认） | `#0c100e` | `#171d19` 系 | `#c4f878` | 现状（`studio-refresh.css`），不动 |
| 蓝色（经典） | `#0e1419` | `#151d23` 系 | `#249cf1` | `tokens.css` 保留的 upstream 原值（基本零成本还原） |
| Comfy 黄 | `#211927` | 深紫灰阶（实现者衍生） | `#F2FF59` | comfy.org 实测 |
| 亮色 | `#f4f6f8` | `#ffffff` 凸起 | 深绿 `#3e7a1e` 档 | 本设计新造 |

灰阶体系（border/hover/selected/muted 等）实现者按各主题底色衍生，过 AA 对比度。

## 豁免与例外清单

- **媒体预览区保持深色**（所有主题，含亮色）：视频/图片预览列、Live Preview 画面底、剪辑台监看区、剧照/帧对比区——半透明黑底或近黑面板是色彩判断环境，不随主题变。实现者在清理时圈定这些选择器并显式注释豁免原因（对应反目标里的「不允许第三种状态」）。
- **墨绿主题的可见变化仅限 D12**：scene-composer 系旧蓝面板/按钮、production-workspace 蓝绿混杂归一为墨绿。验收清单中逐条列明这些界面，供需求方核验。

## 验收（Build 完成后、交需求方逐屏验收前）

1. `pnpm typecheck && pnpm lint && pnpm test && pnpm build:web` 全绿。
2. **墨绿回归**：清理前后逐屏截图对比（主界面 + 全部工作区 + 电影编辑器窗口 + 手机页），除 D12 例外清单外无可辨差异。截图工具可用 `pnpm test:ui-e2e` 的 CDP 路径或 `/tmp/oyama-cdp/drive.cjs` 驱动真实渲染进程。
3. **四主题走查**：每个主题下检查空态、加载态、成功态、失败态、禁用态（CLAUDE.md 的 UI 验证要求），重点：下拉即时生效、电影编辑器实时同步、手机页加载后主题正确、亮色下预览区仍深、`select`/滚动条等原生控件跟随 `color-scheme`。
4. 最小布局与典型桌面尺寸两档走查（CLAUDE.md 要求）。

## 交付顺序（分段提交）

1. **机制**：`AppSettings.theme` + 校验 + `data-theme` 应用点 + themes.css 空骨架 + 下拉控件 + storage 同步 + LAN 端点 + README 更新。
2. **清理**：遗留文件硬编码色 → `var()` 机械替换 + 豁免注释 + D12 墨绿化。
3. **三主题**：蓝（upstream 原值）→ Comfy 黄 → 亮色（工作量最大）。
4. **验证**：验收清单执行 + 截图对比记录。
