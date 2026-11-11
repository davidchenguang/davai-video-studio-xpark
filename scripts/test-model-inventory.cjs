const assert = require('node:assert/strict')
const { load } = require('./test-ts-loader.cjs')

const { mergeModelInventory, MODEL_KINDS } = load('electron/modelInventory.ts')
const { engineModelFiles, mergeModelFiles } = load('src/lib/modelInventory.ts')
const { inferSelections } = load('src/lib/modelSelection.ts')
const { h3StackReport } = load('src/lib/h3Diagnostics.ts')

assert.equal(MODEL_KINDS.join(','), 'diffusion_models,text_encoders,vae,loras,vae_approx,clip_vision', 'Every model folder the engine exposes is indexed')

const local = [
  { name: 'ae.safetensors', path: '/local/models/vae/ae.safetensors', kind: 'vae', bytes: 335544320 },
]
const server = [
  { name: 'minimax_h3_video_vae_fp16.safetensors', kind: 'vae' },
  { name: 'minimax_h3_video_vae_int8_convrot.safetensors', kind: 'vae' },
  { name: 'minimax_h3_audio_vae_fp32.safetensors', kind: 'vae' },
  { name: 'minimax_h3_fl2va_pruned_int8_convrot.safetensors', kind: 'diffusion_models' },
  { name: 'minimax_h3_ref2va_pruned_int8_convrot.safetensors', kind: 'diffusion_models' },
  { name: 'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors', kind: 'text_encoders' },
  { name: 'minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors', kind: 'loras' },
  { name: 'minimax_h3_ref2v_turbo_8step_v1.0_768p_comfyui_bf16.safetensors', kind: 'loras' },
]

const merged = mergeModelInventory(local, server)
assert.equal(merged.length, local.length + server.length, 'Server files join the local inventory')
const mergedVae = merged.find((file) => file.name === 'ae.safetensors')
assert.equal(mergedVae.path, '/local/models/vae/ae.safetensors', 'A local copy keeps its path')
assert.equal(mergedVae.bytes, 335544320, 'A local copy keeps its size for the VRAM estimate')
const remoteVae = merged.find((file) => file.name === 'minimax_h3_video_vae_fp16.safetensors')
assert.equal(remoteVae.path, '', 'A file that only exists on the engine has no local path')
assert.equal(remoteVae.bytes, 0, 'A file that only exists on the engine has no known size')
assert.equal(
  merged.filter((file) => file.kind === 'vae').map((file) => file.name).join(','),
  'ae.safetensors,minimax_h3_audio_vae_fp32.safetensors,minimax_h3_video_vae_fp16.safetensors,minimax_h3_video_vae_int8_convrot.safetensors',
  'Files are listed per kind in name order',
)

const duplicated = mergeModelInventory(local, [{ name: 'ae.safetensors', kind: 'vae' }])
assert.equal(duplicated.length, 1, 'The same file on both sides is listed once')
assert.equal(duplicated[0].bytes, 335544320, 'The local copy wins over the engine copy')

const empty = mergeModelInventory([], [])
assert.equal(empty.length, 0, 'An unreachable engine leaves an empty inventory empty')

// The engine's own files are enough for the MiniMax H3 stack to be usable.
const selection = inferSelections(merged, '8', 'fast', 'int8')
assert.equal(selection.videoVae, 'minimax_h3_video_vae_int8_convrot.safetensors', 'The int8 ConvRot H3 video VAE is preferred over the fp16 copy')
assert.equal(selection.audioVae, 'minimax_h3_audio_vae_fp32.safetensors', 'The H3 audio VAE is found on the engine')
assert.equal(selection.fl2va, 'minimax_h3_fl2va_pruned_int8_convrot.safetensors', 'The FL2VA checkpoint is found on the engine')
assert.equal(selection.ref2va, 'minimax_h3_ref2va_pruned_int8_convrot.safetensors', 'The Ref2VA checkpoint is found on the engine')
assert.equal(selection.textEncoder, 'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors', 'The Qwen3-VL encoder is found on the engine')
assert.ok(selection.fl2vLora, 'The FL2V Turbo LoRA is found on the engine')
assert.ok(selection.ref2vLora, 'The Ref2V Turbo LoRA is found on the engine')

