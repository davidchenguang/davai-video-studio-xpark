'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

const source = fs.readFileSync('src/lib/theme.ts', 'utf8')
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const moduleExports = {}
const fakeStorage = { getItem: () => null, setItem: () => {} }
vm.runInNewContext(code, { exports: moduleExports, window: { localStorage: fakeStorage } }, { filename: 'theme.ts' })

const { THEMES, THEME_STORAGE_KEY, THEME_LABELS, isTheme, normalizeTheme, applyTheme, readThemeMirror, writeThemeMirror } = moduleExports
const host = (list) => Array.from(list)

assert.deepEqual(host(THEMES), ['green', 'blue', 'comfy', 'light'], 'four themes, fixed order')
assert.equal(THEME_STORAGE_KEY, 'minimax.theme')
assert.deepEqual(host(THEME_LABELS).map(([value]) => value), ['green', 'blue', 'comfy', 'light'])
assert.equal(THEME_LABELS.find(([value]) => value === 'blue')[1], '蓝色（经典）')
assert.equal(THEME_LABELS.find(([value]) => value === 'light')[1], '亮色')

assert.equal(isTheme('light'), true)
assert.equal(isTheme('dark'), false)
assert.equal(isTheme(undefined), false)

assert.equal(normalizeTheme('blue'), 'blue')
assert.equal(normalizeTheme('green'), 'green')
assert.equal(normalizeTheme(undefined), 'green')
assert.equal(normalizeTheme('BLUE'), 'green', 'theme ids are case-sensitive')
assert.equal(normalizeTheme(''), 'green')
assert.equal(normalizeTheme(null), 'green')

const target = { dataset: {} }
applyTheme(target, 'light')
assert.equal(target.dataset.theme, 'light')
applyTheme(target, 'green')
assert.equal(target.dataset.theme, 'green', 'green is written explicitly; CSS keeps no green override block')

let stored = null
const storage = { getItem: () => stored, setItem: (key, value) => { stored = value } }
writeThemeMirror('comfy', storage)
assert.equal(stored, 'comfy')
assert.equal(readThemeMirror(storage), 'comfy')
storage.getItem = () => 'bogus'
assert.equal(readThemeMirror(storage), 'green', 'mirror with invalid value falls back to green')
storage.getItem = () => null
assert.equal(readThemeMirror(storage), 'green', 'absent mirror reads as green')

console.log('PASS: theme domain (themes, labels, normalize, apply, mirror)')

// ---- Renderer application points (structural assertions) ----
const readSource = (path) => fs.readFileSync(path, 'utf8')

{
  const main = readSource('src/main.tsx')
  const themesImport = main.indexOf("import './styles/themes.css'")
  const refreshImport = main.indexOf("import './styles/studio-refresh.css'")
  assert.ok(themesImport > -1, 'main.tsx imports themes.css')
  assert.ok(refreshImport > -1 && themesImport > refreshImport, 'themes.css imports after studio-refresh.css')
  assert.ok(/applyTheme\(document\.documentElement,\s*readThemeMirror\(\)\)/.test(main), 'main.tsx applies the theme mirror before render')

  const app = readSource('src/App.tsx')
  assert.ok(/getSettings\(\)\.then/.test(app), 'sanity: App loads settings')
  const thenBody = app.slice(app.indexOf('getSettings().then'))
  assert.ok(thenBody.includes('writeThemeMirror'), 'settings load overwrites the mirror (settings JSON is authoritative)')

  const settingsView = readSource('src/components/SettingsView.tsx')
  assert.ok(settingsView.includes('label="界面主题"'), 'settings has the theme dropdown')
  assert.ok(settingsView.includes('THEME_LABELS'), 'theme options come from THEME_LABELS')
}

