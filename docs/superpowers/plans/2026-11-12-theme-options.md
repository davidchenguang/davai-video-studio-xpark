# 主题选项（墨绿/蓝色/Comfy 黄/亮色）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在设置中新增四选一主题选项（墨绿默认 / 蓝色经典 / Comfy 黄 / 亮色），全界面覆盖、即时生效、跨窗口与手机页同步。

**Architecture:** `<html data-theme>` 属性 + `src/styles/themes.css` 覆盖层（import 在 `studio-refresh.css` 之后）；遗留 CSS 的硬编码色清理为语义变量（蓝色交互族墨绿化、身份色钉住、预览深底钉住）；主题存 `AppSettings.theme` 随既有 JSON 原子持久化；原生外壳（窗口底色/标题栏 overlay/nativeTheme）经新 IPC 通道联动。

**Tech Stack:** Electron 34（main/preload/renderer 三层）、React 19、纯 CSS 变量体系、`node:assert` 脚本测试（`scripts/test-*.cjs` + ts-loader）。

**Spec:** `docs/superpowers/specs/2026-11-12-theme-options-design.md`（18 项决策 D1-D18 + 评审注记，本计划逐条落实）

## Global Constraints

- 级联顺序不可变：`src/styles.css` 内部 import 顺序、`src/main.tsx` 的 import 顺序均保持；唯一允许的追加是 `themes.css` 于 `studio-refresh.css` 之后。
- 设置读取端容忍旧形状：无 `theme` 字段或非法值 → `'green'`（D13 无跟随系统；不新增第五选项）。
- 本地化：新 UI 文案为内联中文；CJK 与拉丁字母/数字之间必须留空格（`pnpm test:locale` 的空格检查）；存储位（localStorage 键值、设置字段）保持 ASCII。
- 渲染器零特权：不新增文件/进程/网络特权；唯一主进程新增 = LAN 端点 + 主题 IPC（均为既有模式）。
- 每任务验证：`pnpm typecheck && pnpm lint`；任务收尾与交接前加 `pnpm test && pnpm build:web`。
- 本机执行：pnpm 不在 PATH，用绝对路径 `/Users/dawo/.local/share/nodejs/node-v26.12.1-darwin-arm64/bin/pnpm` 或 `PATH` 前缀调用（`pnpm test` 内部再调 pnpm，必须带 PATH 前缀）。worktree 的 Electron dist 已修好，勿重装。
- 提交信息以英文书写，结尾加 `Co-Authored-By: Claude Code <noreply@anthropic.com>`。
- 工作目录：`/Users/dawo/orca/workspaces/Oyama-AI-Video-Studio/theme-options`（分支 `theme-options`）。

## Review Focus

1. **镜像过期**（外部改设置 JSON / 工厂重置清 storage）：`getSettings` 返回后必须覆写 `minimax.theme` 并纠正当前应用值 → Task 2 结构断言 + Task 1 行为测试。
2. **非法/缺失 theme 值**（旧 JSON、手改文件）：`normalizeTheme` 白名单回落 green → Task 1 行为测试（含大小写、空串、undefined）。
3. **亮色渗透预览区**（D7 反目标）：light 块必须显式把 `--preview-*` 钉回深色 → Task 11 结构断言。
4. **LAN 预览 mock 抛错**：`lanFetch` browser-preview 分支对未知路径 throw，`/api/lan/appearance` 必须有 mock 分支 → Task 5 结构断言。
5. **切换前已打开的窗口外壳不联动**（did-create-window 只触发一次）：主进程登记主窗口+电影编辑器窗口，IPC 时逐一应用 → Task 4 结构断言 + Task 12 走查。预览类弹窗按 D7 恒深色，创建时静态给值，不参与运行时联动。

---

### Task 1: 主题域模块与设置管线

**Files:**
- Create: `src/lib/theme.ts`
- Modify: `src/types.ts:79-104`（AppSettings 加字段）
- Modify: `electron/main.ts:54-79`（AppSettings 副本加字段）、`:167` 附近 defaultSettings、`:422` loadSettings 合并返回
- Modify: `src/browserMock.ts:4`（默认设置对象）
- Create: `scripts/test-theme.cjs`；Modify: `package.json`（test 链尾追加 `&& pnpm test:theme`，scripts 加 `"test:theme": "node scripts/test-theme.cjs"`）