const report = h3StackReport(merged)
assert.equal(report.ready, true, 'The H3 engine stack is ready once the engine files are visible')
assert.equal(report.validated, true, 'The official Comfy-Org stack is recognized as validated')

// The engine's own node combinations describe the same files, so a renderer
// that only has /object_info can still see them.
const info = {
  UNETLoader: { input: { required: { unet_name: [['minimax_h3_fl2va_pruned_int8_convrot.safetensors', 'minimax_h3_ref2va_pruned_int8_convrot.safetensors']] } } },
  CLIPLoader: { input: { required: { clip_name: [['qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors']] } } },
  VAELoader: { input: { required: { vae_name: [['minimax_h3_video_vae_fp16.safetensors', 'minimax_h3_video_vae_int8_convrot.safetensors', 'minimax_h3_audio_vae_fp32.safetensors', 'pixel_space']] } } },
  LoraLoaderModelOnly: { input: { required: { lora_name: [['minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors', 'minimax_h3_ref2v_turbo_8step_v1.0_768p_comfyui_bf16.safetensors']] } } },
  MiniMaxH3PreviewOverrideCS: { input: { optional: { vae_name: [['taeh3_decoder.safetensors']] } } },
}
const fromInfo = engineModelFiles(info, 'MiniMaxH3PreviewOverrideCS')
assert.equal(fromInfo.filter((file) => file.kind === 'vae').length, 3, 'The built-in pixel-space VAE is not a model file')
assert.ok(fromInfo.find((file) => file.kind === 'vae_approx' && file.name === 'taeh3_decoder.safetensors'), 'The preview decoder is read from the preview node')
const fromInfoMerged = mergeModelFiles([], fromInfo)
const fromInfoSelection = inferSelections(fromInfoMerged, '8', 'fast', 'int8')
assert.equal(fromInfoSelection.videoVae, 'minimax_h3_video_vae_int8_convrot.safetensors', 'The engine report resolves the H3 video VAE')
assert.equal(fromInfoSelection.audioVae, 'minimax_h3_audio_vae_fp32.safetensors', 'The engine report resolves the H3 audio VAE')
assert.equal(fromInfoSelection.previewVae, 'taeh3_decoder.safetensors', 'The engine report resolves the H3 preview decoder')
assert.equal(h3StackReport(fromInfoMerged).ready, true, 'The engine report alone is a usable H3 stack')

// The fp16 copy stays a valid fallback for engines that only carry it.
const fp16Only = inferSelections([
  { kind: 'vae', name: 'minimax_h3_video_vae_fp16.safetensors' },
  { kind: 'vae', name: 'minimax_h3_audio_vae_fp32.safetensors' },
], 'off', 'fast', 'int8')
assert.equal(fp16Only.videoVae, 'minimax_h3_video_vae_fp16.safetensors', 'The fp16 video VAE is still selected when it is the only copy')
assert.equal(h3StackReport([
  { kind: 'vae', name: 'minimax_h3_video_vae_fp16.safetensors' },
]).rows.find((row) => row.label === '视频 VAE').selected, 'minimax_h3_video_vae_fp16.safetensors', 'The fp16 copy is reported as a usable variant')

// Turbo 4 needs a 4-step Turbo LoRA. The larryvrh 4-step file needs its own
// LoRA node, so it must not count as one.
const { hasTurbo4Lora } = load('src/lib/modelSelection.ts')
assert.equal(hasTurbo4Lora([{ kind: 'loras', name: 'minimax_h3_turbo_v4_step600_ema.safetensors' }]), false, 'The larryvrh 4-step file is not a Turbo 4 adapter')
assert.equal(hasTurbo4Lora([{ kind: 'loras', name: 'minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors' }]), true, 'An official 4-step Turbo LoRA enables Turbo 4')
assert.equal(hasTurbo4Lora([{ kind: 'loras', name: 'minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors' }]), false, 'The 8-step Turbo LoRA does not enable Turbo 4')

console.log('model inventory tests passed')