import type { WorkflowGpuRouting } from '../types'
import { addRoutedLoader, type ComfyPrompt } from './workflow'

// MiniMax H3-Image ships two local text-to-image routes:
//
// - 'dedicated': the standalone 33.1B image DiT (`minimax_h3_image_pruned_int8_convrot`)
//   plus its own image VAE. Highest quality, native up to 16MP, needs ComfyUI >= 0.45.0
//   for the `MiniMaxH3ImageConditioning` node.
// - 'fl2va': the H3 *video* DiT plus the 8-step Turbo LoRA, sampled on a plain image
//   latent and cut back to the still image plane. Customers who already render H3
//   video own every file this route needs, so it ships as a zero-download tier.
//
// Both routes are distilled: no CFG, no negative prompt, fixed sampler recipe.
export type H3ImageTier = 'dedicated' | 'fl2va'

export const H3_IMAGE_REQUIRED_NODES = ['MiniMaxH3ImageConditioning']
export const H3_IMAGE_FL2VA_REQUIRED_NODES: string[] = []

export type H3ImageTierSpec = {
  label: string
  summary: string
  detail: string
  steps: number
  model: string
  encoder: string
  vae: string
  lora?: string
  requiredNodes: string[]
}

export const H3_IMAGE_TIERS: Record<H3ImageTier, H3ImageTierSpec> = {
  dedicated: {
    label: 'H3-Image 专用模型',
    summary: '官方 6 步 · 原生 16MP · 更快',
    detail: 'MiniMax 官方图像 DiT（int8 约 21GB）+ 图像 VAE。6 步蒸馏、无 CFG 与反向提示词，可直出 4K；需要 ComfyUI 0.45 及以上。',
    steps: 6,
    model: 'minimax_h3_image_pruned_int8_convrot.safetensors',
    encoder: 'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors',
    vae: 'minimax_h3_image_vae_fp16.safetensors',
    requiredNodes: H3_IMAGE_REQUIRED_NODES,
  },
  fl2va: {
    label: 'H3 视频同款模型',
    summary: '兼容 · 复用视频权重 · 零下载',
    detail: '复用 H3 视频 DiT 与 8 步 Turbo LoRA 出静帧：零新增下载、旧版 ComfyUI 可用；单帧经视频 VAE 解码可能偏软，适合兼容与预览场景。',
    steps: 8,
    model: 'minimax_h3_fl2va_pruned_int8_convrot.safetensors',
    encoder: 'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors',
    vae: 'minimax_h3_video_vae_fp16.safetensors',
    lora: 'minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors',
    requiredNodes: H3_IMAGE_FL2VA_REQUIRED_NODES,
  },
}

// License attribution follows the weights that actually produced the image, so
// the label is chosen from the job's tier snapshot, never the current selection.
export const h3ImageTierAttribution = (tier: H3ImageTier) =>
  tier === 'dedicated' ? '由 MiniMax-H3-Image 生成' : '由 MiniMax H3 视频模型生成'

export type H3ImageComponents = {
  model: string
  encoder: string
  vae: string
  lora?: string
}

export const H3_IMAGE_SAVE_PREFIX = 'MiniMax_first_frames/H3Image'

export const isH3ImageModel = (name: string) => /minimax_h3_image/i.test(name)
export const isH3ImageVae = (name: string) => /minimax_h3_image_vae/i.test(name)
export const isH3Fl2vaModel = (name: string) => /minimax_h3_fl2va/i.test(name)
export const isH3VideoVae = (name: string) => /minimax_h3_video_vae/i.test(name)
export const isH3TurboLora = (name: string) => /minimax_h3_fl2v_turbo/i.test(name)
export const isH3Encoder = (name: string) => /qwen3vl_32b_minimax_h3/i.test(name)

export function h3ImageRequiredNodes(tier: H3ImageTier) {
  return H3_IMAGE_TIERS[tier].requiredNodes
}

// Single source of truth for "is this tier usable": object_info choices plus the
// 0.45 conditioning-node gate. Badges, the status line, the generate gate and
// auto tier selection all read from these two functions (A4).
export type H3ImageEngineSignals = {
  models: string[]
  encoders: string[]
  vaes: string[]
  loras: string[]
  dedicatedNodeReady: boolean
}

