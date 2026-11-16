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

// 音频 job 的来源标签（裸标签）。队列展示时由 JobsView 拼「音乐 · 」前缀——兜底值
// 「音乐」本身已含类别语义，调用方拼接前须先判断（避免「音乐 · 音乐」）。
export function audioSourceLabel(provider?: GenerationJob['provider']) {
  if (provider === 'music3') return 'Music 3'
  if (provider === 'acestep') return 'ACE-Step'
  return '音乐'
}

type GenerationProvider = NonNullable<GenerationJob['provider']>

// 媒体库「提供方」筛选与视频卡片来源徽标的唯一事实来源。Record 的 key 必须覆盖
// GenerationJob['provider']：types.ts 新增来源时这里不补会直接编译失败，下拉因此
// 不会再落后于实际产出（历史上只有 minimax/ltx25，图片与音频类别被漏掉）。
// minimax 同时产出 H3 视频与 Ref2VA 静帧，选它时两者都命中，静帧可用「媒体」筛选细分。
const librarySources: Record<GenerationProvider, { label: string; group: '视频' | '图片' | '音频' }> = {
  minimax: { label: 'MiniMax H3', group: '视频' },
  ltx25: { label: 'LTX 2.5', group: '视频' },
  ltxripple: { label: 'LTX Ripple', group: '视频' },
  h3image: { label: 'H3-Image', group: '图片' },
  zimage: { label: 'Z-Image', group: '图片' },
  firered: { label: 'FireRed 图片编辑', group: '图片' },
  acestep: { label: 'ACE-Step', group: '音频' },
  music3: { label: 'Music 3', group: '音频' },
}

const librarySourceOrder = ['视频', '图片', '音频'] as const

// 分组顺序固定，组内保持上面的书写顺序，避免下拉随任务数据抖动。
export const librarySourceGroups = librarySourceOrder.map((group) => ({
  label: group,
  sources: (Object.keys(librarySources) as GenerationProvider[])
    .filter((provider) => librarySources[provider].group === group)
    .map((provider) => ({ provider, label: librarySources[provider].label })),
}))

const isLibrarySource = (provider?: string): provider is GenerationProvider => provider !== undefined && Object.hasOwn(librarySources, provider)

// 视频卡片的来源标签。历史条目没有 provider（渲染层按 minimax 归类），未知值也回落到
// MiniMax H3，避免旧数据在渲染时抛错。
export function videoSourceLabel(provider?: GenerationJob['provider']) {
  return isLibrarySource(provider) ? librarySources[provider].label : librarySources.minimax.label
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
