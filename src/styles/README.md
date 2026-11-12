# Stylesheet boundaries

`src/styles.css` is the ordered entry point for the older application styles. Its imports retain the original cascade order:

| File | Responsibility |
| --- | --- |
| `shell-and-controls.css` | Base tokens, controls, and application shell. |
| `creation-workspaces.css` | Creation forms, previews, and generation controls. |
| `movie-and-mobile.css` | Movie workspace and LAN companion layout. |
| `visual-system.css` | Shared visual language and workspace composition rules. |
| `workstation.css` | Shared desktop layout and accessibility refinements. |
| `feature-workspaces.css` | Movie editor, reference prep, settings, queue, library, and music workspace rules. |
| `studio-refresh.css` | Final shared palette, shell rhythm, panel treatment, and responsive H3 layout. |
| `themes.css` placeholder note — legacy shell layers (`shell-and-controls`, `workstation`, `visual-system`, `studio-polish`, `studio-system`, `workspace-theme`, `original-theme`, `scratchpad`, `guided-studio`, `movie-workspace`, `components/ui/ui.css`) now reference theme variables instead of hardcoded colors; only `/* theme-exempt: … */` or `var(--x, fallback)` pins may carry literals. |
| `themes.css` | Theme variable vocabulary (action/identity/preview families) and the blue/comfy/light `[data-theme]` override blocks; imported after `studio-refresh.css` in `main.tsx`. |

New workspace rules should live beside their feature, while shared colors and shell rules belong in `studio-refresh.css`. Keep the ordered imports in `styles.css` until the remaining legacy rules have been moved by feature; changing their order changes the cascade.
