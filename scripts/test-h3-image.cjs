const assert = require('node:assert/strict')
const { load } = require('./test-ts-loader.cjs')

const {
  buildH3Image, clampH3ImageResolution, H3_IMAGE_TIERS, H3_IMAGE_SAVE_PREFIX,
  h3ImageTierAttribution, h3ImageTierReady, h3ImageSizesForTier,
  isH3Encoder, isH3Fl2vaModel, isH3ImageModel, isH3ImageVae, isH3TurboLora, isH3VideoVae,
  h3ImageRequiredNodes, resolveH3ImageTier,
} = load('src/lib/h3Image.ts')
const { h3ImageStackReport } = load('src/lib/h3Diagnostics.ts')
const { snapMiniMaxResolution, snapResolutionString } = load('src/lib/videoResolutions.ts')

// The loader evaluates modules inside a VM realm, so their arrays and objects
// carry a foreign prototype. Normalize them before comparing with deep equality.
const plain = (value) => JSON.parse(JSON.stringify(value))

const dedicated = buildH3Image('一间有中文招牌的茶馆', 1344, 768, 42, {
  model: 'minimax_h3_image_pruned_int8_convrot.safetensors',
  encoder: 'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors',
  vae: 'minimax_h3_image_vae_fp16.safetensors',
}, 'dedicated')

assert.equal(dedicated['7'].class_type, 'MiniMaxH3ImageConditioning', 'The dedicated route conditions through the ComfyUI 0.45 image node')
assert.equal(dedicated['7'].inputs.prompt, '一间有中文招牌的茶馆')
assert.equal(dedicated['7'].inputs.width, 1344)
assert.equal(dedicated['7'].inputs.height, 768)
assert.deepEqual(plain(dedicated['7'].inputs.clip), ['2', 0], 'The conditioning node reads the shared text encoder')
assert.deepEqual(plain(dedicated['7'].inputs.vae), ['3', 0], 'The conditioning node encodes the empty latent with the image VAE')
assert.equal(dedicated['8'].class_type, 'ConditioningZeroOut', 'Distilled sampling mirrors the official zeroed-negative recipe')
assert.deepEqual(plain(dedicated['8'].inputs.conditioning), ['7', 0])
assert.equal(dedicated['9'].class_type, 'KSampler')
assert.equal(dedicated['9'].inputs.cfg, 1, 'H3-Image is distilled: guidance stays at 1')
assert.equal(dedicated['9'].inputs.sampler_name, 'euler')
assert.equal(dedicated['9'].inputs.scheduler, 'simple')
assert.equal(dedicated['9'].inputs.steps, 6, 'The dedicated tier ships a six-step schedule')
assert.equal(dedicated['9'].inputs.seed, 42)
assert.deepEqual(plain(dedicated['9'].inputs.positive), ['7', 0])
assert.deepEqual(plain(dedicated['9'].inputs.negative), ['8', 0])
assert.deepEqual(plain(dedicated['9'].inputs.latent_image), ['7', 1], 'The conditioning node also produces the latent')
assert.deepEqual(plain(dedicated['14'].inputs.samples), ['9', 0])
assert.equal(dedicated['15'].class_type, 'SaveImage')
assert.equal(dedicated['15'].inputs.filename_prefix, H3_IMAGE_SAVE_PREFIX)
assert.equal(dedicated['16'].class_type, 'PreviewImage', 'Live preview adds the preview node')
assert.equal(Object.values(dedicated).some((node) => node.class_type === 'ModelAttentionBackend'), false, 'The comfy kitchen attention backend crashes ComfyUI 0.45.2, so image graphs never add it')
assert.deepEqual(plain(dedicated), plain(dedicated), 'Graph must survive a JSON round-trip')

const withoutPreview = buildH3Image('静帧', 1024, 1024, 7, {
  model: 'minimax_h3_image_pruned_int8_convrot.safetensors',
  encoder: 'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors',
  vae: 'minimax_h3_image_vae_fp16.safetensors',
}, 'dedicated', 8, false)
assert.equal(withoutPreview['16'], undefined, 'Turning live preview off removes the preview node')
assert.equal(withoutPreview['9'].inputs.steps, 8, 'A custom step count reaches the sampler')

