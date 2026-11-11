'use strict'
// Locale audit — the resident gate behind `pnpm test:locale`.
// Re-scans the current source every run (it never reads en-US.json) and reports:
//   1. 漏译   display-layer strings still in English (outside keep-english exemptions)
//   2. 术语   glossary translate-terms appearing untranslated in display strings
//   3. 纯净   any CJK character in prompt-layer / storage positions
//   4. 空格   CJK directly adjacent to latin letters or digits in display strings
// Exit code 0 only when all four checks report zero findings.
const fs = require('node:fs')
const path = require('node:path')
const { scanTree, CJK } = require('./lib/locale-scan.cjs')

const root = process.cwd()
const glossaryPath = path.join(root, 'docs', 'locale', 'glossary.md')
const keepPath = path.join(root, 'docs', 'locale', 'keep-english.md')

function parseGlossary(file) {
  if (!fs.existsSync(file)) return { translate: [], keep: [] }
  const translate = []
  const keep = []
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const match = line.match(/^\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|\s*(translate|keep|data)\s*\|/)
    if (!match) continue
    const [, english, , category] = match
    const entry = { en: english, regex: new RegExp(`(?:^|[^A-Za-z])${english.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z])`, 'i') }
    if (category === 'translate') translate.push(entry)
    else if (category === 'keep') keep.push(entry)
  }
  return { translate, keep }
}

