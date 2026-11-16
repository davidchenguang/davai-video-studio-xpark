import type { AceStepGenerationOptions, AceStepModelSelection, AceStepVariant, ModelFile } from '../types'
import { addRoutedLoader, type ComfyPrompt } from './workflow'

export const ACE_STEP_REQUIRED_NODES = [
  'UNETLoader', 'DualCLIPLoader', 'VAELoader', 'TextEncodeAceStepAudio1.5',
  'EmptyAceStep1.5LatentAudio', 'ConditioningZeroOut', 'ModelSamplingAuraFlow',
  'KSampler', 'VAEDecodeAudio', 'SaveAudioAdvanced',
] as const

// Comfy-Org 官方 ACE-Step 1.5 模板（comfyui_workflow_templates_json，随 ComfyUI 0.45.2 分发）：
// audio_ace_step1_5_xl_{turbo,base,sft}.json。变体表是采样参数的唯一来源——
// 步数 / CFG / top_p 不得在组件或提交路径里另行硬编码。其余图参数（TextEncode 的
// cfg_scale 2 / temperature 0.85 / top_k 0 / min_p 0、AuraFlow shift 3、euler/simple/denoise 1）
// 三张官方模板一致，留在 buildAceStepWorkflow 内。
export const ACE_STEP_VARIANTS: Readonly<Record<AceStepVariant, {
  label: string
  subtitle: string
  weightPattern: RegExp
  steps: number
  cfg: number
  topP: number
}>> = {
  sft: {
    label: 'XL SFT',
    subtitle: '指令微调 · 官方 CFG 7',
    weightPattern: /^acestep_v1\.5_xl_sft_bf16(?:\.safetensors)?$/i,
    steps: 50,
    cfg: 7,
    topP: 1,
  },
  turbo: {
    label: 'XL Turbo',
    subtitle: '蒸馏加速 · 官方 8 步 · 无 CFG',
    weightPattern: /^acestep_v1\.5_xl_turbo_bf16(?:\.safetensors)?$/i,
    steps: 8,
    cfg: 1,
    topP: 0.9,
  },
  base: {
    label: 'XL Base',
    subtitle: '基础模型 · 官方 CFG 6',
    weightPattern: /^acestep_v1\.5_xl_base_bf16(?:\.safetensors)?$/i,
    steps: 50,
    cfg: 6,
    topP: 0.9,
  },
}

// 「首个可用变体」的固定优先级：质量档优先，Turbo 次之，Base 只作兜底。
export const ACE_STEP_VARIANT_PRIORITY: readonly AceStepVariant[] = ['sft', 'turbo', 'base']

function matching(models: ModelFile[], kind: ModelFile['kind'], pattern: RegExp) {
  return models.find((model) => model.kind === kind && pattern.test(model.name))?.name ?? ''
}

export function inferAceStepSelections(models: ModelFile[]): AceStepModelSelection {
  return {
    base: matching(models, 'diffusion_models', ACE_STEP_VARIANTS.base.weightPattern),
    sft: matching(models, 'diffusion_models', ACE_STEP_VARIANTS.sft.weightPattern),
    turbo: matching(models, 'diffusion_models', ACE_STEP_VARIANTS.turbo.weightPattern) || undefined,
    textEncoderSmall: matching(models, 'text_encoders', /^qwen_0\.6b_ace15(?:\.safetensors)?$/i),
    textEncoderLarge: matching(models, 'text_encoders', /^qwen_4b_ace15(?:\.safetensors)?$/i),
    vae: matching(models, 'vae', /^ace_1\.5_vae(?:\.safetensors)?$/i),
  }
}

export function aceStepVariantWeight(models: Pick<AceStepModelSelection, 'base' | 'sft' | 'turbo'>, variant: AceStepVariant): string {
  switch (variant) {
    case 'sft': return models.sft
    case 'turbo': return models.turbo ?? ''
    case 'base': return models.base
  }
}

