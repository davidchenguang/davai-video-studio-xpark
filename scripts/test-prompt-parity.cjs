'use strict'
// Prompt-parity regression: the current tree must reproduce the baseline
// fixture byte for byte across every prompt-output path (A4).
// The fixture is generated once from baseline ref 1a7ea28 by
// scripts/capture-prompt-parity.cjs and never hand-edited afterwards.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { capture } = require('./lib/prompt-parity-harness.cjs')

const root = process.cwd()
const fixturePath = path.join(root, 'scripts', 'fixtures', 'prompt-parity-baseline.json')
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'))

// Canonical serialization: recursively sorted keys, so key insertion order
// differences never mask or fake a divergence. Keys holding explicit
// `undefined` are skipped — JSON.stringify (and therefore the fixture round
// trip) drops them, and live objects legitimately carry them.
const canonical = value => {
  if (Array.isArray(value)) return `[${value.map(item => item === undefined ? 'null' : canonical(item)).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.keys(value).filter(key => value[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`)
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

const firstDivergence = (left, right, trail = '') => {
  if (canonical(left) === canonical(right)) return null
  if (left && right && typeof left === 'object' && typeof right === 'object' && !Array.isArray(left) && !Array.isArray(right)) {
    for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
      const nested = firstDivergence(left[key], right[key], trail ? `${trail}.${key}` : key)
      if (nested) return nested
    }
    return { path: trail, baseline: '<key set mismatch>', current: '<key set mismatch>' }
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return { path: `${trail}[length]`, baseline: left.length, current: right.length }
    for (let index = 0; index < left.length; index += 1) {
      const nested = firstDivergence(left[index], right[index], `${trail}[${index}]`)
      if (nested) return nested
    }
  }
  return { path: trail, baseline: canonical(left), current: canonical(right) }
}

;(async () => {
  const current = await capture(root)
  const divergence = firstDivergence(fixture.capture, current)
  assert.equal(fixture._meta?.baseline, '1a7ea28', 'parity fixture must stay pinned to the brief baseline ref')
  assert.ok(divergence === null, `prompt output diverged from baseline at ${divergence?.path}\n  baseline: ${divergence?.baseline?.slice(0, 400)}\n  current:  ${divergence?.current?.slice(0, 400)}`)

  // The embedded-audio default description is a prompt-layer literal that lives
  // in the component layer (both files inline the same English text), so the
  // fixture never captures it. h3SceneCompiler copies it verbatim into
  // `overall_soundscape` / `subject_definitions` — pin it against baseline ref
  // 1a7ea28 here instead of trusting a source comment.
  const BASELINE_EMBEDDED_AUDIO = 'The video’s ambient sound texture; do not inherit speech or music.'
  for (const file of ['src/components/SceneComposer.tsx', 'src/components/SceneContextPanels.tsx']) {
    const source = fs.readFileSync(path.join(root, file), 'utf8')
    assert.ok(source.includes(BASELINE_EMBEDDED_AUDIO), `${file} must keep the prompt-layer embedded-audio description byte-identical to baseline ${fixture._meta.baseline}`)
  }

  const sections = Object.keys(fixture.capture).length
  console.log(`PASS: prompt parity — ${sections} capture sections byte-identical to baseline ${fixture._meta.baseline}`)
})().catch(error => {
  console.error(error && error.stack || error)
  process.exit(1)
})
