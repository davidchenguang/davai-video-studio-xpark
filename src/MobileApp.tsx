import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, CircleStop, Download, Film, Image as ImageIcon, Images, LayoutGrid, LoaderCircle, Menu, Music2, Play, Plus, RefreshCw, Smartphone, Sparkles, Users, Video, WandSparkles, X } from 'lucide-react'
import { ImageCrop } from './components/ImageCrop'
import { RenderSize } from './components/RenderSize'
import { RenderConstruction } from './components/RenderConstruction'
import { ReliableVideo } from './components/ReliableVideo'
import { prepareImage } from './lib/imageCrop'
import { inferLtx25Selections, inferSelections } from './lib/modelSelection'
import { buildMiniMaxWorkflow } from './lib/workflow'
import { buildLtx25Workflow } from './lib/ltx25Workflow'
import { buildZImage } from './lib/zimage'
import { applyDialoguePolicy } from './lib/dialogPolicy'
import { createId } from './lib/createId'
import { applyTheme, normalizeTheme } from './lib/theme'
import type { MediaFile, ModelFile } from './types'

type Bootstrap = { connected: boolean; latencyMs: number; models: ModelFile[]; upscalers?: string[]; ltxModel?: string; ltxVae?: string; ltxUpscaleReady?: boolean; ltxUpscaleMissing?: string[]; ltxNativeReady?: boolean; ltxNativeMissing?: string[]; ollamaModels?: string[]; ollamaModel?: string; llmProvider?: 'ollama' | 'lmstudio'; llmModels?: string[]; llmModel?: string; error?: string }
type MobileStatus = 'ready' | 'uploading' | 'queued' | 'rendering' | 'complete' | 'error'
type MobileUpscale = 'off' | 'refine' | 'ltx' | 'rtx'
type MobileProvider = 'minimax' | 'ltx25'
type InstallPrompt = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
type MobileView = 'video' | 'image' | 'characters'
type MobileCharacter = { id: string; name: string; description: string; wardrobe: string; voiceNotes: string; visualStyle: string; referenceInstructions?: string[]; references: Array<{ name: string; preview: string; purpose?: string; label?: string }> }

type MobileMode = 'text' | 'image' | 'reference'
type MobileReference = MediaFile & { source?: File }
type ClothingPolicy = 'assigned' | 'underwear' | 'unrestricted'
type StoredMobileWorkspace = Partial<{ mode: MobileMode; prompt: string; noDialogue: boolean; resolution: string; duration: number; quality: 'quality' | 'turbo'; upscale: MobileUpscale; refineSteps: number; refineDenoise: number; rtxModel: string; clothingPolicy: ClothingPolicy; refImageSize: 'match' | 'max' }>

function readMobileWorkspace(provider: MobileProvider = 'minimax') {
  try { return JSON.parse(localStorage.getItem(provider === 'ltx25' ? 'ltx25.mobile-workspace' : 'minimax.mobile-workspace') ?? '{}') as StoredMobileWorkspace }
  catch { return {} }
}

const queryToken = new URLSearchParams(location.search).get('token') ?? ''
if (queryToken) localStorage.setItem('minimax.lan-token', queryToken)
const token = queryToken || localStorage.getItem('minimax.lan-token') || ''

async function lanFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (token === 'browser-preview') {
    if (path === '/api/lan/bootstrap') return { connected: true, latencyMs: 7, models: previewModels, upscalers: ['4x-UltraSharp.pth'], ltxModel: 'ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors', ltxVae: 'ltx-2.5-video-vae-bf16.safetensors', ltxUpscaleReady: true, ltxNativeReady: true, llmProvider: 'ollama', llmModels: ['qwen3:latest'], llmModel: 'qwen3:latest', ollamaModels: ['qwen3:latest'], ollamaModel: 'qwen3:latest' } as T
    if (path === '/api/lan/characters') return { characters: previewCharacters } as T
    if (path === '/api/lan/appearance') return { theme: 'green' } as T
    if (path === '/api/lan/ollama') return { response: 'A polished cinematic shot with deliberate subject motion, stable camera movement, natural lighting, and synchronized ambient sound.' } as T
    throw new Error('生成功能需通过桌面应用展示的二维码链接进入后使用。')
  }
  const response = await fetch(path, { ...init, headers: { ...init?.headers, 'x-minimax-token': token } })
  const data = await response.json().catch(() => ({})) as T & { error?: string }
  if (!response.ok) throw new Error(data.error || `DavAi Video Studio 返回了 ${response.status}。`)
  return data
}