**Interfaces:**
- Produces（后续所有任务依赖，名字精确一致）:
  - `type Theme = 'green' | 'blue' | 'comfy' | 'light'`
  - `const THEMES: readonly Theme[]`
  - `const THEME_STORAGE_KEY = 'minimax.theme'`
  - `const THEME_LABELS: Array<[Theme, string]>` = `[['green','墨绿（默认）'],['blue','蓝色（经典）'],['comfy','Comfy 黄'],['light','亮色']]`（D8）
  - `isTheme(value: unknown): value is Theme`；`normalizeTheme(value: unknown): Theme`（非法回落 `'green'`）
  - `applyTheme(target: { dataset: { theme?: string } }, theme: Theme): void`（写 `target.dataset.theme = theme`；green 也写，CSS 无 green 覆盖块）
  - `readThemeMirror(): Theme` / `writeThemeMirror(theme: Theme): void`（localStorage 读写 + normalize）
  - `AppSettings.theme: Theme`（types.ts 与 electron/main.ts 两处）

- [ ] **Step 1: 写失败测试** `scripts/test-theme.cjs`

```js
// 用 scripts/test-ts-loader.cjs 的 load() 转译加载 src/lib/theme.ts（参考 scripts/test-workspace-persistence.cjs 的加载方式）
// 断言：
assert.equal(normalizeTheme('blue'), 'blue')
assert.equal(normalizeTheme(undefined), 'green')
assert.equal(normalizeTheme('BLUE'), 'green')        // 大小写敏感，非法即回落
assert.equal(normalizeTheme(''), 'green')
assert.deepEqual(THEMES, ['green', 'blue', 'comfy', 'light'])
assert.equal(THEME_STORAGE_KEY, 'minimax.theme')
const stub = { dataset: {} }; applyTheme(stub, 'light'); assert.equal(stub.dataset.theme, 'light')
// readThemeMirror/writeThemeMirror 以 { store: {} } 桩对象注入测试（模块允许传入 storage 参数或以最小全局垫片）
```

- [ ] **Step 2: 跑测试确认失败** — Run: `PATH="$HOME/.local/share/nodejs/node-v26.12.1-darwin-arm64/bin:$PATH" pnpm test:theme`，Expected: FAIL（模块不存在）。
- [ ] **Step 3: 实现 `src/lib/theme.ts`** — 纯模块，不 import DOM 类型以外的运行时；`readThemeMirror(storage: Storage = window.localStorage)` 形式注入以便测试。`electron/main.ts`：AppSettings 加 `theme: Theme`（本地重声明 union，不跨树 import），defaultSettings 加 `theme: 'green'`，loadSettings 返回对象加 `theme: normalizeThemeValue(raw.theme)`（main 侧可用简单 includes 白名单）。browserMock 默认设置加 `theme: 'green'`。types.ts 的 `DesktopApi` 加 `setNativeTheme(theme: AppSettings['theme']): Promise<void>`（Task 4 实装；本任务 browserMock 先给 `setNativeTheme: async () => {}` 占位避免类型破口）。
- [ ] **Step 4: 跑测试确认通过 + typecheck** — `pnpm test:theme` PASS；`pnpm typecheck` PASS。
- [ ] **Step 5: Commit** — `git add src/lib/theme.ts src/types.ts electron/main.ts src/browserMock.ts scripts/test-theme.cjs package.json && git commit -m "Add theme domain module and settings plumbing"`

### Task 2: 渲染器应用点、设置下拉、首帧防闪、镜像权威

