'use strict'
// Shared AST scanner for locale tooling (extractor + audit).
// Classifies every string literal occurrence in src/ and electron/ as:
//   display  — user-facing UI text (must become Simplified Chinese)
//   prompt   — prompt-layer / storage / identifier text (must stay English, zero CJK)
//   neutral  — everything else (unchecked; ambiguous dual-purpose positions are
//              governed explicitly by docs/locale/keep-english.md instead)
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const UI_ATTRS = new Set([
  'placeholder', 'title', 'alt', 'label', 'summary',
  'aria-label', 'aria-description', 'aria-placeholder', 'aria-valuetext', 'aria-roledescription',
])
const DISPLAY_PROPS = new Set(['label', 'note', 'title', 'description', 'hint', 'help', 'heading', 'caption'])
// Context-dependent names: display props in most components, prompt fields inside
// prompt-producing modules (workflow builders, scene/prompt/continuation/reference/llm libs).
const TEXTISH_PROPS = new Set(['text', 'message', 'prompt'])
const PROMPT_PROPS = new Set(['insertion', 'keywords', 'compiledPrompt', 'negativePrompt', 'systemPrompt', 'userPrompt', 'instruction'])
const STORAGE_PROPS = new Set(['value', 'id', 'name', 'key', 'type', 'role', 'path', 'url', 'kind', 'code', 'filenamePrefix'])
const PROMPT_CONTEXT_FILE = /(?:Workflow\.ts|prompt|scene|continuation|reference|llm|autoTag|compiler)/i
const DISPLAY_ARRAY_NAMES = /(?:tips|options|labels|stages|messages|sections|groups|examples|suggestions|headings|captions|summaries)$/i
// Factory functions whose return value is display text; a conditional branch inside
// one of them is display text too (e.g. `videoResolutionLabel()`).
const DISPLAY_FACTORY_NAME = /(?:Label|Labels|Text|Title|Heading|Caption|Hint|Note|Description)$/
// Calls whose string argument is a user-facing message.
const DISPLAY_SINKS = new Set(['Promise.resolve', 'setMessage', 'setFailure', 'setError', 'onNotice', 'showNotice'])
// `onNotice('success', '…')` — the first argument is a tone enum, not text.
const NOTICE_TONES = new Set(['success', 'error', 'neutral', 'warning', 'info', 'warn'])

const CJK = /[\u2E80-\u2EFF\u3000-\u303F\u31C0-\u31EF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFFEF]/

function isStringLike(node) {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
}

// Only the static segments of a template literal are display/prompt text; the
// `${…}` interiors are code (identifiers, comparisons) that must never be
// treated as UI copy — `provider === 'ollama'` inside a title template is a
// storage comparison, not a misspelled keep term.
function staticTemplateText(node) {
  let text = node.head.text
  for (const span of node.templateSpans) text += span.literal.text
  return text
}

function propName(node) {
  if (!node) return null
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return node.text
  return null
}

// The name of the function a node sits in (`function videoResolutionLabel() {…}`).
function enclosingFunctionName(node) {
  let current = node.parent
  while (current) {
    if (ts.isFunctionDeclaration(current) && current.name) return current.name.text
    if (ts.isVariableDeclaration(current) && current.initializer && (ts.isArrowFunction(current.initializer) || ts.isFunctionExpression(current.initializer))) {
      const name = propName(current.name)
      if (name) return name
    }
    current = current.parent
  }
  return null
}

// A tuple array (`[[a, b, c?], …]`) carries one user-facing label per row. The
// label half is display text; the other halves are storage values or prompt
// text — unless they contain CJK, which prompt/storage layers never may.
function tupleLabelFindings(node, fileName, sf) {
  const findings = []
  if (!ts.isArrayLiteralExpression(node) || !node.elements.length) return findings
  const isTuple = element => ts.isArrayLiteralExpression(element) && element.elements.length >= 2 && element.elements.length <= 3
    && isStringLike(element.elements[1])
  if (!node.elements.every(isTuple)) return findings
  for (const element of node.elements) {
    const [first, label, extra] = element.elements
    const at = target => ({ file: fileName, line: sf.getLineAndCharacterOfPosition(target.getStart()).line + 1 })
    findings.push({ ...at(label), kind: 'tuple-label', layer: 'display', text: label.text })
    // CJK can only live in the display layer, so a CJK sibling is display too.
    findings.push({ ...at(first), kind: 'tuple-value', layer: CJK.test(first.text) ? 'display' : 'prompt', text: first.text })
    if (extra && isStringLike(extra)) findings.push({ ...at(extra), kind: 'tuple-extra', layer: CJK.test(extra.text) ? 'display' : 'prompt', text: extra.text })
  }
  return findings
}

// A conditional branch inside a display-factory function is display text.
function displayFactoryBranchFindings(node, fileName, sf) {
  const findings = []
  if (!ts.isConditionalExpression(node)) return findings
  const factory = enclosingFunctionName(node)
  if (!factory || !DISPLAY_FACTORY_NAME.test(factory)) return findings
  for (const branch of [node.whenTrue, node.whenFalse]) {
    if (!isStringLike(branch)) continue
    findings.push({ file: fileName, line: sf.getLineAndCharacterOfPosition(branch.getStart()).line + 1, kind: 'display-branch', layer: 'display', text: branch.text })
  }
  return findings
}