const fl2va = buildH3Image('一间有中文招牌的茶馆', 1344, 768, 42, {
  model: 'minimax_h3_fl2va_pruned_int8_convrot.safetensors',
  encoder: 'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors',
  vae: 'minimax_h3_video_vae_fp16.safetensors',
  lora: 'minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors',
}, 'fl2va')

assert.equal(fl2va['2'].class_type, 'LoraLoaderModelOnly', 'The zero-download tier loads the eight-step Turbo LoRA')
assert.deepEqual(plain(fl2va['2'].inputs.model), ['1', 0])
assert.deepEqual(plain(fl2va['8'].inputs.model), ['2', 0], 'The scheduler samples the LoRA-patched model')
assert.equal(fl2va['8'].inputs.steps, 8, 'The zero-download tier ships an eight-step schedule')
assert.equal(fl2va['9'].class_type, 'KSamplerSelect')
assert.equal(fl2va['9'].inputs.sampler_name, 'res_multistep')
assert.equal(fl2va['13'].class_type, 'LTXVSeparateAVLatent', 'The video latent is split back to the still plane')
assert.deepEqual(plain(fl2va['13'].inputs.av_latent), ['12', 0])
assert.deepEqual(plain(fl2va['14'].inputs.samples), ['13', 0])
assert.equal(fl2va['7'], undefined, 'The zero-download tier never needs the ComfyUI 0.45 conditioning node')
assert.deepEqual(plain(h3ImageRequiredNodes('dedicated')), ['MiniMaxH3ImageConditioning'])
assert.deepEqual(plain(h3ImageRequiredNodes('fl2va')), [])
assert.equal(H3_IMAGE_TIERS.dedicated.steps, 6)
assert.equal(H3_IMAGE_TIERS.fl2va.steps, 8)
assert.equal(H3_IMAGE_TIERS.dedicated.requiredNodes.includes('MiniMaxH3ImageConditioning'), true)

assert.equal(isH3ImageModel('minimax_h3_image_pruned_int8_convrot.safetensors'), true)
assert.equal(isH3ImageModel('z_image_bf16.safetensors'), false, 'Z-Image must not be mistaken for the H3 image DiT')
assert.equal(isH3ImageVae('minimax_h3_image_vae_fp16.safetensors'), true)
assert.equal(isH3ImageVae('minimax_h3_video_vae_fp16.safetensors'), false)
assert.equal(isH3Fl2vaModel('minimax_h3_fl2va_pruned_int8_convrot.safetensors'), true)
assert.equal(isH3Fl2vaModel('minimax_h3_ref2va_pruned_int8_convrot.safetensors'), false, 'Ref2VA is a video route, not the still-image route')
assert.equal(isH3VideoVae('minimax_h3_video_vae_fp16.safetensors'), true)
assert.equal(isH3TurboLora('minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors'), true)
assert.equal(isH3Encoder('qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors'), true)

const dedicatedReport = h3ImageStackReport([
  { kind: 'diffusion_models', name: 'minimax_h3_image_pruned_int8_convrot.safetensors' },
  { kind: 'vae', name: 'minimax_h3_image_vae_fp16.safetensors' },
  { kind: 'text_encoders', name: 'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors' },
])
assert.equal(dedicatedReport.dedicatedReady, true, 'A complete dedicated stack reports ready')
assert.equal(dedicatedReport.fl2vaReady, false, 'The zero-download stack needs the video DiT and Turbo LoRA')
assert.equal(dedicatedReport.ready, true)
assert.equal(dedicatedReport.rows.find((row) => row.label === 'H3-Image 模型').validated, true)
assert.equal(h3ImageStackReport([]).ready, false, 'An empty engine reports nothing ready')
const videoOnly = h3ImageStackReport([
  { kind: 'diffusion_models', name: 'minimax_h3_fl2va_pruned_int8_convrot.safetensors' },
  { kind: 'vae', name: 'minimax_h3_video_vae_fp16.safetensors' },
  { kind: 'loras', name: 'minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors' },
  { kind: 'text_encoders', name: 'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors' },
])
assert.equal(videoOnly.fl2vaReady, true, 'An H3 video customer needs no extra download for the still-image tier')
assert.equal(videoOnly.dedicatedReady, false)

