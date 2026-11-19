// The engine-routing gates.
//
// mmh3 sits beside ComfyUI, not instead of it. Each gate below pins one part
// of that arrangement, so a later change that redirects a ComfyUI call, drops
// a bridge method, changes a recipe field or splits the settings write fails
// here instead of in a render that no longer looks right.
//
// The gates match structure, not line numbers: they look for the shape of a
// dispatch point and for behaviour, so moving code around does not break them.

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { load } = require('./test-ts-loader.cjs')

const root = path.resolve(__dirname, '..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const loadModule = (file) => load(path.join(root, file))

// The loader runs the modules in their own realm, so their objects carry a
// different prototype. Round-tripping through JSON brings them back into this
// one, which lets the strict assertions compare them by value.
const plain = (value) => JSON.parse(JSON.stringify(value))

function walk(dir, extension) {
  const found = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) found.push(...walk(full, extension))
    else if (entry.name.endsWith(extension)) found.push(full)
  }
  return found
}

/** The body of a top-level declaration: from its marker to the next one at the
 *  same indentation. Used to look inside a function without pinning lines. */
function region(text, marker) {
  const start = text.indexOf(marker)
  assert.ok(start >= 0, `${marker} is not in the file`)
  const rest = text.slice(start)
  const next = /\n {2}\S/.exec(rest.slice(1))
  return next ? rest.slice(0, next.index + 1) : rest
}

// The fields the mmh3 server accepts. These mirror the server's own lists:
// `generation::OPTIONS` for a video, `IMAGE_OPTIONS` for a picture, and the
// machine options a request may not set at all.
const MMH3_VIDEO_OPTIONS = [
  'prompt', 'prompt-file', 'context', 'models', 'width', 'height', 'frames',
  'first-frame', 'last-frame', 'reference', 'reference-audio', 'reference-video',
  'steps', 'schedule', 'sampler', 'draft-steps', 'latent-upscaler', 'seed',
  'shift-video', 'shift-audio', 'dit', 'text-encoder', 'video-vae', 'audio-vae',
  'patch', 'lora', 'lora-strength', 'lora-mode', 'worker', 'worker-units',
  'token', 'attention', 'attention-precision', 'linear-precision', 'sparse-tau',
  'sparse-start', 'vsa-sparsity', 'veda-predictor', 'veda-sparsity',
  'veda-reference-sparsity', 'vram-budget', 'devices',
  'keyframe', 'frame-index',
]
const MMH3_IMAGE_OPTIONS = [
  'prompt', 'prompt-file', 'reference', 'width', 'height', 'min-generation-area',
  'seed', 'attention-precision', 'attention', 'sparse-tau', 'sparse-start',
  'draft-steps', 'latent-upscaler', 'renoise-sigma', 'steps', 'shift', 'patch',
  'lora', 'lora-strength', 'lora-mode',
]
const MMH3_MACHINE_OPTIONS = [
  'models', 'dit', 'text-encoder', 'video-vae', 'audio-vae', 'devices',
  'vram-budget', 'worker', 'worker-units', 'token',
]
const MMH3_FILE_OPTIONS = [
  'prompt-file', 'context', 'first-frame', 'last-frame', 'reference',
  'reference-audio', 'reference-video', 'keyframe',
]

// The ComfyUI channels the app had before a second engine existed. They may
// only grow.
const COMFY_CHANNELS = [
  'comfy:cancel', 'comfy:history', 'comfy:info', 'comfy:output-image',
  'comfy:queue', 'comfy:save-output-image', 'comfy:save-still-image',
  'comfy:status', 'comfy:submit', 'comfy:upload', 'comfy:upload-data',
]

