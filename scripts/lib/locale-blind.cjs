'use strict'
// Blind-spot scanner: string literals the position-based classifier in
// `locale-scan.cjs` cannot decide.
//
// The main scanner classifies by syntactic position (JSX text, interface
// attributes, known property names, Error arguments). Four shapes fall through
// it, yet all are routinely user-visible:
//
//   1. `return 'Loading diffusion model'` — a label function's return value.
//   2. `{ '161': 'Preparing motion context' }` — a lookup map from id/enum to
//      display text. The key carries no type information, so the value looks
//      like an identifier.
//   3. `function C({ ariaLabel = 'Video prompt' })` — a parameter default that
//      doubles as the visible/accessible label.
//   4. `{ setPlaybackStatus('Buffering video…') }` — a string literal handed to
//      a call inside a JSX expression container. The literal is neither JSX
//      text nor an attribute, so the position classifier reads it as neutral.
//
// All four are reported here as `blind` findings so a localization batch can
// sweep them by eye. Prompt-context files are skipped: their strings are
// prompt bodies that must stay English.
const ts = require('typescript')
const fs = require('node:fs')
const path = require('node:path')

const PROMPT_CONTEXT_FILE = /(?:Workflow\.ts|prompt|scene|continuation|reference|llm|autoTag|compiler|imageHandoff)/i
const SOURCE_DIRS = ['src', 'electron']
const SKIP_DIRS = /node_modules|dist|dist-electron|\.git/

function collectFiles(root) {
  const files = []
  const walk = dir => {
    let entries = []
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.test(full)) walk(full)
      } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) {
        files.push(full)
      }
    }
  }
  for (const dir of SOURCE_DIRS) {
    const full = path.join(root, dir)
    if (fs.existsSync(full)) walk(full)
  }
  return files
}

function scanBlindTree(root) {
  const findings = []
  for (const file of collectFiles(root)) {
    const rel = path.relative(root, file)
    // Prompt-context files hold prompt bodies that must stay English — but a
    // parameter default is never a prompt body, so it is still swept below.
    const promptContext = PROMPT_CONTEXT_FILE.test(rel)
    const source = fs.readFileSync(file, 'utf8')
    const sf = ts.createSourceFile(rel, source, ts.ScriptTarget.ES2022, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    const line = node => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1

    const visit = node => {
      // (1) label functions return their display text directly
      if (!promptContext && ts.isReturnStatement(node) && node.expression) {
        const expression = node.expression
        if ((ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) && /[A-Za-z]{3,}/.test(expression.text)) {
          findings.push({ file: rel, line: line(node), kind: 'return-value', text: expression.text })
        } else if (ts.isTemplateExpression(expression) && expression.templateSpans.length === 0 && /[A-Za-z]{3,}/.test(expression.getText(sf))) {
          findings.push({ file: rel, line: line(node), kind: 'return-template', text: expression.getText(sf) })
        } else if (ts.isConditionalExpression(expression)) {
          // `return cond ? 'A' : 'B'` — both branches carry display text
          for (const branch of [expression.whenTrue, expression.whenFalse]) {
            if ((ts.isStringLiteral(branch) || ts.isNoSubstitutionTemplateLiteral(branch)) && /[A-Za-z]{3,}/.test(branch.text)) {
              findings.push({ file: rel, line: line(branch), kind: 'return-branch', text: branch.text })
            } else if (ts.isTemplateExpression(branch) && branch.templateSpans.length === 0 && /[A-Za-z]{3,}/.test(branch.getText(sf))) {
              findings.push({ file: rel, line: line(branch), kind: 'return-template', text: branch.getText(sf) })
            }
          }
        }
      }

      // (2) lookup maps: object literal with >=2 entries whose values are strings
      if (!promptContext && ts.isObjectLiteralExpression(node) && node.properties.length >= 2) {
        for (const property of node.properties) {
          if (!ts.isPropertyAssignment(property)) continue
          const value = property.initializer
          if (!ts.isStringLiteral(value) && !ts.isNoSubstitutionTemplateLiteral(value)) continue
          if (!/[A-Za-z]{3,}/.test(value.text)) continue
          const key = property.name.getText(sf)
          // quoted keys ("scene", '161') and identifier keys (nodeType) both qualify
          findings.push({ file: rel, line: line(property), kind: `map-value:${key}`, text: value.text })
        }
      }

      // (3) parameter defaults: `function C({ ariaLabel = 'Video prompt' })`
      // The default is the accessible name / visible text when the caller does
      // not pass one, so it is user-facing. Destructured parameters carry their
      // defaults on the binding elements.
      if (ts.isParameter(node)) {
        const defaults = []
        if (node.initializer) defaults.push({ name: node.name.getText(sf), value: node.initializer })
        if (ts.isObjectBindingPattern(node.name)) {
          for (const element of node.name.elements) {
            if (element.initializer) defaults.push({ name: element.name.getText(sf), value: element.initializer })
          }
        }
        for (const entry of defaults) {
          const value = entry.value
          if ((ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) && /[A-Za-z]{3,}/.test(value.text)) {
            findings.push({ file: rel, line: line(node), kind: `param-default:${entry.name}`, text: value.text })
          }
        }
      }

      // (4) call arguments inside a JSX expression container:
      // `{ setPlaybackStatus('Buffering video…') }`. The literal is neither JSX
      // text nor an attribute value, so the position classifier reads it as
      // neutral. Only containers that are children of an element/fragment are
      // swept — an expression used as an attribute value is a different shape.
      if (!promptContext && ts.isJsxExpression(node) && !ts.isJsxAttribute(node.parent)) {
        const collect = current => {
          if (ts.isJsxExpression(current) && ts.isJsxAttribute(current.parent)) return
          if (ts.isStringLiteral(current) || ts.isNoSubstitutionTemplateLiteral(current)) {
            if (/[A-Za-z]{3,}/.test(current.text)) findings.push({ file: rel, line: line(current), kind: 'jsx-expression', text: current.text })
            return
          }
          if (ts.isTemplateExpression(current)) {
            if (/[A-Za-z]{3,}/.test(current.getText(sf))) findings.push({ file: rel, line: line(current), kind: 'jsx-expression-template', text: current.getText(sf) })
            return
          }
          ts.forEachChild(current, collect)
        }
        if (node.expression) collect(node.expression)
      }

      ts.forEachChild(node, visit)
    }
    visit(sf)
  }
  return findings.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line))
}

module.exports = { scanBlindTree }
