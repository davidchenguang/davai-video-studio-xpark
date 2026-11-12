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
  const detach = app.slice(app.indexOf("window.open('', 'oyama-video-preview'"))
  assert.ok(detach.includes('dataset.theme'), 'video preview popout copies data-theme at detach')
  const monitor = app.slice(app.indexOf("window.open('', 'oyama-ai-video-studio-preview'"))
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
