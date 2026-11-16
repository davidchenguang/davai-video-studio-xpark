// ACE-Step 1.5 变体表回归：官方采样参数、Turbo 识别、三张图关键参数、
// SFT 图不回归（prompt-parity 基线在此只断言关键节点值；逐字节对比由
// pnpm test:prompt-parity 负责）、可用变体与兜底选择逻辑。
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { load } = require('./test-ts-loader.cjs')
const ace = load('src/lib/aceStepWorkflow.ts')
const { buildAceStepWorkflow, inferAceStepSelections, ACE_STEP_VARIANTS, ACE_STEP_VARIANT_PRIORITY, aceStepVariantWeight, firstAvailableAceStepVariant, displayableAceStepVariants } = ace

// ---- 变体表：Comfy-Org 官方模板取值 ----
assert.deepEqual(
  { steps: ACE_STEP_VARIANTS.turbo.steps, cfg: ACE_STEP_VARIANTS.turbo.cfg, topP: ACE_STEP_VARIANTS.turbo.topP },
  { steps: 8, cfg: 1, topP: 0.9 },
  'Turbo follows the official template (8 steps, CFG 1, top_p 0.9)')
assert.deepEqual(
  { steps: ACE_STEP_VARIANTS.sft.steps, cfg: ACE_STEP_VARIANTS.sft.cfg, topP: ACE_STEP_VARIANTS.sft.topP },
  { steps: 50, cfg: 7, topP: 1 },
  'SFT follows the official template (50 steps, CFG 7, top_p 1)')
assert.deepEqual(
  { steps: ACE_STEP_VARIANTS.base.steps, cfg: ACE_STEP_VARIANTS.base.cfg, topP: ACE_STEP_VARIANTS.base.topP },
  { steps: 50, cfg: 6, topP: 0.9 },
  'Base follows the official template (50 steps, CFG 6, top_p 0.9)')
assert.deepEqual([...ACE_STEP_VARIANT_PRIORITY], ['sft', 'turbo', 'base'], 'First-available priority is fixed sft -> turbo -> base')

// ---- 识别 ----
const selections = inferAceStepSelections([
  { kind: 'diffusion_models', name: 'acestep_v1.5_xl_sft_bf16.safetensors' },
  { kind: 'diffusion_models', name: 'AceStep_V1.5_XL_Turbo_BF16.safetensors' },
  { kind: 'diffusion_models', name: 'acestep_v1.5_xl_base_bf16.safetensors' },
  { kind: 'text_encoders', name: 'qwen_0.6b_ace15.safetensors' },
  { kind: 'text_encoders', name: 'qwen_4b_ace15.safetensors' },
  { kind: 'vae', name: 'ace_1.5_vae.safetensors' },
])
assert.equal(selections.turbo, 'AceStep_V1.5_XL_Turbo_BF16.safetensors', 'Turbo checkpoint is recognized case-insensitively')
assert.equal(selections.sft, 'acestep_v1.5_xl_sft_bf16.safetensors', 'SFT recognition unchanged')
assert.equal(selections.base, 'acestep_v1.5_xl_base_bf16.safetensors', 'Base recognition unchanged')
// turbo 缺省时字段为 undefined（可选），不破坏既有对象字面量调用方
const noTurbo = inferAceStepSelections([{ kind: 'diffusion_models', name: 'acestep_v1.5_xl_sft_bf16.safetensors' }])
assert.equal(noTurbo.turbo, undefined, 'turbo stays an optional field when absent')
assert.equal(typeof buildAceStepWorkflow({ model: 'sft', lyrics: '', instrumental: true, tags: '', duration: 60, bpm: 120, timeSignature: '4', language: 'en', keyScale: 'C major', seed: 12345, generateAudioCodes: true, filenamePrefix: 'x' }, noTurbo), 'object', 'legacy object literal without turbo still type-safe at runtime')

// ---- 三张图的关键参数 ----
const baseModels = { base: 'acestep_v1.5_xl_base_bf16.safetensors', sft: 'acestep_v1.5_xl_sft_bf16.safetensors', turbo: 'acestep_v1.5_xl_turbo_bf16.safetensors', textEncoderSmall: 'qwen_0.6b_ace15.safetensors', textEncoderLarge: 'qwen_4b_ace15.safetensors', vae: 'ace_1.5_vae.safetensors' }
const options = (model) => ({ model, tags: 'cinematic instrumental soundtrack', lyrics: '', instrumental: true, duration: 60, bpm: 120, timeSignature: '4', language: 'en', keyScale: 'C major', seed: 12345, generateAudioCodes: true, filenamePrefix: `audio/ACE_Step_1.5_${model}_1` })

const turboGraph = buildAceStepWorkflow(options('turbo'), baseModels)
assert.equal(turboGraph['1'].inputs.unet_name, 'acestep_v1.5_xl_turbo_bf16.safetensors', 'Turbo graph loads the turbo checkpoint')
assert.equal(turboGraph['8'].inputs.steps, 8, 'Turbo graph samples 8 steps')
assert.equal(turboGraph['8'].inputs.cfg, 1, 'Turbo graph runs CFG 1')
assert.equal(turboGraph['4'].inputs.top_p, 0.9, 'Turbo TextEncode top_p 0.9')
assert.equal(turboGraph['6'].inputs.shift, 3, 'Turbo keeps AuraFlow shift 3')
assert.equal(turboGraph['4'].inputs.cfg_scale, 2, 'Turbo keeps TextEncode cfg_scale 2')
assert.equal(turboGraph['4'].inputs.temperature, 0.85, 'Turbo keeps temperature 0.85')
assert.equal(turboGraph['8'].inputs.sampler_name, 'euler', 'Turbo keeps euler')
assert.equal(turboGraph['8'].inputs.scheduler, 'simple', 'Turbo keeps simple scheduler')
assert.equal(turboGraph['10'].inputs.format, 'flac', 'Turbo saves FLAC')

