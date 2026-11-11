# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Oyama AI Video Studio is a local-first Electron + React + TypeScript desktop app for ComfyUI. The renderer lives in `src/`, privileged desktop operations live in `electron/`, and ComfyUI graph builders live in `src/lib/`. It also ships a LAN-served mobile companion.

`AGENTS.md` holds the contributor rules (scope, working agreement, validation, known follow-up audits) — read it before editing. This file covers commands and architecture only.

## Commands

```bash
pnpm install          # pnpm 10+, Node 20+
pnpm dev              # Vite on 127.0.0.1:5173 + Electron; ComfyUI must already be running
pnpm dev:web          # renderer only, no Electron — uses the browser mock bridge
pnpm start            # launch the built app (dist/ + dist-electron/ must exist)
pnpm build            # typecheck + build:web + build:electron
pnpm build:web        # vite build -> dist/
pnpm build:electron   # tsc -p tsconfig.electron.json -> dist-electron/
pnpm typecheck        # tsc --noEmit for src/ plus tsconfig.electron.json
pnpm lint             # eslint . --max-warnings 0
pnpm test             # chains the scripts/test-*.cjs suites (see below)
```

### Running a single test

There is no test framework. Every suite is a standalone Node script using `node:assert/strict`, wired into `pnpm test` as a named script. Run one directly:

```bash
node scripts/test-model-inventory.cjs     # or: pnpm test:model-inventory
node scripts/test-workflows.cjs
```

`scripts/test-ts-loader.cjs` transpiles `src/**.ts` on the fly and resolves relative `.ts` imports, so suites load real renderer/electron modules without a build step. A suite that shells out to a binary or needs a live server is not part of `pnpm test` and must be run by hand:

- `pnpm test:ui-e2e` — drives a Chromium over CDP; needs Vite already serving `127.0.0.1:5173`. Set `E2E_BROWSER_PATH` to override the default Windows Edge path.
- `pnpm test:photo-edit-electron` — spawns the real Electron app against the Vite dev server.
- `pnpm test:clip-master` — shells out to ffmpeg.

### Packaging

`pnpm package:win | package:linux | package:mac` (plus `package:linux:deb|appimage|tar`); `scripts/release-*.sh|bat` wrap the same builds. `scripts/release-all.cjs` builds every target.

## Architecture

### Process split and the preload bridge

The renderer has no Node integration and no direct filesystem/process/network privilege. Everything privileged goes through the context-isolated preload bridge `window.minimax` (`electron/preload.ts`), typed as `DesktopApi` in `src/types.ts` and declared in `src/global.d.ts`.

- `electron/main.ts` (~1800 lines) owns settings persistence, ComfyUI HTTP calls, FFmpeg spawning, the LAN server, and the media protocol handler. Every privileged capability is an `ipcMain.handle` channel that `preload.ts` re-exposes.
- `src/browserMock.ts` installs a fake `window.minimax` when the page runs outside Electron (`pnpm dev:web`, the static preview pages). Renderer code must not assume the real bridge.

**Do not move privileged file/process/network operations into renderer modules** — extend the preload bridge instead.

### Media delivery

Local media is served over a custom `minimax-media://` protocol (`protocol.handle` in `electron/main.ts`), not `file://`. Hostnames select the source: `?path=` for a file inside the configured ComfyUI output directory, `comfy` for a remote `/view` URL, `thumbnail` for cached poster frames, `selected` for an explicitly chosen file. It **must keep honoring `Range` requests** (206 + `content-range`) — video seeking and audio scrubbing depend on it.

### App shell and workspace routing

`src/main.tsx` picks the root component from the URL: `App` (desktop), `MobileApp` (`?mobile=1`), `MovieEditorWindow` (`?movieEditor=1`).

`src/App.tsx` is the desktop shell — navigation, shared generation state, the H3 render lifecycle, and the job queue live there. It is by far the largest file in the repo (400 KB) and the usual source of churn. Views are the `View` union in `src/types.ts`; the navigable list, labels, and grouping live in `src/lib/workspaceNavigation.ts` and are the source of truth for the sidebar, the `?` finder, and settings search.

Each workspace is a component in `src/components/` (e.g. `Ltx25Workspace.tsx`, `PhotoEditWorkspace.tsx`, `CharacterStudio.tsx`) and is rendered conditionally from `App.tsx`.

`docs/app-module-map.md` records which module owns which responsibility — update it when you move a boundary.

### ComfyUI integration