assert.equal(snapResolutionString('1344x768'), '1344x768', 'A legal H3 size stays untouched')
assert.equal(snapResolutionString('1536x864'), '1344x768', 'A Z-Image size snaps to the nearest legal H3 rung')
assert.equal(snapResolutionString('1920x1080'), '1344x768', 'A 1080p still enters the pipeline on the native 16:9 rung')
assert.equal(snapResolutionString('1024x1024'), '768x768', 'A square still keeps its framing on the largest square rung')
assert.equal(snapResolutionString('4096x2304'), '1344x768', 'A 4K landscape keeps its framing when it enters the video pipeline')
assert.equal(snapResolutionString('768x1344'), '768x1344', 'A legal portrait rung stays untouched')
assert.equal(snapMiniMaxResolution(0, 0), '608x352', 'An invalid size falls back to the first legal rung')

// Tier readiness and auto selection share one signal source (A4).
const dedicatedSignals = {
  models: ['minimax_h3_image_pruned_int8_convrot.safetensors'],
  encoders: ['qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors'],
  vaes: ['minimax_h3_image_vae_fp16.safetensors'],
  loras: [],
  dedicatedNodeReady: true,
}
assert.equal(h3ImageTierReady('dedicated', dedicatedSignals), true, 'A complete dedicated stack with the 0.45 node is ready')
assert.equal(h3ImageTierReady('fl2va', dedicatedSignals), false, 'The video tier needs the video DiT, VAE and Turbo LoRA')
assert.deepEqual(plain(resolveH3ImageTier(dedicatedSignals)), { tier: 'dedicated', usable: true })

const noNodeSignals = { ...dedicatedSignals, dedicatedNodeReady: false }
assert.equal(h3ImageTierReady('dedicated', noNodeSignals), false, 'Without the 0.45 node the dedicated tier is gated')

const videoSignals = {
  models: ['minimax_h3_fl2va_pruned_int8_convrot.safetensors'],
  encoders: ['qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors'],
  vaes: ['minimax_h3_video_vae_fp16.safetensors'],
  loras: ['minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors'],
  dedicatedNodeReady: false,
}
assert.deepEqual(plain(resolveH3ImageTier(videoSignals)), { tier: 'fl2va', usable: true }, 'A video customer auto-falls back to the zero-download tier')

assert.deepEqual(plain(resolveH3ImageTier({ models: [], encoders: [], vaes: [], loras: [], dedicatedNodeReady: false })), { tier: 'dedicated', usable: false }, 'An empty engine reports nothing usable')

// The video tier caps at 2048 and clamps keep the aspect ratio (decision 10, B2).
assert.equal(h3ImageSizesForTier('fl2va')['16:9'].includes('4096x2304'), false, 'The 4K rung is dedicated-only')
assert.equal(h3ImageSizesForTier('dedicated')['16:9'].includes('4096x2304'), true, 'The dedicated tier keeps its print-grade rungs')
assert.equal(clampH3ImageResolution('fl2va', '4096x2304'), '2048x1152', 'A stored 4K size clamps to the same-ratio rung')
assert.equal(clampH3ImageResolution('fl2va', '4096x4096'), '2048x2048')
assert.equal(clampH3ImageResolution('fl2va', '2304x4096'), '1152x2048')
assert.equal(clampH3ImageResolution('fl2va', '1344x768'), '1344x768', 'A legal size stays untouched')
assert.equal(clampH3ImageResolution('dedicated', '4096x2304'), '4096x2304', 'The dedicated tier keeps 4K')

// Attribution follows the generating tier, not the current selection (A1).
assert.equal(h3ImageTierAttribution('dedicated'), '由 MiniMax-H3-Image 生成')
assert.equal(h3ImageTierAttribution('fl2va'), '由 MiniMax H3 视频模型生成')

console.log('PASS: H3-Image graph builder, tier detection/readiness, resolution clamping, attribution and video-resolution snapping')
