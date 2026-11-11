'use strict'
// One-shot extractor: snapshots the English UI strings of a baseline git ref
// into docs/locale/en-US.json. The snapshot is an offline archive only — the
// runtime never reads it and neither does the audit.
// Usage: node scripts/extract-locale.cjs [--ref <git-ref>] [--out <file>]
//   --ref  defaults to the working tree (no _meta.baseline). The brief pins the
//          official snapshot to ref 1a7ea28.
const fs = require('node:fs')
const path = require('node:path')
const { scanTree, scanGitRef } = require('./lib/locale-scan.cjs')

const args = process.argv.slice(2)
const readFlag = name => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : null
}
const ref = readFlag('--ref')
const out = readFlag('--out') || path.join('docs', 'locale', 'en-US.json')
const root = process.cwd()

const findings = ref ? scanGitRef(root, ref) : scanTree(root)
const byFile = new Map()
const seen = new Set()
for (const finding of findings.filter(item => item.layer === 'display')) {
  if (!byFile.has(finding.file)) byFile.set(finding.file, {})
  const key = String(finding.line)
  // Same line can hold several literals; keep the first occurrence stable.
  if (byFile.get(finding.file)[key] === undefined) byFile.get(finding.file)[key] = finding.text
  seen.add(`${finding.file}:${key}`)
}

const ordered = {}
const files = [...byFile.keys()].sort()
for (const file of files) {
  const lines = byFile.get(file)
  ordered[file] = {}
  for (const line of Object.keys(lines).sort((a, b) => Number(a) - Number(b))) ordered[file][line] = lines[line]
}
const payload = {
  _meta: { baseline: ref, displayStrings: seen.size, files: files.length, note: 'One-shot English snapshot keyed by file:line. Line numbers drift after edits; regenerate only from the recorded baseline ref.' },
  ...ordered,
}
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, JSON.stringify(payload, null, 2) + '\n')
console.log(`${ref ? `ref ${ref}` : 'working tree'}: ${seen.size} display strings across ${files.length} files -> ${out}`)
