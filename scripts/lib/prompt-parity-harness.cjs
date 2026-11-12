'use strict'
// Prompt-parity capture harness. Given a repository root, loads the real
// prompt-producing modules through scripts/test-ts-loader.cjs and returns a
// deterministic JSON-serializable snapshot of every prompt-output path:
//   compileScene / present, composeReferenceInstructions / buildPromptAssistantRequest,
//   applySceneCommand / suggestScene / value, autoTagPrompt, vision prompts
//   (referenceAnalysis), every *Workflow.ts graph builder, English preset search ranking.
// The capture script pins this to baseline ref 1a7ea28; the test re-runs it
// against the current tree and demands byte-identical output.
const path = require('node:path')

const mediaFile = (name, extra = {}) => {
  const kind = /\.(mp4|mov|webm)$/i.test(name) ? 'video' : /\.(mp3|wav|flac)$/i.test(name) ? 'audio' : 'image'
  return { path: `D:/davai-parity/${name}`, name, kind, ...extra }
}

// Bindings mirror what the app builds today: English labels that are BOTH
// displayed and compiled into prompts (the bilingual split points).
const parityBindings = () => [
  { file: mediaFile('mira-face.png', { referenceType: 'face' }), purpose: 'character', label: 'Character: Mira / face close-up', characterId: 'char-mira', source: 'character-studio' },
  { file: mediaFile('mira-body.png', { referenceType: 'full-body' }), purpose: 'character-angle', label: 'Character: Mira / full body', characterId: 'char-mira', source: 'character-studio' },
  { file: mediaFile('mira-turn.png', { referenceType: 'three-quarter' }), purpose: 'character-angle', label: 'Character: Mira / three-quarter view', characterId: 'char-mira', source: 'character-studio' },
  { file: mediaFile('mira-hair.png'), purpose: 'hair', label: 'Hair: soft waves for Mira', characterId: 'char-mira', hairStyleId: 'hair-1', source: 'hair-studio' },
  { file: mediaFile('coat.png'), purpose: 'wardrobe', label: 'Wardrobe: red wool coat for Mira', wardrobeId: 'ward-1', characterId: 'char-mira', source: 'wardrobe-studio' },
  { file: mediaFile('locket.png'), purpose: 'accessory', label: 'Accessory: silver locket for Mira', accessoryId: 'acc-1', characterId: 'char-mira', source: 'accessory-studio' },
  { file: mediaFile('locket-detail.png'), purpose: 'detail', label: 'Detail: engraved locket clasp for Mira', detailNotes: 'transfer only the clasp detail', characterId: 'char-mira', source: 'character-studio' },
  { file: mediaFile('alley.png'), purpose: 'location', label: 'Location: neon alley exterior', locationId: 'loc-alley', locationEnvironmentMode: 'built', locationContext: 'exterior', locationAccuracyDetails: 'green door on the left', source: 'location-studio' },
  { file: mediaFile('prev.mp4'), purpose: 'continuity', label: 'Previous-shot continuity frame', source: 'continuity' },
  { file: mediaFile('board.png'), purpose: 'generic', label: 'Shot reference: opening composition', source: 'shot' },
]

const SCENE_TEXT = 'A courier in a red jacket walks through a rain-slick neon alley at night, wide shot with a slow pan and racking focus onto the green door.'

