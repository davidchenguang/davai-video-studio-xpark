// 状态 / 生成模式的 value 是英文存储值（随任务持久化），以下映射是配套的中文显示层。
import type { GenerationJob } from '../types'

export const jobStatusLabels: Record<string, string> = { queued: '排队中', running: '渲染中', completed: '已完成', failed: '已失败', cancelled: '已取消' }
export const generationModeLabels: Record<string, string> = { text: '文字生成', image: '图片生成', frames: '首尾帧生成', reference: '参考图生成' }

export function shortPrompt(prompt: string) {
  return prompt.length > 76 ? `${prompt.slice(0, 76)}…` : prompt
}

// 图片 job 的来源标签。Ref2VA 静帧在 provider 上仍沿用 minimax（历史条目可能没有
// provider），所以这两个值要落到同一个标签；未知 provider 给中性兜底，避免历史或
// 未来来源的图片被错标。
export function imageSourceLabel(provider?: GenerationJob['provider']) {
  if (provider === 'h3image') return 'H3-Image'
  if (provider === 'zimage') return 'Z-Image'
  if (provider === 'firered') return 'FireRed 图片编辑'
  if (provider === undefined || provider === 'minimax') return 'Ref2VA 静帧'
  return '生成图片'
}

// 生图工作区在保存成功后用它登记一条已完成的图片任务。outputUrl 必须由调用方用
// mediaUrl() 生成短 URL——getOutputImage 返回的 data URL 会把 localStorage 写爆，
// 而 writeLocalJson 失败时静默返回 false。
export function buildImageJob(input: {
  provider: 'h3image' | 'zimage' | 'firered'
  promptId: string
  prompt: string
  width: number
  height: number
  outputUrl: string
  localOutputPath: string
  createdAt?: number
}): GenerationJob {
  const createdAt = input.createdAt ?? Date.now()
  return {
    id: `image-${input.provider}-${input.promptId}-${createdAt}`,
    promptId: input.promptId,
    mode: 'image',
    prompt: input.prompt,
    createdAt,
    status: 'completed',
    progress: 100,
    mediaType: 'image',
    provider: input.provider,
    width: input.width,
    height: input.height,
    duration: 0,
    outputUrl: input.outputUrl,
    localOutputPath: input.localOutputPath,
  }
}

export function libraryPromptTitle(prompt: string) {
  const authored = prompt.match(/(?:integrated_multimodal_description|detailed_description):\s*([\s\S]*?)(?=\n\s*(?:overall_soundscape|non_diegetic_music):|$)/i)?.[1] || prompt
  const line = authored.split(/\r?\n/).map(part => part.replace(/\[Shot\s+\d+\](?:\s+At\s+[\d:.]+,?\s+the\s+camera\s+cuts\s+to)?/gi, '').replace(/<[^>]+>/g, '').trim()).find(Boolean)
  return shortPrompt(line || '未命名渲染')
}

export function modelPrecisionLabel(model?: string) {
  if (!model) return undefined
  if (/nvfp4/i.test(model)) return 'NVFP4'
  if (/int8.*convrot|convrot.*int8/i.test(model)) return 'INT8 ConvRot'
  if (/bf16/i.test(model)) return 'BF16'
  if (/fp16/i.test(model)) return 'FP16'
  if (/int8/i.test(model)) return 'INT8'
  return undefined
}

export function modelLabel(model?: string) {
  if (!model) return undefined
  return model.replace(/\.safetensors$/i, '').replace(/^minimax_h3_/i, 'H3 ').replace(/^ltx-2\.5-/i, 'LTX 2.5 ').replace(/[_-]+/g, ' ')
}
