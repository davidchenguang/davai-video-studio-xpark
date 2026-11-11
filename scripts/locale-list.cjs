'use strict'
// Per-file worklist for a localization batch.
//
// `scripts/locale-audit.cjs` reports problems per category but truncates each
// list at 30 entries, and it only flags strings its heuristics recognise. This
// helper prints EVERY display-layer string in the files you name, so a batch
// can sweep its files line by line — including short labels ("Save", "None")
// that the audit heuristic does not catch.
//
// Usage:
//   node scripts/locale-list.cjs src/components/Foo.tsx src/components/Bar.tsx
//   node scripts/locale-list.cjs --layer prompt <files...>   # prompt/storage layer
//
// Columns:
//   STATUS  TODO  = still English, needs translating
//           CJK   = already contains Chinese
//           ASCII = no Chinese; short ASCII-only strings are the ones the
//                   audit heuristic can miss — sweep them by eye
const path = require('node:path')
const { scanTree, CJK } = require('./lib/locale-scan.cjs')
const { scanBlindTree } = require('./lib/locale-blind.cjs')

const args = process.argv.slice(2)
const layerIndex = args.indexOf('--layer')
const layer = layerIndex >= 0 ? args[layerIndex + 1] : 'display'
const blind = args.includes('--blind')
const skipIndex = layerIndex >= 0 ? layerIndex + 1 : -1
const files = args.filter((value, index) => !value.startsWith('--') && index !== skipIndex)

if (!files.length) {
  console.error('usage: node scripts/locale-list.cjs [--layer display|prompt] [--blind] <file...>')
  process.exit(1)
}

const root = process.cwd()
const findings = blind ? scanBlindTree(root) : scanTree(root)
const wanted = new Set(files.map(file => path.relative(root, path.resolve(root, file))))

const counts = { TODO: 0, CJK: 0, ASCII: 0 }
for (const finding of findings) {
  if (!blind && finding.layer !== layer) continue
  if (!wanted.has(finding.file)) continue
  const status = CJK.test(finding.text) ? 'CJK' : /[A-Za-z]{2,}/.test(finding.text) ? 'ASCII' : 'TODO'
  counts[status] += 1
  const text = finding.text.length > 120 ? `${finding.text.slice(0, 117)}…` : finding.text
  console.log(`${status.padEnd(5)} ${finding.file}:${finding.line}  [${finding.kind}]  ${JSON.stringify(text)}`)
}
console.log(`\n${files.length} file(s) · ${blind ? 'blind' : layer} layer · TODO ${counts.TODO} · CJK ${counts.CJK} · ASCII ${counts.ASCII}`)