// 首个权重在位的变体；全缺时返回 undefined。
export function firstAvailableAceStepVariant(models: Pick<AceStepModelSelection, 'base' | 'sft' | 'turbo'>): AceStepVariant | undefined {
  return ACE_STEP_VARIANT_PRIORITY.find((variant) => Boolean(aceStepVariantWeight(models, variant)))
}

// 选择器渲染顺序：常驻 SFT 与 Turbo；只有两者都缺失而 Base 在位时才追加 Base 卡。
export function displayableAceStepVariants(models: Pick<AceStepModelSelection, 'base' | 'sft' | 'turbo'>): AceStepVariant[] {
  const variants: AceStepVariant[] = ['sft', 'turbo']
  if (!models.sft && !models.turbo && models.base) variants.push('base')
  return variants
}

export function buildAceStepWorkflow(options: AceStepGenerationOptions, models: AceStepModelSelection): ComfyPrompt {
  const variant = options.model
  const variantConfig = ACE_STEP_VARIANTS[variant]
  const diffusion = aceStepVariantWeight(models, variant)
  const lyrics = options.instrumental ? '[Instrumental]' : options.lyrics.trim()
  const graph: ComfyPrompt = {}
  const modelBaseLink = addRoutedLoader(graph, '1', 'UNETLoader', { unet_name: diffusion, weight_dtype: 'default' }, options.gpuRouting?.diffusion, '801')
  const clipRoute = options.gpuRouting?.textEncoder ? { ...options.gpuRouting.textEncoder, nodeType: options.gpuRouting.textEncoder.nodeType === 'CLIPLoaderMultiGPU' ? 'DualCLIPLoaderMultiGPU' : options.gpuRouting.textEncoder.nodeType } : undefined
  const clipLink = addRoutedLoader(graph, '2', 'DualCLIPLoader', { clip_name1: models.textEncoderSmall, clip_name2: models.textEncoderLarge, type: 'ace', device: 'default' }, clipRoute, '802')
  const vaeLink = addRoutedLoader(graph, '3', 'VAELoader', { vae_name: models.vae }, options.gpuRouting?.audioVae, '803')
  const model: [string, number] = options.attentionBackend ? ['85', 0] : modelBaseLink
  Object.assign(graph, {
    ...(options.attentionBackend ? { '85': { class_type: 'ModelAttentionBackend', inputs: { model: modelBaseLink, attention: options.attentionBackend } } } : {}),
    '4': {
      class_type: 'TextEncodeAceStepAudio1.5',
      inputs: {
        clip: clipLink, tags: options.tags.trim(), lyrics, seed: options.seed,
        bpm: options.bpm, duration: options.duration, timesignature: options.timeSignature,
        language: options.language, keyscale: options.keyScale, generate_audio_codes: options.generateAudioCodes,
        cfg_scale: 2, temperature: 0.85, top_p: variantConfig.topP, top_k: 0, min_p: 0,
      },
    },
    '5': { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['4', 0] } },
    '6': { class_type: 'ModelSamplingAuraFlow', inputs: { model, shift: 3 } },
    '7': { class_type: 'EmptyAceStep1.5LatentAudio', inputs: { seconds: options.duration, batch_size: 1 } },
    '8': {
      class_type: 'KSampler',
      inputs: {
        model: ['6', 0], positive: ['4', 0], negative: ['5', 0], latent_image: ['7', 0],
        seed: options.seed, steps: variantConfig.steps, cfg: variantConfig.cfg,
        sampler_name: 'euler', scheduler: 'simple', denoise: 1,
      },
    },
    '9': { class_type: 'VAEDecodeAudio', inputs: { samples: ['8', 0], vae: vaeLink } },
    '10': { class_type: 'SaveAudioAdvanced', inputs: { audio: ['9', 0], filename_prefix: options.filenamePrefix, format: 'flac' } },
  })
  return graph
}
