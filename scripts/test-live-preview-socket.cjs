const assert = require('node:assert/strict')
const { load } = require('./test-ts-loader.cjs')

// The dev branch of comfyEventSocketUrl reads the page origin; stage a
// browser-like location before the first load so the module sees it.
global.__TS_LOADER_EXTRA_GLOBALS__ = { location: { protocol: 'http:', host: '127.0.0.1:5173' } }
const { comfyEventSocketUrl } = load('src/lib/useLivePreview.ts')
const clientId = 'abc'

// Production/file:// origin: the socket must talk to the engine directly, so
// Host and Origin both come from the engine URL and ComfyUI's origin-only
// middleware lets the handshake through.
assert.equal(
  comfyEventSocketUrl('http://127.0.0.1:8188', false, clientId),
  'ws://127.0.0.1:8188/ws?clientId=abc',
)
assert.equal(
  comfyEventSocketUrl('http://localhost:8188/', false, clientId),
  'ws://localhost:8188/ws?clientId=abc',
)
assert.equal(
  comfyEventSocketUrl('https://engine.local:8443/base', false, clientId),
  'wss://engine.local:8443/base/ws?clientId=abc',
)

// Dev origin: a cross-origin socket (page 5173, engine 8188) is rejected by
// ComfyUI's origin-only middleware with 403 before onopen ever fires, which
// silently degrades job progress to "stuck at submit-time percent". Route the
// socket through the Vite dev proxy instead so Host and Origin stay the page
// origin and the middleware lets the handshake through.
assert.equal(
  comfyEventSocketUrl('http://127.0.0.1:8188', true, clientId),
  'ws://127.0.0.1:5173/comfy-ws?clientId=abc',
)
// Any engine URL still maps to the single same-origin proxy route in dev.
assert.equal(
  comfyEventSocketUrl('http://192.168.1.40:8188', true, clientId),
  'ws://127.0.0.1:5173/comfy-ws?clientId=abc',
)

console.log('PASS: event-socket URL keeps Host/Origin aligned with the page origin')