export default function MobileApp() {
  const initialProvider = useMemo(() => localStorage.getItem('mobile.active-provider') === 'ltx25' ? 'ltx25' as const : 'minimax' as const, [])
  const stored = useMemo(() => readMobileWorkspace(initialProvider), [initialProvider])
  const [provider, setProvider] = useState<MobileProvider>(initialProvider)
  const [mobileView, setMobileView] = useState<MobileView>('video')
  const [menuOpen, setMenuOpen] = useState(false)
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null)
  const [refreshing, setRefreshing] = useState(true)
  const [characters, setCharacters] = useState<MobileCharacter[]>([])
  const [selectedCharacterId, setSelectedCharacterId] = useState('')
  const [mode, setMode] = useState<MobileMode>(stored.mode ?? 'text')
  const [prompt, setPrompt] = useState(stored.prompt ?? '')
  const [noDialogue, setNoDialogue] = useState(stored.noDialogue ?? true)
  const [frame, setFrame] = useState<MediaFile | null>(null)
  const [referenceImages, setReferenceImages] = useState<MobileReference[]>([])
  const [referenceVideos, setReferenceVideos] = useState<MobileReference[]>([])
  const [referenceAudios, setReferenceAudios] = useState<MobileReference[]>([])
  const [clothingPolicy, setClothingPolicy] = useState<ClothingPolicy>(stored.clothingPolicy ?? 'assigned')
  const [refImageSize, setRefImageSize] = useState<'match' | 'max'>(stored.refImageSize ?? 'match')
  const [resolution, setResolution] = useState(stored.resolution ?? '768x448')
  const [duration, setDuration] = useState(stored.duration ?? 5)
  const [quality, setQuality] = useState<'quality' | 'turbo'>(stored.quality ?? 'turbo')
  const [upscale, setUpscale] = useState<MobileUpscale>(stored.upscale ?? 'refine')
  const [refineSteps, setRefineSteps] = useState(Math.max(1, Math.min(30, Math.round(Number(stored.refineSteps) || 3))))
  const [refineDenoise, setRefineDenoise] = useState(Number.isFinite(Number(stored.refineDenoise)) ? Math.max(0.01, Math.min(1, Number(stored.refineDenoise))) : 0.3)
  const [rtxModel, setRtxModel] = useState(stored.rtxModel ?? '')
  const [status, setStatus] = useState<MobileStatus>('ready')
  const [message, setMessage] = useState('')
  const [outputUrl, setOutputUrl] = useState('')
  const [livePreview, setLivePreview] = useState('')
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState('就绪')
  const [promptId, setPromptId] = useState('')
  const [assistantInstruction, setAssistantInstruction] = useState('')
  const [assisting, setAssisting] = useState(false)
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null)
  const [imagePrompt, setImagePrompt] = useState('')
  const [imageResolution, setImageResolution] = useState('1344x768')
  const [imageBusy, setImageBusy] = useState(false)
  const [imageMessage, setImageMessage] = useState('')
  const [imageOutput, setImageOutput] = useState<{ url: string; name: string } | null>(null)
  const cancelled = useRef(false)
  const models = useMemo(() => bootstrap?.models ?? [], [bootstrap?.models])
  const llmLabel = bootstrap?.llmProvider === 'lmstudio' ? 'LM Studio' : 'Ollama'
  const llmModels = bootstrap?.llmModels ?? bootstrap?.ollamaModels ?? []
  const llmModel = bootstrap?.llmModel ?? bootstrap?.ollamaModel ?? ''
  const turbo = quality === 'turbo' ? '8' as const : 'off' as const
  const selection = useMemo(() => inferSelections(models, turbo), [models, turbo])
  const ltxSelection = useMemo(() => inferLtx25Selections(models, bootstrap?.ltxModel ? [bootstrap.ltxModel] : []), [bootstrap?.ltxModel, models])
  const miniMaxReady = Boolean((mode === 'reference' ? selection.ref2va : selection.fl2va) && selection.textEncoder && selection.videoVae && selection.audioVae && (turbo === 'off' || (mode === 'reference' ? selection.ref2vLora : selection.fl2vLora)))
  const ltxReady = Boolean(ltxSelection.diffusion && ltxSelection.textEncoder && ltxSelection.videoVae && ltxSelection.audioVae && ltxSelection.latentUpscaler && bootstrap?.ltxNativeReady)
  const ltxUpscaleReady = Boolean(bootstrap?.ltxModel && bootstrap?.ltxVae && bootstrap?.ltxUpscaleReady)
  const modelReady = provider === 'ltx25' ? ltxReady : miniMaxReady
  const zModel = models.find((file) => file.kind === 'diffusion_models' && /z[_ .-]?image/i.test(file.name))?.name ?? ''
  const zEncoder = models.find((file) => file.kind === 'text_encoders' && /qwen[_ .-]?3[_ .-]?4b/i.test(file.name))?.name ?? ''
  const zVae = models.find((file) => file.kind === 'vae' && /^ae(?:\.|_|-)/i.test(file.name))?.name ?? ''
  const zReady = Boolean(zModel && zEncoder && zVae)
  const renderDuration = provider === 'ltx25' ? Math.min(duration, 10) : duration
  const busy = status === 'uploading' || status === 'queued' || status === 'rendering'

  useEffect(() => {
    if (!rtxModel && bootstrap?.upscalers?.length) setRtxModel(bootstrap.upscalers[0])
  }, [bootstrap?.upscalers, rtxModel])

  useEffect(() => {
    localStorage.setItem(provider === 'ltx25' ? 'ltx25.mobile-workspace' : 'minimax.mobile-workspace', JSON.stringify({ mode, prompt, noDialogue, resolution, duration, quality, upscale, refineSteps, refineDenoise, rtxModel, clothingPolicy, refImageSize }))
    localStorage.setItem('mobile.active-provider', provider)
  }, [clothingPolicy, duration, mode, noDialogue, prompt, provider, quality, refImageSize, refineSteps, refineDenoise, resolution, rtxModel, upscale])

  const changeProvider = (next: MobileProvider) => {
    if (next === provider || ['uploading', 'queued', 'rendering'].includes(status)) return
    const nextWorkspace = readMobileWorkspace(next)
    setProvider(next)
    setMode(next === 'ltx25' && nextWorkspace.mode === 'reference' ? 'text' : nextWorkspace.mode ?? 'text')
    setPrompt(nextWorkspace.prompt ?? '')
    setNoDialogue(nextWorkspace.noDialogue ?? true)
    setResolution(nextWorkspace.resolution ?? '1056x608')
    setDuration(nextWorkspace.duration ?? 5)
    setQuality(nextWorkspace.quality ?? (next === 'ltx25' ? 'quality' : 'turbo'))
    setUpscale(next === 'ltx25' ? 'off' : nextWorkspace.upscale ?? 'refine')
    setRefineSteps(Math.max(1, Math.min(30, Math.round(Number(nextWorkspace.refineSteps) || 3))))
    setRefineDenoise(Number.isFinite(Number(nextWorkspace.refineDenoise)) ? Math.max(0.01, Math.min(1, Number(nextWorkspace.refineDenoise))) : 0.3)
    setClothingPolicy(nextWorkspace.clothingPolicy ?? 'assigned'); setRefImageSize(nextWorkspace.refImageSize ?? 'match')
    setOutputUrl(''); setLivePreview(''); setProgress(0); setProgressLabel('就绪'); setPromptId(''); setMessage(''); setStatus('ready')
  }

  const refresh = async () => {
    setRefreshing(true)
    try {
      const [nextBootstrap, library] = await Promise.all([lanFetch<Bootstrap>('/api/lan/bootstrap'), lanFetch<{ characters: MobileCharacter[] }>('/api/lan/characters')])
      setBootstrap(nextBootstrap); setCharacters(library.characters ?? []); setMessage('')
    }
    catch (error) { setBootstrap({ connected: false, latencyMs: 0, models: [], error: error instanceof Error ? error.message : String(error) }) }
    finally { setRefreshing(false) }
  }

  useEffect(() => { void refresh() }, [])
  // The phone page follows the studio theme (D14): fetch once at load; a refresh picks up changes.
  useEffect(() => {
    // The phone page follows the studio theme (D14): fetch once at load; a refresh picks up changes.
    const themeColors: Record<string, string> = { green: '#0c100e', blue: '#0e1419', comfy: '#211927', light: '#e6e7e3' }
    lanFetch<{ theme: string }>('/api/lan/appearance').then(({ theme }) => {
      const normalized = normalizeTheme(theme)
      applyTheme(document.documentElement, normalized)
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColors[normalized])
    }).catch(() => undefined)
  }, [])
  useEffect(() => {
    const capture = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPrompt) }
    window.addEventListener('beforeinstallprompt', capture)
    if ('serviceWorker' in navigator && window.isSecureContext) void navigator.serviceWorker.register('/sw.js')
    return () => window.removeEventListener('beforeinstallprompt', capture)
  }, [])

  const chooseFrame = (file?: File) => {
    if (!file) return
    if (!file.type.startsWith('image/')) { setMessage('请选择 PNG、JPG 或 WebP 图片。'); return }
    if (file.size > 24 * 1024 * 1024) { setMessage('请选择小于 24 MB 的图片。'); return }
    const reader = new FileReader()
    reader.onload = () => { setFrame({ path: file.name, name: file.name, kind: 'image', preview: String(reader.result) }); setMode('image'); setMessage('') }
    reader.readAsDataURL(file)
  }

  const chooseReferences = (kind: 'image' | 'video' | 'audio', files?: FileList | null) => {
    const incoming = Array.from(files ?? [])
    const limit = kind === 'image' ? 9 : 3
    const setter = kind === 'image' ? setReferenceImages : kind === 'video' ? setReferenceVideos : setReferenceAudios
    setter((current) => {
      const available = Math.max(0, limit - current.length)
      const accepted = incoming.filter((file) => file.type.startsWith(`${kind}/`)).slice(0, available).map((file) => ({ path: file.name, name: file.name, kind, source: file } as MobileReference))
      accepted.forEach((item) => {
        if (kind !== 'image' || !item.source) return
        const reader = new FileReader()
        reader.onload = () => setter((items) => items.map((candidate) => candidate === item ? { ...candidate, preview: String(reader.result) } : candidate))
        reader.readAsDataURL(item.source)
      })
      if (incoming.length > available) setMessage(`已达参考数量上限：最多 ${limit} 个。`)
      return [...current, ...accepted]
    })
  }

  const setVideoMode = (next: MobileMode) => {
    setMode(next)
    if (next === 'reference') { setProvider('minimax'); setUpscale('off') }
  }

  const applyCharacter = (character: MobileCharacter) => {
    const identity = character.referenceInstructions?.length ? character.referenceInstructions.join(' ') : `Character: ${character.name} — preserve this saved identity. ${character.description}${character.wardrobe ? ` Wardrobe: ${character.wardrobe}.` : ''}${character.voiceNotes ? ` Performance: ${character.voiceNotes}.` : ''}`
    setSelectedCharacterId(character.id)
    setPrompt((current) => current.includes(`Character: ${character.name}`) ? current : `${identity}\n\n${current}`.trim())
    const approved = character.references.slice(0, 9).map((reference) => ({ path: reference.name, name: reference.name, kind: 'image' as const, preview: reference.preview }))
    if (approved.length) setReferenceImages(approved)
    setMobileView('video'); setVideoMode(approved.length ? 'reference' : 'text'); setMessage(`已将 ${character.name} 加入镜头${approved.length ? `，含 ${approved.length} 张已确认身份参考` : ''}。`)
  }

  const fileData = (reference: MobileReference) => new Promise<string>((resolve, reject) => {
    if (!reference.source) {
      if (reference.preview?.startsWith('data:')) return resolve(reference.preview)
      return reject(new Error(`${reference.name} 在这台手机上不可用。请刷新桌面端素材库后重试。`))
    }
    const reader = new FileReader(); reader.onerror = () => reject(new Error(`无法读取 ${reference.name}。`)); reader.onload = () => resolve(String(reader.result)); reader.readAsDataURL(reference.source)
  })

  const uploadReference = async (reference: MobileReference) => lanFetch<{ name: string; subfolder?: string; type?: string }>('/api/lan/upload-media', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: reference.name, data: await fileData(reference) }) })

  const generateImage = async () => {
    if (!imagePrompt.trim()) return setImageMessage('请先描述想创建的图片。')
    if (!bootstrap?.connected || !zReady) return setImageMessage('桌面端 Z-Image 尚未就绪。')
    setImageBusy(true); setImageOutput(null); setImageMessage('正在桌面端 GPU 上使用 Z-Image 渲染…')
    try {
      const [width, height] = imageResolution.split('x').map(Number)
      const queued = await lanFetch<{ prompt_id: string }>('/api/lan/prompt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: buildZImage(imagePrompt.trim(), width, height, Math.floor(Math.random() * 1_000_000_000), zModel, zEncoder, zVae) }) })
      for (let attempt = 0; attempt < 1800; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
        const result = await lanFetch<{ finished: boolean; error?: string; output?: { filename: string; subfolder?: string; type?: string } }>(`/api/lan/history/${encodeURIComponent(queued.prompt_id)}?kind=image`)
        if (!result.finished) continue
        if (result.error) throw new Error(result.error)
        if (!result.output) throw new Error('ComfyUI 已完成但未返回图片。')
        const query = new URLSearchParams({ token, filename: result.output.filename, subfolder: result.output.subfolder ?? '', type: result.output.type ?? 'output' })
        setImageOutput({ url: `/api/lan/media?${query}`, name: result.output.filename }); setImageMessage('图片已完成。'); return
      }
      throw new Error('移动端页面已停止等待。请查看桌面端队列。')
    } catch (error) { setImageMessage(error instanceof Error ? error.message : String(error)) }
    finally { setImageBusy(false) }
  }

  const runAssistant = async (task: 'enhance' | 'timeline' | 'audio' | 'custom') => {
    if (!prompt.trim() || assisting || !llmModels.length) return
    const dialogueRule = noDialogue ? ' Use ambient sound only; do not add dialogue, narration, singing, lip-sync, subtitles, captions, or text overlays.' : ''
    const direction = task === 'enhance'
      ? `Rewrite this into one polished ${provider === 'ltx25' ? 'LTX-2.5' : 'MiniMax H3'} video prompt with precise subject action, camera, lighting, physical motion, pacing, and synchronized audio.${dialogueRule}`
      : task === 'timeline'
        ? `Rewrite this as a concise time-coded sequence lasting exactly ${renderDuration} seconds. Preserve continuity and include camera and audio cues.${dialogueRule}`
        : task === 'audio'
          ? `Preserve the visuals and improve ${noDialogue ? 'ambience, sound effects, music, spatial audio placement, and timing without voices' : 'dialogue, ambience, sound effects, music, spatial audio placement, and timing'}.`
          : assistantInstruction.trim()
    if (!direction) { setMessage('请告诉助手你想修改什么。'); return }
    setAssisting(true); setMessage(`${llmLabel} 正在桌面端润色提示词…`)
    try {
      const result = await lanFetch<{ response: string }>('/api/lan/ollama', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: `${direction}\nReturn only the revised generation prompt.\n\nDRAFT:\n${prompt.trim()}` }),
      })
      setPrompt(result.response); setAssistantInstruction(''); setMessage(`已由本地 ${llmLabel} 模型更新提示词。`)
    } catch (error) { setStatus('error'); setMessage(error instanceof Error ? error.message : String(error)) }
    finally { setAssisting(false) }
  }

  const openPreviewStream = (clientId: string) => {
    if (token === 'browser-preview') return { source: null, ready: Promise.resolve() }
    const source = new EventSource(`/api/lan/events?${new URLSearchParams({ token, clientId })}`)
    let samplerStage = ''
    let markReady: () => void = () => undefined
    const ready = new Promise<void>((resolve) => { markReady = resolve })
    source.onmessage = (event) => {
      try {
        const update = JSON.parse(event.data) as { type?: string; data?: { node?: string | null; value?: number; max?: number; image?: string; output?: { images?: Array<{ filename: string; subfolder?: string; type?: string }> } } }
        if (update.type === 'stream_ready') markReady()
        if (update.type === 'execution_start') { samplerStage = ''; setProgress((current) => Math.max(current, 1)); setProgressLabel('正在启动工作流') }
        if (update.type === 'execution_cached') setProgressLabel('复用缓存的模型数据')
        if (update.type === 'executing' && update.data?.node) {
          if (update.data.node === '15') samplerStage = '首轮采样'
          else if (update.data.node === '111') samplerStage = '精修采样轮'
          setProgressLabel(samplerStage && (update.data.node === '15' || update.data.node === '111') ? samplerStage : '正在加载或处理工作流阶段')
        }
        if (update.type === 'progress' && update.data?.max) {
          const step = update.data.value ?? 0
          const total = update.data.max
          setProgress((current) => Math.max(current, Math.min(95, Math.round((step / total) * 95))))
          setProgressLabel(`${samplerStage || '采样中'} · 第 ${step} 步，共 ${total} 步`)
        }
        if (update.type === 'execution_success') { setProgress(98); setProgressLabel('正在保存最终输出') }
        if (update.type === 'preview' && update.data?.image) setLivePreview(update.data.image)
        const image = update.type === 'executed' ? update.data?.output?.images?.[0] : undefined
        if (image) setLivePreview(`/api/lan/media?${new URLSearchParams({ token, filename: image.filename, subfolder: image.subfolder ?? '', type: image.type ?? 'temp' })}`)
      } catch { /* Ignore unrelated ComfyUI events. */ }
    }
    source.onerror = () => markReady()
    return { source, ready }
  }

  const generate = async () => {
    if (!prompt.trim()) return setMessage('请先描述想创建的视频。')
    if (!bootstrap?.connected) return setMessage('桌面应用无法连接 ComfyUI。')
    if (!modelReady) return setMessage(`桌面端缺少所需的 ${provider === 'ltx25' ? 'LTX‑2.5' : 'MiniMax H3'} 模型。`)
    if (mode === 'image' && !frame) return setMessage('请为图生视频选择首帧。')
    if (mode === 'reference' && referenceImages.length + referenceVideos.length + referenceAudios.length === 0) return setMessage('请至少添加一张参考图片、视频或音频文件。')
    if (provider === 'minimax' && upscale === 'ltx' && !ltxUpscaleReady) return setMessage(`使用 LTX 2× 放大前请先更新 ComfyUI${bootstrap?.ltxUpscaleMissing?.length ? `；缺少 ${bootstrap.ltxUpscaleMissing.join(', ')}` : ''}。`)
    if (upscale === 'rtx' && !rtxModel) return setMessage('请先选择一个 RTX/CUDA 逐帧放大模型。')
    if (upscale === 'rtx' && !window.confirm('RTX/CUDA 放大逐帧独立处理，可能放大噪点或闪烁。继续使用这个实验性后处理？')) return
    setOutputUrl(''); setLivePreview(''); setProgress(2); setProgressLabel(mode === 'image' ? '正在准备首帧' : mode === 'reference' ? '正在上传参考' : '正在准备工作流'); setPromptId(''); setStatus(mode === 'image' || mode === 'reference' ? 'uploading' : 'queued'); setMessage(mode === 'image' ? '正在准备并上传裁剪画面…' : mode === 'reference' ? '正在上传参考素材到桌面端…' : `正在构建 ${provider === 'ltx25' ? 'LTX‑2.5' : 'MiniMax'} 工作流…`)
    const clientId = createId()
    const previewStream = openPreviewStream(clientId)
    cancelled.current = false
    try {
      await Promise.race([previewStream.ready, new Promise<void>((resolve) => setTimeout(resolve, 1500))])
      const [width, height] = resolution.split('x').map(Number)
      const first = mode === 'image' && frame ? await lanFetch<{ name: string; subfolder?: string; type?: string }>('/api/lan/upload', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data: await prepareImage(frame, width, height) }) }) : undefined
      const [images, videos, audios] = mode === 'reference' ? await Promise.all([Promise.all(referenceImages.map(uploadReference)), Promise.all(referenceVideos.map(uploadReference)), Promise.all(referenceAudios.map(uploadReference))]) : [[], [], []]
      const seed = Math.floor(Math.random() * 1_000_000_000)
      const postProcess = upscale === 'refine' ? { type: 'refine' as const, steps: refineSteps, denoise: refineDenoise } : upscale === 'ltx' ? { type: 'ltx' as const, model: bootstrap.ltxModel!, vae: bootstrap.ltxVae! } : upscale === 'rtx' ? { type: 'rtx' as const, model: rtxModel } : undefined
      const clothingDirection = clothingPolicy === 'assigned' ? 'Clothing intent: preserve the assigned wardrobe shown in the reference images.' : clothingPolicy === 'underwear' ? 'Clothing intent: keep only the underwear shown in each adult character identity reference; do not add outer garments.' : 'Clothing intent: adult fictional characters only; follow the scene prompt explicitly and do not treat reference clothing as mandatory.'
      const effectivePrompt = applyDialoguePolicy([prompt, mode === 'reference' ? clothingDirection : ''].filter(Boolean).join(' '), noDialogue)
      const graph = provider === 'ltx25'
        ? buildLtx25Workflow({ mode: mode === 'image' ? 'image' : 'text', prompt: effectivePrompt, width, height, duration: renderDuration, seed, preset: quality, filenamePrefix: `video/LTX_2.5_Mobile_${Date.now()}` }, ltxSelection, first)
        : buildMiniMaxWorkflow({ mode, prompt: effectivePrompt, width, height, duration: renderDuration, seed, steps: quality === 'quality' ? 30 : 20, turbo, sampler: 'res_multistep', scheduler: 'simple', upscale: postProcess, refImageSize, filenamePrefix: `video/MiniMax_Mobile_${Date.now()}`, firstFrame: frame?.path, referenceImages: referenceImages.map((item) => item.path), referenceVideos: referenceVideos.map((item) => item.path), referenceAudios: referenceAudios.map((item) => item.path) }, selection, { first, images, videos, audios })
      const queued = await lanFetch<{ prompt_id: string }>('/api/lan/prompt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: graph, clientId }) })
      setPromptId(queued.prompt_id)
      setProgressLabel('等待 ComfyUI 启动')
      setStatus('rendering'); setMessage(`正在桌面端 GPU 上使用 ${provider === 'ltx25' ? 'LTX‑2.5' : 'MiniMax H3'} 渲染。可保持本页面开启。`)
      for (let attempt = 0; attempt < 1800; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
        if (cancelled.current) { previewStream.source?.close(); return }
        const result = await lanFetch<{ finished: boolean; error?: string; output?: { filename: string; subfolder?: string; type?: string } }>(`/api/lan/history/${encodeURIComponent(queued.prompt_id)}`)
        if (!result.finished) continue
        if (result.error) throw new Error(result.error)
        if (!result.output) throw new Error('ComfyUI 已完成但未返回视频文件。')
        const query = new URLSearchParams({ token, filename: result.output.filename, subfolder: result.output.subfolder ?? '', type: result.output.type ?? 'output' })
        setOutputUrl(`/api/lan/media?${query}`); setProgress(100); setProgressLabel('已完成'); setStatus('complete'); setMessage('视频已完成。可在下方预览或下载。'); previewStream.source?.close(); return
      }
      throw new Error('移动端页面已停止等待本次生成。请查看桌面端队列。')
    } catch (error) { previewStream.source?.close(); if (!cancelled.current) { setStatus('error'); setMessage(error instanceof Error ? error.message : String(error)) } }
  }

  const cancel = async () => {
    if (!promptId) return
    try { const result = await lanFetch<{ cancelled: boolean; state: 'running' | 'pending' | 'finished' | 'unknown' }>('/api/lan/cancel', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ promptId }) }); if (!result.cancelled) { setMessage(result.state === 'finished' ? '该生成已完成。正在等待其输出…' : 'ComfyUI 已不再上报本次生成。请先查看桌面端队列再重试。'); return }; cancelled.current = true; setPromptId(''); setStatus('ready'); setProgress(0); setProgressLabel('已取消'); setMessage('生成已取消。') }
    catch (error) { setStatus('error'); setMessage(error instanceof Error ? error.message : String(error)) }
  }

  const showMobileWorkspace = (next: MobileView, nextMode?: MobileMode) => { setMobileView(next); if (nextMode) setVideoMode(nextMode); setMenuOpen(false) }
  const fullStudioUrl = `/?desktop=1&token=${encodeURIComponent(token)}`
  return <main className="mobile-app">
    <header className="mobile-header"><button className="mobile-menu-trigger" aria-label="打开工作区菜单" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><Menu size={18} /></button><span className="brand-mark"><Film size={18} /></span><span><strong>DavAi Video Studio</strong><small>{refreshing ? '正在连接桌面端…' : bootstrap?.connected ? '局域网伴侣 · 已连接' : '局域网伴侣 · 离线'}</small></span><button aria-label="刷新桌面端连接" disabled={refreshing} onClick={() => void refresh()}>{refreshing ? <LoaderCircle className="spin" size={17} /> : <RefreshCw size={17} />}</button></header>
    <nav className="mobile-primary-nav" aria-label="快捷工作区"><button className={mobileView === 'video' ? 'active' : ''} onClick={() => showMobileWorkspace('video')}><Film size={18} /><span>视频</span></button><button className={mobileView === 'image' ? 'active image' : 'image'} onClick={() => showMobileWorkspace('image')}><ImageIcon size={18} /><span>图片</span></button><button className={mobileView === 'characters' ? 'active character' : 'character'} onClick={() => showMobileWorkspace('characters')}><Users size={18} /><span>角色</span></button></nav>
    {menuOpen && <div className="mobile-menu-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setMenuOpen(false) }}><aside className="mobile-menu" role="dialog" aria-modal="true" aria-label="MiniMax 工作区"><header><span><strong>工作区</strong><small>在本机上快速创作</small></span><button aria-label="关闭工作区菜单" onClick={() => setMenuOpen(false)}><X size={18} /></button></header><nav><button onClick={() => showMobileWorkspace('video', 'text')}><Film size={18} /><span><strong>创建视频</strong><small>MiniMax H3 或 LTX 2.5</small></span></button><button onClick={() => showMobileWorkspace('video', 'reference')}><Sparkles size={18} /><span><strong>参考工作区</strong><small>角色、服装、发型、图片、运动与音频</small></span></button><button onClick={() => showMobileWorkspace('image')}><ImageIcon size={18} /><span><strong>生成图片</strong><small>桌面端 GPU 上的 Z-Image</small></span></button><button onClick={() => showMobileWorkspace('characters')}><Users size={18} /><span><strong>角色库</strong><small>使用已确认的角色及其关联素材</small></span></button></nav><a href={fullStudioUrl}><LayoutGrid size={18} /><span><strong>打开完整工作室</strong><small>影片剪辑、发型、服装、地点、队列、视频库、编辑器与设置</small></span></a></aside></div>}
    <section className="mobile-hero"><div><p>本地 {mobileView === 'characters' ? '素材库' : '创作'}</p><h1>{mobileView === 'video' ? '创建视频' : mobileView === 'image' ? '生成图片' : '角色库'}</h1><span>{mobileView === 'video' ? 'MiniMax H3 与 LTX‑2.5 在桌面端 GPU 上运行。' : mobileView === 'image' ? '用手机设计高分辨率 Z-Image 静帧。' : '浏览已确认的角色形象，一键加入镜头。'}</span></div><i className={bootstrap?.connected ? 'online' : ''}>{bootstrap?.connected ? `已连接 · ${bootstrap.latencyMs} ms` : '离线'}</i></section>
    {mobileView === 'video' && <section className="mobile-create-panel">
      <div className="mobile-provider" role="tablist" aria-label="视频引擎"><button role="tab" aria-selected={provider === 'minimax'} disabled={busy} onClick={() => changeProvider('minimax')}><strong>MiniMax H3</strong><small>灵活的视频与参考</small></button><button role="tab" aria-selected={provider === 'ltx25'} disabled={busy} onClick={() => changeProvider('ltx25')}><strong>LTX‑2.5</strong><small>原生文生视频与图生视频</small></button></div>
      <div className={`mobile-provider-status ${modelReady ? 'ready' : ''}`}><span />{modelReady ? `${provider === 'ltx25' ? 'LTX‑2.5' : 'MiniMax'} 管线就绪` : `${provider === 'ltx25' ? 'LTX‑2.5 组件缺失' : 'MiniMax 组件缺失'}`}</div>
      <div className={`mobile-mode-tabs ${provider === 'minimax' ? 'three' : ''}`} role="tablist" aria-label="生成模式"><button role="tab" aria-selected={mode === 'text'} disabled={busy} onClick={() => setVideoMode('text')}><WandSparkles size={18} /><span><strong>文生视频</strong><small>描述一个镜头</small></span></button><button role="tab" aria-selected={mode === 'image'} disabled={busy} onClick={() => setVideoMode('image')}><ImageIcon size={18} /><span><strong>图生视频</strong><small>让一帧画面动起来</small></span></button>{provider === 'minimax' && <button role="tab" aria-selected={mode === 'reference'} disabled={busy} onClick={() => setVideoMode('reference')}><Sparkles size={18} /><span><strong>参考生成</strong><small>图片、视频、音频</small></span></button>}</div>
      <label className="mobile-prompt">提示词<textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="主体、动作、运镜、光线、对白与声音…" /></label>
      {characters.length > 0 && <div className="mobile-character-strip"><div className="mobile-section-head"><span><strong>角色提示</strong><small>在本镜头中使用桌面端已确认的角色形象</small></span><button onClick={() => setMobileView('characters')}>查看全部</button></div><div>{characters.map((character) => <button key={character.id} className={selectedCharacterId === character.id ? 'selected' : ''} onClick={() => applyCharacter(character)}>{character.references[0]?.preview ? <img src={character.references[0].preview} alt="" /> : <Users size={18} />}<span>{character.name}</span>{selectedCharacterId === character.id && <Check size={13} />}</button>)}</div></div>}
      <label className="no-dialogue-toggle mobile-no-dialogue"><input type="checkbox" checked={noDialogue} onChange={(event) => setNoDialogue(event.target.checked)} /><span><strong>无对白</strong><small>{noDialogue ? '仅自然环境声' : '允许对白与口型同步'}</small></span></label>
      <details className="mobile-assistant"><summary><span><Sparkles size={16} /><strong>{llmLabel} 提示词助手</strong></span><small>{llmModels.length ? `${llmModel} · 本地` : '不可用'}</small></summary><div><div className="mobile-assistant-tools"><button disabled={assisting || !prompt.trim() || !llmModels.length} onClick={() => void runAssistant('enhance')}>润色</button><button disabled={assisting || !prompt.trim() || !llmModels.length} onClick={() => void runAssistant('timeline')}>镜头时序</button><button disabled={assisting || !prompt.trim() || !llmModels.length} onClick={() => void runAssistant('audio')}>声音处理</button></div><label>说明具体修改要求<textarea value={assistantInstruction} onChange={(event) => setAssistantInstruction(event.target.value)} placeholder="让运镜更舒缓，并保持主体的面部特征…" /></label><button className="secondary-button" disabled={assisting || !prompt.trim() || !assistantInstruction.trim() || !llmModels.length} onClick={() => void runAssistant('custom')}>{assisting ? <LoaderCircle size={15} className="spin" /> : <Sparkles size={15} />}应用指令</button></div></details>
      {mode === 'image' && <div className="mobile-frame"><div className="mobile-section-head"><span><strong>首帧</strong><small>自动裁剪为所选输出尺寸</small></span>{frame && <button onClick={() => setFrame(null)} aria-label="移除首帧"><X size={16} /></button>}</div>{frame ? <><img src={frame.preview} alt="已选择的首帧" /><ImageCrop label="首帧" file={frame} resolution={resolution} onChange={setFrame} /></> : <label className="mobile-file-picker"><ImageIcon size={25} /><strong>选择图片</strong><span>PNG、JPG 或 WebP</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => chooseFrame(event.target.files?.[0])} /></label>}</div>}
      {mode === 'reference' && <MobileReferencePanel images={referenceImages} videos={referenceVideos} audios={referenceAudios} clothingPolicy={clothingPolicy} refImageSize={refImageSize} onClothingPolicy={setClothingPolicy} onRefImageSize={setRefImageSize} onAdd={chooseReferences} onRemove={(kind, index) => { const setter = kind === 'image' ? setReferenceImages : kind === 'video' ? setReferenceVideos : setReferenceAudios; setter((items) => items.filter((_, itemIndex) => itemIndex !== index)) }} onInsert={(value) => setPrompt((current) => `${current}${current.trim() ? ' ' : ''}${value}`)} />}
      <RenderSize value={resolution} onChange={setResolution} provider={provider} />
      <div className="mobile-options"><label>时长<span><input aria-label="时长" type="range" min="3" max={provider === 'ltx25' ? 10 : 15} value={renderDuration} onChange={(event) => setDuration(Number(event.target.value))} /><output>{renderDuration} 秒</output></span></label><label>渲染画质<select value={quality} onChange={(event) => setQuality(event.target.value as 'quality' | 'turbo')}><option value="turbo">{provider === 'ltx25' ? 'Turbo · 蒸馏单阶段 8' : mode === 'reference' ? 'Turbo · Ref2VA 8 步 v1.0' : '均衡 · 8 步 Turbo'}</option><option value="quality">{provider === 'ltx25' ? '画质 · 官方两阶段 8 + 3' : '画质 · 30 步'}</option></select></label></div>
      {provider === 'minimax' && <fieldset className="mobile-upscale"><legend>精修与放大</legend><div><label><input type="radio" name="mobile-upscale" checked={upscale === 'off'} onChange={() => setUpscale('off')} />关闭</label><label><input type="radio" name="mobile-upscale" checked={upscale === 'refine'} onChange={() => setUpscale('refine')} />精修 · 原分辨率</label><label><input type="radio" name="mobile-upscale" checked={upscale === 'ltx'} disabled={!ltxUpscaleReady} onChange={() => setUpscale('ltx')} />LTX 2.5 潜空间 · 2×</label><label><input type="radio" name="mobile-upscale" checked={upscale === 'rtx'} disabled={!bootstrap?.upscalers?.length} onChange={() => setUpscale('rtx')} />RTX/CUDA 逐帧 · 实验性</label></div>{upscale === 'refine' && <div className="mobile-refine-controls"><label>精修步数<input type="number" min={1} max={30} value={refineSteps} onChange={(event) => setRefineSteps(Math.max(1, Math.min(30, Math.round(Number(event.target.value)) || 1)))} /></label><label>强度 / 降噪<input type="number" min={0.01} max={1} step={0.05} value={refineDenoise} onChange={(event) => setRefineDenoise(Math.max(0.01, Math.min(1, Number(event.target.value) || 0.01)))} /></label></div>}{upscale === 'rtx' && <select aria-label="RTX 放大模型" value={rtxModel} onChange={(event) => setRtxModel(event.target.value)}>{(bootstrap?.upscalers ?? []).map((name) => <option key={name}>{name}</option>)}</select>}<small>{upscale === 'off' ? '保留 MiniMax 原生输出。' : upscale === 'refine' ? '第二轮 H3 采样在原尺寸下清理细节，保留首轮音频。' : upscale === 'ltx' ? '经验证的 LTX 视频 VAE 编码 → 学习型潜空间 2× → 解码；保留 MiniMax 原生音频。' : '逐帧处理可能放大噪点、闪烁或时序抖动。'}</small></fieldset>}
      {(livePreview || status === 'uploading' || status === 'queued' || status === 'rendering') && <section className={`mobile-live-preview ${livePreview ? '' : 'constructing'}`}><div><strong>{progressLabel}</strong><span>{progress}%</span></div>{livePreview ? <img src={livePreview} alt="当前 ComfyUI 生成预览" /> : <div><RenderConstruction /><span>{status === 'uploading' ? '正在准备输入…' : '正在构建首个预览帧…'}</span></div>}<progress max="100" value={progress}>{progress}%</progress></section>}
      {message && <div className={`mobile-message ${status}`} role="status">{status === 'uploading' || status === 'queued' || status === 'rendering' ? <LoaderCircle className="spin" size={17} /> : null}<span>{message}</span></div>}
      <div className="mobile-generate-actions">{promptId && (status === 'queued' || status === 'rendering') && <button className="mobile-cancel" onClick={() => void cancel()}><CircleStop size={18} />取消</button>}<button className="mobile-generate" disabled={busy || refreshing || !modelReady} onClick={() => void generate()}>{busy ? <LoaderCircle className="spin" size={19} /> : <Play size={19} fill="currentColor" />}{status === 'uploading' ? '正在上传输入…' : status === 'queued' ? '已在桌面端排队…' : status === 'rendering' ? `渲染中 · ${progress}%` : refreshing ? '正在连接…' : !modelReady ? '模型不可用' : `生成${mode === 'reference' ? '参考' : ''}视频`}</button></div>
    </section>}
    {mobileView === 'video' && outputUrl && <section className="mobile-output"><div><strong>你的视频</strong><span>由 {provider === 'ltx25' ? 'LTX‑2.5' : 'MiniMax H3'} 渲染</span></div><ReliableVideo src={outputUrl} controls playsInline preload="metadata" /><a href={`${outputUrl}&download=1`} download><Download size={18} />下载视频</a></section>}
    {mobileView === 'image' && <section className="mobile-create-panel mobile-image-workspace"><div className={`mobile-provider-status ${zReady ? 'ready' : ''}`}><span />{zReady ? 'Z-Image 管线就绪' : 'Z-Image 组件缺失'}</div><label className="mobile-prompt">图片提示词<textarea value={imagePrompt} onChange={(event) => setImagePrompt(event.target.value)} placeholder="主体、环境、构图、镜头、光线、色彩与质感…" /></label><button className="secondary-button mobile-image-enhance" disabled={!imagePrompt.trim() || !llmModels.length || assisting} onClick={async () => { setAssisting(true); setImageMessage('正在优化图片提示词…'); try { const result = await lanFetch<{ response: string }>('/api/lan/ollama', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: `Rewrite this as one polished Z-Image still prompt. Include composition, lens, lighting, texture, and color. Return only the final prompt.\n\n${imagePrompt}` }) }); setImagePrompt(result.response); setImageMessage('提示词已优化。') } catch (error) { setImageMessage(error instanceof Error ? error.message : String(error)) } finally { setAssisting(false) } }}><Sparkles size={16} />使用 {llmLabel} 优化</button><RenderSize value={imageResolution} onChange={setImageResolution} provider="zimage" />{imageOutput && <div className="mobile-image-result"><img src={imageOutput.url} alt="生成的 Z-Image 输出" /><div><a href={`${imageOutput.url}&download=1`} download><Download size={17} />下载</a><button onClick={() => { setFrame({ path: imageOutput.name, name: imageOutput.name, kind: 'image', preview: imageOutput.url }); setMode('image'); setMobileView('video'); setMessage('Z-Image 输出已作为首帧载入。') }}><Play size={16} />转为视频</button></div></div>}{imageMessage && <div className="mobile-message" role="status">{imageBusy && <LoaderCircle className="spin" size={17} />}<span>{imageMessage}</span></div>}<button className="mobile-generate" disabled={imageBusy || !zReady || !imagePrompt.trim()} onClick={() => void generateImage()}>{imageBusy ? <LoaderCircle className="spin" size={19} /> : <ImageIcon size={19} />}生成图片</button></section>}
    {mobileView === 'characters' && <section className="mobile-character-library">{characters.length ? characters.map((character) => <article key={character.id}><div className="mobile-character-gallery">{character.references.length ? character.references.slice(0, 4).map((reference) => <img key={reference.name} src={reference.preview} alt={`${character.name} 参考图`} />) : <div><Images size={28} /><span>暂无已确认图片</span></div>}</div><div className="mobile-character-details"><h2>{character.name}</h2><p>{character.description || '暂无形象描述。'}</p>{character.wardrobe && <small><strong>服装</strong>{character.wardrobe}</small>}{character.voiceNotes && <small><strong>声音表现</strong>{character.voiceNotes}</small>}<button onClick={() => applyCharacter(character)}><WandSparkles size={16} />用于视频提示词</button></div></article>) : <div className="mobile-library-empty"><Users size={30} /><strong>还没有已确认的角色</strong><span>先在桌面端角色工作室创建并确认角色参考，然后刷新本页面。</span></div>}</section>}
    <section className="mobile-install"><Smartphone size={20} /><span><strong>添加到主屏幕</strong><small>{window.isSecureContext ? '安装 MiniMax Mobile，获得接近应用的体验。' : '通过浏览器菜单添加快捷方式。受信任的 HTTPS 才能进行完整的 PWA 安装与离线缓存。'}</small></span>{installPrompt && <button onClick={() => { void installPrompt.prompt(); setInstallPrompt(null) }}>安装</button>}</section>
  </main>
}