const sftGraph = buildAceStepWorkflow(options('sft'), baseModels)
assert.equal(sftGraph['1'].inputs.unet_name, 'acestep_v1.5_xl_sft_bf16.safetensors', 'SFT graph loads the sft checkpoint')
assert.equal(sftGraph['8'].inputs.steps, 50, 'SFT graph samples 50 steps')
assert.equal(sftGraph['8'].inputs.cfg, 7, 'SFT graph runs CFG 7')
assert.equal(sftGraph['4'].inputs.top_p, 1, 'SFT TextEncode top_p 1 (unchanged)')

const baseGraph = buildAceStepWorkflow(options('base'), baseModels)
assert.equal(baseGraph['1'].inputs.unet_name, 'acestep_v1.5_xl_base_bf16.safetensors', 'Base graph loads the base checkpoint')
assert.equal(baseGraph['8'].inputs.steps, 50, 'Base graph samples 50 steps')
assert.equal(baseGraph['8'].inputs.cfg, 6, 'Base graph runs CFG 6')
assert.equal(baseGraph['4'].inputs.top_p, 0.9, 'Base TextEncode top_p corrected to the official 0.9')
assert.equal(baseGraph['10'].inputs.filename_prefix, 'audio/ACE_Step_1.5_base_1', 'Base keeps the variant filename prefix')

// ---- SFT 图不回归（与既有基线的抽样对比；逐字节对比在 test:prompt-parity） ----
const sftSample = JSON.stringify(buildAceStepWorkflow({ ...options('sft'), attentionBackend: undefined, gpuRouting: undefined }, { base: '', sft: 'acestep_v1.5_xl_sft_bf16.safetensors', textEncoderSmall: 'qwen_0.6b_ace15.safetensors', textEncoderLarge: 'qwen_4b_ace15.safetensors', vae: 'ace_1.5_vae.safetensors' }))
assert.ok(sftSample.includes('"steps":50'), 'SFT still samples 50 steps')
assert.ok(sftSample.includes('"cfg":7'), 'SFT still runs CFG 7')
assert.ok(sftSample.includes('"top_p":1'), 'SFT still uses top_p 1')
assert.ok(!sftSample.includes('"top_p":0.9'), 'SFT must not inherit the Base top_p correction')

// ---- 可用变体与兜底选择 ----
const w = (sft, turbo, base) => ({ base, sft, turbo })
assert.equal(firstAvailableAceStepVariant(w('sft.safetensors', 'turbo.safetensors', 'base.safetensors')), 'sft', 'Priority picks sft first')
assert.equal(firstAvailableAceStepVariant(w('', 'turbo.safetensors', 'base.safetensors')), 'turbo', 'Turbo wins when sft missing')
assert.equal(firstAvailableAceStepVariant(w('', '', 'base.safetensors')), 'base', 'Base is the last resort')
assert.equal(firstAvailableAceStepVariant(w('', '', '')), undefined, 'No variant when nothing installed')

assert.deepEqual([...displayableAceStepVariants(w('a', 'b', 'c'))], ['sft', 'turbo'], 'SFT+Turbo present: exactly two cards')
assert.deepEqual([...displayableAceStepVariants(w('a', '', 'c'))], ['sft', 'turbo'], 'SFT present, turbo missing: still two cards, base hidden')
assert.deepEqual([...displayableAceStepVariants(w('', 'b', 'c'))], ['sft', 'turbo'], 'Turbo-only: sft card stays with missing badge, base hidden')
assert.deepEqual([...displayableAceStepVariants(w('', '', 'c'))], ['sft', 'turbo', 'base'], 'Only base installed: base card surfaces as fallback')
assert.deepEqual([...displayableAceStepVariants(w('', '', ''))], ['sft', 'turbo'], 'Nothing installed: two resident cards with missing badges')

// 仅 Turbo 在位：权重解析走 turbo 字段
assert.equal(aceStepVariantWeight(w('', 'turbo.safetensors', ''), 'turbo'), 'turbo.safetensors', 'Turbo weight resolves from the optional field')

// ---- 运行中面板不重复渲染同一份进度信息 ----
// ProductionLoading 自己已经输出「标签 + 进度条 + 百分比」；面板里若再保留
// 旧结构的同名标题、第二条进度条与第二处百分比，同一句话会显示两遍。
{
  const source = fs.readFileSync('src/components/AceStepWorkspace.tsx', 'utf8')
  const start = source.indexOf('<div className="render-state">')
  const end = source.indexOf(': <div className="empty-preview">')
  assert.ok(start > -1 && end > start, '运行中面板的结构可定位')
  const block = source.slice(start, end)
  assert.ok(block.includes('<ProductionLoading'), '运行中面板仍复用 ProductionLoading 进度原语')
  assert.equal((block.match(/progressLabel/g) || []).length, 1, '进度标签只出现一次（由 ProductionLoading 渲染），标题不再复述它')
  assert.ok(!block.includes('<div className="progress">'), '不再渲染第二条进度条（ProductionLoading 已渲染）')
  assert.ok(!block.includes('ComfyUI 实时状态'), '不再重复渲染百分比（ProductionLoading 已渲染）')
}

console.log('PASS: ACE-Step variant table, turbo recognition, official sampling parameters, SFT stability, fallback selection and single-source progress display')
