# Optimization roadmap

This roadmap translates the internal audit findings and external benchmark research into ordered implementation phases. It does not authorize behavior changes on its own; the purpose is to provide a sequenced technical plan for hardening test coverage, decomposing the coordinator, improving engine truthfulness, and polishing the media pipeline. Each item is backed by measured evidence or cited mainstream references.

## Scope and evidence

Every gap and work item in this roadmap is supported by either an internal measurement (file line counts, specific code locations, CI configuration, or measured limits) or a cited external source from video editor architecture, ComfyUI client patterns, data layer best practices, testing toolchains, AI video studio UX, or latent preview implementations. The audit was run with `pnpm typecheck` and `pnpm lint --max-warnings 0` passing and a clean working tree.

## What is already at or above mainstream

| Strength | Evidence | Position |
| --- | --- | --- |
| Atomic writes for settings JSON | AGENTS.md:7 requires versioned or atomic outputs; `electron/atomicFile.ts` uses temp-then-rename [mainstream](https://www.edgedrop.app/blog/atomic-json-persistence-vs-sqlite) | Keep |
| Typed preload bridge with contextIsolation | AGENTS.md:6 requires privileged operations to stay behind the preload bridge; verified `electron/main.ts:1044,1069,1101` set contextIsolation=true and nodeIntegration=false | Keep |
| Path-traversal validation on local media serving | Verified in `electron/main.ts`; range headers validated and path traversal rejected on the LAN upload path (`electron/main.ts:726`) | Keep |
| H3 preview ahead of upstream | AGENTS.md:32-33 pins 12-channel `taeh3_decoder.safetensors` (madebyollin/taehv) and `ComfyUI-MiniMaxH3-PreviewOverride` commit d1eb17b; upstream ComfyUI issue #15592 still open [mainstream](https://github.com/Comfy-Org/ComfyUI/issues/15592) | Keep |
| VRAM overcommit guard | docs/performance-production-readiness.md:16 requires explicit override before predicted overcommit; persisted warning | Keep |
| Per-component GPU routing | docs/performance-production-readiness.md:14 routes at loader boundaries; short diagnostic validates placement [advanced](https://github.com/mcmonkeyprojects/SwarmUI/blob/master/docs/Using%20More%20GPUs.md) | Keep |
| Reproducible H3 benchmark | docs/performance-production-readiness.md:17 fixed prompt/seed/model/steps; persisted results for comparison after driver/node changes | Keep |

## Gap summary

| Gap | Evidence | Mainstream reference | Handled in phase |
| --- | --- | --- | --- |
| No renderer unit tests | AGENTS.md:39 TODO(testing) for playback boundary advance, buffering/error, modal focus, reduced-motion | [mainstream](https://dev.to/mp3sss31/testing-electron-apps-a-practical-guide-to-unit-integration-and-e2e-coverage-4ei9) | Phase 1 |
| No accessibility pass on dense screens | AGENTS.md:40 TODO(accessibility) — no keyboard/screen-reader pass and no in-product shortcut map; `docs/ui-audit.md:14` flags the same gap | [mainstream](https://playwright.dev/docs/api/class-electron) | Phase 1 |
| No Electron E2E tests | 31 `.cjs` workflow tests in `scripts/` cover logic, but no golden-path E2E | [mainstream](https://playwright.dev/docs/api/class-electron) | Phase 1 |
| CI only runs on ubuntu-latest | `.github/workflows/ci.yml` runs on ubuntu-latest; README says Windows/Linux/macOS; primary target is Windows | [mainstream](https://www.electron.build/docs/github-actions) | Phase 1 |
| CI pins pnpm 9, README says pnpm 10+ | `.github/workflows/ci.yml` uses `pnpm/action-setup@v4`; README requires pnpm 10+ | Internal mismatch | Phase 1 |
| App.tsx is 4003 lines | Measured with `Measure-Object -Line` | Module extraction in docs/app-module-map.md:26 | Phase 2 |
| No per-workspace code splitting | `src/main.tsx:4-6` lazy-loads App/MobileApp/MovieEditorWindow; workspace internals not split | [mainstream](https://www.remotion.dev/blog/media-parser) | Phase 2 |
| Socket reconnect does not refresh object_info | `src/lib/useLivePreview.ts` listens for `liveConnected` but does not re-fetch `object_info`; AGENTS.md:43 TODO(live-preview) — engine restart/node install stays invisible until manual "Test connection" | [mainstream](https://github.com/Comfy-Org/ComfyUI_frontend/issues/6430) | Phase 3 |
| Model inventory has no timeout or caching | `electron/main.ts:506-510` issues parallel `/models/${kind}` fetches under a single shared `AbortSignal.timeout(15_000)` with no per-kind timeout and no cache; `electron/main.ts:691` awaits it on the settings path, so a slow/offline engine stalls the settings load | [mainstream](https://github.com/StableCanvas/comfyui-client) | Phase 3 |
| No LAN API rate limiting | `electron/main.ts:726` rejects uploads over 175 MB; no rate limit, per-client quota, or connection limit | Internal measurement | Phase 3 |
| No compositor for gaps/overlays/titles | AGENTS.md:37 TODO(movie-editor); current export is primary-track-only | [mainstream](https://auto-editor.com/docs/v3) | Phase 3 |
| No poster-frame cache | AGENTS.md:38 TODO(media-preview); each media card opens a decoder | [mainstream](https://docs.kdenlive.org/en/project_and_asset_management/file_management/project_files.html) | Phase 4 |
| No auto-update implementation | Electron app lacks electron-updater integration | [mainstream](https://www.electron.build/docs/features/code-signing/) | Phase 4 |
| No queue depth / ETA visibility | Job state shown, but no queue depth or ETA aligned with local GPU tools | [advanced](https://github.com/mcmonkeyprojects/SwarmUI/blob/master/docs/Using%20More%20GPUs.md) | Phase 4 |
| H3-Image vs Z-Image default unresolved | AGENTS.md:41 TODO(image-models); product decision deferred pending customer-hardware validation | Product decision | Phase 4 |
| H3-Image reference-edit garbled | AGENTS.md:42 TODO(h3-image-edit); T2I works, reference-edit produces garbled frames | Product decision | Phase 4 |

## Phase 1 — Test safety net

**Goal**: Establish test coverage for renderer interactions and golden paths before large-scale decomposition. Align CI with declared supported platforms.

| Item | Why | Acceptance check |
| --- | --- | --- |
| vitest + React Testing Library for renderer units | AGENTS.md:39 TODO(testing) for playback boundary advance, buffering/error feedback, modal focus trapping, reduced-motion [mainstream](https://dev.to/mp3sss31/testing-electron-apps-a-practical-guide-to-unit-integration-and-e2e-coverage-4ei9) | `pnpm test` runs renderer interaction tests; coverage for playback, buffering, modal focus, reduced-motion |
| Keyboard and screen-reader pass on dense screens | AGENTS.md:40 TODO(accessibility); `docs/ui-audit.md:14` records the same open item | Documented shortcut map exists in-product; dialogs trap focus and expose labels to screen readers |
| Playwright Electron E2E for 3-5 golden paths | No E2E currently; need submit/cancel a render, timeline edit then export, LAN QR mobile companion [mainstream](https://playwright.dev/docs/api/class-electron) | `pnpm test:ui-e2e` executes 3-5 E2E scenarios; Playwright inspects main-process state via electronApp.evaluate() |
| Align CI pnpm version with README | `.github/workflows/ci.yml` pins pnpm 9, README says pnpm 10+ | CI uses pnpm 10+ matching README |
| Add windows-latest to CI matrix | CI only runs ubuntu-latest; primary target platform is Windows | CI runs lint, typecheck, test, build on ubuntu-latest and windows-latest |
| Packaged-build smoke job | No packaged-build validation before release; catch signing/notarization/startup issues [mainstream](https://github.com/berntpopp/VarLens/blob/main/AGENTS.md) | CI produces a packaged artifact on one platform and validates it launches without crashing |

Do not run full E2E on every platform; one matrix leg builds for each platform, one leg runs E2E on a single platform. Do not add macOS to the initial matrix if Apple signing credentials are unavailable; document it as a follow-up once credentials exist.

## Phase 2 — Coordinator decomposition

**Goal**: Split `src/App.tsx` by workspace domain, preserving exact ComfyUI prompt ID to history lookup and local output paths for continuation. Add per-workspace code splitting on top of the existing top-level lazy entries in `src/main.tsx:4-6`.

| Item | Why | Acceptance check |
| --- | --- | --- |
| Extract H3 video workspace internals | `src/App.tsx` is 4003 lines; H3 submission, history/output reconciliation, continuation, and video workspace UI are large sections | H3 workspace lives in dedicated module; `src/App.tsx` < 2500 lines |
| Extract LTX Ripple workspace logic | `src/components/LtxRippleWorkspace.tsx` and `src/lib/ltxRippleWorkflow.ts` exist; move coordinator logic to workspace module | LTX Ripple workspace owns its lifecycle; coordinator only routes navigation and shared state |
| Extract Photo Edit workspace logic | `src/components/PhotoEditWorkspace.tsx` and `src/lib/fireRedEditWorkflow.ts` exist; move coordinator logic to workspace module | Photo Edit workspace owns its lifecycle |
| Extract Music 3 workspace logic | `src/components/Music3Workspace.tsx` and `src/lib/music3Vocabulary.ts` exist; move coordinator logic to workspace module | Music 3 workspace owns its lifecycle |
| Extract H3-Image workspace logic | `src/components/H3ImageWorkspace.tsx` and `src/lib/h3Image.ts` exist; move coordinator logic to workspace module | H3-Image workspace owns its lifecycle |
| Add per-workspace React.lazy code splitting | `src/main.tsx:4-6` lazy-loads top-level, but workspace internals are not split [mainstream](https://www.remotion.dev/blog/media-parser) | Each workspace lazy-loaded; initial bundle < 400 KB parsed JS |
| Preserve prompt ID to history binding | docs/app-module-map.md:26 requires keeping history lookup tied to exact ComfyUI prompt ID and local output paths for continuation | Continuation still resolves outputs via prompt ID; no broken media links after extraction |

Do not move privileged file or process operations into renderer modules. Do not rewrite `App.tsx` in a way that breaks the prompt-ID history binding or loses continuation support.

## Phase 3 — Engine truthfulness and shared compositor

**Goal**: Rehydrate ComfyUI session on socket reconnect, add model inventory caching, implement LAN API rate limiting, and build a shared compositor honoring gaps, overlays, transforms, titles, and mixed audio.

| Item | Why | Acceptance check |
| --- | --- | --- |
| Socket reconnect fetches object_info + queue + history | AGENTS.md:43 TODO(live-preview); engine restart/node install invisible until manual "Test connection" [mainstream](https://github.com/Comfy-Org/ComfyUI_frontend/issues/6430) | Reconnect triggers object_info + /queue + /history fetch; new node appears without manual "Test connection" |
| Normalized lifecycle event state machine | Canonical events: execution_start, executing, progress, executed, execution_success, execution_error, execution_interrupted, status [mainstream](https://docs.comfy.org/development/comfyui-server/comms_messages) | State machine handles all lifecycle events; no missed progress due to client_id/clientId mismatch [mainstream](https://github.com/Comfy-Org/ComfyUI/issues/8395) |
| Model inventory per-kind timeout + caching | Parallel `/models/{kind}` with no timeout stalls settings; add per-kind 5s timeout and 5-minute cache | Settings load completes in < 8 seconds even if one model kind times out; cache refreshes in background |
| LAN API rate limiting, per-client quota, connection limit | `electron/main.ts:726` rejects uploads > 175 MB; no rate limit, per-client quota, or connection limit | LAN API enforces 10 req/min per client, 500 MB/hour upload quota, max 5 concurrent connections |
| Shared compositor for preview and export | AGENTS.md:37 TODO(movie-editor); current export is primary-track-only [mainstream](https://auto-editor.com/docs/v3), [advanced](https://github.com/OpenShot/libopenshot/blob/develop/src/Timeline.h) | Compositor honors gaps, overlays, transforms, titles, mixed audio; exported output matches visible timeline |
| WebCodecs + OffscreenCanvas decode fast path | Existing decoder is not WebCodecs-accelerated [mainstream](https://www.remotion.dev/blog/media-parser) | Video playback uses WebCodecs when available; fallback to current path on unsupported browsers |

Do not ship the LAN companion without rate limiting. Do not treat a successfully queued prompt as proof of VRAM placement. Do not enable tiled VAE generically without benchmarking output and elapsed time.

## Phase 4 — Media pipeline and product polish

**Goal**: Add poster-frame/proxy cache, integrate electron-updater, migrate to SQLite for relational queries, expose queue depth/ETA, and resolve the two product decisions.

| Item | Why | Acceptance check |
| --- | --- | --- |
| Poster-frame + proxy cache | AGENTS.md:38 TODO(media-preview); each media card opens a decoder [mainstream](https://docs.kdenlive.org/en/project_and_asset_management/file_management/project_files.html) | Media cards show stable thumbnails without per-card decode; cache lives outside primary state |
| electron-updater with NSIS channel | No auto-update; manual download required [mainstream](https://www.electron.build/docs/features/code-signing/) | Auto-update checks for new release on launch; downloads and prompts for install; requires user decision before enabling given privacy-by-default promise |
| SQLite (better-sqlite3 + WAL) for media library + job history | Settings JSON is correct for single-writer; library and history need relational queries [mainstream](https://invental.co/blog/local-first-electron-sqlite-llm) | Media library and job history use SQLite with journal_mode=WAL, foreign_keys=ON, synchronous=NORMAL; settings JSON unchanged |
| Queue depth, ETA, warmup visibility | Job state shown, but no queue depth or ETA aligned with local GPU tools [advanced](https://github.com/mcmonkeyprojects/SwarmUI/blob/master/docs/Using%20More%20GPUs.md) | Queue view shows position, estimated wait time, and warmup status when model is not resident |
| Resolve H3-Image vs Z-Image default | AGENTS.md:41 TODO(image-models); H3-Image additive, Z-Image still owns scratchpad handoff | Product decision: validate H3-Image Chinese text + 4K output on customer hardware, then switch or explicitly keep Z-Image |
| Resolve H3-Image reference-edit route | AGENTS.md:42 TODO(h3-image-edit); T2I works, reference-edit garbled | Product decision: verify local edit path (FL2VA + p-h3-image LoRA) or document cloud-only route; H3 图片 workspace can expose it |

Do not migrate settings JSON to SQLite; atomic temp-then-rename is correct for single-writer documents [mainstream](https://www.edgedrop.app/blog/atomic-json-persistence-vs-sqlite). Do not change the preview decoder file `models/vae_approx/taeh3_decoder.safetensors`; the 12-channel file from madebyollin/taehv is ahead of upstream and required for H3 preview (AGENTS.md:33).

## Sequencing and dependencies

Phase 1 gates Phases 2-4: decomposition and new features require test coverage to validate correctness. Phase 2's module boundaries gate Phase 3's compositor work: the compositor is a shared service that workspaces consume, so workspace extraction must complete first. Phase 4 items are independent of each other and can be pulled forward once Phase 1 completes.

| Dependency | Reason |
| --- | --- |
| Phase 1 before Phase 2-4 | Renderer tests and E2E validate that decomposition and new features do not break golden paths |
| Phase 2 before Phase 3 compositor | Compositor is a shared service; workspace extraction establishes module boundaries and handoff contracts |
| Phase 4 items are independent | Poster cache, auto-update, SQLite, queue visibility, and product decisions do not depend on each other; pull forward as needed |

## Defaults to avoid

Do not rewrite App.tsx without preserving the prompt-ID history binding and local output paths for continuation (docs/app-module-map.md:26). Do not migrate settings JSON to SQLite; atomic writes are correct for single-writer documents. Do not enable the LAN companion without rate limiting, per-client quota, and connection limits. Do not change the preview decoder file `models/vae_approx/taeh3_decoder.safetensors`; the 12-channel TAEHV file is required and ahead of upstream. Do not ship unpackaged builds as release artifacts; packaged builds catch signing, notarization, and startup issues. Do not treat a successfully queued prompt as proof of VRAM placement; ComfyUI can still offload or reject.

## Verification

Run the following commands before each phase handoff:

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build:web
pnpm build:electron
pnpm test:ui-e2e
```

The UI test requires the Vite server running at `127.0.0.1:5173`. For Phase 1, add `pnpm test:ui-e2e` to CI. For Phases 2-4, verify that all commands pass after each module extraction or feature addition.

## Open questions

1. **Auto-update channel**: Should electron-updater be enabled by default given the privacy-by-default promise, or should it require explicit opt-in on first launch?
2. **LAN companion authentication**: Should the LAN companion remain token-only (current UUID in `userData/lan-access-token.txt`), or should it gain per-device pairing with revocation?
3. **SQLite migration timing**: Is SQLite worth the migration complexity before the media library grows to thousands of items, or should it wait until relational queries become a measurable bottleneck?
4. **H3-Image default decision**: Should H3-Image replace Z-Image as the default still-image generator after customer-hardware validation, or should both remain available indefinitely?
5. **H3-Image reference-edit resolution**: Should the garbled reference-edit issue be resolved with a local FL2VA + p-h3-image LoRA path, or should it be documented as cloud-only until a verified local route exists?

## Sources

- [Video editor architecture: non-destructive timeline, placements + source ranges](https://auto-editor.com/docs/v3)
- [KDENlive architecture: UI separated from engine, one pull-based engine for playback/scrub/render](https://github.com/KDE/kdenlive/blob/master/dev-docs/architecture.md)
- [KDENlive MLT intro: single Timeline abstraction for preview and render](https://github.com/KDE/kdenlive/blob/master/dev-docs/mlt-intro.md)
- [OpenShot Timeline abstraction](https://github.com/OpenShot/libopenshot/blob/develop/src/Timeline.h)
- [Remotion WebCodecs + media-parser](https://www.remotion.dev/blog/media-parser)
- [Cap WebCodecs fast path](https://cap.so/llms-full.txt)
- [Etro layer/effect/keyframe model with JSON serialization](https://github.com/etro-js/etro)
- [React video editor: layer/effect/keyframe](https://github.com/designcombo/react-video-editor)
- [KDENlive proxy + thumbnail derivatives](https://docs.kdenlive.org/en/project_and_asset_management/file_management/project_files.html)
- [ComfyUI canonical routes: POST /prompt, WS /ws?clientId=, GET /history, GET /view](https://docs.comfy.org/development/comfyui-server/api-examples)
- [ComfyUI communication routes](https://docs.comfy.org/development/comfyui-server/comms_routes)
- [ComfyUI client_id/clientId mismatch issue](https://github.com/Comfy-Org/ComfyUI/issues/8395)
- [ComfyUI lifecycle events: execution_start, executing, progress, executed, execution_success, execution_error, execution_interrupted, status](https://docs.comfy.org/development/comfyui-server/comms_messages)
- [ComfyUI-client SDK: enqueue/progress/reconnect/poll-fallback](https://github.com/StableCanvas/comfyui-client)
- [ComfyUI SDK](https://github.com/comfy-addons/comfyui-sdk)
- [ComfyUI reconnect must rehydrate from /queue + /history](https://github.com/Comfy-Org/ComfyUI_frontend/issues/6430)
- [SwarmUI exact model-path parity and node distribution across workers](https://github.com/mcmonkeyprojects/SwarmUI/blob/master/src/BuiltinExtensions/ComfyUIBackend/README.md)
- [SQLite with better-sqlite3 for local-first Electron](https://invental.co/blog/local-first-electron-sqlite-llm)
- [Atomic JSON persistence vs SQLite](https://www.edgedrop.app/blog/atomic-json-persistence-vs-sqlite)
- [Debounce belongs to sync/upload, not local durability](https://storyie.com/blog/local-first-autosave-without-losing-last-keystroke)
- [Durable state in main process under app.getPath('userData')](https://dev.to/mp3sss31/electron-offline-first-a-practical-guide-to-caching-assets-persisting-local-data-and-surviving-a-4ab6)
- [Playwright Electron support](https://playwright.dev/docs/api/class-electron)
- [Electron testing: unit + IPC contract + Playwright E2E](https://dev.to/mp3sss31/testing-electron-apps-a-practical-guide-to-unit-integration-and-e2e-coverage-4ei9)
- [Electron E2E testing guide](https://qaskills.sh/blog/electron-app-testing-guide)
- [Electron GitHub Actions: multi-OS matrix, cached artifacts, xvfb-run, artifact upload](https://www.electron.build/docs/github-actions)
- [Packaged-build smoke tests as release gates](https://github.com/berntpopp/VarLens/blob/main/AGENTS.md)
- [Electron signing and notarization](https://www.electron.build/docs/features/code-signing/)
- [SwarmUI multi-GPU job routing and multi-backend scheduling](https://github.com/mcmonkeyprojects/SwarmUI/blob/master/docs/Using%20More%20GPUs.md)
- [SwarmUI "Use This Workflow" handoff](https://github.com/mcmonkeyprojects/SwarmUI/blob/master/docs/Advanced%20Usage.md)
- [SwarmUI drag-reorderable prompt references and @imageN tokens](https://civitai.com/articles/34538/swarmui-latest-updates)
- [Flora.ai generated clips live-linked into multitrack editor](https://docs.flora.ai/editor/timeline-editor)
- [ComfyUI preview guidance: --preview-method auto or taesd, decoders in models/vae_approx](https://github.com/Comfy-Org/ComfyUI)
- [TAEHV family with taeh3 for MiniMax H3](https://github.com/madebyollin/taehv)
- [Upstream taeh3 failing through generic preview/VAE path, KJNodes workaround](https://github.com/Comfy-Org/ComfyUI/issues/15592)
- [Silent fallback to Latent2RGB masking misconfiguration](https://github.com/MadPonyInteractive/Cubric-Studio/blob/master/docs/preview-decoders.md)
- [Preview override order and node version sensitivity](https://huggingface.co/Kijai/MiniMax-H3-TAE/discussions/9)