- Graph builders are pure functions in `src/lib/*Workflow.ts` (`workflow.ts` for H3, `ltx25Workflow.ts`, `aceStepWorkflow.ts`, `music3Workflow.ts`, `zimage.ts`, `ltxRippleWorkflow.ts`, `fireRedEditWorkflow.ts`, `birefnetWorkflow.ts`). They emit ComfyUI **API-format** graphs — node id → `{ class_type, inputs }` — and are the unit of work most test suites assert against.
- Live preview uses the ComfyUI WebSocket (`/ws`) via `src/lib/useLivePreview.ts`; progress shaping lives in `src/lib/renderProgress.ts` and `src/lib/renderActivity.ts`.
- Job lifecycle interpretation is in `src/lib/comfyJobState.ts`; it guards terminal updates against cancellation races. Cancellation goes through one path, `electron/comfyCancellation.ts`, shared by IPC and LAN.
- Model discovery has two sources that are merged: the local folder scan (`electron/modelInventory.ts`) and the files the **engine** reports through its node combinations (`src/lib/modelInventory.ts` → `engineModelFiles`). The engine owns the models when ComfyUI runs on another machine, so a local scan alone would report everything missing. `src/lib/modelSelection.ts` resolves filenames to selections; `src/lib/h3Diagnostics.ts` builds the H3 stack report.

### State and persistence

Two tiers, deliberately separate:

- Renderer workspace state → `localStorage`, via `src/lib/workspacePersistence.ts` (readers must tolerate older/partial shapes — see the migrations in `readWorkspace`) and `src/lib/useLocalPersistence.ts` (surfaces failed writes for retry).
- Settings, render benchmarks, LAN token, migration markers → `app.getPath('userData')` JSON files written atomically via `electron/atomicFile.ts`.

`electron/legacyBrowserStorage.ts` and the `LegacyMigrationControl` component restore a previous local profile into the app-data folder with a recoverable backup. Never overwrite existing user data.

### LAN mobile companion

`electron/main.ts` starts a plain `node:http` server (`/api/lan/*`) protected by a persisted access token, and serves the built renderer for phones on the same network. `src/MobileApp.tsx` is the phone UI; the "complete Studio" link loads the same `App` with `?desktop=1`. Rotating the token invalidates every previously issued link.

### Styles

CSS is split by feature. `src/styles/README.md` documents the boundaries and the cascade order — `src/styles.css` and the imports in `src/main.tsx` must keep their order, because changing it changes the cascade. New workspace rules belong next to their feature; shared palette/shell rules belong in `src/styles/studio-refresh.css`.

## Conventions

- Reuse existing UI primitives (`src/components/FormFields.tsx`, `src/components/VideoPlayer.tsx`), theme tokens, and workflow helpers rather than introducing parallel systems.
- Realtime status must describe the current operation and expose failures with recovery guidance; use `role="status"` / `aria-live="polite"` for meaningful state changes, and avoid announcing high-frequency frame or timer updates.
- Defer work with `TODO(owner-or-area): reason; completion condition` — never a generic TODO that restates the code. `AGENTS.md` lists the current known follow-up audits.
- Keep stored-data readers tolerant of older shapes; write versioned or atomic outputs.

## Validation

While iterating, run the narrowest relevant check. Before handoff, run:

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build:web
```

For UI changes, also exercise the affected screen in the Electron app at its smallest supported layout and a typical desktop size, and verify empty, loading, success, failure, and disabled states. `pnpm build:electron` additionally covers the `electron/` tree.

<comet-ambient-resume>
<!-- Managed by Comet. Edits inside this block may be replaced by comet init/update. -->
<!-- Contract: comet.resume_probe.v2 -->

## Comet Ambient Resume

在这个仓库中，开始处理需要改动或调查的任务前，如果可能存在活跃 Comet workflow，把当前用户请求传入只读探针：`comet resume-probe . --stdin --json`。

- 如果用户通过宿主明确调用任意 Comet Skill（例如 `@comet`、`/comet`、`@comet-native` 或 `/comet-hotfix`），显式调用优先于本恢复协议；不要运行 resume probe，直接进入被调用的 Skill。
- 如果用户通过宿主明确调用的是非 Comet 的 Skill 或斜杠命令，任务意图已由该调用明确：不要运行 resume probe，直接执行该 Skill。
- 如果你正在 Comet 流程内（包括正在等待用户回复你在流程中提出的问题），不要运行 resume probe；把这类回复（例如方案/选项选择）当作当前 change 的继续，直接按用户的选择推进。
- 只信任返回的 `workflow`、`skill` 和 `entrySource`；它们只由项目配置或无配置兼容回退决定。不得扫描或切换另一套 workflow。
- 如果 probe 返回 `auto_resume`，简短说明选中的 active change，并进入 `nextCommand` 指向的永久入口。不要把状态命令当作恢复入口直接推进。
- 如果 probe 返回 `ask_user`，只问一个简短问题并等待用户回复。
- 如果当前请求未明确调用 Comet Skill，且 probe 返回 `out_of_scope` 或 `none`，不要进入 Comet workflow。
- `out_of_scope` 或 `none` 只表示不要因为这个新请求进入 Comet workflow；它绝不表示要暂停或退出一个已在进行的 Comet 流程。
- 如果配置或状态无效且没有 `nextCommand`，停止并报告原因；不要猜测另一个 workflow。
- 不能只因为存在 active change 就把无关任务挂到该 change。Native 的未提交改动由 Native 入口检查，不由探针自动归因。
</comet-ambient-resume>
