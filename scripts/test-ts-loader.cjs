const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const cache = new Map()
function load(filename) {
  const absolute = path.resolve(filename)
  if (cache.has(absolute)) return cache.get(absolute)
  const exports = {}
  cache.set(absolute, exports)
  const code = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
    // CommonJS transpile keeps `import.meta` verbatim, which throws in the vm
    // sandbox. Rewrite it to the staged marker object (loader provides .env.DEV).
    .replaceAll('import.meta', '__ts_import_meta__')
  const localRequire = request => request.startsWith('.') ? load(path.resolve(path.dirname(absolute), `${request}.ts`)) : require(request)
  // Host scripts (e.g. the prompt-parity harness) can stage extra globals for
  // the sandboxed module by setting global.__TS_LOADER_EXTRA_GLOBALS__ before load().
  const extraGlobals = global.__TS_LOADER_EXTRA_GLOBALS__ || {}
  // import.meta is rewritten to this marker object: renderer modules read
  // import.meta.env.DEV (Vite) which has no meaning under the Node loader.
  const importMeta = { env: { DEV: false } }
  vm.runInNewContext(code, { exports, require: localRequire, URLSearchParams, URL, console, localStorage: { getItem: () => null }, __ts_import_meta__: importMeta, ...extraGlobals }, { filename: absolute })
  return exports
}
module.exports = { load }
