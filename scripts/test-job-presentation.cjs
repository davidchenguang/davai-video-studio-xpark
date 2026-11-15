const assert = require('node:assert/strict')
const { load } = require('./test-ts-loader.cjs')

const { audioSourceLabel, buildImageJob, imageSourceLabel } = load('src/lib/jobPresentation.ts')

assert.equal(imageSourceLabel('h3image'), 'H3-Image')
assert.equal(imageSourceLabel('zimage'), 'Z-Image')
assert.equal(imageSourceLabel('firered'), 'FireRed 图片编辑')
assert.equal(imageSourceLabel('minimax'), 'Ref2VA 静帧', 'The image-only H3 path keeps its existing label')
assert.equal(imageSourceLabel(undefined), 'Ref2VA 静帧', 'Jobs persisted before provider existed must not be relabelled')
assert.equal(imageSourceLabel('ltx25'), '生成图片', 'A provider that never produces stills falls back instead of being mislabelled')
assert.equal(imageSourceLabel('acestep'), '生成图片')

assert.equal(audioSourceLabel('music3'), 'Music 3')
assert.equal(audioSourceLabel('acestep'), 'ACE-Step')
assert.equal(audioSourceLabel(undefined), '音乐', 'Audio jobs persisted before provider existed get the neutral label')
assert.equal(audioSourceLabel('ltx25'), '音乐', 'A provider that never produces audio falls back instead of being mislabelled')
// 队列拼接规则的镜像断言：兜底值「音乐」不再拼「音乐 · 」前缀，否则会渲染出「音乐 · 音乐」。
const queueAudioMeta = (provider) => {
  const label = audioSourceLabel(provider)
  return `${label === '音乐' ? label : `音乐 · ${label}`}`
}
assert.equal(queueAudioMeta('music3'), '音乐 · Music 3', 'The queue meta keeps its existing wording for Music 3')
assert.equal(queueAudioMeta('acestep'), '音乐 · ACE-Step', 'The queue meta keeps its existing wording for ACE-Step')
assert.equal(queueAudioMeta(undefined), '音乐', 'The fallback label must not be prefixed with 音乐 · ')

const job = buildImageJob({
  provider: 'zimage',
  promptId: 'prompt-z',
  prompt: 'A quiet still',
  width: 1344,
  height: 768,
  outputUrl: 'minimax-media://local?path=still.png',
  localOutputPath: '/output/Created Images/created-image-still.png',
  createdAt: 1700000000000,
})
assert.equal(job.id, 'image-zimage-prompt-z-1700000000000')
assert.equal(job.promptId, 'prompt-z')
assert.equal(job.mode, 'image')
assert.equal(job.mediaType, 'image')
assert.equal(job.status, 'completed')
assert.equal(job.progress, 100)
assert.equal(job.duration, 0)
assert.equal(job.provider, 'zimage')
assert.equal(job.prompt, 'A quiet still')
assert.equal(job.width, 1344)
assert.equal(job.height, 768)
assert.equal(job.outputUrl, 'minimax-media://local?path=still.png')
assert.equal(job.localOutputPath, '/output/Created Images/created-image-still.png')
assert.equal(job.createdAt, 1700000000000)

const timed = buildImageJob({ provider: 'firered', promptId: 'prompt-f', prompt: 'Swap the jacket', width: 0, height: 0, outputUrl: 'u', localOutputPath: 'p' })
assert.ok(timed.createdAt > 1700000000000, 'createdAt defaults to the completion moment')
assert.match(timed.id, /^image-firered-prompt-f-\d+$/)
assert.equal(timed.provider, 'firered')

console.log('PASS: image and audio source labels, Ref2VA compatibility, unknown-provider fallbacks, and completed image job shape')