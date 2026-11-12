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
