'use strict'
// Generates scripts/fixtures/prompt-parity-baseline.json from the baseline ref.
// The baseline is pinned to 6a600eb (the Music 3 Chinese support; originally 1a7ea28,
// re-pinned at the DavAi rename). Generation refuses
// to run when src/ or electron/ differ from that ref unless --allow-dirty is
// passed explicitly — after localization batches start, the fixture must never
// be silently regenerated.
// Usage: node scripts/capture-prompt-parity.cjs [--baseline <ref>] [--force] [--allow-dirty]
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { capture } = require('./lib/prompt-parity-harness.cjs')

const args = process.argv.slice(2)
const has = name => args.includes(name)
const readFlag = name => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : null
}
const baseline = readFlag('--baseline') || '6a600eb625d530f5d4694f766e5d2c6c0e8d4956'
const root = process.cwd()
const fixturePath = path.join(root, 'scripts', 'fixtures', 'prompt-parity-baseline.json')

if (fs.existsSync(fixturePath) && !has('--force')) {
  console.error(`fixture already exists: ${fixturePath}`)
  console.error('regenerating would redefine the parity baseline; pass --force only when re-pinning the baseline ref deliberately')
  process.exit(1)
}

let clean = true
try {
  execFileSync('git', ['-C', root, 'diff', '--quiet', baseline, '--', 'src', 'electron'], { stdio: 'pipe' })
} catch {
  clean = false
}
if (!clean && !has('--allow-dirty')) {
  console.error(`src/ or electron/ differs from baseline ref ${baseline}; refusing to capture.`)
  console.error('the fixture must be generated from a tree byte-identical to the baseline. Pass --allow-dirty only when re-pinning deliberately.')
  process.exit(1)
}

capture(root).then(snapshot => {
  const payload = { _meta: { baseline, cleanTreeVerified: clean, generatedBy: 'scripts/capture-prompt-parity.cjs' }, capture: snapshot }
  fs.mkdirSync(path.dirname(fixturePath), { recursive: true })
  fs.writeFileSync(fixturePath, JSON.stringify(payload, null, 2) + '\n')
  console.log(`captured parity fixture from ${baseline} (clean tree: ${clean}) -> ${fixturePath}`)
}).catch(error => {
  console.error(error && error.stack || error)
  process.exit(1)
})