**Files:**
- Modify: `src/main.tsx`（styles import 后追加 `import './styles/themes.css'`（Task 6 建文件前先建空文件占位）；`createRoot` 前 `applyTheme(document.documentElement, readThemeMirror())`）
- Modify: `src/App.tsx:734`（settings 加载 then 内：`writeThemeMirror(loaded.theme)` + `applyTheme(document.documentElement, loaded.theme)`——镜像权威修正，评审注记第 1 条）
- Modify: `src/App.tsx`（新增 effect：`settings?.theme` 变化 → `applyTheme` + `writeThemeMirror` + `void window.minimax.setNativeTheme(theme)`；注意 App.tsx:747-758 的 250ms 防抖自动保存已覆盖持久化，勿重复 save）
- Modify: `src/components/SettingsView.tsx:246` 附近（settings-display 区、uiScale 控件后）：`<SelectField label="界面主题" value={settings.theme} options={THEME_LABELS} onChange={(theme) => setSettings({ ...settings, theme: theme as Theme })} />`（SelectField 签名见 `src/components/FormFields.tsx:4`：`{ label, value: string, options: Array<[string,string]>, onChange(value: string) }`）

**Interfaces:**
- Consumes: Task 1 全部导出。
- Produces: 切换主题的完整链路（下拉 → setSettings → effect 应用 + IPC）。

- [ ] **Step 1: 失败测试**（追加到 test-theme.cjs，源码结构断言，模式同 locale-audit 的文本扫描）：
  - `src/main.tsx` 中 `themes.css` 的 import 出现在 `studio-refresh.css` 之后；
  - `src/App.tsx` 的 getSettings then 内含 `writeThemeMirror`；
  - `SettingsView.tsx` 含 `label="界面主题"` 且四个选项顺序 = THEME_LABELS。
- [ ] **Step 2: 跑测试确认失败** — `pnpm test:theme`，Expected: FAIL（断言未命中）。
- [ ] **Step 3: 实现** — 按 Files 列表落点修改；`src/styles/themes.css` 先建只含一行注释的空占位。
- [ ] **Step 4: 验证** — `pnpm test:theme` PASS；`pnpm typecheck && pnpm lint && pnpm test:locale` PASS（"Comfy 黄" 的 CJK/拉丁空格合规）。
- [ ] **Step 5: Commit** — `git commit -m "Apply theme at renderer roots with settings dropdown and mirror authority"`

### Task 3: 电影编辑器窗口与弹出小窗同步

**Files:**
- Modify: `src/MovieEditorWindow.tsx:18`（getSettings then 内 `applyTheme` + `writeThemeMirror`）与 `:19-23`（现有 storage 监听旁新增：`event.key === THEME_STORAGE_KEY` → `applyTheme(document.documentElement, normalizeTheme(event.newValue))`）
- Modify: `src/App.tsx:3644`（video preview detach：克隆样式后 `popup.document.documentElement.dataset.theme = document.documentElement.dataset.theme`）、`:3785` 附近（preview popout 同样处理）
- Modify: `src/App.tsx` Task 2 的 theme effect：追加向 `popoutRef.current`/`previewPopoutRef.current`（未 closed 时）直写 `popup.document.documentElement.dataset.theme`（句柄直写为主，评审已确认）

**Interfaces:**
- Consumes: `THEME_STORAGE_KEY`, `applyTheme`, `normalizeTheme`。
- Produces: 三个窗口类（主/电影编辑器/弹窗）主题一致。

- [ ] **Step 1: 失败测试**（test-theme.cjs 追加结构断言）：MovieEditorWindow 源码含 `THEME_STORAGE_KEY` 监听；App.tsx 两处 `window.open` 后均复制 dataset.theme。
- [ ] **Step 2: 确认失败** — `pnpm test:theme` FAIL。
- [ ] **Step 3: 实现**（照 Files 落点）。
- [ ] **Step 4: 验证** — `pnpm test:theme && pnpm typecheck && pnpm lint` PASS。
- [ ] **Step 5: Commit** — `git commit -m "Sync theme to movie editor window and preview popouts"`

### Task 4: 原生外壳值表与 IPC 联动（D17）

**Files:**
- Create: `electron/nativeShellTheme.ts`
- Modify: `electron/main.ts:978-1039`（窗口创建读主题值；978/995 的 `nativeTheme.themeSource = 'dark'` 硬编码删除，改按主题：green/blue/comfy→`'dark'`，light→`'light'`；981 电影编辑器 backgroundColor、1001-1003 主窗口 backgroundColor+titleBarOverlay、1028-1030 弹窗 options 全部改为 `shellFor(...)` 取值）
- Modify: `electron/main.ts`（ipcMain.handle 新通道 + 窗口登记表）；`electron/preload.ts`（expose `setNativeTheme`）
- Test: `scripts/test-theme.cjs` 追加

