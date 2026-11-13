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
    summary: 'MiniMax 专用生图 DiT · 中文排版最稳 · 可出 4K',
    detail: '专用图像 DiT（int8 约 21GB）+ 图像 VAE，6 步蒸馏、无 CFG 与反向提示词。需要 ComfyUI 0.45 及以上。',
    steps: 6,
    model: 'minimax_h3_image_pruned_int8_convrot.safetensors',
    encoder: 'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors',
    vae: 'minimax_h3_image_vae_fp16.safetensors',
    requiredNodes: H3_IMAGE_REQUIRED_NODES,
  },
  fl2va: {
    label: 'H3 视频同款模型',
    summary: '复用 H3 视频 DiT · 零新增下载',
    detail: '直接用 FL2VA 视频 DiT 加 8 步 Turbo LoRA 出静帧。已部署 H3 视频的客户无需再下载模型。',
    steps: 8,
    model: 'minimax_h3_fl2va_pruned_int8_convrot.safetensors',
    encoder: 'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors',
    vae: 'minimax_h3_video_vae_fp16.safetensors',
    lora: 'minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors',
    requiredNodes: H3_IMAGE_FL2VA_REQUIRED_NODES,
  },
}

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
