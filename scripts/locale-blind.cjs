'use strict'
// Prints the blind-spot worklist: string literals the position classifier in
// `lib/locale-scan.cjs` cannot decide (label-function returns, lookup-map
// values, parameter defaults, and call arguments inside JSX expression
// containers). These are user-visible in practice, so each localization batch
// has to sweep them by eye — this script makes the worklist reproducible
// instead of ad-hoc grep output.
//
// Usage: node scripts/locale-blind.cjs [--json] [--file <path>]
//   --json   emit the raw findings as JSON
//   --file   only report findings from this file (repeatable)
const { scanBlindTree } = require('./lib/locale-blind.cjs')

const args = process.argv.slice(2)
const json = args.includes('--json')
const files = []
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === '--file') files.push(args[index + 1])
}

const root = process.cwd()
let findings = scanBlindTree(root)
if (files.length) findings = findings.filter(item => files.some(file => item.file.endsWith(file)))

const byFile = new Map()
for (const finding of findings) {
  if (!byFile.has(finding.file)) byFile.set(finding.file, [])
  byFile.get(finding.file).push(finding)
}

if (json) {
  console.log(JSON.stringify(findings, null, 2))
  process.exit(0)
}

const kinds = new Map()
for (const finding of findings) {
  const kind = finding.kind.split(':')[0]
  kinds.set(kind, (kinds.get(kind) || 0) + 1)
}
console.log(`盲区清单：${findings.length} 处，${byFile.size} 个文件`)
for (const [kind, count] of [...kinds.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${kind}: ${count}`)
for (const [file, items] of [...byFile.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n${file} (${items.length})`)
  for (const item of items) console.log(`  ${item.line}\t${item.kind}\t${item.text.replace(/\s+/g, ' ').slice(0, 120)}`)
}