**Interfaces:**
- Consumes: Task 1 的 `AppSettings['theme']`（IPC 载荷为 string，main 侧白名单）。
- Produces:
  - `type ShellTheme = 'green' | 'blue' | 'comfy' | 'light'`（electron 本地类型）
  - `type NativeShell = { backgroundColor: string; titleBarOverlay: { color: string; symbolColor: string; height: 48 } }`
  - `NATIVE_SHELL: Record<ShellTheme, NativeShell>`：green `{#0c100e, overlay #171d19, symbol #f0f5ef}`（外壳墨绿化，D12 例外）；blue 沿用现值 `{#071524, #243c53, #d8ebff}`；comfy `{#211927, overlay #2a2138, symbol #f5f0fa}`；light `{#f4f6f8, #ffffff, symbol #23300f}`
  - `PREVIEW_MONITOR_SHELL: NativeShell` = 现值深色 `{#07100b, overlay #07100b, symbol #cfd8dc}`（D7：预览弹窗恒深色，含亮色主题）
  - `shellFor(theme: string, previewMonitor?: boolean): NativeShell`（非法 theme → green）
  - IPC 通道 `'theme:set-native-shell'`；preload `setNativeTheme(theme: string): Promise<void>`
  - main 窗口登记：`themedWindows = new Set<BrowserWindow>()`（主窗口 + 电影编辑器窗口，close 时移除；预览弹窗不登记——创建时静态深色）

- [ ] **Step 1: 失败测试**（test-theme.cjs，ts-loader 加载 electron/nativeShellTheme.ts）：
  - `NATIVE_SHELL` 四键齐全；`shellFor('light')` 与 `NATIVE_SHELL.light` 相等；`shellFor('bogus')` 等于 green；`shellFor('light', true)` 等于 `PREVIEW_MONITOR_SHELL` 且其 overlay 为深色（非 `#ffffff`）；
  - 结构断言：main.ts 无 `nativeTheme.themeSource = 'dark'` 字面量、含 `'theme:set-native-shell'`、preload 含 `setNativeTheme`。
- [ ] **Step 2: 确认失败** — `pnpm test:theme` FAIL。
- [ ] **Step 3: 实现** — 值表 + 创建点改造 + IPC（handler：`nativeTheme.themeSource = theme === 'light' ? 'light' : 'dark'`；遍历 themedWindows `setBackgroundColor` + `setTitleBarOverlay`）。窗口创建时读 `await loadSettings()` 取 theme（createWindow/createMovieEditorWindow 已是 async 上下文或可改）。
- [ ] **Step 4: 验证** — `pnpm test:theme && pnpm typecheck && pnpm lint && pnpm build:electron` PASS。
- [ ] **Step 5: Commit** — `git commit -m "Theme native window chrome via IPC with per-theme shell table"`

### Task 5: LAN appearance 端点、手机页与 ?desktop=1

**Files:**
- Modify: `electron/main.ts:673-733`（handleLanRequest，token 鉴权内、与 `/api/lan/characters` 并列）：`if (url.pathname === '/api/lan/appearance' && request.method === 'GET') return sendJson(response, 200, { theme: settings.theme })`
- Modify: `src/MobileApp.tsx:38-42`（lanFetch browser-preview 分支加 `if (path === '/api/lan/appearance') return { theme: 'green' } as T`）
- Modify: `src/MobileApp.tsx`（挂载时 `lanFetch<{theme: string}>('/api/lan/appearance')` → `applyTheme(document.documentElement, normalizeTheme(...))`，catch 回落不处理；同时按主题设置 `document.querySelector('meta[name="theme-color"]')` 为各主题底色：green `#0c100e`/blue `#0e1419`/comfy `#211927`/light `#f4f6f8`——评审注记第 6 条）
- Modify: `src/App.tsx`（LAN 浏览器环境检测：`new URLSearchParams(location.search).has('token')` 且非 Electron → 同样拉取并 `applyTheme`；只读不持久，评审注记第 5 条）
- Test: `scripts/test-theme.cjs` 追加