export function h3ImageTierReady(tier: H3ImageTier, signals: H3ImageEngineSignals) {
  const spec = H3_IMAGE_TIERS[tier]
  const encoderOk = signals.encoders.includes(spec.encoder) || signals.encoders.some(isH3Encoder)
  if (tier === 'dedicated') {
    return signals.models.some(isH3ImageModel) && signals.vaes.some(isH3ImageVae) && encoderOk && signals.dedicatedNodeReady
  }
  return signals.models.some(isH3Fl2vaModel) && signals.vaes.some(isH3VideoVae)
    && encoderOk && Boolean(spec.lora) && signals.loras.some(isH3TurboLora)
}

// Auto selection: prefer the dedicated stack, fall back to the zero-download
// stack, else report that nothing is usable. Callers on an offline/empty engine
// must not re-evaluate (A3): keep the previous tier instead.
export function resolveH3ImageTier(signals: H3ImageEngineSignals): { tier: H3ImageTier; usable: boolean } {
  if (h3ImageTierReady('dedicated', signals)) return { tier: 'dedicated', usable: true }
  if (h3ImageTierReady('fl2va', signals)) return { tier: 'fl2va', usable: true }
  return { tier: 'dedicated', usable: false }
}

// The dedicated tier reaches 16MP natively; the video-model tier tops out at
// 2048 (decision 10). Clamping keeps the aspect ratio and picks the
// nearest-area rung from the workspace size table (B2).
export const H3_IMAGE_WORKSPACE_SIZES: Record<string, string[]> = {
  '16:9': ['1024x576', '1344x768', '2048x1152', '4096x2304'],
  '1:1': ['1024x1024', '1536x1536', '2048x2048', '4096x4096'],
  '9:16': ['576x1024', '768x1344', '1152x2048', '2304x4096'],
}

export const H3_IMAGE_TIER_MAX_EDGE: Record<H3ImageTier, number> = { dedicated: 4096, fl2va: 2048 }

export function h3ImageSizesForTier(tier: H3ImageTier): Record<string, string[]> {
  const maxEdge = H3_IMAGE_TIER_MAX_EDGE[tier]
  return Object.fromEntries(Object.entries(H3_IMAGE_WORKSPACE_SIZES)
    .map(([ratio, sizes]) => [ratio, sizes.filter((size) => size.split('x').every((edge) => Number(edge) <= maxEdge))]))
}

export function clampH3ImageResolution(tier: H3ImageTier, resolution: string): string {
  const [width, height] = resolution.split('x').map(Number)
  if (!Number.isFinite(width) || !Number.isFinite(height)) return resolution
  const ratio = width === height ? '1:1' : width > height ? '16:9' : '9:16'
  const candidates = (h3ImageSizesForTier(tier)[ratio] ?? []).map((size) => {
    const [w, h] = size.split('x').map(Number)
    return { size, area: w * h }
  })
  if (!candidates.length) return resolution
  const target = width * height
  return candidates.reduce((best, option) =>
    Math.abs(option.area - target) < Math.abs(best.area - target) ? option : best).size
}

// Dedicated route: the conditioning node produces both the positive conditioning
// and the empty latent, so the sampler needs no separate latent node.
// `ConditioningZeroOut` mirrors the no-CFG distilled recipe used by the official
// template (negative == zeroed positive).
function dedicatedGraph(prompt: string, width: number, height: number, seed: number, components: H3ImageComponents, steps: number, livePreview: boolean, gpuRouting?: WorkflowGpuRouting): ComfyPrompt {
  const graph: ComfyPrompt = {}
  const modelLink = addRoutedLoader(graph, '1', 'UNETLoader', { unet_name: components.model, weight_dtype: 'default' }, gpuRouting?.diffusion, '801')
  const clipLink = addRoutedLoader(graph, '2', 'CLIPLoader', { clip_name: components.encoder, type: 'minimax', device: 'default' }, gpuRouting?.textEncoder, '802')
  const vaeLink = addRoutedLoader(graph, '3', 'VAELoader', { vae_name: components.vae }, gpuRouting?.videoVae, '803')
  Object.assign(graph, {
    '7': { class_type: 'MiniMaxH3ImageConditioning', inputs: { clip: clipLink, prompt, width, height, vae: vaeLink } },
    '8': { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['7', 0] } },
    '9': { class_type: 'KSampler', inputs: { model: modelLink, positive: ['7', 0], negative: ['8', 0], latent_image: ['7', 1], seed, steps, cfg: 1, sampler_name: 'euler', scheduler: 'simple', denoise: 1 } },
    '14': { class_type: 'VAEDecode', inputs: { samples: ['9', 0], vae: vaeLink } },
    '15': { class_type: 'SaveImage', inputs: { images: ['14', 0], filename_prefix: H3_IMAGE_SAVE_PREFIX } },
  })
  if (livePreview) graph['16'] = { class_type: 'PreviewImage', inputs: { images: ['14', 0] } }
  return graph
}

