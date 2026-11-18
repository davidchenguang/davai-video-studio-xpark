const assert = require('node:assert/strict')
const { load } = require('./test-ts-loader.cjs')

let saved = null
// The loader sandbox gets its own localStorage so this suite can stage saved workspaces.
global.__TS_LOADER_EXTRA_GLOBALS__ = { localStorage: { getItem: () => saved } }
const moduleExports = load('src/lib/workspacePersistence.ts')

saved = JSON.stringify({
  seed: 42,
  livePreviewMode: 'standard',
  referenceImages: null,
  referenceVideos: [{ path: 'clip.mp4', name: 'Clip', kind: 'video' }, { path: 7, kind: 'video' }],
  referenceAudios: 'invalid',
  selectedReferenceCharacterIds: ['valid', null, 7],
  firstFrame: { path: 'opening.png', name: 'Opening', kind: 'image', preview: 'data:image/png;base64,abc' },
  lastFrame: { path: 'sound.wav', name: 'Sound', kind: 'audio' },
})
const restored = moduleExports.readWorkspace()
assert.equal(restored.ref2vaSeed, 42, 'legacy seed remains the Ref2VA seed')
assert.equal(restored.livePreviewMode, 'auto', 'old preview mode migrates')
assert.equal(restored.referenceImages.length, 0)
assert.equal(restored.referenceVideos.length, 1)
assert.equal(restored.referenceAudios.length, 0)
assert.deepEqual(Array.from(restored.selectedReferenceCharacterIds), ['valid'])
assert.equal(restored.firstFrame.path, 'opening.png')
assert.equal(restored.lastFrame, null, 'an invalid audio frame is ignored')
assert.equal(moduleExports.withoutPreview(restored.firstFrame).preview, undefined, 'media previews are not persisted twice')

saved = JSON.stringify({ experimentalSampling: false, sampler: 'euler', scheduler: 'beta' })
const optOut = moduleExports.readWorkspace()
assert.equal(optOut.experimentalSampling, false)
assert.equal(optOut.sampler, 'euler', 'an explicit sampling choice is preserved')
assert.equal(optOut.scheduler, 'beta')

assert.equal(moduleExports.readWorkspace().mmh3RecipeChoice, 'auto', 'a workspace without the field follows the quality preset')
saved = JSON.stringify({ mmh3RecipeChoice: 'pdmd' })
assert.equal(moduleExports.readWorkspace().mmh3RecipeChoice, 'pdmd', 'an explicit mmh3 recipe is preserved')
saved = JSON.stringify({ mmh3RecipeChoice: 'retired-recipe' })
assert.equal(moduleExports.readWorkspace().mmh3RecipeChoice, 'auto', 'an unknown mmh3 recipe name falls back to auto')

saved = '{broken json'
assert.equal(moduleExports.readWorkspace().resolution, moduleExports.workspaceDefaults.resolution)
process.stdout.write('PASS: legacy workspace migration, malformed media recovery, saved opt-out, mmh3 recipe choice, and corrupt JSON fallback\n')