**Interfaces:**
- Consumes: Task 1 导出；lanFetch 既有签名。
- Produces: `GET /api/lan/appearance → { theme }`（token 鉴权同其他 LAN 路由）。

- [ ] **Step 1: 失败测试**（结构断言）：main.ts 含 `/api/lan/appearance`；MobileApp.tsx 的 browser-preview 分支含该路径 mock；MobileApp 含 theme-color 更新；App.tsx 含 token 检测分支。
- [ ] **Step 2: 确认失败** → **Step 3: 实现**（照 Files 落点；App 的拉取放在现有挂载 effect 附近，失败静默保持镜像值）。
- [ ] **Step 4: 验证** — `pnpm test:theme && pnpm typecheck && pnpm lint` PASS。
- [ ] **Step 5: Commit** — `git commit -m "Serve theme over LAN and apply on mobile and desktop companion pages"`

### Task 6: themes.css 变量词表骨架与导入

**Files:**
- Modify: `src/styles/themes.css`（替换占位为完整骨架）
- Modify: `src/styles/README.md`（边界表加一行：themes.css = 主题变量词表与蓝/黄/亮覆盖块，位于 studio-refresh.css 之后）
- Test: `scripts/test-theme.cjs` 追加 CSS 结构断言

**Interfaces:**（全计划唯一的 CSS 变量词表，Task 7-11 全部使用，名字不得偏离）
- `:root` 基准块（= 墨绿主题现状值 + D15 墨绿化的交互族）：
  - 交互族（当前渲染为蓝、D15 墨绿化）：`--action-from: #b6ef68; --action-to: #93d63c;`（主 CTA 渐变对，AA 微调）；`--action-soft: rgb(196 248 120 / 14%)`；`--info-accent: #8fd35a; --info-accent-soft: rgb(143 211 90 / 12%)`（eyebrow/模型卡/信息强调）；`--check-tint: rgb(196 248 120 / 18%)`（原 ui.css `#bfe5ff` 勾选色）
  - 身份色（钉住现值，D15）：`--identity-movie: #a879ff; --playhead: #f4c85d;` + 清理中发现的各工作室资产色调以 `--asset-*` 前缀就地钉住（现值写入，命名 `--asset-<组件>-<角色>`）
  - 预览深底（D7）：`--preview-bg: rgb(0 0 0 / 12%); --preview-panel: #0a0f0c; --preview-line: #1d2721;`（初值按现渲染取，Task 7 清理时校准）
  - 语义第二家族（评审注记第 2 条）：`--success/--warning/--danger` 基准 = production-workspace.css 现值，但其 `--accent: #69a8ff` 属 D15 墨绿化 → 不入词表，清理时直接映射 `var(--accent)`
- `[data-theme="blue"|"comfy"|"light"]` 三块：`color-scheme: dark/dark/light` + 以 studio-refresh.css:3-4 的选择器策略（`:root[data-theme=…] , .app-shell[data-theme=…] …`）`!important` 覆盖 `--bg/--surface*/--line*/--text/--muted*/--accent*/--oy-*/--video-*/--success/--warning/--danger` + 交互族变量（本任务先留注释占位，Task 9-11 填值）

- [ ] **Step 1: 失败测试**（结构断言 themes.css）：含 `:root`、三个 `[data-theme` 块；三块各含 `color-scheme`；无 `[data-theme="green"]` 块；`--action-from` 等 6 个交互族变量在 `:root` 有定义。
- [ ] **Step 2: 确认失败** → **Step 3: 实现骨架 + README 行**。
- [ ] **Step 4: 验证** — `pnpm test:theme && pnpm test && pnpm build:web` PASS（绿主题视觉零变化——基准块新变量尚未被引用）。
- [ ] **Step 5: Commit** — `git commit -m "Add themes.css variable vocabulary and per-theme skeletons"`

### Task 7: 清理 A——壳与共享样式层（先拍绿基线）

**Files:**
- Modify: `src/styles/shell-and-controls.css`、`src/styles/workstation.css`、`src/styles/visual-system.css`、`src/styles/studio-polish.css`、`src/components/ui/ui.css`、`src/guided-studio.css`、`src/workspace-theme.css`、`src/original-theme.css`、`src/movie-workspace.css`、`src/scratchpad.css`、`src/studio-system.css`

