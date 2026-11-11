'use strict'
// A9 structure check: compare the code skeleton of every changed file against
// a baseline git ref. String literals, template texts and JSX text nodes are
// blanked out; everything else must match. A difference means the change goes
// beyond display text and has to be justified in
// `docs/locale/structure-changes.md`.
//
// Usage: node scripts/locale-structure-check.cjs [--ref <git-ref>] [--json]
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const args = process.argv.slice(2)
const readFlag = name => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : null
}
const ref = readFlag('--ref') || '1a7ea28'
const asJson = args.includes('--json')
const root = process.cwd()

/** Replace every literal with a placeholder so only code shape remains. */
function skeleton(source, file) {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.ES2022, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const edits = []
  const visit = node => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) edits.push([node.getStart(sf), node.getEnd(), 'S'])
    else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) edits.push([node.getStart(sf), node.getEnd(), 'S'])
    else if (ts.isJsxText(node)) edits.push([node.getStart(sf), node.getEnd(), ''])
    ts.forEachChild(node, visit)
  }
  visit(sf)
  let out = ''
  let cursor = 0
  for (const [start, end, text] of edits.sort((a, b) => a[0] - b[0])) {
    out += source.slice(cursor, start) + text
    cursor = end
  }
  out += source.slice(cursor)
  return out
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
}

function changedFiles() {
  return execFileSync('git', ['diff', '--name-only', ref], { cwd: root, encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(file => /\.(ts|tsx)$/.test(file))
}

const report = []
for (const file of changedFiles()) {
  let base
  try {
    base = execFileSync('git', ['show', `${ref}:${file}`], { cwd: root, encoding: 'utf8' })
  } catch {
    report.push({ file, kind: 'new-file' })
    continue
  }
  const work = fs.readFileSync(path.join(root, file), 'utf8')
  const before = skeleton(base, file).join('\n')
  const after = skeleton(work, file).join('\n')
  if (before === after) continue
  // Report the first differing region so the change can be classified.
  let index = 0
  while (index < Math.min(before.length, after.length) && before[index] === after[index]) index += 1
  report.push({
    file,
    kind: 'skeleton-diff',
    before: before.slice(Math.max(0, index - 80), index + 160),
    after: after.slice(Math.max(0, index - 80), index + 160),
  })
}

if (asJson) {
  console.log(JSON.stringify(report, null, 2))
  process.exit(0)
}

console.log(`结构骨架检查（基线 ref ${ref}）：${report.length} 个文件存在字面量之外的改动`)
for (const item of report) {
  console.log(`\n### ${item.file} [${item.kind}]`)
  if (item.before !== undefined) {
    console.log(`  base: ${item.before.replace(/\s+/g, ' ')}`)
    console.log(`  work: ${item.after.replace(/\s+/g, ' ')}`)
  }
}