// Video-model route: the FL2VA DiT samples an audio-video latent, so the still
// image plane has to be split back out before decoding.
function fl2vaGraph(prompt: string, width: number, height: number, seed: number, components: H3ImageComponents, steps: number, livePreview: boolean, gpuRouting?: WorkflowGpuRouting): ComfyPrompt {
  const graph: ComfyPrompt = {}
  const modelBaseLink = addRoutedLoader(graph, '1', 'UNETLoader', { unet_name: components.model, weight_dtype: 'default' }, gpuRouting?.diffusion, '801')
  const modelLink = components.lora
    ? (graph['2'] = { class_type: 'LoraLoaderModelOnly', inputs: { model: modelBaseLink, lora_name: components.lora, strength_model: 1 } }, ['2', 0])
    : modelBaseLink
  const clipLink = addRoutedLoader(graph, '3', 'CLIPLoader', { clip_name: components.encoder, type: 'minimax', device: 'default' }, gpuRouting?.textEncoder, '802')
  const vaeLink = addRoutedLoader(graph, '5', 'VAELoader', { vae_name: components.vae }, gpuRouting?.videoVae, '803')
  Object.assign(graph, {
    '4': { class_type: 'CLIPTextEncode', inputs: { clip: clipLink, text: prompt } },
    '6': { class_type: 'EmptyLatentImage', inputs: { width, height, batch_size: 1 } },
    '8': { class_type: 'BasicScheduler', inputs: { model: modelLink, scheduler: 'simple', steps, denoise: 1 } },
    '9': { class_type: 'KSamplerSelect', inputs: { sampler_name: 'res_multistep' } },
    '10': { class_type: 'RandomNoise', inputs: { noise_seed: seed } },
    '11': { class_type: 'BasicGuider', inputs: { model: modelLink, conditioning: ['4', 0] } },
    '12': { class_type: 'SamplerCustomAdvanced', inputs: { noise: ['10', 0], guider: ['11', 0], sampler: ['9', 0], sigmas: ['8', 0], latent_image: ['6', 0] } },
    '13': { class_type: 'LTXVSeparateAVLatent', inputs: { av_latent: ['12', 0] } },
    '14': { class_type: 'VAEDecode', inputs: { samples: ['13', 0], vae: vaeLink } },
    '15': { class_type: 'SaveImage', inputs: { images: ['14', 0], filename_prefix: H3_IMAGE_SAVE_PREFIX } },
  })
  if (livePreview) graph['16'] = { class_type: 'PreviewImage', inputs: { images: ['14', 0] } }
  return graph
}

export function buildH3Image(
  prompt: string,
  width: number,
  height: number,
  seed: number,
  components: H3ImageComponents,
  tier: H3ImageTier = 'dedicated',
  steps = H3_IMAGE_TIERS[tier].steps,
  livePreview = true,
  gpuRouting?: WorkflowGpuRouting,
): ComfyPrompt {
  // The 'comfy kitchen attention' backend crashes ComfyUI 0.45.2 with a
  // cpu/cuda device mismatch inside the rope op, so the image graphs never add
  // a ModelAttentionBackend node — they always use the default backend.
  return tier === 'fl2va'
    ? fl2vaGraph(prompt, width, height, seed, components, steps, livePreview, gpuRouting)
    : dedicatedGraph(prompt, width, height, seed, components, steps, livePreview, gpuRouting)
}