// ---- Cross-window sync (structural assertions) ----
{
  const editor = readSource('src/MovieEditorWindow.tsx')
  assert.ok(editor.includes('THEME_STORAGE_KEY'), 'movie editor listens for the theme mirror')
  assert.ok(/addEventListener\('storage'/.test(editor), 'movie editor has a storage listener')
  assert.ok(editor.includes('applyTheme'), 'movie editor applies the theme')

  const app = readSource('src/App.tsx')
  const detach = app.slice(app.indexOf("window.open('', 'davai-video-preview'"))
  assert.ok(detach.includes('dataset.theme'), 'video preview popout copies data-theme at detach')
  const monitor = app.slice(app.indexOf("window.open('', 'davai-video-studio-preview'"))
  assert.ok(monitor.slice(0, 900).includes('dataset.theme'), 'preview monitor popout copies data-theme at detach')
}

// ---- Native shell theme table (structural + behavioral) ----
{
  const code = fs.readFileSync('electron/nativeShellTheme.ts', 'utf8')
  const compiled = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const shellExports = {}
  vm.runInNewContext(compiled, { exports: shellExports }, { filename: 'nativeShellTheme.ts' })
  const { NATIVE_SHELL, PREVIEW_MONITOR_SHELL, shellFor } = shellExports

  assert.deepEqual(Object.keys(NATIVE_SHELL).sort(), ['blue', 'comfy', 'green', 'light'], 'shell table covers four themes')
  assert.equal(shellFor('light'), NATIVE_SHELL.light)
  assert.equal(shellFor('bogus'), NATIVE_SHELL.green, 'invalid theme falls back to the green shell')
  assert.equal(shellFor('light', true), PREVIEW_MONITOR_SHELL, 'preview monitor keeps the dark shell in every theme')
  assert.ok(!/ffffff/i.test(PREVIEW_MONITOR_SHELL.titleBarOverlay.color), 'preview monitor overlay is never light')
  assert.equal(NATIVE_SHELL.green.backgroundColor, '#0c100e', 'green shell greenifies the window background (D12)')
  assert.equal(NATIVE_SHELL.blue.titleBarOverlay.color, '#243c53', 'blue keeps the current overlay color')

  const main = readSource('electron/main.ts')
  assert.ok(!main.includes("nativeTheme.themeSource = 'dark'"), 'hard-coded dark themeSource is gone')
  assert.ok(main.includes("'theme:set-native-shell'"), 'main registers the native-shell IPC channel')
  const preload = readSource('electron/preload.ts')
  assert.ok(preload.includes('setNativeTheme'), 'preload exposes setNativeTheme')
}

// ---- LAN appearance endpoint and companion pages ----
{
  const main = readSource('electron/main.ts')
  assert.ok(main.includes("'/api/lan/appearance'"), 'LAN serves the appearance endpoint')

  const mobile = readSource('src/MobileApp.tsx')
  assert.ok(mobile.includes("'/api/lan/appearance'"), 'MobileApp has a browser-preview mock for appearance')
  assert.ok(mobile.includes('theme-color'), 'MobileApp updates the meta theme-color')

  const app = readSource('src/App.tsx')
  assert.ok(/\/api\/lan\/appearance/.test(app), 'App fetches appearance in LAN browser context')
}

// ---- themes.css variable vocabulary skeleton ----
{
  const themes = readSource('src/styles/themes.css')
  assert.ok(/:root\s*\{/.test(themes), 'themes.css defines the :root base block')
  const themeBlocks = ['blue', 'comfy', 'light'].map((name) => `[data-theme="${name}"]`)
  for (const block of themeBlocks) assert.ok(themes.includes(block), `themes.css has a ${block} override block`)
  assert.ok((themes.match(/color-scheme/g) ?? []).length >= 3, 'each theme declares color-scheme')
  assert.ok(!themes.includes('[data-theme="green"]'), 'green keeps no override block (the base cascade is green)')
  for (const variable of ['--action-from', '--action-to', '--action-soft', '--info-accent', '--info-accent-soft', '--check-tint', '--preview-bg', '--preview-panel', '--preview-line', '--identity-movie', '--playhead']) {
    assert.ok(themes.includes(`${variable}:`), `:root defines ${variable}`)
  }

  const readme = readSource('src/styles/README.md')
  assert.ok(readme.includes('themes.css'), 'styles README documents themes.css')
}

// ---- Light theme block: media surfaces stay dark (D7) ----
{
  const themes = readSource('src/styles/themes.css')
  const lightStart = themes.indexOf('[data-theme="light"]')
  assert.ok(lightStart > -1, 'light block exists')
  const lightEnd = themes.indexOf('}', themes.indexOf('--preview-line', lightStart))
  const lightBody = themes.slice(themes.lastIndexOf('{', themes.indexOf('--preview-bg', lightStart)), lightEnd > -1 ? lightEnd : undefined)
  const previewBg = lightBody.match(/--preview-bg:\s*([^;]+);/)?.[1]?.trim()
  assert.ok(previewBg, 'light block defines --preview-bg')
  assert.ok(!/^#[ef]/i.test(previewBg) && !/^rgb\(\s*(2[0-9]|1[4-9])\d?\b/.test(previewBg), `light keeps --preview-bg dark (D7), got ${previewBg}`)
  const previewPanel = lightBody.match(/--preview-panel:\s*([^;]+);/)?.[1]?.trim()
  assert.ok(previewPanel && /^#[0-6]/i.test(previewPanel), `light keeps --preview-panel dark (D7), got ${previewPanel}`)
  assert.ok(/color-scheme:\s*light/.test(themes.slice(lightStart)), 'light block declares color-scheme: light')
  const accentInk = themes.slice(lightStart).match(/--accent-ink:\s*([^;]+);/)?.[1]?.trim()
  assert.ok(accentInk, 'light block defines --accent-ink (deep green actions need light ink)')
}

// ---- Light theme: an aluminum desk with white paper on it ----
// The light theme is the daylight half of a color-judging studio. The
// requirement holder re-pinned it on 2026-11-13: the ground became an
// aluminum desk a clear step below the panels, so a white panel reads as
// paper on a desk instead of dissolving into a white-on-white page (the
// light theme exists for strong ambient light, where a 2% step disappears);
// the gray ladder carries no green temperature at all; the brand green stops
// being the structure and becomes a seal — the only green on the page; and
// the primary action is ink, not brand.
{
  const themes = readSource('src/styles/themes.css')
  const lightStart = themes.indexOf('html[data-theme="light"]')
  const lightBody = themes.slice(lightStart, themes.indexOf('preview-popout-document'))
  const hexOf = (body, token) => body.match(new RegExp(`${token}:\\s*(#[0-9a-f]{6})`, 'i'))?.[1]
  const channelsOf = (hex) => {
    const m = /^#([0-9a-f]{6})$/i.exec(hex || '')
    return m ? [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)] : null
  }
  const luminanceOf = (hex) => {
    const [r, g, b] = channelsOf(hex).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const alphaOf = (value) => { const m = /\/\s*([\d.]+)%\s*\)/.exec(value); return m ? Number(m[1]) / 100 : null }

  // The desk is a clear step below the paper: a panel reads as a panel.
  const bg = hexOf(lightBody, '--bg')
  const surface = hexOf(lightBody, '--surface')
  assert.ok(bg && /^#e6e7e3$/i.test(bg), `the light ground is the aluminum desk #e6e7e3, got ${bg}`)
  assert.ok(surface && /^#ffffff$/i.test(surface), `the light panels stay white paper, got ${surface}`)
  const paperL = luminanceOf(surface)
  const deskL = luminanceOf(bg)
  assert.ok(paperL - deskL >= 0.15, `the desk is a visible step below the paper (${(paperL - deskL).toFixed(3)})`)
  // The ladder keeps its order: a raised surface, the desk, then the recessed steps.
  const ladder = ['--surface-1', '--bg', '--surface-2', '--surface-3'].map((t) => luminanceOf(hexOf(lightBody, t)))
  assert.ok(ladder[0] > ladder[1] && ladder[1] > ladder[2] && ladder[2] > ladder[3],
    `the light ladder keeps its order (${ladder.map((v) => v.toFixed(3)).join(' > ')})`)

  // No green temperature anywhere: the green channel never leads on the
  // surfaces, and never leads at all on the inks (the old ladder carried the
  // brand temperature into every step, down to the text color).
  for (const token of ['--bg', '--surface-1', '--surface-2', '--surface-3', '--line', '--line-strong']) {
    const value = hexOf(lightBody, token)
    const c = channelsOf(value)
    assert.ok(c, `light: ${token} is a hex (${value})`)
    assert.ok(Math.max(...c) - Math.min(...c) <= 8, `light: ${token} (${value}) stays a neutral gray — no visible tint`)
    assert.ok(c[1] <= Math.max(c[0], c[2]) + 1, `light: ${token} (${value}) carries no green cast — the G channel does not lead`)
  }
  for (const token of ['--text', '--muted', '--muted-2']) {
    const value = hexOf(lightBody, token)
    const c = channelsOf(value)
    assert.ok(c && c[1] <= Math.max(c[0], c[2]), `light: ${token} (${value}) is an ink with no green cast`)
  }

  // The brand green is a seal, not the structure: it keeps the focus, nav and
  // selection roles, and the primary action is ink.
  const accent = hexOf(lightBody, '--accent')
  assert.ok(accent && /^#2f6417$/i.test(accent), `the brand green survives as the seal (${accent})`)
  const actionFrom = hexOf(lightBody, '--action-from')
  assert.ok(actionFrom && /^#2c3136$/i.test(actionFrom), `the primary action is graphite ink, not brand green (${actionFrom})`)
  const actionChannels = channelsOf(actionFrom)
  assert.ok(Math.max(...actionChannels) - Math.min(...actionChannels) <= 12, 'the primary action is achromatic')
  // The desk is lit by a graphite sheen, not washed with green.
  const pageGlow = lightBody.match(/--page-glow:\s*([^;]+);/)?.[1]
  assert.ok(pageGlow && /rgb\(\s*44 49 54/.test(pageGlow), `the light page glow is a graphite sheen, not a green wash (${pageGlow})`)

  // The canvas is still the charcoal monitor (D7), untouched by the re-pin.
  const previewPanel = hexOf(lightBody, '--preview-panel')
  assert.ok(previewPanel && /^#191a1b$/i.test(previewPanel), `the media canvas stays the charcoal monitor (${previewPanel})`)

  // Daylight chrome weights are unchanged.
  const scrimLight = lightBody.match(/--scrim:\s*([^;]+);/)?.[1]
  assert.ok(scrimLight && (alphaOf(scrimLight) ?? 1) < 0.5, `light: the dialog scrim is daylight-weight (${scrimLight})`)
  const popoverLight = lightBody.match(/--oy-shadow-popover:\s*([^;]+);/)?.[1]
  assert.ok(popoverLight && (alphaOf(popoverLight) ?? 1) < 0.3, `light: the popover shadow is daylight-weight (${popoverLight})`)
  const dialogShadowLight = lightBody.match(/--dialog-shadow:\s*([^;]+);/)?.[1]
  assert.ok(dialogShadowLight && (alphaOf(dialogShadowLight) ?? 1) < 0.4, `light: the dialog shadow is daylight-weight (${dialogShadowLight})`)
  const rootBody = themes.slice(themes.indexOf(':root'), themes.indexOf('}', themes.indexOf(':root')))
  assert.ok(/--scrim:\s*rgb\(3 8 12 \/ 78%\)/.test(rootBody), ':root pins the night scrim the dark themes render today')
  assert.ok(/--dialog-shadow:\s*0 28px 90px rgb\(0 0 0 \/ 70%\)/.test(rootBody), ':root pins the night dialog shadow the dark themes render today')
  const ui = readSource('src/components/ui/ui.css')
  assert.ok(/\.ui-dialog-overlay\{[^}]*background:var\(--scrim/.test(ui), 'the dialog overlay uses the scrim vocabulary')
  assert.ok(/\.ui-dialog-content\{[^}]*box-shadow:var\(--dialog-shadow/.test(ui), 'the dialog shadow uses the dialog-shadow vocabulary')
  assert.ok(/html\[data-theme="light"\][^{]*::selection\s*\{/.test(themes), 'the light theme styles the selection highlight')
  assert.ok(/html\[data-theme="light"\] ::selection\s*\{[^}]*background:\s*rgb\(47 100 23/.test(themes), 'the light selection follows the seal green')
  // The native shell and the mobile chrome follow the desk.
  const shell = readSource('electron/nativeShellTheme.ts')
  assert.ok(/light:\s*\{\s*backgroundColor:\s*'#e6e7e3'/.test(shell), 'the native shell ground matches the aluminum desk')
  assert.ok(/light:\s*\{[^}]*symbolColor:\s*'#121416'/.test(shell), 'the native shell glyphs follow the light ink')
  const mobile = readSource('src/MobileApp.tsx')
  assert.ok(mobile.includes("light: '#e6e7e3'"), 'the mobile browser chrome matches the aluminum desk')
}

// ---- The monitor: one canvas for every media surface ----
// Media is judged against a neutral ground, so the canvas stays dark in every
// theme (D7). What changed on 2026-11-13 (requirement holder): the light
// theme's canvas is re-pinned to a neutral charcoal with no green
// temperature, so the monitor reads as equipment standing on paper instead of
// as the green theme's black; every media surface in the app paints that one
// ground; and the dark-room tools keep their own identity palette instead of
// adding one more black to the room.
{
  const themes = readSource('src/styles/themes.css')
  const rootBody = themes.slice(themes.indexOf(':root'), themes.indexOf('}', themes.indexOf(':root')))
  const lightStart = themes.indexOf('html[data-theme="light"]')
  const lightBody = themes.slice(lightStart, themes.indexOf('preview-popout-document'))
  const blueBody = themes.slice(themes.indexOf('html[data-theme="blue"]'), lightStart)
  const comfyBody = themes.slice(themes.indexOf('html[data-theme="comfy"]'), lightStart)

  const hexOf = (body, token) => body.match(new RegExp(`${token}:\\s*(#[0-9a-f]{6})`, 'i'))?.[1]
  // The channel spread of a hex: 0 means a perfectly neutral gray. The paper
  // ladder deliberately leads in green; the monitor must not.
  const spread = (hex) => {
    const m = /^#([0-9a-f]{6})$/i.exec(hex || '')
    if (!m) return null
    const ch = [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16))
    return Math.max(...ch) - Math.min(...ch)
  }
  const relLum = (hex) => {
    const m = /^#([0-9a-f]{6})$/i.exec(hex || '')
    if (!m) return null
    const lin = [0, 2, 4].map(i => {
      const v = parseInt(m[1].slice(i, i + 2), 16) / 255
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
    })
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
  }

  // 1. The dark themes render the canvas they render today: zero visible
  //    difference against the pre-branch baseline (D6).
  assert.ok(/--preview-panel:\s*#0a0f0c/.test(rootBody), ':root pins the canvas the dark themes render today')
  assert.ok(!/--preview-panel/.test(blueBody), 'the blue theme shares the one canvas (D16 keeps its upstream literals)')
  assert.ok(!/--preview-panel/.test(comfyBody), 'the comfy theme shares the one canvas')

  // 2. The light theme's canvas is a neutral charcoal — no green temperature.
  const lightCanvas = hexOf(lightBody, '--preview-panel')
  assert.ok(lightCanvas, 'the light theme pins the canvas')
  assert.ok((spread(lightCanvas) ?? 99) <= 4, `light: the canvas is a neutral charcoal (${lightCanvas}, spread ${spread(lightCanvas)}) — the paper's green temperature stops at the studio walls`)
  const lightGround = hexOf(lightBody, '--bg')
  const canvasVsGround = (relLum(lightGround) + 0.05) / (relLum(lightCanvas) + 0.05)
  assert.ok(canvasVsGround >= 12, `light: the canvas is far darker than the paper ground (${canvasVsGround.toFixed(1)}:1)`)

  // 3. The canvas furniture follows the same neutral family.
  const lightEmpty = hexOf(lightBody, '--preview-empty-surface')
  assert.ok(lightEmpty && (spread(lightEmpty) ?? 99) <= 6, `light: the empty-state card is neutral too (${lightEmpty})`)
  assert.ok(relLum(lightEmpty) > relLum(lightCanvas), 'light: the empty-state card reads as raised off the canvas')
  const lightHair = hexOf(lightBody, '--preview-line')
  assert.ok(lightHair && (spread(lightHair) ?? 99) <= 6, `light: the canvas hairline is neutral (${lightHair})`)

  // 4. Media surfaces that follow the studio ground still need their own ink,
  //    hairline and alpha checker.
  for (const token of ['--preview-hairline', '--preview-caption-ink', '--preview-strong-ink', '--preview-checker', '--preview-empty-ground']) {
    assert.ok(new RegExp(`${token}:`).test(rootBody), `:root defines ${token}`)
    assert.ok(new RegExp(`${token}:`).test(lightBody), `the light theme re-pins ${token}`)
  }
  assert.ok(/--preview-checker:\s*#[0-9a-f]{6}/i.test(lightBody), 'the light theme checks alpha against a solid gray, not against white')
  // An empty media area is always dark. In the dark themes the ground behind
  // it is already dark, so it stays transparent — exactly what they render
  // today (D6). The light theme re-pins it to the charcoal canvas, because
  // the ground behind it there is paper.
  assert.ok(
    /--preview-empty-ground:\s*transparent/.test(rootBody),
    ':root leaves the empty media ground to the ground behind it',
  )
  assert.ok(
    /--preview-empty-ground:\s*var\(--preview-panel\)/.test(lightBody),
    'the light theme paints the empty media area with the charcoal canvas',
  )

  // 5. Every media surface paints the one canvas.
  const audit = readSource('src/workspace-audit.css')
  assert.ok(/\.character-primary-preview\s*\{[^}]*background:\s*var\(--preview-panel\)/.test(audit), 'the character identity preview paints the canvas vocabulary')
  const features = readSource('src/styles/feature-workspaces.css')
  assert.ok(/\.reference-prep-source\s*\{[^}]*background:\s*var\(--preview-panel\)/.test(features), 'the reference-prep source paints the canvas vocabulary')
  assert.ok(/\.reference-prep-results figure\s*\{[^}]*background:\s*var\(--preview-panel\)/.test(features), 'the reference-prep result paints the canvas vocabulary')
  assert.ok(/\.reference-prep-results img\s*\{[^}]*var\(--preview-checker\)/.test(features), 'the alpha checkerboard uses the checker vocabulary')
  assert.ok(/\.reference-prep-source figcaption\s*\{[^}]*color:\s*var\(--preview-caption-ink\)/.test(features), 'the caption on a canvas uses the caption-ink vocabulary')
  assert.ok(/\.reference-prep-empty\s*\{[^}]*background:\s*var\(--preview-empty-ground\)/.test(features), 'the empty media area keeps the canvas rule in every theme')
  assert.ok(/\.reference-prep-empty\s*\{[^}]*color:\s*var\(--preview-caption-ink\)/.test(features), 'the empty media area uses the caption-ink vocabulary')
  assert.ok(/\.reference-prep-empty strong\s*\{[^}]*color:\s*var\(--preview-strong-ink\)/.test(features), 'the empty media area heading uses the strong-ink vocabulary')

  // 6. The dark-room tools keep their identity palette, written down once.
  for (const token of ['--tool-card-from', '--tool-card-to', '--tool-card-line', '--tool-stage', '--tool-inset', '--tool-shadow', '--ripple-card-from', '--ripple-card-to', '--ripple-card-line', '--ripple-shadow']) {
    assert.ok(new RegExp(`${token}:`).test(rootBody), `:root defines ${token}`)
    assert.ok(!new RegExp(`${token}:`).test(lightBody), `${token} is theme-independent — the tools keep their own identity`)
  }
  const photoEdit = readSource('src/components/photo-edit.css')
  const ripple = readSource('src/components/ltx-ripple.css')
  const hardcoded = ['#11131c', '#10121b', '#0d0f17', '#171923', '#181923', '#252637', '#1b1d2a', '#272733', '#37394a', '#3b3d4d']
  for (const hex of hardcoded) {
    assert.ok(!photoEdit.includes(hex), `photo-edit.css has no hardcoded dark (${hex}) — the tool vocabulary owns it`)
    assert.ok(!ripple.includes(hex), `ltx-ripple.css has no hardcoded dark (${hex}) — the tool vocabulary owns it`)
  }
  assert.ok(/\.photo-edit-card\s*\{[^}]*var\(--tool-card-from\)[^}]*var\(--tool-card-to\)/.test(photoEdit), 'the photo-edit card paints the tool card vocabulary')
  assert.ok(/\.photo-edit-image-picker[^}]*\{[^}]*background:\s*var\(--tool-stage\)/.test(photoEdit), 'the photo-edit stage paints the tool stage vocabulary')
  assert.ok(/\.ripple-card\s*\{[^}]*var\(--ripple-card-from\)[^}]*var\(--ripple-card-to\)/.test(ripple), 'the ripple card keeps its own identity in the tool vocabulary')
  assert.ok(/\.ripple-result-stage\s*\{[^}]*background:\s*var\(--tool-stage\)/.test(ripple), 'the ripple stage paints the tool stage vocabulary')
}

// ---- No self-referencing custom properties (Chromium poisons them) ----
// `--x: var(--x)` — with or without a fallback — is a cycle: the declaration
// computes to the guaranteed-invalid value and every usage silently falls
// back to `unset`. It is invisible in review and shows up as a wrong color.
{
  const cssFiles = []
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`
      if (entry.isDirectory()) walk(path)
      else if (entry.name.endsWith('.css')) cssFiles.push(path)
    }
  }
  walk('src')
  const selfReference = /(--[a-z0-9-]+)\s*:\s*var\(\s*\1\s*(?:,|\))/gi
  const offenders = []
  for (const file of cssFiles) {
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
      let match
      selfReference.lastIndex = 0
      while ((match = selfReference.exec(line))) offenders.push(`${file}:${index + 1} ${match[1]}`)
    })
  }
  assert.deepEqual(offenders, [], `no custom property may reference itself: ${offenders.join(', ')}`)
}

// ---- Pinned workspace identity tones (D15) ----
{
  const themes = readSource('src/styles/themes.css')
  for (const token of ['--asset-wardrobe-tone', '--asset-hair-tone', '--asset-location-tone', '--music-accent']) {
    assert.ok(themes.includes(`${token}:`), `themes.css pins ${token}`)
  }
  const movie = readSource('src/styles/movie-and-mobile.css')
  assert.ok(/--asset-tone:\s*var\(--asset-wardrobe-tone\)/.test(movie), 'the wardrobe studio uses the pinned wardrobe tone')
  assert.ok(/--asset-tone:\s*var\(--asset-hair-tone\)/.test(movie), 'the hair studio uses the pinned hair tone')
  assert.ok(/--asset-tone:\s*var\(--asset-location-tone\)/.test(movie), 'the location studio uses the pinned location tone')
  const feature = readSource('src/styles/feature-workspaces.css')
  assert.ok(/--accent:\s*var\(--music-accent\)/.test(feature), 'the music workspace keeps its own accent identity')
}

// ---- Emphasis ink is opaque (readable as text) ----
{
  const themes = readSource('src/styles/themes.css')
  const values = [...themes.matchAll(/--check-tint:\s*([^;]+);/g)].map((match) => match[1].trim())
  assert.ok(values.length >= 4, 'every theme defines --check-tint')
  for (const value of values) {
    assert.ok(!/\//.test(value) && !/^#[0-9a-f]{8}$/i.test(value), `--check-tint must be opaque (it is used as a text color), got ${value}`)
  }
}

// ---- Green theme keeps the pre-branch semantic hues (D15) ----
{
  const themes = readSource('src/styles/themes.css')
  const root = themes.slice(themes.indexOf(':root'), themes.indexOf('}', themes.indexOf(':root')))
  assert.ok(/--warning:\s*#e3ad55/.test(root), 'green keeps the pre-branch warning hue')
  assert.ok(/--danger:\s*#f1707e/.test(root), 'green keeps the pre-branch danger hue')
  assert.ok(/--success:\s*#55c98a/.test(root), 'green keeps the pre-branch success hue')
}

// ---- Light theme: detached media windows stay dark (D7) ----
{
  const themes = readSource('src/styles/themes.css')
  const lightStart = themes.indexOf('html[data-theme="light"]')
  const mediaWindow = themes.slice(lightStart).match(/html\[data-theme="light"\][^{]*\.preview-popout-document[^{]*\{([^}]*)\}/)
  assert.ok(mediaWindow, 'light theme pins the detached media window surfaces')
  const mediaBg = mediaWindow[1].match(/--bg:\s*([^;]+);/)?.[1]?.trim()
  assert.ok(mediaBg && /^#[0-6]/i.test(mediaBg), `the detached media window keeps a dark ground in the light theme, got ${mediaBg}`)
  const mediaText = mediaWindow[1].match(/--text:\s*([^;]+);/)?.[1]?.trim()
  assert.ok(mediaText && /^#[c-f]/i.test(mediaText), `the detached media window keeps light ink in the light theme, got ${mediaText}`)
}

// ---- Media popouts are marked so D7 applies (renderer) ----
{
  const app = readSource('src/App.tsx')
  const videoPopout = app.slice(app.indexOf("'davai-video-preview'"), app.indexOf("'davai-video-preview'") + 1200)
  assert.ok(videoPopout.includes('preview-popout-document'), 'the video preview popout marks its document (media surfaces stay dark)')
  assert.ok(app.includes('dataset.theme'), 'the popouts still carry the theme id (theme sync)')
}

// ---- Native shell: media windows keep the dark chrome, windows are themed at creation ----
{
  const main = readSource('electron/main.ts')
  const didCreate = main.slice(main.indexOf("on('did-create-window'"), main.indexOf("on('did-create-window'") + 800)
  assert.ok(didCreate.includes('frameName'), 'did-create-window decides the shell from the frame name')
  assert.ok(/shellFor\([^)]*,\s*(isMediaWindow|isPreviewMonitor)\)/.test(didCreate), 'did-create-window tells the media windows apart')
  assert.ok(main.includes("'davai-video-preview'"), 'the video preview popout is a media window')

  const studioWindow = main.slice(main.indexOf('function createWindow()'), main.indexOf('function createWindow()') + 900)
  assert.ok(!/backgroundColor:\s*'#0c100e'/.test(studioWindow), 'the studio window is created with the themed background (no green flash)')
  const movieWindow = main.slice(main.indexOf('function createMovieEditorWindow()'), main.indexOf('function createMovieEditorWindow()') + 900)
  assert.ok(!/backgroundColor:\s*'#171719'/.test(movieWindow), 'the movie editor window is created with the themed background')
}

// ---- LAN browser companion follows the studio theme ----
{
  const app = readSource('src/App.tsx')
  const lanEffect = app.slice(app.indexOf("'/api/lan/appearance'") - 1200, app.indexOf("'/api/lan/appearance'") + 400)
  assert.ok(!/typeof window\.minimax\?\.setNativeTheme === 'function'/.test(lanEffect), 'the LAN appearance fetch is not gated on the mock bridge (the mock defines the same function)')
  assert.ok(/Electron/.test(lanEffect), 'the LAN appearance fetch detects the Electron runtime')
}

// ---- Green-theme fidelity: the cleanup may not re-tint non-blue emphasis ----
// The pre-branch baseline styled these elements white/muted/neutral. Mapping
// them to the interactive-accent token silently recolored them (found by the
// base-vs-branch computed-color diff after review).
{
  const video = readSource('src/video-workspace.css')
  // Headings and labels that were white/near-white in the baseline stay text-colored.
  assert.ok(!/\.video-workflow-intro h2\s*\{[^}]*--info-accent/.test(video), 'the workflow intro heading keeps its baseline white (not the accent)')
  assert.ok(!/\.video-step-control strong\s*\{[^}]*--info-accent/.test(video), 'the step-control heading keeps its baseline white')
  assert.ok(!/\.video-quality-note strong\s*\{[^}]*--info-accent/.test(video), 'the quality-note heading keeps its baseline white')
  assert.ok(!/\.video-asset-empty strong\s*\{[^}]*--info-accent/.test(video), 'the asset-empty heading keeps its baseline white')
  assert.ok(!/\.video-workspace-switcher\s*\{[^}]*--info-accent/.test(video), 'the workspace switcher keeps its baseline ink')
  // Labels that were muted in the baseline stay muted.
  assert.ok(/\.video-pipeline-state\s*\{[^}]*color:\s*var\(--muted\)/.test(video), 'the pipeline state chip keeps its baseline muted ink')
  assert.ok(/\.video-mode-identity small\s*\{[^}]*color:\s*var\(--muted\)/.test(video), 'the mode identity small keeps its baseline muted ink')
  // Field borders were neutral blue-grays in the baseline, not accents.
  const workstation = readSource('src/styles/workstation.css')
  assert.ok(!/\.field-border:\s*var\(--info-accent\)/.test(workstation), 'field borders stay neutral (not the accent)')
}

// ---- Badges keep their baseline pill palette (identity, D15) ----
{
  const ui = readSource('src/components/ui/ui.css')
  assert.ok(/\.ui-badge-warning\{[^}]*#785c35/.test(ui), 'the warning badge keeps its warm pill border')
  assert.ok(/\.ui-badge-warning\{[^}]*#4d3a23/.test(ui), 'the warning badge keeps its warm pill ground')
  assert.ok(/\.ui-badge-warning\{[^}]*#f0cf98/.test(ui), 'the warning badge keeps its warm pill ink')
  assert.ok(/\.ui-badge-primary\{[^}]*#174a70/.test(ui), 'the primary badge keeps its baseline pill ground')
  assert.ok(/\.ui-badge-success\{[^}]*#164b38/.test(ui), 'the success badge keeps its baseline pill ground')
}

// ---- Danger buttons keep their baseline soft-danger treatment ----
{
  const production = readSource('src/production-workspace.css')
  assert.ok(!/\.danger-button\s*\{[^}]*var\(--danger,\s*var\(--danger/.test(production), 'the danger button does not self-reference --danger')
  assert.ok(/\.danger-button\s*\{[^}]*color-mix\(in srgb,\s*var\(--danger\)/.test(production), 'the danger button keeps its soft translucent treatment per theme')
  const branchCreation = readSource('src/styles/creation-workspaces.css')
  assert.ok(!/\.danger-button\s*\{[^}]*background:\s*var\(--danger\)/.test(branchCreation), 'creation danger buttons keep the translucent treatment, not a solid fill')
}

// ---- Ground-contrast invariants ----
// A runtime contrast sweep (every view x every theme) found text painted in
// the ground color of its own surface: the LTX Ripple and photo-edit pages
// carry a hardcoded light ink while the light theme's ground is pale, and the
// character studio's primary-preview caption sits on a fixed dark figure.
// These assertions pin the invariants that keep that from coming back.
{
  const themes = readSource('src/styles/themes.css')
  const refresh = readSource('src/styles/studio-refresh.css')

  const hexOf = (value) => {
    const m = /^#([0-9a-f]{6})$/i.exec(String(value).trim())
    return m ? `#${m[1].toLowerCase()}` : null
  }
  const blockBody = (css, startIndex) => {
    const open = css.indexOf('{', startIndex)
    let depth = 0
    for (let i = open; i < css.length; i++) {
      if (css[i] === '{') depth++
      else if (css[i] === '}') { depth--; if (depth === 0) return css.slice(open + 1, i) }
    }
    return ''
  }
  const declarations = (body) => {
    const map = new Map()
    for (const m of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) map.set(m[1], m[2].replace(/!important$/i, '').trim())
    return map
  }
  const merge = (...maps) => {
    const out = new Map()
    for (const map of maps) for (const [k, v] of map) out.set(k, v)
    return out
  }
  const themeBlocks = (id) => {
    const tokens = new Map()
    const re = new RegExp(`html\\[data-theme="${id}"\\][^{]*\\{`, 'g')
    let match
    while ((match = re.exec(themes))) {
      const selector = themes.slice(match.index, themes.indexOf('{', match.index))
      if (selector.includes('preview-popout-document')) continue // the detached media windows are their own palette
      for (const [k, v] of declarations(blockBody(themes, match.index))) tokens.set(k, v)
    }
    return tokens
  }
  const themesRoot = declarations(blockBody(themes, themes.indexOf(':root')))
  const greenRoot = declarations(blockBody(refresh, refresh.indexOf(':root')))
  const palette = {
    green: merge(greenRoot, themesRoot),
    blue: merge(themesRoot, themeBlocks('blue')),
    comfy: merge(themesRoot, themeBlocks('comfy')),
    light: merge(themesRoot, themeBlocks('light')),
  }
  const resolve = (tokens, name, seen = new Set()) => {
    if (!tokens.has(name) || seen.has(name)) return null
    seen.add(name)
    const raw = tokens.get(name)
    const ref = /^var\(\s*(--[a-z0-9-]+)/i.exec(raw)
    if (ref) return resolve(tokens, ref[1], seen)
    return hexOf(raw)
  }
  const luminance = (hex) => {
    const channels = [0, 2, 4].map((i) => parseInt(hex.slice(1 + i, 3 + i), 16) / 255)
    const [r, g, b] = channels.map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const contrast = (a, b) => {
    const l1 = luminance(a)
    const l2 = luminance(b)
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
  }

  for (const id of ['green', 'blue', 'comfy', 'light']) {
    const tokens = palette[id]
    const surface3 = resolve(tokens, '--surface-3')
    const muted2 = resolve(tokens, '--muted-2')
    assert.ok(surface3 && muted2, `${id}: --surface-3 and --muted-2 resolve to hex colors`)
    const ratio = contrast(muted2, surface3)
    assert.ok(ratio >= 4.5, `${id}: --muted-2 (${muted2}) passes AA-normal on --surface-3 (${surface3}) — ${ratio.toFixed(2)}:1`)
  }

  {
    const light = palette.light
    const surface3 = resolve(light, '--surface-3')
    const accent = resolve(light, '--accent')
    const accentRatio = contrast(accent, surface3)
    assert.ok(accentRatio >= 4.5, `light: --accent (${accent}) passes AA-normal on --surface-3 (${surface3}) — ${accentRatio.toFixed(2)}:1`)
    const bg = resolve(light, '--bg')
    // The light page ground carries a soft green glow, so the secondary ink
    // has to read on the tinted ground too, not only on the flat background.
    const tintedGround = '#cadedb'
    for (const token of ['--ripple-kicker', '--photo-edit-eyebrow']) {
      const value = resolve(light, token)
      assert.ok(value, `light: ${token} is defined`)
      const ratio = contrast(value, bg)
      assert.ok(ratio >= 4.5, `light: ${token} (${value}) passes AA-normal on the page ground (${bg}) — ${ratio.toFixed(2)}:1`)
      const tintedRatio = contrast(value, tintedGround)
      assert.ok(tintedRatio >= 4.5, `light: ${token} (${value}) passes AA-normal on the tinted page ground (${tintedGround}) — ${tintedRatio.toFixed(2)}:1`)
    }
    const muted = resolve(light, '--muted')
    assert.ok(muted, 'light: --muted is defined')
    for (const ground of [bg, resolve(light, '--surface-3'), tintedGround]) {
      const ratio = contrast(muted, ground)
      assert.ok(ratio >= 4.5, `light: --muted (${muted}) passes AA-normal on the page ground (${ground}) — ${ratio.toFixed(2)}:1`)
    }
    const emptySurface = resolve(light, '--preview-empty-surface')
    assert.ok(emptySurface, 'light: --preview-empty-surface is defined')
    const previewInk = resolve(light, '--preview-ink')
    const emptyRatio = contrast(previewInk, emptySurface)
    assert.ok(emptyRatio >= 4.5, `light: the preview empty-state card (${emptySurface}) keeps a readable ink (${previewInk}) — ${emptyRatio.toFixed(2)}:1`)
    for (const id of ['green', 'blue', 'comfy']) {
      const tokens = palette[id]
      const surface2 = resolve(tokens, '--surface-2')
      const previewInkId = resolve(tokens, '--preview-ink')
      const ratio = contrast(previewInkId, surface2)
      assert.ok(ratio >= 4.5, `${id}: the preview empty-state card keeps a readable ink (${previewInkId} on ${surface2}) — ${ratio.toFixed(2)}:1`)
    }
  }

  // Tool workspaces that keep their own palette still follow the theme ground.
  const ripple = readSource('src/components/ltx-ripple.css')
  const photo = readSource('src/components/photo-edit.css')
  assert.ok(/\.ripple-workspace\{[^}]*color:var\(--text/.test(ripple), 'the Ripple page text follows the theme ground')
  assert.ok(/\.ripple-heading p\{[^}]*color:var\(--muted/.test(ripple), 'the Ripple subtitle follows the theme ground')
  assert.ok(/\.ripple-kicker\{[^}]*color:var\(--ripple-kicker/.test(ripple), 'the Ripple eyebrow uses its theme token')
  assert.ok(/\.photo-edit-workspace\{[^}]*color:var\(--text/.test(photo), 'the photo-edit page text follows the theme ground')
  assert.ok(/\.photo-edit-heading p\{[^}]*color:var\(--muted/.test(photo), 'the photo-edit subtitle follows the theme ground')
  assert.ok(/\.photo-edit-eyebrow\{[^}]*color:var\(--photo-edit-eyebrow/.test(photo), 'the photo-edit eyebrow uses its theme token')
  // The cards keep their own dark surface in every theme, so the ink that
  // reads on them is constant: the card declares it, the page ground does not.
  assert.ok(/\.ripple-card\{[^}]*color:var\(--tool-ink/.test(ripple), 'the Ripple card declares the ink that reads on its dark surface')
  assert.ok(/\.photo-edit-card\{[^}]*color:var\(--tool-ink/.test(photo), 'the photo-edit card declares the ink that reads on its dark surface')
  assert.ok(/\.photo-edit-back\{[^}]*color:var\(--tool-ink-muted/.test(photo), 'the photo-edit back link sits inside the dark card, so it uses the card ink')

  // The tool ink is constant across themes and has to read on the card's own
  // gradient, whose stops are hardcoded in the tool stylesheets.
  const toolInk = resolve(palette.green, '--tool-ink')
  assert.ok(toolInk, '--tool-ink is defined')
  for (const id of ['green', 'blue', 'comfy', 'light']) {
    assert.equal(resolve(palette[id], '--tool-ink'), toolInk, `${id}: --tool-ink stays the same in every theme`)
  }
  // The card gradient stops now live in the tool vocabulary, so the contrast
  // check reads the stops from the tokens rather than from the stylesheet.
  // Each tool keeps its own card stops — the card is that tool's face.
  const cardStops = ['--ripple-card-from', '--ripple-card-to'].map((token) => resolve(palette.green, token))
  assert.ok(cardStops.every(Boolean), 'the Ripple card gradient stops resolve from the tool vocabulary')
  for (const stop of cardStops) {
    const ratio = contrast(toolInk, stop)
    assert.ok(ratio >= 4.5, `--tool-ink (${toolInk}) passes AA-normal on the Ripple card ground (${stop}) — ${ratio.toFixed(2)}:1`)
  }
  const photoStops = ['--tool-card-from', '--tool-card-to'].map((token) => resolve(palette.green, token))
  assert.ok(photoStops.every(Boolean), 'the photo-edit card gradient stops resolve from the tool vocabulary')
  for (const stop of photoStops) {
    const ratio = contrast(toolInk, stop)
    assert.ok(ratio >= 4.5, `--tool-ink (${toolInk}) passes AA-normal on the photo-edit card ground (${stop}) — ${ratio.toFixed(2)}:1`)
  }

  // The character primary preview is a fixed dark surface: its caption needs a
  // light ink in every theme, not the theme text color.
  const audit = readSource('src/workspace-audit.css')
  assert.ok(/\.character-primary-preview > button\s*\{[^}]*color:\s*var\(--preview-ink\)/.test(audit), 'the primary-preview button uses the dark-surface ink')
  assert.ok(/\.character-primary-preview > button strong\s*\{[^}]*color:\s*var\(--preview-ink\)/.test(audit), 'the primary-preview caption uses the dark-surface ink')
  assert.ok(/\.character-primary-preview > button svg\s*\{[^}]*color:\s*var\(--preview-accent\)/.test(audit), 'the primary-preview icon uses the preview accent')
  assert.ok(/\.character-primary-preview figcaption \.ui-button-ghost\s*\{[^}]*color:\s*var\(--preview-ink\)/.test(audit), 'the primary-preview actions use the dark-surface ink')
  assert.ok(/\.movie-media-list > p\s*\{[^}]*color:\s*var\(--muted\)/.test(audit), 'the movie media empty-state follows the theme ink')

  // The scratchpad is a normal workspace, not a D7 media surface: its glass
  // panels follow the theme, so the theme inks inside them keep reading.
  const scratchpad = readSource('src/scratchpad.css')
  assert.ok(/--scratch-panel:\s*var\(--scratch-glass/.test(scratchpad), 'the scratchpad panel uses the theme-derived glass token')
  assert.ok(/\.h3-prompt-editor > textarea\s*\{[^}]*background:\s*var\(--scratch-field/.test(scratchpad), 'the scratchpad writing field uses the theme-derived field token')
  assert.ok(/\.scratchpad-status\s*\{[^}]*background:\s*var\(--scratch-chip/.test(scratchpad), 'the scratchpad status chip uses the theme-derived chip token')
  const lightGlass = resolve(palette.light, '--scratch-glass')
  assert.ok(lightGlass, 'light: --scratch-glass is defined')
  const lightText = resolve(palette.light, '--text')
  const glassRatio = contrast(lightText, lightGlass)
  assert.ok(glassRatio >= 4.5, `light: the scratchpad glass panel (${lightGlass}) carries the page text (${lightText}) — ${glassRatio.toFixed(2)}:1`)

  // The live monitor is a media surface (D7): it stays dark in every theme,
  // so its own ink and accent have to be the dark-surface ones.
  const cont = readSource('src/components/continue-workspace.css')
  assert.ok(/\.continue-live-monitor\{[^}]*color:\s*var\(--preview-ink/.test(cont), 'the live monitor uses the dark-surface ink')
  assert.ok(/\.continue-monitor-empty\{[^}]*color:\s*var\(--preview-ink/.test(cont), 'the live monitor empty state uses the dark-surface ink')
  assert.ok(/\.continue-live-monitor>header\{[^}]*background:\s*var\(--monitor-chrome/.test(cont), 'the live monitor header uses the theme-derived chrome token')
  assert.ok(/\.continue-live-monitor>header small\{[^}]*color:\s*var\(--monitor-accent/.test(cont), 'the live monitor kicker uses the monitor accent')
  const lightMonitor = resolve(palette.light, '--monitor-chrome')
  assert.ok(lightMonitor, 'light: --monitor-chrome is defined')
  const monitorRatio = contrast(resolve(palette.light, '--preview-ink'), lightMonitor)
  assert.ok(monitorRatio >= 4.5, `light: the live monitor chrome (${lightMonitor}) keeps a readable ink — ${monitorRatio.toFixed(2)}:1`)

  // The empty-state card inside a preview stage stays dark in every theme
  // (D7), so its own text needs the dark-surface ink.
  const workstation = readSource('src/styles/workstation.css')
  assert.ok(/\.empty-preview span \{[^}]*color:\s*var\(--preview-empty-ink/.test(workstation), 'the preview empty-state card uses the preview empty ink')
  assert.ok(!/\.empty-preview span,\n\.render-state span/.test(workstation), 'the preview empty-state card is not painted with the theme help colour')
  const lightEmptyInk = resolve(palette.light, '--preview-empty-ink')
  assert.ok(lightEmptyInk, 'light: --preview-empty-ink is defined')
  const emptyInkRatio = contrast(lightEmptyInk, resolve(palette.light, '--preview-empty-surface'))
  assert.ok(emptyInkRatio >= 4.5, `light: the preview empty-state card keeps a readable ink (${lightEmptyInk}) — ${emptyInkRatio.toFixed(2)}:1`)

  // The soft-danger button paints the danger hue over the theme surface; the
  // danger text has to read on that mix in every theme — this is the button
  // the requirement holder reported as invisible.
  const mixHex = (fg, bg, percent) => {
    const channel = (i) => Math.round(parseInt(fg.slice(1 + i, 3 + i), 16) * percent / 100 + parseInt(bg.slice(1 + i, 3 + i), 16) * (1 - percent / 100))
    return `#${[0, 2, 4].map((i) => channel(i).toString(16).padStart(2, '0')).join('')}`
  }
  for (const id of ['green', 'blue', 'comfy', 'light']) {
    const tokens = palette[id]
    const danger = resolve(tokens, '--danger')
    const surface = resolve(tokens, '--surface')
    assert.ok(danger && surface, `${id}: --danger and --surface resolve to hex colors`)
    const percent = Number(String(tokens.get('--danger-soft-mix') || '14%').replace('%', ''))
    const soft = mixHex(danger, surface, percent)
    const ratio = contrast(danger, soft)
    assert.ok(ratio >= 4.5, `${id}: the soft-danger button keeps the danger text readable (${danger} on ${soft}) — ${ratio.toFixed(2)}:1`)
  }

  // The empty-state card inside a preview stage stays dark in every theme (D7).
  const original = readSource('src/original-theme.css')
  assert.ok(/\.empty-preview[^{]*\{[^}]*background:var\(--preview-empty-surface/.test(original), 'the preview empty-state card uses the preview empty surface token')
}

// ---- Music 3 keeps its writing-desk layout inside the studio shell ----
// The studio shell's generator rule ("compact authoring inspector left, broad
// output monitor right", align-items: stretch) was written for ACE-Step and
// Z-Image. Music 3's DOM reuses .workspace-grid.ace-workspace-grid with the
// editor first and the player second, so that rule flipped its columns and,
// through align-items: stretch, stretched every control in the player to the
// height of the whole page (measured: duration pills 129px, secondary buttons
// 463px, the generate button 3.7 screens below the fold).
{
  const studioSystem = readSource('src/studio-system.css')
  assert.ok(
    !/\.workspace-grid\.ace-workspace-grid/.test(studioSystem),
    'the studio-shell generator rule does not grab the Music 3 grid (it is scoped to real generator layouts)',
  )
  const features = readSource('src/styles/feature-workspaces.css')
  // The Music 3 player keeps its own rhythm: its rows are packed at the top,
  // not stretched by whatever column the shell thinks it has.
  assert.ok(
    /\.music3-player \{[^}]*align-content:\s*start/.test(features),
    'the Music 3 player packs its rows at the top instead of stretching them',
  )
  // The listening panel is sticky, and it is taller than the content area
  // (measured ~950px of rows against ~858px of viewport). A sticky panel
  // taller than its viewport can never show its own tail — the generate
  // button was unreachable while pinned. It scrolls within itself instead.
  assert.ok(
    /\.music3-player \{[^}]*max-height:\s*calc\(100dvh/.test(features),
    'the pinned Music 3 player clamps to the viewport and scrolls inside itself',
  )
  assert.ok(
    /\.music3-player \{[^}]*overscroll-behavior:\s*contain/.test(features),
    'the Music 3 player does not trap the page wheel at its scroll ends',
  )
  const polish = readSource('src/studio-polish.css')
  // The album art is a tile in a listening panel, not a poster: at 330px it
  // cost 490px of the panel's height and pushed the transport off the fold.
  const artWidth = polish.match(/\.music3-page \.music3-art \{ width: min\(100%, (\d+)px\)/)?.[1]
  assert.ok(artWidth && Number(artWidth) <= 220, `the Music 3 album art stays a tile (measured ${artWidth}px, cap 220px)`)
}

// ---- The studio shell's compacted generate bar keeps its full-bleed inset ----
// The studio shell compacts .zimage-composer padding to 14px while the generate
// bar keeps visual-system.css's -22px full-bleed margin. Its sticky rule zeroed
// the bar's inline padding, so the primary button sat flush with the panel edge
// and 8px of it was clipped by the composer's overflow: hidden (measured at
// 1913x1118: button right edge 653px against a 645px clip edge).
{
  const studioSystem = readSource('src/studio-system.css')
  const rule = studioSystem.match(/\.studio-shell-active \.zimage-generate-bar \{[^}]*\}/)?.[0]
  assert.ok(rule, 'the studio shell restyles the generator generate bar')
  assert.ok(
    /margin-inline:\s*-14px/.test(rule),
    'the studio-shell generate bar bleed matches the compacted 14px composer padding',
  )
  assert.ok(
    /padding:\s*10px 14px 0/.test(rule),
    'the studio-shell generate bar insets its actions by the composer padding instead of clipping them',
  )
}