**Interfaces:**
- Consumes: Task 6 词表 + 既有变量（`--bg/--surface*/--line*/--text/--muted*/--accent*` 等）。
- Produces: 清理规则本身（Task 8 复用）：每个硬编码色三选一——(a) 近似既有变量值 → `var(既有变量)`；(b) 蓝色交互强调（`#70bcff/#72adf8/#288ff2/#0873dc/#4ca9ff/#087aff/#bfe5ff` 族）→ 交互族/勾选变量（墨绿化）；(c) 身份色或预览深底 → 钉住变量；**不允许第四种状态**，豁免处必须注释 `/* theme-exempt: <原因> */`。

- [ ] **Step 1: 拍绿基线** — 启动 app（`pnpm dev`），用 `/tmp/oyama-cdp/drive.cjs` CDP 驱动逐屏截图存 `/tmp/oyama-theme-baseline/`：create、continue、scratchpad、ltx25、ltxripple、photoedit、music、zimage、referenceprep、characters、hair、wardrobes、accessories、locations、queue、library、clipmaster、settings、movie 编辑器窗口、手机页（`?mobile=1`）。
- [ ] **Step 2: 机械替换** — 按 Interfaces 规则逐文件替换（grep `#[0-9a-fA-F]{3,8}` 与 `rgb(` 逐个裁决；每文件清零或全豁免注释）。
- [ ] **Step 3: 验证** — `pnpm build:web` PASS；重启 app 对拍基线：壳层界面（设置/导航/对话框/表单控件）除 D15 墨绿化点外无可辨差异；`pnpm test:theme && pnpm typecheck && pnpm lint` PASS。
- [ ] **Step 4: Commit** — `git commit -m "Replace hardcoded colors with theme variables in shell stylesheets"`

### Task 8: 清理 B——工作区样式层（含 scene-composer 墨绿化，D12/D15）

**Files:**
- Modify: `src/styles/creation-workspaces.css`、`src/styles/feature-workspaces.css`、`src/styles/movie-and-mobile.css`、`src/styles/production-workspace.css`、`src/scene-composer.css`、`src/video-workspace.css`

**Interfaces:**
- Consumes: Task 6 词表 + Task 7 清理规则。
- Produces: D12 例外清单（交付时给需求方核验）：逐屏列出「清理前渲染为蓝 → 现为墨绿」的界面（scene-composer 全套、video-workspace 生成按钮/eyebrow、production-workspace `--accent:#69a8ff`、ui.css 勾选色、D17 原生外壳）。

- [ ] **Step 1: 机械替换** — 同 Task 7 规则；scene-composer.css 自带 `:root` 蓝色面板系整体映射到 surface 族；`--playhead/--identity-movie/--asset-*` 钉住。
- [ ] **Step 2: 验证** — `pnpm build:web` + 对拍基线：工作区界面除 D12 清单外无可辨差异；`pnpm test:theme && pnpm typecheck && pnpm lint && pnpm test` 全 PASS。
- [ ] **Step 3: Commit** — `git commit -m "Theme-clean workspace stylesheets and greenify legacy blue surfaces"`

### Task 9: 蓝色主题块（D16）

**Files:**
- Modify: `src/styles/themes.css`（blue 块填值）

**Interfaces:**
- Consumes: Task 6 骨架 + Task 7/8 清理后的变量引用。
- Produces: blue 完整块：底/面板用 `tokens.css` 原值族（`--bg:#0e1419`、`--surface:#151d23`、`--surface-1:#1a242c`、`--surface-2:#202c35`、`--line:#303c46`、`--line-strong:#40515e`、`--text:#e9f0f6`、`--muted:#a2b1be`、`--muted-2:#7f919f`）；交互族还原 upstream 字面值（`--action-from:#288ff2; --action-to:#0873dc; --info-accent:#70bcff; --info-accent-soft:rgb(112 188 255 / 12%); --check-tint:rgb(191 229 255 / 18%); --action-soft:rgb(112 188 255 / 14%)`）；accent 家族 `#249cf1/#3bafff`；`--oy-*/--video-*` 同步；语义两家族按需微调过 AA。