// A string passed to a user-facing sink (message setters, notice callbacks).
function displaySinkArgFindings(node, fileName, sf) {
  const findings = []
  if (!ts.isCallExpression(node)) return findings
  if (!DISPLAY_SINKS.has(node.expression.getText(sf))) return findings
  for (const argument of node.arguments) {
    if (!isStringLike(argument)) continue
    if (NOTICE_TONES.has(argument.text)) continue
    findings.push({ file: fileName, line: sf.getLineAndCharacterOfPosition(argument.getStart()).line + 1, kind: 'display-arg', layer: 'display', text: argument.text })
  }
  return findings
}

function nearestEnclosingName(node) {
  let current = node.parent
  while (current) {
    if (ts.isPropertyAssignment(current) || ts.isPropertySignature(current)) return propName(current.name)
    if (ts.isVariableDeclaration(current)) return propName(current.name)
    if (ts.isJsxAttribute(current)) return propName(current.name)
    if (ts.isParameter(current)) return propName(current.name)
    current = current.parent
  }
  return null
}

// Electron dialog file-type filters (`filters: [{ name: 'Videos', extensions: [...] }]`):
// `name:` there is the user-visible filter label shown in the native save/open
// dialog, not a storage key. Crossing only object/array/assignment/variable
// levels keeps the walk inside the literal that carries the `filters` name.
function insideDialogFilters(node) {
  let current = node.parent
  while (current) {
    if (ts.isPropertyAssignment(current) || ts.isVariableDeclaration(current)) {
      if (propName(current.name) === 'filters') return true
    } else if (!ts.isObjectLiteralExpression(current) && !ts.isArrayLiteralExpression(current)) {
      return false
    }
    current = current.parent
  }
  return false
}

