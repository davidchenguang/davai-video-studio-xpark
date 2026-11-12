'use strict'
// A10 walkthrough: drive the real Electron renderer through every workspace,
// screenshot each one, and report (a) horizontal overflow at two viewport
// widths, (b) residual English phrases in UI chrome (excluding prompt fields,
// which legitimately stay English), and (c) whether strings the localization
// batches previously missed still show up in the DOM.
//
// Usage: node scripts/locale-walkthrough.cjs [--out <dir>] [--port <cdp-port>]
//   --out   defaults to docs/locale/evidence/walkthrough
//   --port  defaults to 9333 (the Electron instance's CDP port)
//
// The script needs the app to be running: `pnpm dev:web` for the Vite server
// and the Electron app pointed at it with --remote-debugging-port.
const fs = require('node:fs')
const path = require('node:path')
const WebSocket = require('ws')

const args = process.argv.slice(2)
const readFlag = name => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : null
}
const PORT = readFlag('--port') || process.env.CDP_PORT || '9333'
const OUT_DIR = path.resolve(readFlag('--out') || path.join('docs', 'locale', 'evidence', 'walkthrough'))

// The desktop shell is laid out for a wide window; the LAN phone UI has its
// own narrow layout. Both sizes are set explicitly so a stale device-metrics
// override from an earlier run cannot hide the sidebar again.
const DESKTOP = { width: 1440, height: 900 }
const NARROW_DESKTOP = { width: 900, height: 700 }
const PHONE = { width: 390, height: 844 }

// Sidebar labels as rendered by the app shell (shorter than the workspace
// finder labels): 19 views + the two music engines.
const DESTINATIONS = [
  '草稿本', 'H3 视频', '续接', 'LTX 2.5', 'LTX Ripple',
  '图片编辑', '生成图片', '音乐 · ACE-Step', '音乐 · Music 3',
  '参考图准备', '角色', '发型', '服装', '配饰', '地点',
  '队列', '视频库', '影片剪辑', '片段工坊', '设置',
]

// Strings that earlier batches missed because they sat in positions the
// scanner could not classify (tuple labels, computed labels, message
// arguments). Each one must be absent from the rendered DOM.
const MUST_NOT_RENDER = [
  'Square ·', 'Landscape ·', 'Portrait ·', 'Ultrawide',
  'Custom appearance', 'Cinematic lead', 'Period drama', 'Custom voice',
  'Save frame only', 'first-frame input', 'native Frame 0 anchor',
  'Approve a location image', 'multi-GPU parallel',
  'Standard decoded frame', 'LTX sampling', 'LTX latent',
  'sampling preview stream',
  // 第 15 轮：Music 3 正在播放条与 ACE-Step 调性下拉的枚举裸显示。
  'C major', 'Pop',
]

let socket
let nextId = 0
const pending = new Map()

function send(method, params = {}) {
  const id = ++nextId
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    socket.send(JSON.stringify({ id, method, params }))
  })
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + ' ' + (result.exceptionDetails.exception?.description || ''))
  return result.result?.value
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

async function until(fn, label, timeout = 20000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const value = await fn().catch(() => null)
    if (value) return value
    await delay(250)
  }
  throw new Error('Timed out waiting for ' + label)
}

async function setViewport(size) {
  await send('Emulation.setDeviceMetricsOverride', { width: size.width, height: size.height, deviceScaleFactor: 1, mobile: false })
}

async function clearViewport() {
  await send('Emulation.clearDeviceMetricsOverride')
}

async function shot(name) {
  const { data } = await send('Page.captureScreenshot', { format: 'png' })
  const file = path.join(OUT_DIR, `${name}.png`)
  fs.writeFileSync(file, Buffer.from(data, 'base64'))
  return file
}

// Click a sidebar entry by its exact visible label.
const CLICK_LABEL = label => `(() => {
  const nodes = [...document.querySelectorAll('.sidebar .nav-button, .sidebar button, .sidebar a')];
  const hit = nodes.find(node => (node.getAttribute('aria-label') || node.textContent || '').trim() === ${JSON.stringify(label)} && node.getClientRects().length);
  if (!hit) return false;
  hit.click();
  return true;
})()`

// Collect visible English phrases from UI chrome only.
const COLLECT_ENGLISH = `(() => {
  const skip = node => {
    for (let current = node; current; current = current.parentElement) {
      const tag = current.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'CODE' || tag === 'PRE') return true;
      const cls = String(current.className || '');
      if (/prompt|code|mono|tag/i.test(cls)) return true;
    }
    return false;
  };
  const text = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const parent = node.parentElement;
    if (!parent || skip(parent)) continue;
    if (parent.closest('textarea, input, code, pre')) continue;
    if (!parent.getClientRects().length) continue;
    const value = node.textContent.trim();
    if (value) text.push(value);
  }
  // Closed <select> widgets render only the selected option, and their option
  // text nodes report no client rects, so the TreeWalker above misses them (the
  // ACE-Step key-select residue hid there). Collect the selected label directly.
  for (const select of document.querySelectorAll('select')) {
    const option = select.selectedOptions[0] || select.options[0];
    if (!option) continue;
    const value = (option.textContent || '').trim();
    if (value) text.push(value);
  }
  const phrase = /\\b[A-Za-z][A-Za-z0-9'’.-]*(?: [A-Za-z][A-Za-z0-9'’.-]*){1,}\\b/g;
  const hits = new Set();
  for (const value of text) {
    if (/[\\u4e00-\\u9fff]/.test(value)) continue;
    for (const match of value.match(phrase) || []) hits.add(match.trim());
  }
  return [...hits].sort();
})()`