function MobileReferencePanel({ images, videos, audios, clothingPolicy, refImageSize, onClothingPolicy, onRefImageSize, onAdd, onRemove, onInsert }: {
  images: MobileReference[]
  videos: MobileReference[]
  audios: MobileReference[]
  clothingPolicy: ClothingPolicy
  refImageSize: 'match' | 'max'
  onClothingPolicy(value: ClothingPolicy): void
  onRefImageSize(value: 'match' | 'max'): void
  onAdd(kind: 'image' | 'video' | 'audio', files?: FileList | null): void
  onRemove(kind: 'image' | 'video' | 'audio', index: number): void
  onInsert(value: string): void
}) {
  const groups = [
    { kind: 'image' as const, label: '图片', note: '最多 9 张', icon: ImageIcon, files: images, accept: 'image/png,image/jpeg,image/webp', multiple: true },
    { kind: 'video' as const, label: '视频', note: '最多 3 个 · 请使用 2–15 秒的片段', icon: Video, files: videos, accept: 'video/mp4,video/webm,video/quicktime', multiple: true },
    { kind: 'audio' as const, label: '音频', note: '最多 3 个', icon: Music2, files: audios, accept: 'audio/mpeg,audio/wav,audio/ogg,audio/mp4', multiple: true },
  ]
  return <section className="mobile-reference-panel" aria-label="参考素材">
    <header><span><Sparkles size={17} /></span><div><strong>参考素材</strong><small>组合身份、运动、环境与声音参考。</small></div></header>
    <div className="mobile-reference-tools" aria-label="参考提示词辅助">
      {images.map((_, index) => <button key={`p-${index}`} onClick={() => onInsert(`<Picture ${index + 1}>`)}>{`<Picture ${index + 1}>`}</button>)}
      {videos.map((_, index) => <button key={`v-${index}`} onClick={() => onInsert(`<Video ${index + 1}>`)}>{`<Video ${index + 1}>`}</button>)}
      {audios.map((_, index) => <button key={`a-${index}`} onClick={() => onInsert(`<Audio ${index + 1}>`)}>{`<Audio ${index + 1}>`}</button>)}
      <button className="template" onClick={() => onInsert('Scene: [environment]. Subject: [identity and action]. Camera: [framing and movement]. Lighting: [source and mood]. Sound: [ambience and effects]. Continuity: preserve identities, wardrobe, geometry, and direction across the full shot.')}>插入模板</button>
    </div>
    {groups.map(({ kind, label, note, icon: Icon, files, accept, multiple }) => <div className={`mobile-reference-group ${kind}`} key={kind}>
      <div className="mobile-section-head"><Icon size={18} /><span><strong>{label}</strong><small>{note}</small></span><label className="mobile-reference-add"><Plus size={15} /><span>添加</span><input type="file" accept={accept} multiple={multiple} onChange={(event) => { onAdd(kind, event.target.files); event.currentTarget.value = '' }} /></label></div>
      {files.length > 0 ? <div className="mobile-reference-list">{files.map((file, index) => <div key={`${file.name}-${index}`}>{kind === 'image' && file.preview ? <img src={file.preview} alt="" /> : <Icon size={19} />}<span><strong>{kind === 'image' ? `图片 ${index + 1}` : kind === 'video' ? `视频 ${index + 1}` : `音频 ${index + 1}`}</strong><small>{file.name}</small></span><button aria-label={`移除 ${file.name}`} onClick={() => onRemove(kind, index)}><X size={15} /></button></div>)}</div> : <p>尚未添加{label}。</p>}
    </div>)}
    <fieldset className="mobile-reference-choice"><legend>服装意图</legend><label className={clothingPolicy === 'assigned' ? 'selected' : ''}><input type="radio" name="mobile-clothing" checked={clothingPolicy === 'assigned'} onChange={() => onClothingPolicy('assigned')} /><span><strong>指定服装</strong><small>以已确认的服装参考为准。</small></span></label><label className={clothingPolicy === 'underwear' ? 'selected' : ''}><input type="radio" name="mobile-clothing" checked={clothingPolicy === 'underwear'} onChange={() => onClothingPolicy('underwear')} /><span><strong>内衣</strong><small>保留成年角色的身份参考，不附加外层服装。</small></span></label><label className={clothingPolicy === 'unrestricted' ? 'selected' : ''}><input type="radio" name="mobile-clothing" checked={clothingPolicy === 'unrestricted'} onChange={() => onClothingPolicy('unrestricted')} /><span><strong>不受限</strong><small>遵循提示词中明确的成年虚构服装描述。</small></span></label></fieldset>
    <fieldset className="mobile-reference-choice two"><legend>参考图保真度</legend><label className={refImageSize === 'match' ? 'selected' : ''}><input type="radio" name="mobile-fidelity" checked={refImageSize === 'match'} onChange={() => onRefImageSize('match')} /><span><strong>均衡</strong><small>让参考图适应输出画布。</small></span></label><label className={refImageSize === 'max' ? 'selected' : ''}><input type="radio" name="mobile-fidelity" checked={refImageSize === 'max'} onChange={() => onRefImageSize('max')} /><span><strong>最大身份保留</strong><small>保留更多源画面细节。</small></span></label></fieldset>
  </section>
}

