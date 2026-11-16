# Application module map

`src/App.tsx` coordinates workspace navigation, shared generation state, and the H3 render lifecycle. The following modules own narrower responsibilities:

| Module | Responsibility |
| --- | --- |
| `src/lib/workspacePersistence.ts` | Workspace defaults, legacy saved-state recovery, and preview-free storage copies. |
| `src/components/LtxRippleWorkspace.tsx`, `src/components/PhotoEditWorkspace.tsx`, `src/lib/ltxRippleWorkflow.ts`, and `src/lib/fireRedEditWorkflow.ts` | Ripple frame 0 extraction, FireRed photo editing, in-app image handoff, and separate ComfyUI workflow graphs. |
| `src/lib/workspaceProjects.ts` and `src/components/WorkspaceProjectManager.tsx` | Local project index and the save/open manager. Source media files remain in place. |
| `src/lib/workspaceSearch.tsx` | Setting discovery and result labels; the active workspace controls remain the source of truth. |
| `src/lib/workspaceTips.ts` and `src/components/WorkspaceTips.tsx` | Workspace help copy and its dialog. |
| `src/lib/jobPresentation.ts` and `src/components/JobsView.tsx` | Queue status, render configuration, activity display, and the clickable thumbnail that opens the shared media preview. |
| `src/lib/progressStages.ts` | ComfyUI progress stages: node class_type → stage classification, the declared stage weights, global progress composition, and elapsed-time formatting for the render surfaces. |
| `src/lib/music3Vocabulary.ts` and `src/components/Music3Workspace.tsx` | Music 3 vocabulary: the English prompt/storage values (genre, key, progression, keyword and style-descriptor presets) together with their Chinese display labels. The workspace renders the labels; the English values still reach the prompt verbatim. |
| `src/components/LibraryView.tsx`, `src/components/MediaPreviewModal.tsx`, and `src/components/VideoPlayer.tsx` | Render library filtering, output cards, and media playback controls. The preview lightbox is shared by the library and the queue; media-specific footer actions stay with the caller. |
| `src/components/SettingsView.tsx` and `src/components/FormFields.tsx` | Settings panels and shared labeled input controls. |
| `src/lib/h3Diagnostics.ts` and `src/lib/h3NodeDetection.ts` | H3 benchmark persistence, model stack reports (video and H3-Image), and ComfyUI node detection. |
| `src/lib/h3Image.ts` and `src/components/H3ImageWorkspace.tsx` | MiniMax H3-Image still-image graphs (the dedicated image DiT tier and the zero-download FL2VA tier) and the H3 图片 workspace: automatic tier selection with an advanced-options override, single readiness signals shared by badges/gate/auto, tier-clamped size table, tier attribution, local prompt assist, and handoff into the H3 and LTX video workspaces. |
| `src/components/CreatePromptPanel.tsx`, `src/lib/promptPresets.ts`, and `src/lib/promptAutoTags.ts` | Create prompt tools, shared `//` command search, and deterministic H3 section tagging. |
| `electron/promptCompletion.ts` | Bounded Ollama and LM Studio inline suggestion request contracts; privileged transport stays in Electron main. |
| `src/lib/comfyJobState.ts` | Interpret ComfyUI queue/history state and guard terminal updates against cancellation races. |
| `src/lib/jobPersistence.ts` | Restore saved Queue jobs independently, isolating malformed entries and migrating playback URLs. |
| `electron/comfyCancellation.ts` | One cancellation path for Electron IPC and LAN, with modern ComfyUI and legacy queue handling. |
| `electron/legacyBrowserStorage.ts` and `src/components/LegacyMigrationControl.tsx` | Staged, pre-session Local Storage restore with a recoverable backup and visible retry errors. |
| `electron/gpuTelemetry.ts` | Bounded `nvidia-smi` polling behind the desktop process. |

The remaining large sections in `App.tsx` are H3 submission, history/output reconciliation, continuation, and the video workspace UI. A future extraction should keep the history lookup tied to the exact ComfyUI prompt ID and preserve local output paths for continuation. Avoid moving privileged file or process operations into renderer modules.

Run `pnpm test`, `pnpm typecheck`, `pnpm build:web`, `pnpm build:electron`, and `pnpm test:ui-e2e` after changing these boundaries. The UI test requires the Vite server at `127.0.0.1:5173`.
