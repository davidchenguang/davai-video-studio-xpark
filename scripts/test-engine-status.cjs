// The engine-status gates.
//
// The status row tells the user what the engine is doing right now. Two
// classes of lie are pinned here: (1) an idle instance whose weights were
// unloaded (--idle-unload leaves weights empty or dit-less) reading as
// "busy" — busy is what generating/cancelling say, weights only say what is
// resident; (2) a quiet 15-second re-ask announcing itself to screen readers
// or disabling the selector. The tier-pairing notice lives in a pure
// function here too, so its wording cannot drift back into the component.

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { load } = require('./test-ts-loader.cjs')

const root = path.resolve(__dirname, '..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const loadModule = (file) => load(path.join(root, file))

const { mmh3EngineHealth, engineHealthAnnouncement, engineHealthStamp, ENGINE_HEALTH_REFRESH_MS, ENGINE_HEALTH_TTL_MS } = loadModule('src/lib/engine/engineHealth.ts')
const { mmh3TierNotice } = loadModule('src/lib/engine/mmh3Notice.ts')
const { mmh3TierForCanvas } = loadModule('src/lib/engine/mmh3Recipe.ts')

const engine = { id: 'mmh3', kind: 'mmh3', label: 'mmh3 (本机)', baseUrl: 'http://127.0.0.1:8888' }

const status = (over = {}) => ({
  reachable: true,
  generating: null,
  cancelling: null,
  queued: 0,
  models: null,
  weights: null,
  memory: null,
  error: null,
  ...over,
})

const ditWeights = [{
  kind: 'dit',
  file: 'minimax_h3_fl2va_pruned_int8_convrot.safetensors',
  bytes: 20979314802,
  digest: '0685701d57698a1b',
  adapters: [{ file: 'minimax_h3_fasth3_vsa_datafree_patch_rank64.safetensors', bytes: 1, digest: '1111222233334444', strength: 1, mode: 'adapter' }],
}]

function gate(name, fn) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

// S1: an idle instance that unloaded its weights is ready, never busy.
gate('S1 idle + unloaded weights stays ready', () => {
  const health = mmh3EngineHealth(engine, status({ weights: [] }))
  assert.equal(health.state, 'ready')
  assert.ok(health.detail.includes('未驻留权重'), `detail explains the unloaded weights: ${health.detail}`)
  assert.ok(!health.detail.includes('正在生成'), 'an idle engine is not "generating"')
  assert.ok(!health.detail.includes('正忙'), 'an idle engine is not "busy"')
})

// S1b: dit-less weights (some resident, the dit borrowed or gone) do not
// flip an idle instance to busy either.
gate('S1b idle + dit-less weights stays ready', () => {
  const health = mmh3EngineHealth(engine, status({ weights: [{ kind: 'text_encoder', file: 'qwen3vl.safetensors', bytes: 1, digest: 'a', adapters: [] }] }))
  assert.equal(health.state, 'ready')
  assert.ok(!health.detail.includes('正在生成'))
})

// S2: a run in flight is busy, with the queue count.
gate('S2 generating is busy', () => {
  const health = mmh3EngineHealth(engine, status({ generating: '6afe0001', queued: 1 }))
  assert.equal(health.state, 'busy')
  assert.ok(health.detail.includes('正在生成'))
  assert.ok(health.detail.includes('队列 1 个'))
})

// S3: an accepted interrupt is busy with the stop note (generating is null
// in the sub-second window after the interrupt is accepted).
gate('S3 cancelling is busy with the stop note', () => {
  const health = mmh3EngineHealth(engine, status({ cancelling: '6afe0002' }))
  assert.equal(health.state, 'busy')
  assert.ok(health.detail.includes('已受理停止'))
  assert.ok(health.detail.includes('跑完当前步即停'))
})

// S1c: resident weights render the weight line with the fingerprint note.
gate('S1c resident weights render with the fingerprint caveat', () => {
  const health = mmh3EngineHealth(engine, status({ weights: ditWeights }))
  assert.equal(health.state, 'ready')
  assert.ok(health.detail.includes('实际权重'))
  assert.ok(health.detail.includes('指纹 0685701d57698a1b'))
  assert.ok(health.detail.includes('实例口径指纹，非完整性校验'))
})

// S1d: the fast instance follows the same wording — resident, unloaded, or
// busy — and never decides the main instance's busy state.
gate('S1d fast instance note follows the same rules', () => {
  const resident = mmh3EngineHealth(engine, status({ weights: ditWeights }), Date.now(), status({ weights: ditWeights }))
  assert.ok(resident.detail.includes('极速实例') && resident.detail.includes('实际权重'), resident.detail)

  const unloaded = mmh3EngineHealth(engine, status({ weights: ditWeights }), Date.now(), status({ weights: [] }))
  assert.ok(unloaded.detail.includes('极速实例当前未驻留权重'), unloaded.detail)

  const fastBusy = mmh3EngineHealth(engine, status({ weights: ditWeights }), Date.now(), status({ generating: '6afe0003', weights: [] }))
  assert.equal(fastBusy.state, 'ready', 'a busy fast instance does not make the main instance busy')
  assert.ok(fastBusy.detail.includes('极速实例正在生成'), fastBusy.detail)

  const offline = mmh3EngineHealth(engine, status({ weights: ditWeights }), Date.now(), status({ reachable: false, error: 'connect ECONNREFUSED' }))
  assert.ok(!offline.detail.includes('极速实例'), 'an unreachable fast instance is not narrated')
})

// S4: the announcement carries the badge and detail; the timestamp stays
// out of it so an unchanged state is never re-announced by a quiet refresh.
gate('S4 the timestamp stays out of the announcement', () => {
  const health = mmh3EngineHealth(engine, status({ weights: [] }))
  const announcement = engineHealthAnnouncement(health)
  const stamp = engineHealthStamp(health)
  assert.ok(stamp.includes('检查于'), stamp)
  assert.ok(!announcement.includes('检查于'), announcement)
  assert.ok(announcement.includes('● 就绪'), announcement)
  assert.equal(engineHealthStamp(undefined), '')
  assert.equal(engineHealthAnnouncement(undefined), '尚未检查。')
})

// S5: the quiet refresh is silent and bounded.
gate('S5 the refresh cadence is silent and bounded', () => {
  assert.equal(ENGINE_HEALTH_REFRESH_MS, 15_000, 'the spec pins the 15-second cadence')
  assert.ok(ENGINE_HEALTH_TTL_MS >= ENGINE_HEALTH_REFRESH_MS, 'freshness outlives one refresh tick')

  const hook = read('src/lib/engine/useEngineSelection.ts')
  assert.ok(hook.includes('if (!document.hidden) void runChecks({ silent: true })'), 'the timer only ticks while the page is visible')
  assert.ok(hook.includes('visibilitychange'), 'returning to the foreground catches up immediately')
  assert.ok(hook.includes('if (!options.silent) setChecking(true)'), 'a silent pass never raises the checking flag')

  const selector = read('src/components/EngineSelector.tsx')
  assert.ok(/<span aria-hidden="true">\{engineHealthStamp\(current\)\}<\/span>/.test(selector), 'the stamp is rendered aria-hidden')
  assert.ok(selector.includes('{engineHealthAnnouncement(current)}'), 'the live region carries only the announcement')
})

// S6: the tier-pairing notice says what actually happens.
gate('S6 the tier-pairing notice describes the real pairing', () => {
  // The canvas-paired case: 960×544 re-aims turbo8 to turbo8-544p.
  assert.equal(mmh3TierForCanvas('turbo8', 960, 544), 'turbo8-544p')
  const paired = mmh3TierNotice('turbo8', 'turbo8-544p', 960, 544)
  assert.ok(paired.includes('turbo8-544p') && paired.includes('8 步'), paired)
  assert.ok(!paired.includes('回退') && !paired.includes('30 步'), paired)

  // The fallback case: an untrained canvas falls back to the standard recipe.
  assert.equal(mmh3TierForCanvas('turbo8', 1344, 576), 'off')
  const fallback = mmh3TierNotice('turbo8', 'off', 1344, 576)
  assert.ok(fallback.includes('标准配方'), fallback)
  assert.ok(!fallback.includes('30 步'), fallback)

  // No re-aim, no notice.
  assert.equal(mmh3TierNotice('turbo8', mmh3TierForCanvas('turbo8', 1344, 768), 1344, 768), null)
  assert.equal(mmh3TierNotice('off', 'off', 1344, 768), null)

  // The component delegates instead of wording it inline.
  const app = read('src/App.tsx')
  assert.ok(app.includes('mmh3TierNotice(wantedTier, tier, options.width, options.height)'), 'App.tsx uses the pure notice function')
  assert.ok(!/已回退到标准 \d+ 步/.test(app), 'no hardcoded step count remains in the component')
})

console.log('engine status tests passed')
