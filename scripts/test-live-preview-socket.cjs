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

// Dev origin, loopback engine: ComfyUI's origin check only compares the host,
// and only when the Host is loopback. The page is served by Vite on 5173 while
// the engine listens on 8188, so a loopback engine rejects the cross-port
// handshake — route the socket through the Vite dev proxy instead.
assert.equal(
  comfyEventSocketUrl('http://127.0.0.1:8188', true, clientId),
  'ws://127.0.0.1:5173/comfy-ws?clientId=abc',
)
assert.equal(
  comfyEventSocketUrl('http://localhost:8188', true, clientId),
  'ws://127.0.0.1:5173/comfy-ws?clientId=abc',
)
// Dev origin, remote engine: the origin check does not apply to a non-loopback
// Host, so the renderer connects straight to the engine that runs the prompt.
// Proxying here would subscribe to a *different* engine and no node or step
// event would ever arrive (the progress bar would stay at its submit value).
assert.equal(
  comfyEventSocketUrl('http://192.168.20.80:8188', true, clientId),
  'ws://192.168.20.80:8188/ws?clientId=abc',
)
assert.equal(
  comfyEventSocketUrl('http://192.168.1.40:8188', true, clientId),
  'ws://192.168.1.40:8188/ws?clientId=abc',
)

console.log('PASS: event-socket URL follows the engine that actually runs the prompt')