// The bridge methods the app had before a second engine existed. They may
// only grow.
const BRIDGE_METHODS = [
  'assembleRippleChunks', 'cancelPrompt', 'chooseClipMasterExportPath',
  'chooseDirectory', 'chooseMedia', 'chooseVideos', 'deleteMedia',
  'exportVideo', 'exportWorkflowJson', 'extractClipMasterFrames',
  'extractVideoFrame', 'extractVideoFrames', 'factoryResetSettings',
  'fileDataUrl', 'findLatestOutput', 'generatePromptCompletion',
  'generateStructuredWithOllama', 'generateWithOllama', 'generateWithOllamaVision',
  'getComfyStatus', 'getGpuTelemetry', 'getHistory', 'getLanStatus',
  'getLegacyMigrationStatus', 'getLocalLlmStatus', 'getObjectInfo',
  'getOutputImage', 'getQueue', 'getRenderBenchmarks', 'getRifeStatus',
  'getSettings', 'getVideoMetadata', 'getVideoThumbnail', 'installRife',
  'interpolateVideo', 'joinVideos', 'mediaUrl', 'migrateLegacyData',
  'openDevTools', 'openMovieEditor', 'openStudio', 'prepareContinuationSource',
  'prepareRippleChunkSource', 'resolveOutput', 'rotateLanToken',
  'saveComfyOutputImage', 'saveRenderBenchmarks', 'saveSettings',
  'saveStillImage', 'scanModels', 'setNativeTheme', 'setUiScale',
  'setWindowAlwaysOnTop', 'showOutput', 'spliceClipMaster', 'submitPrompt',
  'syncMobileCharacters', 'trimClipMaster', 'trimVideo', 'uploadImageData',
  'uploadInput', 'validateMediaFiles',
]

// The mmh3 channels and the bridge method each one answers under.
const MMH3_BRIDGE = {
  'mmh3:status': 'mmh3Status',
  'mmh3:submit': 'mmh3Submit',
  'mmh3:submit-image': 'mmh3SubmitImage',
  'mmh3:job': 'mmh3Job',
  'mmh3:list': 'mmh3List',
  'mmh3:delete': 'mmh3Delete',
  'mmh3:download': 'mmh3Download',
  'mmh3:release-comfy': 'mmh3ReleaseComfy',
  'mmh3:interrupt': 'mmh3Interrupt',
  'mmh3:recipes': 'mmh3Recipes',
}

// The mmh3 channels the app had before the interrupt and recipe endpoints
// existed. They may only grow; a renamed or dropped channel breaks the
// deployed engine contract.
const ORIGINAL_MMH3_CHANNELS = [
  'mmh3:status', 'mmh3:submit', 'mmh3:submit-image', 'mmh3:job', 'mmh3:list',
  'mmh3:delete', 'mmh3:download', 'mmh3:release-comfy',
]

const gates = []
function gate(id, name, run) {
  gates.push({ id, name, run })
}

gate('G1', 'Every ComfyUI submit point still targets the ComfyUI address', () => {
  const files = [...walk(path.join(root, 'src'), '.ts'), ...walk(path.join(root, 'src'), '.tsx')]
  const allowed = new Set(['settings.comfyUrl', 'url'])
  const calls = []
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8')
    const pattern = /minimax\.submitPrompt\(\s*([A-Za-z0-9_.$]+)/g
    let match
    while ((match = pattern.exec(text))) calls.push({ file: path.relative(root, file), argument: match[1] })
  }
  assert.ok(calls.length >= 20, `The scan found ${calls.length} ComfyUI submit points, far fewer than the app has`)
  for (const call of calls) {
    assert.ok(allowed.has(call.argument), `${call.file} submits to "${call.argument}" instead of the ComfyUI address`)
  }
})

gate('G2', 'The live preview socket still follows the ComfyUI address', () => {
  const text = read('src/lib/useLivePreview.ts')
  assert.doesNotMatch(text, /engines/, 'The live preview must not read the engine list')
  assert.doesNotMatch(text, /mmh3/, 'The live preview must not know about mmh3')
  const { comfyEventSocketUrl } = loadModule('src/lib/useLivePreview.ts')
  assert.equal(comfyEventSocketUrl('http://10.0.0.2:8188', false, 'c1'), 'ws://10.0.0.2:8188/ws?clientId=c1', 'The socket follows the URL it was given')
  assert.equal(comfyEventSocketUrl('https://engine.local:8188', false, 'c2'), 'wss://engine.local:8188/ws?clientId=c2', 'A secure engine keeps the secure socket')
})

