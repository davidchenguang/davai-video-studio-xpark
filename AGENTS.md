# DavAi Video Studio contributor guide

## Scope and architecture

- This is a local-first Electron + React + TypeScript application. The renderer lives in `src/`, privileged desktop operations live in `electron/`, and workflow builders live in `src/lib/`.
- Keep filesystem, process, FFmpeg, and network privileges behind the typed preload bridge. Do not enable Node integration in renderer code.
- Preserve user media and project data. Avoid destructive migrations; make stored-data readers tolerant of older shapes and write versioned or atomic outputs where the existing API supports it.

## Working agreement

- Before editing, run `git status --short` and preserve unrelated user changes.
- Prefer small, typed changes. Reuse existing UI primitives, theme tokens, protocol URLs, and workflow helpers instead of introducing parallel systems.
- For media, test loading, seeking, buffering, decode failure, clip boundaries, and keyboard/accessibility feedback. Local media URLs must continue to support byte-range requests.
- Realtime status must describe the current operation, expose failures with recovery guidance, and use `role="status"`/`aria-live="polite"` for meaningful state changes. Avoid announcing high-frequency frame or timer updates.
- Add comments only for non-obvious constraints. Use `TODO(owner-or-area): reason; completion condition` for deferred work, and do not leave generic TODOs that merely restate the code.

## Validation

Run the narrowest relevant check while iterating, then before handoff run:

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build:web
```

For UI changes, also exercise the affected screen in the Electron app at its smallest supported layout and a typical desktop size. Verify empty, loading, success, failure, and disabled states when applicable.

## Known follow-up audit items

- TODO(movie-editor): replace the current primary-track-only export with a compositor that honors gaps, overlays, transforms, titles, and mixed audio; complete when exported output matches the visible timeline.
- TODO(media-preview): add cached poster-frame extraction for large libraries; complete when media cards show stable thumbnails without each card opening a decoder.
- TODO(testing): add renderer interaction tests for playback boundary advance, buffering/error feedback, modal focus trapping, and reduced-motion behavior.
- TODO(accessibility): complete a keyboard and screen-reader pass on the dense editor/studio screens and document the supported shortcut map in-product.
- TODO(image-models): decide whether the H3 图片 workspace replaces Z-Image as the default still-image generator. The H3-Image workspace is additive for now — Z-Image keeps its sidebar entry and still owns the scratchpad's "生成静帧" handoff; complete when H3-Image's Chinese text rendering and 4K output are validated on customer hardware, and the scratchpad handoff plus the Z-Image entry point are either switched or explicitly kept.
- TODO(h3-image-edit): the local H3-Image dedicated DiT renders T2I stills correctly but produced garbled frames in reference-edit mode; complete when a verified local edit path exists (FL2VA plus the p-h3-image LoRA, or a documented cloud-only route) and the H3 图片 workspace can expose it.

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