const OVERFLOW = `(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  innerWidth: window.innerWidth,
  overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
}))()`

// Any of the previously-missed strings still visible in the page?
const FIND_MISSED = needles => `(() => {
  const needles = ${JSON.stringify(needles)};
  const text = document.body.innerText || '';
  return needles.filter(needle => text.includes(needle));
})()`

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
  const page = targets.find(target => String(target.url || '').includes('5173')) || targets.find(target => target.type === 'page')
  if (!page) throw new Error('no page target')
  socket = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false })
  await new Promise((resolve, reject) => { socket.on('open', resolve); socket.on('error', reject) })
  socket.on('message', raw => {
    const message = JSON.parse(raw.toString())
    if (message.id && pending.has(message.id)) {
      const entry = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) entry.reject(new Error(message.error.message))
      else entry.resolve(message.result)
    }
  })

  await send('Page.enable')
  await send('Runtime.enable')

  // Walk the desktop shell: navigate to the app root (the renderer may still
  // be on ?movieEditor=1 or ?mobile=1 from an earlier run), then reload so the
  // renderer picks up the latest Vite module state.
  const baseUrl = new URL(page.url || 'http://127.0.0.1:5173/')
  baseUrl.search = ''
  baseUrl.hash = ''
  await send('Page.navigate', { url: baseUrl.toString() })
  await until(() => evaluate(`document.readyState === 'complete'`), 'app root', 30000)
  await send('Page.reload')
  // A stale device-metrics override would hide the sidebar at phone width.
  await clearViewport()
  await setViewport(DESKTOP)
  await until(() => evaluate(`document.readyState === 'complete' && Boolean(document.querySelector('.sidebar .nav-button'))`), 'app shell', 30000)
  await delay(1000)

  const report = []
  for (const [index, label] of DESTINATIONS.entries()) {
    const clicked = await evaluate(CLICK_LABEL(label))
    if (!clicked) {
      report.push({ label, status: 'not-found' })
      console.log(`${label}: NOT FOUND`)
      continue
    }
    await delay(1200)
    const english = await evaluate(COLLECT_ENGLISH)
    const missed = await evaluate(FIND_MISSED(MUST_NOT_RENDER))
    const wide = await evaluate(OVERFLOW)
    await setViewport(NARROW_DESKTOP)
    await delay(600)
    const narrow = await evaluate(OVERFLOW)
    await setViewport(DESKTOP)
    await delay(300)
    const file = await shot(`${String(index + 1).padStart(2, '0')}-${label.replace(/[^a-z0-9]+/gi, '-')}`)
    report.push({ label, status: 'ok', english, missed, wide, narrow, screenshot: path.basename(file) })
    console.log(`${label}: english=${english.length} missed=${missed.length} overflowWide=${wide.overflow} overflowNarrow=${narrow.overflow} -> ${path.basename(file)}`)
    if (english.length) console.log('   english:', english.join(' | '))
    if (missed.length) console.log('   MISSED :', missed.join(' | '))
  }

  // The two extra shells: the movie editor window and the LAN phone UI.
  for (const [name, query, size] of [['movie-editor', '?movieEditor=1', DESKTOP], ['mobile', '?mobile=1', PHONE]]) {
    await clearViewport()
    await setViewport(size)
    await send('Page.navigate', { url: `http://127.0.0.1:5173/${query}` })
    await until(() => evaluate(`document.readyState === 'complete'`), `${name} shell`, 30000)
    await delay(1500)
    const missed = await evaluate(FIND_MISSED(MUST_NOT_RENDER))
    const english = await evaluate(COLLECT_ENGLISH)
    const overflow = await evaluate(OVERFLOW)
    const file = await shot(`90-${name}`)
    report.push({ label: name, status: 'ok', english, missed, overflow, screenshot: path.basename(file) })
    console.log(`${name}: english=${english.length} missed=${missed.length} overflow=${overflow.overflow} -> ${path.basename(file)}`)
    if (english.length) console.log('   english:', english.join(' | '))
    if (missed.length) console.log('   MISSED :', missed.join(' | '))
  }

  await clearViewport()
  fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2))
  const missed = report.flatMap(entry => entry.missed || [])
  const overflows = report.filter(entry => entry.wide?.overflow || entry.narrow?.overflow || entry.overflow?.overflow)
  const notFound = report.filter(entry => entry.status === 'not-found')
  console.log('\nreport:', path.join(OUT_DIR, 'report.json'))
  console.log('previously-missed strings still rendered:', missed.length, missed.length ? missed.join(' | ') : '')
  console.log('views with horizontal overflow:', overflows.length)
  console.log('destinations not found in the sidebar:', notFound.length, notFound.length ? notFound.map(entry => entry.label).join(' | ') : '')
  if (missed.length || overflows.length || notFound.length) process.exit(1)
  // The CDP WebSocket keeps the event loop alive after the work is done;
  // close it so a successful run actually exits instead of hanging silently.
  try { socket.close() } catch { /* already closed — nothing to do */ }
  process.exit(0)
}

main().catch(error => { console.error('FAILED:', error.message); process.exit(1) })
