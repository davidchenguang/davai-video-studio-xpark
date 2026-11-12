'use strict'
// One-shot extractor: snapshots the English UI strings of a baseline git ref
// into docs/locale/en-US.json. The snapshot is an offline archive only — the
// runtime never reads it and neither does the audit.
//
// Usage: node scripts/extract-locale.cjs [--ref <git-ref>] [--out <file>]
//   --ref  defaults to the working tree (no _meta.baseline). The brief pins the
//          official snapshot to ref 1a7ea28.
//   --out  defaults to docs/locale/en-US.json.
//
// Arguments are parsed strictly: only `--ref <value>`, `--out <value>` and
// `--help` are accepted. Anything else (unknown flag, positional argument, a
// flag without its value) prints the error plus the usage and exits non-zero.
// `--help` prints the usage and exits 0. Neither path writes a file: the
// snapshot is only written after the arguments parse cleanly.
const fs = require('node:fs')
const path = require('node:path')
const { scanTree, scanGitRef } = require('./lib/locale-scan.cjs')

const USAGE = `用法：node scripts/extract-locale.cjs [--ref <git-ref>] [--out <file>]

把基线里的英文界面文案快照成 JSON（离线归档，运行时与审计都不读它）。

选项：
  --ref <git-ref>  要扫描的基线；缺省扫描当前工作树（_meta.baseline 为空）。
                   正式快照固定用 ref 1a7ea28。
  --out <file>     快照输出路径；缺省写入 docs/locale/en-US.json。
  --help           打印本用法并以 0 退出，不写任何文件。

除以上选项以外的参数一律报错：打印错误与本用法、退出码非 0，且不写任何文件。
选项的取值用空格分隔，不接受 --flag=value 写法。`

/** Parse the command line. Throws on anything outside the accepted grammar. */
function parseArgs(argv) {
  const options = { ref: null, out: null, help: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      options.help = true
      continue
    }
    if (arg === '--ref' || arg === '--out') {
      const value = argv[index + 1]
      if (value === undefined || value.startsWith('--')) throw new Error(`${arg} 缺少取值`)
      if (arg === '--ref') options.ref = value
      else options.out = value
      index += 1
      continue
    }
    throw new Error(`未知参数：${arg}`)
  }
  return options
}

let options
try {
  options = parseArgs(process.argv.slice(2))
} catch (error) {
  console.error(`错误：${error.message}`)
  console.log(USAGE)
  process.exit(1)
}

if (options.help) {
  console.log(USAGE)
  process.exit(0)
}

const ref = options.ref
const out = options.out || path.join('docs', 'locale', 'en-US.json')
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