const previewModels: ModelFile[] = [
  { name: 'minimax_h3_fl2va_preview.safetensors', path: '', kind: 'diffusion_models', bytes: 1 },
  { name: 'minimax_h3_ref2va_preview.safetensors', path: '', kind: 'diffusion_models', bytes: 1 },
  { name: 'qwen3vl_32b_minimax_h3_preview.safetensors', path: '', kind: 'text_encoders', bytes: 1 },
  { name: 'minimax_h3_video_vae_preview.safetensors', path: '', kind: 'vae', bytes: 1 },
  { name: 'minimax_h3_audio_vae_preview.safetensors', path: '', kind: 'vae', bytes: 1 },
  { name: 'minimax_h3_fl2v_turbo_8step_preview.safetensors', path: '', kind: 'loras', bytes: 1 },
  { name: 'minimax_h3_ref2v_turbo_8step_v1.0_768p_comfyui_bf16.safetensors', path: '', kind: 'loras', bytes: 1 },
  { name: 'ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors', path: '', kind: 'diffusion_models', bytes: 1 },
  { name: 'gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors', path: '', kind: 'text_encoders', bytes: 1 },
  { name: 'ltx-2.5-video-vae-bf16.safetensors', path: '', kind: 'vae', bytes: 1 },
  { name: 'ltx-2.5-audio-vae-bf16.safetensors', path: '', kind: 'vae', bytes: 1 },
  { name: 'z_image_turbo_bf16.safetensors', path: '', kind: 'diffusion_models', bytes: 1 },
  { name: 'qwen_3_4b.safetensors', path: '', kind: 'text_encoders', bytes: 1 },
  { name: 'ae.safetensors', path: '', kind: 'vae', bytes: 1 },
]

const previewCharacters: MobileCharacter[] = [
  { id: 'preview-anna', name: 'Anna', description: '镜头主角，深色长发，形象稳定中性。', wardrobe: '红色碎花外套、浅色牛仔裤、黄色鞋子。', voiceNotes: '自信、温暖、语速从容。', visualStyle: 'cinematic photorealism', references: [{ name: 'anna-front.png', preview: 'data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22240%22 height=%22320%22%3E%3Crect width=%22240%22 height=%22320%22 fill=%22%231a211d%22/%3E%3Ccircle cx=%22120%22 cy=%2290%22 r=%2242%22 fill=%22%238db8ff%22/%3E%3Cpath d=%22M55 280 Q65 150 120 145 Q175 150 185 280%22 fill=%22%23354b68%22/%3E%3C/svg%3E' }] },
]