// Entry forms: `path` (whole file), `path:42` (line), `path:prop=name`, `path:attr=name`,
// `path:content=<exact string>`
function parseKeep(file) {
  const rules = []
  if (!fs.existsSync(file)) return rules
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const match = line.match(/^-\s+`([^`]+)`\s+(?:—|-)\s+(.*)$/)
    if (!match) continue
    const [, target, reason] = match
    const separator = target.match(/^(.*?):(prop|attr|line|content)[=:\s](.+)$/)
    if (separator) rules.push({ kind: separator[2], path: separator[1], value: separator[3], reason })
    else if (/:\d+$/.test(target)) rules.push({ kind: 'line', path: target.slice(0, target.lastIndexOf(':')), value: Number(target.slice(target.lastIndexOf(':') + 1)), reason })
    else rules.push({ kind: 'file', path: target, reason })
  }
  return rules
}

const glossary = parseGlossary(glossaryPath)
const keepRules = parseKeep(keepPath)

function keepMatches(finding) {
  return keepRules.filter(rule => {
    if (rule.path !== finding.file) return false
    if (rule.kind === 'file') return true
    if (rule.kind === 'line') return rule.value === finding.line
    if (rule.kind === 'content') return rule.value === finding.text
    // Scanner kinds look like `prop:label` / `attr:placeholder`; the keep-english
    // format historically used `prop=label`, so accept either separator.
    return [`${rule.kind}=`, `${rule.kind}:`].some(prefix => finding.kind.startsWith(prefix) && finding.kind.slice(prefix.length) === rule.value)
  })
}

const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const stripKeepTerms = text => glossary.keep.reduce((acc, term) => acc.replace(new RegExp(`\\b${escapeRegExp(term.en)}\\b`, 'gi'), ' '), text)

// A `keep` term must appear exactly as the glossary writes it (case and
// hyphen sensitive). Returns the first offending occurrence, if any.
//
// Three shapes are deliberately not violations:
//   - the term inside a path-like run ("birefnet.safetensors", "ltx-2.5-video-vae-…")
//   - an all-caps occurrence, which is a deliberate typographic style (the
//     `.eyebrow` kickers are literal uppercase, not CSS-transformed)
//   - an occurrence that is the entire string, which is an id ("h3")
const keepTermMismatch = text => {
  const trimmed = text.trim()
  for (const term of glossary.keep) {
    const pattern = new RegExp(`\\b${escapeRegExp(term.en)}\\b`, 'gi')
    let match
    while ((match = pattern.exec(text)) !== null) {
      const found = match[0]
      if (found === term.en) continue
      if (found === found.toUpperCase()) continue
      const before = text[match.index - 1] || ''
      const after = text[match.index + found.length] || ''
      if (/[./_\-:]/.test(before) || /[./_\-:]/.test(after)) continue
      if (found === trimmed) continue
      return { term: term.en, found }
    }
  }
  return null
}

const isUntranslatedEnglish = text => {
  if (CJK.test(text)) return false
  const trimmed = text.trim()
  if (!/^[A-Z]/.test(trimmed.replace(/^['"`{(<\s]+/, ''))) return false
  const words = trimmed.match(/[A-Za-z][A-Za-z'’-]*/g) || []
  return words.length >= 2
}

const findings = scanTree(root)
const problems = { untranslated: [], terms: [], purity: [], spacing: [] }
const pendingOnly = { untranslated: [], terms: [] }

// Progressive gate: a file becomes "claimed" once any of its display strings is
// Chinese. Claimed files must be fully clean (0 untranslated, 0 term drift);
// not-yet-claimed files only report counts. At completion every UI file is
// claimed, so "PASS with 0 pending" is equivalent to a whole-tree zero.
const claimedFiles = new Set(findings.filter(item => item.layer === 'display' && CJK.test(item.text)).map(item => item.file))

for (const finding of findings) {
  if (finding.layer === 'display') {
    const exempt = keepMatches(finding).length > 0
    const stripped = stripKeepTerms(finding.text)
    const untranslated = !exempt && isUntranslatedEnglish(stripped)
    // A translate-term embedded in an already-Chinese sentence is a proper noun
    // (ComfyUI node name, brand, file name), not an untranslated UI label —
    // e.g. "施加原生 Add Guide 条件控制" keeps the node name verbatim.
    const termHit = !exempt && !CJK.test(finding.text) && glossary.translate.find(term => term.regex.test(stripped))
    // Keep terms are whitelisted for the untranslated check, but they must
    // still be written exactly as the glossary writes them.
    const keepHit = !exempt ? keepTermMismatch(finding.text) : null
    if (untranslated || termHit || keepHit) {
      const bucket = claimedFiles.has(finding.file) ? problems : pendingOnly
      if (untranslated) bucket.untranslated.push(finding)
      if (termHit) bucket.terms.push({ ...finding, term: termHit.en })
      else if (keepHit) bucket.terms.push({ ...finding, term: keepHit.term, found: keepHit.found })
    }
    const spacing = text => /[一-鿿⺀-⻿㇀-㇯㐀-䶿豈-﫿][A-Za-z0-9]|[A-Za-z0-9][一-鿿⺀-⻿㇀-㇯㐀-䶿豈-﫿]/.test(text)
    if (spacing(finding.text)) problems.spacing.push(finding)
  } else if (finding.layer === 'prompt') {
    if (CJK.test(finding.text)) problems.purity.push(finding)
  }
}

const format = finding => `  ${finding.file}:${finding.line}  [${finding.kind}]  ${JSON.stringify(finding.text.length > 90 ? `${finding.text.slice(0, 87)}…` : finding.text)}`
let total = 0
for (const [name, list] of Object.entries(problems)) {
  if (!list.length) { console.log(`${name}: 0 处`); continue }
  total += list.length
  console.log(`${name}: ${list.length} 处`)
  for (const finding of list.slice(0, 30)) console.log(finding.term ? `${format(finding)}  -> 术语「${finding.term}」` : format(finding))
  if (list.length > 30) console.log(`  … 另有 ${list.length - 30} 处`)
}
const pendingTotal = pendingOnly.untranslated.length + pendingOnly.terms.length
console.log(`未认领文件（尚未开始翻译，仅计数不判失败）: 漏译 ${pendingOnly.untranslated.length} 处、术语 ${pendingOnly.terms.length} 处，涉及 ${new Set([...pendingOnly.untranslated, ...pendingOnly.terms].map(item => item.file)).size} 个文件；已认领文件 ${claimedFiles.size} 个`)
const scannedDisplay = findings.filter(item => item.layer === 'display').length
const scannedPrompt = findings.filter(item => item.layer === 'prompt').length
console.log(`扫描: ${scannedDisplay} 条界面文案、${scannedPrompt} 条提示词/存储位（${findings.length} 条字面量分类总计）`)
if (total > 0) {
  console.log(`FAIL: locale audit 在已认领文件发现 ${total} 处问题`)
  process.exit(1)
}
console.log(pendingTotal > 0 ? `PASS: locale audit 已认领文件 0 处问题（剩余 ${pendingTotal} 处待译）` : 'PASS: locale audit 0 处问题')