- [ ] **Step 1: 填值实现**（照 Interfaces 值表；灰阶衍生沿 tokens.css 色温）。
- [ ] **Step 2: 验证** — `pnpm build:web`；app 切 blue：与 `/tmp/oyama-theme-ref/studio-workspace-dark-blue.png` 观感对照（底色/按钮/eyebrow 同族）；AA 抽查（accent 上文字、muted 文本）；`pnpm test:theme` PASS。
- [ ] **Step 3: Commit** — `git commit -m "Fill blue theme block from upstream palette"`

### Task 10: Comfy 黄主题块（D4）

**Files:** Modify: `src/styles/themes.css`（comfy 块）

**Interfaces:**
- Produces: `--bg:#211927`；面板灰阶按紫底衍生（`--surface:#2a2138` 一族，六档全部从 `#211927` 色温推）；`--accent:#F2FF59`、`--accent-ink`（黄底上的深字，取 `#211927`）；交互族 `--action-from:#F2FF59; --action-to:#d8e13e;`；`--info-accent:#e8f06a;`；语义色过 AA（黄 warning 在紫底上需提亮或换位）。

- [ ] **Step 1: 填值** → **Step 2: 验证**（同 Task 9 方式：切 comfy 走查 + AA 抽查 + `pnpm test:theme && pnpm build:web`）→ **Step 3: Commit** — `git commit -m "Fill comfy theme block from comfy.org palette"`

### Task 11: 亮色主题块（D5/D7）

**Files:** Modify: `src/styles/themes.css`（light 块）

**Interfaces:**
- Produces: `color-scheme: light`；`--bg:#f4f6f8`、`--surface:#ffffff`、`--surface-1/-2/-3` 白→浅灰三档、`--line` 浅灰族、`--text:#1f2a24`、`--muted` 深灰族；`--accent:#3e7a1e`（AA 微调）+ `--accent-soft` 同色调低透明；交互族深绿（`--action-from:#3e7a1e; --action-to:#2f6317; --action-ink:#f4f6f8` 如需）；语义两家族按 AA 调整（warning 加深，如 `#8a6116`）；`--preview-bg/--preview-panel/--preview-line` **显式钉回深色值**（D7，结构断言锚点）；阴影换浅色（`rgb(15 23 20 / 8%)` 档）。

- [ ] **Step 1: 失败测试**（test-theme.cjs 追加）：light 块含 `--preview-bg` 且值为深色（非 `#f`/`#e` 开头的亮值）；含 `color-scheme: light`。
- [ ] **Step 2: 确认失败** → **Step 3: 填值实现** → **Step 4: 验证**（切 light 全屏走查：预览列/Live Preview/剪辑台监看区仍深；正文与 muted 文本 AA；`pnpm test:theme && pnpm build:web`）。
- [ ] **Step 5: Commit** — `git commit -m "Fill light theme block with dark preview surfaces"`

### Task 12: 验收执行与交付（D9：停下等需求方）

**Files:**
- Modify: `docs/superpowers/specs/2026-11-12-theme-options-design.md`（追加「验收记录」小节：基线对比结论 + D12 例外清单终版 + 四主题走查结果）
- Test: 全套

- [ ] **Step 1: 全量命令** — `PATH` 前缀下 `pnpm typecheck && pnpm lint && pnpm test && pnpm build:web && pnpm build:electron` 全绿，真实输出贴进验收记录。
- [ ] **Step 2: 绿回归对拍** — 与 `/tmp/oyama-theme-baseline/` 逐屏对比，结论（除 D12 清单外无可辨差异）写入验收记录。
- [ ] **Step 3: 四主题走查** — 每主题：五态（空/加载/成功/失败/禁用）抽查 + 验收清单重点项（下拉即时生效、电影编辑器同步、手机页与 `?desktop=1`、弹窗同步、亮色预览仍深、原生控件 color-scheme、D17 外壳值表、最小布局 760px 与典型 1440px 两档）。
- [ ] **Step 4: 汇总提交** — `git commit -m "Record theme acceptance walkthrough"`；**停**，输出验收材料给需求方逐屏核验（D9），不自行合并。
