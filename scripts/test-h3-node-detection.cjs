const assert = require('node:assert/strict')
const { load } = require('./test-ts-loader.cjs')

const { findH3PreviewOverrideNode } = load('src/lib/h3NodeDetection.ts')

const info = (...names) => Object.fromEntries(names.map(name => [name, {}]))

// The renderer's live-preview parser matches the un-suffixed node's protocol
// only, so it must win even when the CS-suffixed Director node is also present.
assert.equal(
  findH3PreviewOverrideNode(info('MiniMaxH3PreviewOverrideCS', 'MiniMaxH3PreviewOverride')),
  'MiniMaxH3PreviewOverride',
  'The protocol-compatible node outranks the CS-suffixed Director node',
)
assert.equal(findH3PreviewOverrideNode(info('MiniMaxH3PreviewOverrideCS')), 'MiniMaxH3PreviewOverrideCS', 'The CS-suffixed id is still detected when it is the only candidate')
assert.equal(findH3PreviewOverrideNode(info('MiniMaxH3FooPreviewOverride')), 'MiniMaxH3FooPreviewOverride', 'The regex fallback keeps finding renamed variants')
assert.equal(findH3PreviewOverrideNode(info('KSampler', 'VAELoader')), undefined, 'Unrelated nodes are not reported as a preview override')

console.log('PASS: H3 preview-override detection prefers the protocol-compatible node')