async function capture(root) {
  const { load } = require(path.join(root, 'scripts', 'test-ts-loader.cjs'))
  const at = relative => load(path.join(root, relative))
  const snapshot = {}

  // ---- referenceAnalysis vision prompts (prompt layer; must stay English) ----
  const visionCalls = []
  global.__TS_LOADER_EXTRA_GLOBALS__ = {
    window: {
      minimax: {
        generateWithOllamaVision: async (url, model, prompt, images, provider) => {
          visionCalls.push({ url, model, prompt, images, provider })
          if (prompt.startsWith('Describe this reference image')) {
            const sceneState = at('src/lib/scenePromptState.ts')
            const fields = [...sceneState.preserveAttributes, ...sceneState.cameraAttributes]
            return JSON.stringify(Object.fromEntries(fields.map(field => [field, `observed ${field} value`])) , null, 0)
          }
          return '{"name":"Test Entry","description":"A deterministic analysis result."}'
        },
      },
    },
  }
  const settings = { llmProvider: 'ollama', ollamaUrl: 'http://127.0.0.1:11434', ollamaModel: 'vision-parity-model' }
  const referenceAnalysis = at('src/lib/referenceAnalysis.ts')
  const vision = {}
  for (const kind of ['character', 'wardrobe', 'location', 'hair', 'accessory']) {
    vision[kind] = await referenceAnalysis.analyzeReferenceImage(settings, 'D:/davai-parity/ref.png', kind)
  }
  vision.scene = await referenceAnalysis.analyzeSceneReference(settings, 'D:/davai-parity/scene.png')
  snapshot.visionPrompts = visionCalls.map(call => call.prompt)
  snapshot.visionParsed = vision
  delete global.__TS_LOADER_EXTRA_GLOBALS__

  // ---- scene state / compiler ----
  const sceneStateLib = at('src/lib/scenePromptState.ts')
  const compiler = at('src/lib/h3SceneCompiler.ts')
  const base = sceneStateLib.createSceneState(SCENE_TEXT, 6, 'text')
  let chained = base
  for (const [category, label] of [
    ['shot', 'Wide Shot'], ['angle', 'Low Angle'], ['camera', 'Handheld camera'], ['movement', 'Tracking'],
    ['style', 'Neon-soaked cinematic realism'], ['lighting', 'Practical neon lighting'], ['location', 'Rain-slick alley'],
    ['character', 'Mira'], ['sound', 'Rain and distant traffic'],
  ]) chained = sceneStateLib.applySceneCommand(chained, category, label)
  // English legacy storage values must keep flowing through unchanged (localStorage compatibility).
  snapshot.applySceneCommand = { camera: chained.camera, styles: chained.styles, environment: chained.environment, lighting: chained.lighting, soundscape: chained.soundscape, characters: chained.characters, continuity: chained.continuity }
  snapshot.suggestScene = {
    wide: sceneStateLib.suggestScene(SCENE_TEXT),
    mixed: sceneStateLib.suggestScene('Low angle over-the-shoulder close-up with a whip pan'),
    none: sceneStateLib.suggestScene('A quiet afternoon with no camera vocabulary at all'),
  }
  snapshot.applySceneSuggestions = sceneStateLib.applySceneSuggestions({ ...base, camera: {} })
  const compiledOf = state => {
    const compiled = compiler.compileScene(state)
    // conflicts[].message is display-layer text (translated later) — excluded from parity.
    return { prompt: compiled.prompt, references: compiled.references, subjects: compiled.subjects, speakers: compiled.speakers, timing: compiled.timing }
  }
  snapshot.compileScene = { base: compiledOf(base), commanded: compiledOf({ ...chained, mode: 'reference' }) }

  // ---- promptComposer ----
  const composer = at('src/lib/promptComposer.ts')
  const bindings = parityBindings()
  snapshot.composeReferenceInstructions = composer.composeReferenceInstructions(bindings)
  const referenceMap = ['Image 1 — Character: Mira / face close-up', 'Image 2 — Wardrobe: red wool coat for Mira', 'Video 1 — Previous-shot continuity frame']
  snapshot.buildPromptAssistantRequest = {
    enhance: composer.buildPromptAssistantRequest('enhance', 'A courier enters the alley and looks up at the green door.', { duration: 6, mode: 'reference', referenceMap }),
    timeline: composer.buildPromptAssistantRequest('timeline', 'The courier crosses the alley, unlocks the door and pauses.', { duration: 12, mode: 'text' }),
    audio: composer.buildPromptAssistantRequest('audio', 'The courier enters; rain hums around the neon signs.', { duration: 5, mode: 'text', noDialogue: true }),
  }
  snapshot.formatH3PromptOutput = composer.formatH3PromptOutput(
    'A courier in a red jacket walks through a rain-slick neon alley at night; she stops at the green door and looks up as rain hums around the neon signs.',
    'Alley arrival',
    { mode: 'text', duration: 6, noDialogue: true, referenceMap },
  )
  const characterProject = { id: 'char-mira', name: 'Mira', description: 'A courier with a red jacket and short dark hair.', wardrobe: 'red wool coat, black boots', voiceNotes: 'low and even', visualStyle: 'grounded realism', referencePrompt: '', createdAt: 1, updatedAt: 1, referenceMode: 'single', referenceImages: [], detailReferences: [] }
  const locationProject = { id: 'loc-alley', name: 'Neon Alley', description: 'A narrow rain-slick alley with a green door', environmentMode: 'built', locationContext: 'exterior' }
  const movieProject = { id: 'movie-1', title: 'Neon Courier', visualStyle: 'moody cinematic realism', visualRules: 'Keep the red jacket continuity across shots.', characters: [characterProject], locations: [locationProject] }
  const movieScene = { id: 'scene-1', title: 'Alley Arrival', summary: 'The courier reaches the alley door.', locationId: 'loc-alley', transition: 'cut', shots: [] }
  const movieShot = { id: 'shot-1', title: 'Walk In', duration: 6, prompt: 'The courier walks to the green door and looks up.', dialogue: 'Mira says, "Almost done."', mode: 'reference', characterIds: ['char-mira'], stage: 'planned', referenceImages: [], referenceVideos: [], referenceAudios: [] }
  snapshot.movieShotSceneState = composer.movieShotSceneState(movieProject, movieScene, movieShot, bindings)
  snapshot.compileMovieShotPrompt = composer.compileMovieShotPrompt(movieProject, movieScene, movieShot, bindings)
  const characterInputs = [{
    id: 'char-mira', name: 'Mira',
    identity: [mediaFile('mira-master.png', { referenceType: 'master' }), mediaFile('mira-face.png', { referenceType: 'face' }), mediaFile('mira-body.png', { referenceType: 'full-body' })],
    detailReferences: [{ label: 'approved locket clasp', notes: 'engraved clasp', images: [mediaFile('locket-detail.png')] }],
    wardrobeIds: [], hairStyleIds: [], accessoryIds: [],
  }]
  const wardrobeProject = { id: 'ward-1', name: 'red wool coat', description: 'long red wool coat', accessories: [], materials: 'wool', colors: 'red', visualStyle: 'worn and practical', referencePrompt: '', referenceImages: [mediaFile('coat.png')], createdAt: 1, updatedAt: 1 }
  // After the bilingual split the allocator output carries both layers: label
  // is Chinese display text, promptLabel is the English prompt fragment. Like
  // conflicts[].message, `label` is display-layer — parity pins only the
  // prompt-layer view so display translations cannot mask a prompt change.
  snapshot.allocateCharacterReferences = composer.allocateCharacterReferences(characterInputs, [wardrobeProject], 9)
    .map(({ promptLabel, label, ...rest }) => ({ ...rest, label: promptLabel ?? label }))

  // ---- auto tags ----
  const autoTags = at('src/lib/promptAutoTags.ts')
  snapshot.autoTagPrompt = {
    plain: autoTags.autoTagPrompt('A courier crosses a rainy alley at night in a wide shot.'),
    rich: autoTags.autoTagPrompt('Mira says, "Almost done." Rain hums around the neon signs while the camera pans slowly across the green door.'),
  }

  // ---- presets: prompt layer only (label/description become Chinese later) ----
  const presets = at('src/lib/promptPresets.ts')
  snapshot.presetPromptLayer = presets.promptPresets.map(preset => ({ id: preset.id, category: preset.category, insertion: preset.insertion, keywords: preset.keywords }))
  snapshot.searchPromptPresets = {}
  for (const query of ['dolly zoom', 'single unbroken take', 'eyeline', 'rack focus', 'neon city night', 'zzzzzzzzzzz']) {
    snapshot.searchPromptPresets[query] = presets.searchPromptPresets(query).map(item => ({ id: item.id, score: presets.promptCommandScore(item, query) }))
  }

  // ---- graph builders (full graphs: prompt fields ride inside inputs) ----
  const workflow = at('src/lib/workflow.ts')
  const ltx25 = at('src/lib/ltx25Workflow.ts')
  const music3 = at('src/lib/music3Workflow.ts')
  const aceStep = at('src/lib/aceStepWorkflow.ts')
  const fireRed = at('src/lib/fireRedEditWorkflow.ts')
  const ripple = at('src/lib/ltxRippleWorkflow.ts')
  const birefnet = at('src/lib/birefnetWorkflow.ts')
  const zimage = at('src/lib/zimage.ts')
  const backgroundFill = at('src/lib/referenceBackgroundFillWorkflow.ts')
  const h3Models = { fl2va: 'fl2va', ref2va: 'ref2va', fastH3: 'fastvideo_fasth3_8step_v2_pruned_int8_convrot.safetensors', textEncoder: 'clip', videoVae: 'video', audioVae: 'audio', fl2vLora: 'fl-lora', ref2vLora: 'ref-lora' }
  const ltxModels = { diffusion: 'ltx-distilled.safetensors', textEncoder: 'gemma4.safetensors', videoVae: 'video-vae.safetensors', audioVae: 'audio-vae.safetensors', latentUpscaler: 'latent-x2.safetensors' }
  const parityPrompt = 'A courier in a red jacket walks through a rain-slick neon alley at night.'
  snapshot.builders = {
    h3TextFast: workflow.buildMiniMaxWorkflow({ mode: 'text', width: 768, height: 768, prompt: parityPrompt, duration: 5, seed: 42, steps: 30, turbo: 'fast', sampler: 'res_multistep', scheduler: 'simple', filenamePrefix: 'parity-h3', refImageSize: 'match' }, h3Models, { images: [], videos: [], audios: [] }),
    h3Reference: workflow.buildMiniMaxWorkflow({ mode: 'reference', width: 1344, height: 768, prompt: parityPrompt, duration: 6, seed: 7, steps: 20, turbo: '8', sampler: 'res_multistep', scheduler: 'simple', filenamePrefix: 'parity-h3-ref', refImageSize: 'max' }, h3Models, { images: [{ name: 'mira-face.png' }, { name: 'alley.png' }], videos: [], audios: [] }),
    h3ReferenceStill: workflow.buildMiniMaxReferenceStillWorkflow({ mode: 'reference', width: 1344, height: 768, prompt: parityPrompt, duration: 5, seed: 123, steps: 20, turbo: 'off', sampler: 'res_multistep', scheduler: 'simple', filenamePrefix: 'parity-still', refImageSize: 'match' }, h3Models, { images: [{ name: 'character.png' }, { name: 'environment.png' }], videos: [], audios: [] }),
    ltx25Text: ltx25.buildLtx25Workflow({ mode: 'text', preset: 'turbo', prompt: parityPrompt, width: 1280, height: 736, duration: 5, seed: 42, filenamePrefix: 'parity-ltx' }, ltxModels),
    ltx25Image: ltx25.buildLtx25Workflow({ mode: 'image', preset: 'quality', prompt: 'Image 1 is the character.', width: 1280, height: 736, duration: 5, seed: 42, filenamePrefix: 'parity-ltx-i' }, ltxModels, { name: 'first.png' }),
    music3: music3.buildMusic3Workflow({ caption: 'rainy neon city night, slow cinematic beat', lyrics: '', duration: 30, seed: 1, tiledDecode: true, filenamePrefix: 'parity-music' }, { diffusion: 'music3.safetensors', textEncoder: 'music3-clip.safetensors', vae: 'music3-vae.safetensors' }),
    music3Caption: music3.buildMusic3Caption({ metadata: 'rainy neon night', vocals: 'female spoken word', arrangement: 'ambient synth with rain textures' }),
    aceStep: aceStep.buildAceStepWorkflow({ model: 'sft', tags: 'cinematic, neon, rainy, downtempo', lyrics: '[verse]\nNeon rain on the green door', instrumental: false, duration: 60, bpm: 90, timeSignature: '4/4', language: 'English', keyScale: 'A minor', seed: 5, generateAudioCodes: false }, { base: 'acestep_base.safetensors', sft: 'acestep_sft.safetensors', textEncoderSmall: 'qwen_small.safetensors', textEncoderLarge: 'qwen_large.safetensors', vae: 'ace_vae.safetensors' }),
    fireRed: fireRed.buildFireRedEditWorkflow({ name: 'frame.png', subfolder: 'parity' }, 'Change only the jacket to red.', 42, { model: 'FireRed-Image-Edit-1.1.safetensors', modelLoader: 'UNETLoader', encoder: 'qwen_2.5_vl_7b_fp8_scaled.safetensors', vae: 'qwen_image_vae.safetensors', lightningLora: 'FireRed-Image-Edit-1.1-Lightning-8steps-v1.2.safetensors' }, 'turbo', { width: 1024, height: 576 }),
    ripple: ripple.buildLtxRippleWorkflow({ prompt: 'Steady the handheld shake of this alley walk.', negativePrompt: '', width: 768, height: 512, frames: 97, strength: 1.35, seed: 42, filenamePrefix: 'parity-ripple' }, ltxModels, 'LTX/LTX25_Ripple_v11.safetensors', { name: 'source.mp4' }, { name: 'edit.png' }),
    birefnet: birefnet.buildBiRefNetWorkflow({ name: 'source.png', subfolder: 'parity' }, 'parity/BiRefNet'),
    zimage: zimage.buildZImage(parityPrompt, 1024, 576, 42, 'z.safetensors', 'qwen.safetensors', 'ae.safetensors', 8, 1, 'turbo'),
    backgroundFill: backgroundFill.buildReferenceBackgroundFillWorkflow({ name: 'plate.png', subfolder: 'parity' }, 'parity/BGFill'),
  }

  return snapshot
}

module.exports = { capture }