function scanSource(fileName, source) {
  const findings = []
  const promptContext = PROMPT_CONTEXT_FILE.test(fileName)
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2022, true, fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const visit = (node, parents) => {
    const parent = parents[parents.length - 1]

    if (ts.isJsxText(node)) {
      if (node.text.trim()) findings.push({ file: fileName, line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1, kind: 'jsx-text', layer: 'display', text: node.getText(sf) })
    } else if (ts.isJsxAttribute(node) && node.initializer) {
      // `attr="text"` initializes with a plain string literal; `attr={'text'}`
      // and `attr={`text ${x}`}` wrap the real initializer in a JsxExpression,
      // so unwrap that before classifying (the brace forms are the common ones).
      const raw = ts.isJsxExpression(node.initializer) ? node.initializer.expression : node.initializer
      const name = propName(node.name)
      const attributes = parent && ts.isJsxAttributes(parent) ? parent : null
      const tag = attributes && attributes.parent && ts.isJsxOpeningLikeElement(attributes.parent) ? propName(attributes.parent.tagName) : null
      if (raw && isStringLike(raw)) {
        if (name === 'value' && tag === 'option') findings.push({ file: fileName, line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1, kind: 'option-value', layer: 'prompt', text: raw.text })
        else if (UI_ATTRS.has(name)) findings.push({ file: fileName, line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1, kind: `attr:${name}`, layer: 'display', text: raw.text })
        // ID_ATTRS and everything else: neutral (identifiers / storage)
      } else if (raw && ts.isTemplateExpression(raw)) {
        if (name === 'value' && tag === 'option') findings.push({ file: fileName, line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1, kind: 'option-value', layer: 'prompt', text: staticTemplateText(raw) })
        else if (UI_ATTRS.has(name)) findings.push({ file: fileName, line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1, kind: `attr:${name}`, layer: 'display', text: staticTemplateText(raw) })
      }
    } else if (ts.isPropertyAssignment(node) && isStringLike(node.initializer)) {
      const name = propName(node.name)
      if (name == null) return
      const base = { file: fileName, line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1, text: node.initializer.text }
      if (DISPLAY_PROPS.has(name) && !PROMPT_PROPS.has(name)) findings.push({ ...base, kind: `prop:${name}`, layer: 'display' })
      else if (name === 'name' && insideDialogFilters(node)) findings.push({ ...base, kind: 'prop:name', layer: 'display' })
      else if (TEXTISH_PROPS.has(name)) findings.push(promptContext ? { ...base, kind: `prop:${name}`, layer: 'prompt' } : { ...base, kind: `prop:${name}`, layer: 'display' })
      else if (PROMPT_PROPS.has(name)) findings.push({ ...base, kind: `prop:${name}`, layer: 'prompt' })
      else if (STORAGE_PROPS.has(name)) findings.push({ ...base, kind: `prop:${name}`, layer: 'prompt' })
    } else if (ts.isPropertyAssignment(node) && node.initializer && ts.isTemplateExpression(node.initializer)) {
      const name = propName(node.name)
      if (name == null) return
      const base = { file: fileName, line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1, text: staticTemplateText(node.initializer) }
      if (DISPLAY_PROPS.has(name) && !PROMPT_PROPS.has(name)) findings.push({ ...base, kind: `prop:${name}`, layer: 'display' })
      else if (PROMPT_PROPS.has(name)) findings.push({ ...base, kind: `prop:${name}`, layer: 'prompt' })
    } else if (ts.isNewExpression(node) && node.arguments?.length && isStringLike(node.arguments[0])) {
      const callee = node.expression.getText(sf)
      if (callee === 'Error' || callee === 'TypeError' || callee === 'RangeError') {
        findings.push({ file: fileName, line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1, kind: 'error-arg', layer: 'display', text: node.arguments[0].text })
      }
    } else if (ts.isArrayLiteralExpression(node)) {
      const elements = node.elements
      const holder = nearestEnclosingName(node)
      const parent = node.parent
      // `options={[[value, label], …]}` — the SelectField contract is
      // `[optionValue, text, optionDisabled?]`. The value half is a storage key
      // that reaches the DOM verbatim, so it is prompt layer; only the label
      // half is user-facing text.
      const isPair = element => ts.isArrayLiteralExpression(element) && element.elements.length >= 2 && element.elements.length <= 3
        && isStringLike(element.elements[1])
        && (element.elements.length === 2 || !isStringLike(element.elements[2]))
      const isOptionsPairArray = array => array.elements.length >= 1 && array.elements.every(isPair)
      const isOptionPairs = holder === 'options' && isOptionsPairArray(node)
      // The inner `[value, label]` arrays are visited on their own too; the
      // enclosing options array classifies both halves, so skip them here.
      const insideOptionPairs = ts.isArrayLiteralExpression(parent) && isOptionsPairArray(parent)
        && nearestEnclosingName(parent) === 'options' && elements.length >= 2 && elements.length <= 3
      if (insideOptionPairs) {
        // handled by the enclosing options array
      } else if (isOptionPairs) {
        for (const element of elements) {
          const [value, label] = element.elements
          findings.push({ file: fileName, line: sf.getLineAndCharacterOfPosition(value.getStart()).line + 1, kind: 'option-value', layer: 'prompt', text: value.text })
          findings.push({ file: fileName, line: sf.getLineAndCharacterOfPosition(label.getStart()).line + 1, kind: 'option-label', layer: 'display', text: label.text })
        }
      } else if (elements.length >= 1 && elements.every(isStringLike)) {
        if (holder && DISPLAY_ARRAY_NAMES.test(holder)) {
          for (const element of elements) findings.push({ file: fileName, line: sf.getLineAndCharacterOfPosition(element.getStart()).line + 1, kind: 'array-element', layer: 'display', text: element.text })
        } else if (holder && (PROMPT_PROPS.has(holder) || STORAGE_PROPS.has(holder))) {
          for (const element of elements) findings.push({ file: fileName, line: sf.getLineAndCharacterOfPosition(element.getStart()).line + 1, kind: 'array-element', layer: 'prompt', text: element.text })
        }
        // otherwise neutral
      } else if (!promptContext) {
        // Tuples outside `options` carry one user-facing label per row too
        // (character presets, handoff targets, tips). The label half is
        // display text; the halves that hold CJK are display as well.
        findings.push(...tupleLabelFindings(node, fileName, sf))
      }
    }

    if (!promptContext) findings.push(...displayFactoryBranchFindings(node, fileName, sf))
    findings.push(...displaySinkArgFindings(node, fileName, sf))

    ts.forEachChild(node, child => visit(child, [...parents, node]))
  }
  visit(sf, [])
  return findings.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line))
}

function listSourceFiles(root) {
  const out = []
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'dist-electron' || entry.name.startsWith('.')) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full)
    }
  }
  for (const base of ['src', 'electron']) {
    const dir = path.join(root, base)
    if (fs.existsSync(dir)) walk(dir)
  }
  return out
}

// Scan the working tree at root.
function scanTree(root) {
  const findings = []
  for (const absolute of listSourceFiles(root)) {
    const relative = path.relative(root, absolute).split(path.sep).join('/')
    findings.push(...scanSource(relative, fs.readFileSync(absolute, 'utf8')))
  }
  return findings
}

// Scan a git ref: reads blobs with `git show`, so extraction stays reproducible.
function scanGitRef(root, ref) {
  const { execFileSync } = require('node:child_process')
  const listing = execFileSync('git', ['-C', root, 'ls-tree', '-r', '--name-only', ref], { encoding: 'utf8' })
    .split('\n').filter(p => /^(src|electron)\/.*\.(ts|tsx)$/.test(p))
  const findings = []
  for (const relative of listing) {
    const blob = execFileSync('git', ['-C', root, 'show', `${ref}:${relative}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    findings.push(...scanSource(relative, blob))
  }
  return findings
}

module.exports = { scanTree, scanGitRef, scanSource, CJK, listSourceFiles }