gate('G3', 'The ComfyUI channels and the bridge only grow', () => {
  const main = read('electron/main.ts')
  const preload = read('electron/preload.ts')
  const mock = read('src/browserMock.ts')
  const channels = new Set([...main.matchAll(/ipcMain\.handle\('([^']+)'/g)].map((match) => match[1]))
  const methods = new Set([...preload.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9]*):/gm)].map((match) => match[1]))
  for (const channel of COMFY_CHANNELS) {
    assert.ok(channels.has(channel), `The ${channel} channel is still registered`)
  }
  for (const method of BRIDGE_METHODS) {
    assert.ok(methods.has(method), `The bridge still exposes ${method}`)
  }
  for (const [channel, method] of Object.entries(MMH3_BRIDGE)) {
    assert.ok(channels.has(channel), `The ${channel} channel is registered`)
    assert.ok(methods.has(method), `The bridge exposes ${method}`)
    assert.ok(mock.includes(`${method}:`), `The browser mock answers ${method}`)
  }
  assert.equal([...channels].filter((channel) => channel.startsWith('mmh3:')).length, Object.keys(MMH3_BRIDGE).length, 'mmh3 has exactly its own channels')
})

gate('G4', 'The three H3 dispatch points branch on the engine', () => {
  const app = read('src/App.tsx')
  const image = read('src/components/H3ImageWorkspace.tsx')
  const generate = region(app, 'const generate = async')
  assert.match(generate, /usingMmh3/, 'The H3 generation reads the engine it renders on')
  assert.match(generate, /runMmh3Job\(/, 'The H3 generation can hand the job to mmh3')
  const survey = region(app, 'const generateCharacterIdentitySurvey')
  assert.match(survey, /runMmh3Job\(/, 'The character identity survey can hand the job to mmh3')
  assert.match(image, /mmh3ImageRequest\(/, 'The image workspace builds an mmh3 request')
  assert.match(image, /mmh3SubmitImage\(/, 'The image workspace submits to mmh3')
  assert.match(image, /submitPrompt\(/, 'The image workspace still submits to ComfyUI')
})

gate('G5', 'The mmh3 recipes keep the fields the server accepts', () => {
  const { mmh3VideoRecipe, mmh3ImageFields, recipeForTurbo, mmh3TierForCanvas, mmh3TierCanvas, MMH3_FASTH3_PATCH, MMH3_TURBO4_LORA, MMH3_TURBO8_LORA, MMH3_TURBO8_544P_LORA, MMH3_PDMD_LORA } = loadModule('src/lib/engine/mmh3Recipe.ts')

  assert.deepEqual(
    plain(mmh3VideoRecipe('off', { steps: 30 }).fields),
    { sampler: 'euler', schedule: 'uniform', steps: 30, 'shift-video': '12', 'shift-audio': '3' },
    'The standard tier sends the sampler and the schedule',
  )
  assert.deepEqual(
    plain(mmh3VideoRecipe('turbo4').fields),
    { patch: MMH3_FASTH3_PATCH, steps: 4, 'attention-precision': 'int8-fp8', 'shift-video': '12', 'shift-audio': '3' },
    'Turbo 4 sends the FastH3 patch and four steps',
  )
  assert.deepEqual(
    plain(mmh3VideoRecipe('turbo4-lora').fields),
    { lora: MMH3_TURBO4_LORA, steps: 4, attention: 'sol', 'attention-precision': 'int8-fp8', 'sparse-start': 0, 'shift-video': '6', 'shift-audio': '3' },
    'The 768p Turbo 4 LoRA tier keeps the shift it was trained with',
  )
  assert.deepEqual(
    plain(mmh3VideoRecipe('turbo8').fields),
    { lora: MMH3_TURBO8_LORA, steps: 8, attention: 'sol', 'attention-precision': 'int8-fp8', 'sparse-start': 0, 'shift-video': '6', 'shift-audio': '3' },
    'Turbo 8 sends the 768p LoRA, eight steps and the shift it was trained with',
  )
  assert.deepEqual(
    plain(mmh3VideoRecipe('turbo8-544p').fields),
    { lora: MMH3_TURBO8_544P_LORA, steps: 8, attention: 'sol', 'attention-precision': 'int8-fp8', 'sparse-start': 0, 'shift-video': '12', 'shift-audio': '3' },
    'The 544p Turbo 8 tier sends its own LoRA file',
  )
  assert.deepEqual(
    plain(mmh3VideoRecipe('fast').fields),
    { steps: 8, attention: 'dense', 'attention-precision': 'int8-fp8', 'shift-video': '12', 'shift-audio': '3' },
    'The fast tier sends the dense attention it needs',
  )
  assert.equal(mmh3VideoRecipe('fast').target, 'fast', 'The fast tier runs on the second instance')
  assert.deepEqual(
    plain(mmh3VideoRecipe('pdmd').fields),
    { lora: MMH3_PDMD_LORA, steps: 2, attention: 'sol', 'attention-precision': 'int8-fp8', 'sparse-start': 0, 'shift-video': '12', 'shift-audio': '3' },
    'PDMD sends its own LoRA and two steps',
  )
  assert.equal(recipeForTurbo('4'), 'turbo4', 'The 4-step tier maps to the FastH3 patch')
  assert.equal(recipeForTurbo('8'), 'turbo8', 'The 8-step tier maps to the Turbo 8 LoRA')
  assert.equal(recipeForTurbo('fast'), 'fast', 'The fast tier maps to the second instance')
  assert.equal(recipeForTurbo('off'), 'off', 'Everything else maps to the standard tier')

  // The turbo8 weights pair with the canvas they were trained on: 1344x768
  // takes the 768p LoRA, 960x544 the 544p one, and no other canvas gets turbo8.
  assert.equal(mmh3TierForCanvas('turbo8', 1344, 768), 'turbo8', 'The 768p canvas keeps the 768p Turbo 8 tier')
  assert.equal(mmh3TierForCanvas('turbo8', 960, 544), 'turbo8-544p', 'The 544p canvas swaps to the 544p Turbo 8 tier')
  assert.equal(mmh3TierForCanvas('turbo8', 864, 480), 'off', 'A canvas without a trained Turbo 8 falls back to the standard tier')
  assert.deepEqual(plain(mmh3TierCanvas('turbo8')), { width: 1344, height: 768 }, 'Turbo 8 names the canvas it was trained on')
  assert.equal(mmh3TierCanvas('off'), null, 'The standard tier has no canvas constraint')

  assert.deepEqual(
    plain(mmh3ImageFields({ width: 1024, height: 768, steps: 6, seed: 7 })),
    { width: 1024, height: 768, steps: 6, seed: 7 },
    'A picture sends its size, its steps and its seed',
  )
  assert.deepEqual(plain(mmh3ImageFields({})), { steps: 6 }, 'A picture without a size still sends its steps')

  // Every field the app sends has to be a field the server knows, and no
  // request may set one of the machine options.
  for (const id of ['off', 'turbo4', 'turbo4-lora', 'turbo8', 'turbo8-544p', 'fast', 'pdmd']) {
    for (const name of Object.keys(mmh3VideoRecipe(id).fields)) {
      assert.ok(MMH3_VIDEO_OPTIONS.includes(name), `The ${id} tier sends "${name}", which the mmh3 server does not accept`)
      assert.ok(!MMH3_MACHINE_OPTIONS.includes(name), `The ${id} tier sends the machine option "${name}"`)
    }
  }
  for (const name of Object.keys(mmh3ImageFields({ width: 1024, height: 1024, steps: 6, seed: 7 }))) {
    assert.ok(MMH3_IMAGE_OPTIONS.includes(name), `A picture sends "${name}", which the mmh3 server does not accept`)
  }

  // The request builder adds the fields of the tier and nothing else.
  const { mmh3VideoRequest, mmh3ImageRequest } = loadModule('src/lib/engine/mmh3Task.ts')
  const engine = { id: 'mmh3', label: 'mmh3', kind: 'mmh3', baseUrl: 'http://127.0.0.1:8888', fastBaseUrl: 'http://127.0.0.1:8889' }
  const video = mmh3VideoRequest({ engine, recipe: 'off', prompt: 'a wave', seed: 5, width: 1344, height: 768, duration: 5 })
  for (const name of Object.keys(video.fields)) {
    assert.ok(MMH3_VIDEO_OPTIONS.includes(name), `A video request sends "${name}", which the mmh3 server does not accept`)
    assert.ok(!MMH3_MACHINE_OPTIONS.includes(name), `A video request sends the machine option "${name}"`)
  }
  assert.equal(video.fields.prompt, 'a wave', 'The video request carries the prompt')
  assert.equal(video.fields.frames, 124, 'Five seconds is the frame count the H3 pipeline already uses')
  assert.equal(video.baseUrl, 'http://127.0.0.1:8888', 'A video request goes to the main instance')
  const fast = mmh3VideoRequest({ engine, recipe: 'fast', prompt: 'a wave' })
  assert.equal(fast.baseUrl, 'http://127.0.0.1:8889', 'The fast tier goes to the second instance')
  const picture = mmh3ImageRequest({ engine, prompt: 'a wave', width: 1024, height: 1024 })
  for (const name of Object.keys(picture.fields)) {
    assert.ok(MMH3_IMAGE_OPTIONS.includes(name), `A picture request sends "${name}", which the mmh3 server does not accept`)
  }
  assert.equal(picture.fields.seed, undefined, 'A picture without a seed sends none')

  // The files a request uploads are the ones the server reads as files.
  const withFiles = mmh3VideoRequest({ engine, recipe: 'off', prompt: 'a wave', firstFrame: '/tmp/first.png', lastFrame: '/tmp/last.png', referenceImages: ['/tmp/ref.png'], referenceVideos: ['/tmp/ref.mp4'], referenceAudios: ['/tmp/ref.wav'] })
  assert.deepEqual(plain(withFiles.files.map((file) => file.field)), ['first-frame', 'last-frame', 'reference', 'reference-video', 'reference-audio'], 'The uploads keep the field names the server reads')
  for (const file of withFiles.files) {
    assert.ok(MMH3_FILE_OPTIONS.includes(file.field), `The upload "${file.field}" is not a file option`)
  }

  // The engine's own recipe is the contract: its option keys are the form
  // fields, the values ride along untouched, and a machine option never does.
  const fromServer = mmh3VideoRequest({ engine, recipe: 'off', prompt: 'a wave', serverOptions: { 'shift-video': '6', steps: 8, models: 'some/dir' } })
  assert.deepEqual(plain(fromServer.fields), { 'shift-video': '6', steps: 8, prompt: 'a wave' }, 'The engine recipe fields go into the request as they are')
  for (const name of Object.keys(fromServer.fields)) {
    assert.ok(!MMH3_MACHINE_OPTIONS.includes(name), `The engine recipe sends the machine option "${name}"`)
  }

  // The multi-anchor keyframes travel as paired keyframe/frame-index fields.
  const anchored = mmh3VideoRequest({ engine, recipe: 'off', prompt: 'a wave', duration: 5, keyframes: [{ frameIndex: 30, path: '/tmp/anchor-1.png' }, { frameIndex: 60, path: '/tmp/anchor-2.png' }] })
  assert.deepEqual(plain(anchored.files.map((file) => file.field)), ['keyframe', 'keyframe'], 'Each anchor uploads as a keyframe file')
  // The server reads frame-index as one repeatable field: the i-th entry pairs
  // with the i-th keyframe. Joining the indexes into one space-separated value
  // is rejected with "pass one --frame-index for every --keyframe".
  assert.deepEqual(plain(anchored.repeats ?? []), [{ name: 'frame-index', value: '30' }, { name: 'frame-index', value: '60' }], 'Each anchor carries its own frame-index entry')
  assert.equal(anchored.fields['frame-index'], undefined, 'The frame indexes are never joined into a single field')
  for (const repeat of anchored.repeats ?? []) {
    assert.ok(MMH3_VIDEO_OPTIONS.includes(repeat.name), `An anchored request sends "${repeat.name}", which the mmh3 server does not accept`)
  }
  for (const name of Object.keys(anchored.fields)) {
    assert.ok(MMH3_VIDEO_OPTIONS.includes(name), `An anchored request sends "${name}", which the mmh3 server does not accept`)
  }
  assert.deepEqual(plain(mmh3VideoRequest({ engine, recipe: 'off', prompt: 'a wave', duration: 5, keyframes: [{ frameIndex: 30, path: '/tmp/anchor-1.png' }] }).repeats ?? []), [{ name: 'frame-index', value: '30' }], 'One anchor sends exactly one frame-index')
})

gate('G6', 'The engine settings have one write channel', () => {
  const main = read('electron/main.ts')
  assert.match(main, /engines: engines\.engines, activeEngineId: engines\.activeEngineId/, 'The settings the app reads carry the engine list and the active engine')
  assert.match(main, /defaultEngines\(comfyUrl, raw\.engines, raw\.activeEngineId\)/, 'The engine list is normalized when the settings are read')

  const { normalizeEngines, DEFAULT_MMH3_BASE_URL, DEFAULT_MMH3_FAST_BASE_URL } = loadModule('electron/engineSettings.ts')
  const preset = normalizeEngines('http://127.0.0.1:8188')
  assert.deepEqual(plain(preset.engines.map((engine) => engine.id)), ['comfy', 'mmh3'], 'A fresh install has the two engines')
  assert.equal(preset.engines[0].baseUrl, 'http://127.0.0.1:8188', 'The ComfyUI entry carries the address')
  assert.equal(preset.engines[1].baseUrl, DEFAULT_MMH3_BASE_URL, 'The mmh3 entry points at the local instance')
  assert.equal(preset.engines[1].fastBaseUrl, DEFAULT_MMH3_FAST_BASE_URL, 'The mmh3 entry knows its second instance')
  assert.equal(preset.activeEngineId, 'comfy', 'ComfyUI is the engine a fresh install starts on')

  // The write side mirrors the address into the ComfyUI entry, so the two can
  // never disagree on disk.
  const mirrored = normalizeEngines('http://127.0.0.1:9999', [{ id: 'comfy', label: 'ComfyUI', kind: 'comfy', baseUrl: 'http://127.0.0.1:8188' }], 'comfy')
  assert.equal(mirrored.engines[0].baseUrl, 'http://127.0.0.1:9999', 'The ComfyUI entry follows the address')
  assert.equal(mirrored.activeEngineId, 'comfy', 'The active engine stays an engine that exists')
  assert.equal(normalizeEngines('http://127.0.0.1:8188', undefined, 'mmh3').activeEngineId, 'mmh3', 'The mmh3 engine can be the active one')
  assert.equal(normalizeEngines('http://127.0.0.1:8188', undefined, 'nope').activeEngineId, 'comfy', 'An unknown engine falls back to ComfyUI')

  // The renderer mirrors it the same way, so the memory and the file agree.
  const { normalizeEngineSettings } = loadModule('src/lib/engine/engines.ts')
  const written = normalizeEngineSettings({ comfyUrl: 'http://127.0.0.1:9999', engines: [{ id: 'comfy', label: 'ComfyUI', kind: 'comfy', baseUrl: 'http://127.0.0.1:8188' }] })
  assert.equal(written.comfyUrl, 'http://127.0.0.1:9999', 'The address is kept')
  assert.equal(written.engines.find((engine) => engine.id === 'comfy').baseUrl, 'http://127.0.0.1:9999', 'The ComfyUI entry follows the address')
  assert.deepEqual(plain(written.engines.map((engine) => engine.id)), ['comfy', 'mmh3'], 'The renderer writes the same two engines')
  assert.equal(written.activeEngineId, 'comfy', 'The renderer falls back to ComfyUI')

  // A stored record without an engine ran on ComfyUI.
  const { readSavedJobs } = loadModule('src/lib/jobPersistence.ts')
  const [comfy] = readSavedJobs(JSON.stringify([{ id: 'a', prompt: 'p', createdAt: 1, status: 'running', mode: 'text', progress: 1, width: 1, height: 1, duration: 1 }]))
  assert.equal(comfy.engineId, undefined, 'An older record has no engine')
  assert.match(comfy.error, /ComfyUI 队列/, 'An interrupted ComfyUI render still says what to do')
  const [mmh3] = readSavedJobs(JSON.stringify([{ id: 'b', prompt: 'p', createdAt: 1, status: 'running', mode: 'text', progress: 1, width: 1, height: 1, duration: 1, engineId: 'mmh3' }]))
  assert.equal(mmh3.engineId, 'mmh3', 'An mmh3 record keeps its engine')
  assert.match(mmh3.error, /mmh3/, 'An interrupted mmh3 render says that the task id is gone')
})

gate('G7', 'The mmh3 channels only grow', () => {
  const main = read('electron/main.ts')
  const preload = read('electron/preload.ts')
  const mock = read('src/browserMock.ts')
  const channels = new Set([...main.matchAll(/ipcMain\.handle\('([^']+)'/g)].map((match) => match[1]))
  // Every channel the deployed engines answer still exists.
  for (const channel of ORIGINAL_MMH3_CHANNELS) {
    assert.ok(channels.has(channel), `The ${channel} channel is still registered`)
  }
  // The two new endpoints are additions, not replacements.
  assert.ok(channels.has('mmh3:interrupt'), 'The interrupt channel is registered')
  assert.ok(channels.has('mmh3:recipes'), 'The recipes channel is registered')
  assert.equal([...channels].filter((channel) => channel.startsWith('mmh3:')).length, Object.keys(MMH3_BRIDGE).length, 'mmh3 has exactly its own channels')
  // Each channel is reachable from the renderer under its own bridge method.
  for (const [channel, method] of Object.entries(MMH3_BRIDGE)) {
    assert.match(preload, new RegExp(`${method}:\\s*\\(`), `The bridge exposes ${method}`)
    assert.match(preload, new RegExp(`invoke\\('${channel}'`), `The bridge method ${method} calls ${channel}`)
    assert.ok(mock.includes(`${method}:`), `The browser mock answers ${method}`)
  }
})

gate('G8', 'The engine job states are read as the engine states them', () => {
  const { parseJob, parseWeights } = loadModule('electron/mmh3Api.ts')
  for (const state of ['queued', 'running', 'cancelling', 'cancelled', 'done', 'failed']) {
    assert.equal(parseJob({ id: 'x', state }).state, state, `The ${state} state survives the parse`)
  }
  // A state the app does not know falls back to queued instead of pretending
  // the job is running.
  assert.equal(parseJob({ id: 'x', state: 'weird' }).state, 'queued', 'An unknown state is treated as queued')
  // The per-step seconds are the ETA input; they are null until the first step.
  assert.equal(parseJob({ id: 'x', state: 'running', step_seconds: 12.5 }).stepSeconds, 12.5, 'The engine step seconds are read')
  assert.equal(parseJob({ id: 'x', state: 'running' }).stepSeconds, null, 'A job without a measured step has no step seconds')

  // The weights the instance loaded: the dit carries its adapters in order.
  const weights = parseWeights([
    { kind: 'text_encoder', file: 'text.safetensors', bytes: 10, digest: 'abcd' },
    { kind: 'dit', file: 'dit.safetensors', bytes: 20, digest: 'beef', adapters: [{ file: 'lora.safetensors', bytes: 5, digest: 'cafe', strength: 1, mode: 'adapter' }] },
  ])
  assert.equal(weights.length, 2, 'Both weights are read')
  assert.equal(weights[1].kind, 'dit', 'The dit keeps its kind')
  assert.equal(weights[1].adapters[0].file, 'lora.safetensors', 'The adapter of the dit is read')
  assert.equal(weights[1].adapters[0].mode, 'adapter', 'The adapter mode is read')
  assert.equal(parseWeights(null), null, 'A status without weights stays empty')
})

let failed = 0
for (const { id, name, run } of gates) {
  try {
    run()
    console.log(`PASS ${id} · ${name}`)
  } catch (error) {
    failed += 1
    console.log(`FAIL ${id} · ${name}`)
    console.log(`     ${error instanceof Error ? error.message : String(error)}`)
  }
}

if (failed) {
  console.log(`${failed} engine routing gate(s) failed`)
  process.exit(1)
}
console.log('engine routing tests passed')
