import { PreviewPanel, ProductionLoading } from './Workspace'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, Check, CircleStop, Dices, Film, Gauge, ImagePlus, LoaderCircle, Sparkles, WandSparkles } from 'lucide-react'
import {
  buildH3Image, clampH3ImageResolution, h3ImageTierAttribution, h3ImageTierReady, H3_IMAGE_TIERS,
  isH3Fl2vaModel, isH3ImageModel, resolveH3ImageTier, type H3ImageEngineSignals, type H3ImageTier,
} from '../lib/h3Image'
import { buildImageJob } from '../lib/jobPresentation'
import { choices, hasInput, type ObjectInfo } from '../lib/comfyInfo'
import { RenderSize } from './RenderSize'
import { SmartPromptEditor } from './SmartPromptEditor'
import type { GenerationJob, MediaFile, WorkflowGpuRouting } from '../types'
import { useLivePreview, type LiveProgress } from '../lib/useLivePreview'
import { useEngineSelection } from '../lib/engine/useEngineSelection'
import { mmh3ImageRequest, mmh3OutputName, waitForMmh3Task } from '../lib/engine/mmh3Task'
import type { EngineConfig } from '../lib/engine/engines'
import { EngineSelector } from './EngineSelector'

type StoredWorkspace = {
  prompt: string
  resolution: string
  // A persisted tier is always treated as an explicit override (decision 11):
  // the auto rule only re-claims control once the stored tier became unusable.
  tierOverride: H3ImageTier | null
  model: string
  encoder: string
  vae: string
  lora: string
  seed: number
  livePreview: boolean
}

const defaults: StoredWorkspace = {
  prompt: '',
  resolution: '1344x768',
  tierOverride: null,
  model: H3_IMAGE_TIERS.dedicated.model,
  encoder: H3_IMAGE_TIERS.dedicated.encoder,
  vae: H3_IMAGE_TIERS.dedicated.vae,
  lora: H3_IMAGE_TIERS.fl2va.lora ?? '',
  seed: Math.floor(Math.random() * 1_000_000_000),
  livePreview: true,
}

function readWorkspace(): StoredWorkspace {
  try {
    const saved = JSON.parse(localStorage.getItem('minimax.h3image-workspace') ?? '{}') as Partial<StoredWorkspace & { tier?: H3ImageTier }>
    // Older shapes stored a plain tier; both values migrate to explicit
    // overrides so nobody's past choice is silently reverted (decision 11).
    const tierOverride: H3ImageTier | null = saved.tierOverride === 'fl2va' || saved.tierOverride === 'dedicated'
      ? saved.tierOverride
      : saved.tier === 'fl2va' || saved.tier === 'dedicated' ? saved.tier : null
    const base: StoredWorkspace = { ...defaults, ...saved, tierOverride }
    return { ...base, model: base.model || defaults.model, encoder: base.encoder || defaults.encoder, vae: base.vae || defaults.vae, lora: base.lora || defaults.lora }
  }
  catch { return defaults }
}

type H3ImageJob = { id: string; url: string; resolution: string; prompt: string; tier: H3ImageTier }
type Mmh3ImageJob = { id: string; baseUrl: string; engineId: string; tier: H3ImageTier; prompt: string; resolution: string; width: number; height: number }
type HistoryEntry = {
  status?: { status_str?: string }
  outputs?: Record<string, { images?: Array<{ filename: string; subfolder?: string; type?: string }> }>
}

// ComfyUI only records a prompt in its history once it ran, so a job that is
// neither in the history nor in the queue was dropped by the engine.
async function isJobQueued(job: H3ImageJob) {
  try {
    const queue = await window.minimax.getQueue(job.url) as { queue_running?: unknown[]; queue_pending?: unknown[] }
    return [...(queue.queue_running ?? []), ...(queue.queue_pending ?? [])].some((item) => Array.isArray(item) && item[1] === job.id)
  } catch { return true }
}

export function H3ImageWorkspace({
  url, info, connected, ollamaAvailable, llmProvider, ollamaUrl, ollamaModel, outputDirectory, gpuRouting, engines, activeEngineId, onUse, onUseLtx, onRegisterJob,
}: {
  url: string
  info: ObjectInfo
  connected: boolean
  ollamaAvailable: boolean
  llmProvider: 'ollama' | 'lmstudio'
  ollamaUrl: string
  ollamaModel: string
  outputDirectory: string
  gpuRouting?: WorkflowGpuRouting
  engines?: EngineConfig[]
  activeEngineId?: string
  onUse(file: MediaFile, resolution: string): void
  onUseLtx(file: MediaFile): void
  onRegisterJob?(job: GenerationJob): void
}) {
  const initial = useMemo(readWorkspace, [])
  const [prompt, setPrompt] = useState(initial.prompt)
  const [resolution, setResolution] = useState(initial.resolution)
  const [tierOverride, setTierOverride] = useState<H3ImageTier | null>(initial.tierOverride)
  const [tier, setTier] = useState<H3ImageTier>(initial.tierOverride ?? 'dedicated')
  const [model, setModel] = useState(initial.model)
  const [encoder, setEncoder] = useState(initial.encoder)
  const [vae, setVae] = useState(initial.vae)
  const [lora, setLora] = useState(initial.lora)
  const [seed, setSeed] = useState(initial.seed)
  const [livePreview, setLivePreview] = useState(initial.livePreview)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [job, setJob] = useState<H3ImageJob | null>(null)
  const [result, setResult] = useState<{ file: MediaFile; resolution: string; tier: H3ImageTier } | null>(null)
  const [busy, setBusy] = useState(false)
  const [assisting, setAssisting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState(false)
  const jobRef = useRef<H3ImageJob | null>(null)
  const [liveProgress, setLiveProgress] = useState<LiveProgress | null>(null)
  const liveProgressRef = useRef<LiveProgress | null>(null)
  const onLiveProgress = useCallback((id: string, update: LiveProgress) => {
    if (jobRef.current?.id === id) { liveProgressRef.current = update; setLiveProgress(update) }
  }, [])
  const live = useLivePreview(url, connected, onLiveProgress)
  // The image workspace may render on the mmh3 engine instead of ComfyUI.
  const mmh3 = useEngineSelection('davai_h3_image_engine', { engines, activeEngineId, comfyUrl: url }, { comfyConnected: connected })
  // The job remembers what it was submitted with, so that editing the prompt or
  // the tier while it renders does not restart the poll and lose the picture.
  const [mmh3Job, setMmh3Job] = useState<Mmh3ImageJob | null>(null)
  const mmh3Abort = useRef<AbortController | null>(null)
  const noteMmh3Failure = mmh3.noteFailure

  const updateJob = useCallback((next: H3ImageJob | null) => {
    jobRef.current = next
    setJob(next)
  }, [])

  // Keep the registration callback out of the polling effect's dependencies: App
  // re-renders while a render is in flight, and a changing callback identity would
  // reset the 2s poll timer and the saved image would never be picked up.
  const registerJobRef = useRef(onRegisterJob)
  useEffect(() => { registerJobRef.current = onRegisterJob }, [onRegisterJob])

  // The Studio helper still sends its still-image prompt to the Z-Image
  // workspace (stage one keeps that path untouched), so this workspace must not
  // listen to the shared event: otherwise it would silently steal the prompt
  // from Z-Image while staying hidden.
  useEffect(() => {
    localStorage.setItem('minimax.h3image-workspace', JSON.stringify({ prompt, resolution, tierOverride, tier, model, encoder, vae, lora, seed, livePreview }))
  }, [encoder, livePreview, lora, model, prompt, resolution, seed, tier, tierOverride, vae])

  useEffect(() => {
    if (!job) return
    let disposed = false
    let timer: ReturnType<typeof setTimeout>
    let missingPolls = 0
    let completedWithoutOutputPolls = 0
    const poll = async () => {
      try {
        const history = await window.minimax.getHistory(job.url, job.id)
        const entry = history[job.id] as HistoryEntry | undefined
        if (entry?.status?.status_str === 'error') throw new Error('H3-Image 运行失败。请检查所选组件与 ComfyUI 日志。')
        // Only the SaveImage node (15) writes a stable output file. The preview
        // node (16) leaves a temporary frame in ComfyUI's temp folder, so it
        // must never be mistaken for the production result: keep polling until
        // the saved image appears.
        const image = entry?.outputs?.['15']?.images?.[0]
        if (image) {
          const preview = await window.minimax.getOutputImage(job.url, image)
          const saved = await window.minimax.saveComfyOutputImage(job.url, image, outputDirectory, 'image-creation')
          // Resolve the short URL before the state update below: registerJob is
          // the App-level callback and stays valid across this workspace's
          // teardown, but updateJob(null) re-runs this effect's cleanup, so
          // anything deferred behind a `disposed` check would be dropped.
          const outputUrl = await window.minimax.mediaUrl(saved.path).catch(() => null)
          if (!disposed) {
            setResult({ file: { ...saved, preview, kind: 'image' }, resolution: job.resolution, tier: job.tier })
            updateJob(null); setBusy(false); setError(false); liveProgressRef.current = null; setLiveProgress(null); setMessage('图片已生成，可以使用。')
            const [width, height] = job.resolution.split('x').map(Number)
            if (outputUrl) registerJobRef.current?.(buildImageJob({ provider: 'h3image', promptId: job.id, prompt: job.prompt, width, height, outputUrl, localOutputPath: saved.path }))
          }
          return
        }
        if (entry?.status?.status_str === 'success') {
          completedWithoutOutputPolls += 1
          if (completedWithoutOutputPolls > 2) throw new Error('ComfyUI 已完成 H3-Image，但没有返回保存的图片。请检查 SaveImage 节点与 ComfyUI 日志。')
          if (!disposed) setMessage('ComfyUI 已完成；正在收集保存的图片…')
        } else if (!disposed) {
          // A job the engine no longer knows about — a restarted ComfyUI or a
          // cleared queue — must not leave the workspace waiting forever.
          missingPolls = entry ? 0 : missingPolls + 1
          if (missingPolls > 4 && !(await isJobQueued(job))) throw new Error('引擎已重启或队列被清空，本次渲染没有结果。请重新生成。')
          if (!disposed) setMessage(liveProgressRef.current?.label ?? '正在 ComfyUI 中渲染图片…')
        }
      } catch (caught) {
        if (!disposed) { setMessage(caught instanceof Error ? caught.message : String(caught)); setError(true); setBusy(false); liveProgressRef.current = null; setLiveProgress(null); updateJob(null) }
        return
      }
      if (!disposed) timer = setTimeout(poll, 2000)
    }
    void poll()
    return () => { disposed = true; clearTimeout(timer) }
  }, [job, outputDirectory, updateJob])

  // Single readiness source (A4): object_info choices plus the 0.45 node gate,
  // shared by the badges, the status line, the generate gate and auto selection.
  const signals: H3ImageEngineSignals = useMemo(() => ({
    models: choices(info, 'UNETLoader', 'unet_name'),
    encoders: choices(info, 'CLIPLoader', 'clip_name'),
    vaes: choices(info, 'VAELoader', 'vae_name'),
    loras: choices(info, 'LoraLoaderModelOnly', 'lora_name'),
    dedicatedNodeReady: hasInput(info, 'MiniMaxH3ImageConditioning', 'prompt'),
  }), [info])
  const dedicatedReady = h3ImageTierReady('dedicated', signals)
  const fl2vaReady = h3ImageTierReady('fl2va', signals)

  // Auto selection only re-evaluates on a connected engine with fresh signals
  // (A3): a restart leaves info briefly empty, and re-running auto on that would
  // flip the tier and trigger an irreversible resolution clamp.
  const engineUsable = connected && signals.models.length > 0
  const applyTier = useCallback((next: H3ImageTier) => {
    setTier(next)
    const spec = H3_IMAGE_TIERS[next]
    setModel(spec.model)
    setEncoder(spec.encoder)
    setVae(spec.vae)
    setLora(spec.lora ?? '')
  }, [])
  useEffect(() => {
    if (!engineUsable || busy) return
    const resolved = resolveH3ImageTier(signals)
    if (tierOverride) {
      // A persisted override is respected while usable; once its stack
      // disappears we fall back silently, without discarding it for future
      // sessions.
      if (h3ImageTierReady(tierOverride, signals) || resolved.tier === tier) return
    } else if (resolved.tier === tier) return
    applyTier(resolved.tier)
    // Startup/resume path (A2): a stored size above the new tier's cap clamps
    // to the same-ratio rung, so the size select never renders a bare value.
    const clamped = clampH3ImageResolution(resolved.tier, resolution)
    if (clamped !== resolution) setResolution(clamped)
  }, [applyTier, busy, engineUsable, resolution, signals, tier, tierOverride])

  // The dedicated route needs the ComfyUI 0.45 conditioning node; without it the
  // engine answers with an "unknown node type" error, so we gate it up front.
  const modelMatchesTier = tier === 'dedicated' ? isH3ImageModel(model) : isH3Fl2vaModel(model)
  const tierReady = h3ImageTierReady(tier, signals)
  const modelSelected = signals.models.includes(model)
  const available = modelSelected && modelMatchesTier
    && signals.encoders.includes(encoder)
    && signals.vaes.includes(vae)
    && (tier === 'fl2va' ? Boolean(lora) && signals.loras.includes(lora) : true)
    && tierReady

  const switchTier = (next: H3ImageTier) => {
    if (busy || next === tier) return
    applyTier(next)
    setTierOverride(next)
    const clamped = clampH3ImageResolution(next, resolution)
    if (clamped !== resolution) {
      setResolution(clamped)
      setMessage(`已切换到${H3_IMAGE_TIERS[next].label}；画幅超出该档位上限，已调整到 ${clamped.replace('x', ' × ')}。`)
    } else {
      setMessage(next === 'dedicated' ? '已选择 H3-Image 专用模型：官方 6 步，可直出 4K。' : '已选择 H3 视频同款模型：复用视频权重，零新增下载。')
    }
    setError(false)
  }

  const autoTier = !tierOverride && engineUsable ? resolveH3ImageTier(signals).tier : null
  // B3: when a persisted override lost its stack and auto moved on, say so
  // instead of presenting the fallback as if it were the user's choice.
  const fallbackFromOverride = tierOverride !== null && tierOverride !== tier && !h3ImageTierReady(tierOverride, signals)
  const statusLine = !connected
    ? '引擎离线'
    : fallbackFromOverride && tierOverride !== null
      ? `已按手动选择尝试${H3_IMAGE_TIERS[tierOverride].label}，因缺${tierOverride === 'dedicated' ? '专用模型或 ComfyUI 0.45 节点' : '视频权重或 Turbo LoRA'}临时使用${H3_IMAGE_TIERS[tier].label}`
      : !tierReady && engineUsable
        ? (tier === 'dedicated'
          ? (signals.dedicatedNodeReady ? '未检测到专用模型权重' : '当前 ComfyUI 缺少 0.45 的专用模型节点')
          : '未检测到视频同款权重')
        : `当前：${H3_IMAGE_TIERS[tier].label} · ${tier === 'dedicated' ? '官方 6 步 · 最高 16MP' : '8 步 · 最高 2048'}${!tierOverride && engineUsable ? ' · 自动选择' : ''}${autoTier === tier && tier === 'fl2va' && !dedicatedReady ? '（未检测到专用模型）' : ''}`

  const fields = tier === 'dedicated'
    ? [
      { label: 'H3-Image 模型', value: model, set: setModel, node: 'UNETLoader', field: 'unet_name' },
      { label: '文本编码器', value: encoder, set: setEncoder, node: 'CLIPLoader', field: 'clip_name' },
      { label: '图像 VAE', value: vae, set: setVae, node: 'VAELoader', field: 'vae_name' },
    ]
    : [
      { label: 'H3 视频 DiT', value: model, set: setModel, node: 'UNETLoader', field: 'unet_name' },
      { label: '文本编码器', value: encoder, set: setEncoder, node: 'CLIPLoader', field: 'clip_name' },
      { label: '视频 VAE', value: vae, set: setVae, node: 'VAELoader', field: 'vae_name' },
      { label: 'Turbo 8 步 LoRA', value: lora, set: setLora, node: 'LoraLoaderModelOnly', field: 'lora_name' },
    ]

  // The mmh3 route keeps its own poll: the server owns the queue and reports
  // its own steps, and the picture only exists once it has been written here.
  useEffect(() => {
    if (!mmh3Job) return
    let disposed = false
    const controller = new AbortController()
    mmh3Abort.current = controller
    void (async () => {
      try {
        const finished = await waitForMmh3Task(mmh3Job.baseUrl, mmh3Job.id, (update) => {
          if (disposed) return
          setMessage(update.state === 'queued'
            ? `排队中（前面还有 ${update.ahead} 个）`
            : update.state === 'running'
              ? `mmh3 正在渲染 · 第 ${update.step ?? 0} / ${update.steps ?? '?'} 步`
              : '')
        }, controller.signal)
        if (disposed) return
        if (finished.state === 'failed') throw new Error(finished.error?.trim() || 'mmh3 图片生成失败。')
        const downloaded = await window.minimax.mmh3Download(mmh3Job.baseUrl, mmh3Job.id, 'image', outputDirectory, mmh3OutputName('image', mmh3Job.prompt))
        const outputUrl = await window.minimax.mediaUrl(downloaded.path)
        setResult({ file: { path: downloaded.path, name: downloaded.name, preview: outputUrl, kind: 'image' }, resolution: mmh3Job.resolution, tier: mmh3Job.tier })
        updateJob(null); setBusy(false); setError(false); liveProgressRef.current = null; setLiveProgress(null); setMessage('图片已生成，可以使用。')
        registerJobRef.current?.(buildImageJob({ provider: 'h3image', promptId: mmh3Job.id, prompt: mmh3Job.prompt, width: mmh3Job.width, height: mmh3Job.height, outputUrl, localOutputPath: downloaded.path, engineId: mmh3Job.engineId }))
        await window.minimax.mmh3Delete(mmh3Job.baseUrl, mmh3Job.id).catch(() => undefined)
      } catch (caught) {
        if (disposed) return
        const message = caught instanceof Error ? caught.message : String(caught)
        noteMmh3Failure(mmh3Job.engineId, message)
        setMessage(message); setError(true); setBusy(false); updateJob(null)
      }
    })()
    return () => { disposed = true; controller.abort(); mmh3Abort.current = null }
  }, [mmh3Job, outputDirectory, updateJob, noteMmh3Failure])

  const create = async () => {
    if (mmh3.engine.kind === 'mmh3') {
      if (!prompt.trim()) return
      setBusy(true); setResult(null); setError(false); liveProgressRef.current = null; setLiveProgress(null)
      setMessage('正在向 mmh3 提交图片任务…')
      try {
        const warning = await mmh3.prepareSubmit()
        if (warning) setMessage(warning)
        const [width, height] = resolution.split('x').map(Number)
        const request = mmh3ImageRequest({ engine: mmh3.engine, prompt: prompt.trim(), width, height, steps: 6, seed })
        const submitted = await window.minimax.mmh3SubmitImage(request.baseUrl, request.fields, request.files)
        if (!submitted.id) throw new Error('mmh3 没有返回任务 ID。')
        setMmh3Job({ id: submitted.id, baseUrl: request.baseUrl, engineId: mmh3.engine.id, tier, prompt: prompt.trim(), resolution, width, height })
        setMessage('mmh3 已接收任务，正在渲染…')
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : String(caught)
        noteMmh3Failure(mmh3.engine.id, message)
        setMessage(message); setError(true); setBusy(false)
      }
      return
    }
    if (!connected || !available || !prompt.trim()) return
    setBusy(true); setResult(null); setError(false); liveProgressRef.current = null; setLiveProgress(null); setMessage(`正在提交${H3_IMAGE_TIERS[tier].label}工作流…`)
    try {
      const [width, height] = resolution.split('x').map(Number)
      const graph = buildH3Image(prompt.trim(), width, height, seed, { model, encoder, vae, lora: tier === 'fl2va' ? lora : undefined }, tier, H3_IMAGE_TIERS[tier].steps, livePreview, gpuRouting)
      const response = await window.minimax.submitPrompt(url, graph, live.clientId)
      live.registerWorkflow(response.prompt_id, graph, livePreview)
      if (gpuRouting) console.info('[GPU Routing] H3-Image component routing enabled.', gpuRouting)
      updateJob({ id: response.prompt_id, url, resolution, prompt: prompt.trim(), tier })
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : String(caught)); setError(true); setBusy(false)
    }
  }

  const cancel = async () => {
    if (mmh3Job) {
      // mmh3 cannot interrupt a generation that is already running: the card
      // turns cancelled and the artifact is dropped when the server is done.
      mmh3Abort.current?.abort()
      mmh3Abort.current = null
      setMmh3Job(null)
      setBusy(false); setError(false)
      setMessage('mmh3 无法中断运行中的生成，仍在占用 GPU；产物会被丢弃，不会入库。')
      return
    }
    if (!job) return
    try {
      await window.minimax.cancelPrompt(job.url, job.id)
      setMessage('已取消图片生成。'); setError(false)
    } catch (caught) {
      setMessage(`无法取消：${caught instanceof Error ? caught.message : String(caught)}`); setError(true)
    } finally { updateJob(null); setBusy(false); liveProgressRef.current = null; setLiveProgress(null) }
  }

  const enhance = async () => {
    if (!ollamaAvailable || !prompt.trim() || assisting) return
    setAssisting(true); setError(false); setMessage('正在询问本地提示词助手…')
    try {
      const instruction = `Rewrite this as one polished still-image prompt for the MiniMax H3-Image model. Preserve the subject and intent while improving composition, lens, lighting, environment, texture, color, and clarity. If the prompt contains Chinese text to render, keep every character exactly as written. Do not describe motion, sound, timelines, or multiple shots. Return only the finished prompt.\n\nDRAFT:\n${prompt.trim()}`
      setPrompt(await window.minimax.generateWithOllama(ollamaUrl, ollamaModel, instruction, llmProvider))
      setMessage('提示词已在本地润色。生成前请先检查。')
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : String(caught)); setError(true) }
    finally { setAssisting(false) }
  }

  const visibleLivePreview = livePreview && busy && job && live.preview?.promptId === job.id ? live.preview : null
  const onMmh3 = mmh3.engine.kind === 'mmh3'
  const engineReady = onMmh3 ? mmh3.engineHealth?.state !== 'offline' : connected && available
  const generateDisabled = onMmh3 ? busy || !prompt.trim() || mmh3.engineHealth?.state === 'offline' : busy || !connected || !available || !prompt.trim()

  return <div className="standard-page h3image-workspace">
    <div className="page-heading">
      <div><p className="eyebrow">创作 · H3‑IMAGE</p><h1>图片 · H3-Image</h1><p>生成可直接发往 H3 与 LTX 视频的静帧；推荐使用 MiniMax 官方 H3-Image 模型。</p><p className="h3image-attribution">{result ? h3ImageTierAttribution(result.tier) : h3ImageTierAttribution(tier)}</p></div>
      <div className="heading-state"><span className={onMmh3 ? (engineReady ? 'ok' : 'warn') : (connected ? (available ? 'ok' : 'warn') : 'warn')}>{onMmh3 ? engineReady ? <Check size={15} /> : <AlertCircle size={15} /> : connected ? available ? <Check size={15} /> : <AlertCircle size={15} /> : <AlertCircle size={15} />}{onMmh3 ? (engineReady ? 'mmh3 就绪' : 'mmh3 不可用') : connected ? available ? '模型就绪' : !tierReady ? '需要模型或 0.45' : '需要选择模型' : '引擎离线'}</span></div>
    </div>

    <div className="zimage-workspace-grid">
      <section className="zimage-composer">
        <div className="field-group h3image-engine-status"><span className="field-label"><label>渲染引擎</label></span><EngineSelector engines={mmh3.engines} engineId={mmh3.engineId} health={mmh3.health} checking={mmh3.checking} onChange={mmh3.setEngineId} />{onMmh3 && <small className="field-help" role="status" aria-live="polite">mmh3 用自己的生图配方渲染，与 ComfyUI 的输出不等价；实时预览帧在 mmh3 上不可用。</small>}</div>
        <div className="field-group h3image-engine-status"><span className="field-label"><label>模型来源</label></span><p className="field-help">{statusLine}</p>{(!tierOverride || available) && <button className="text-button" onClick={() => {
          setAdvancedOpen(true)
          document.getElementById('h3image-advanced')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }}>在高级选项中切换</button>}</div>
        <div className="field-group">
          <div className="field-label"><label htmlFor="h3image-prompt">图片提示词</label><span>{prompt.length.toLocaleString()} 字符</span></div>
          <SmartPromptEditor id="h3image-prompt" value={prompt} onChange={setPrompt} placeholder="描述主体、环境、构图、镜头、光线、色彩与需要渲染的中文文字…输入 // 可使用制作指令。" disabled={busy} />
          <div className="zimage-prompt-actions"><button className="secondary-button" onClick={() => void enhance()} disabled={busy || assisting || !ollamaAvailable || !prompt.trim()} title={ollamaAvailable ? `用 ${ollamaModel} 润色` : '请在设置中配置本地 AI 助手'}>{assisting ? <LoaderCircle size={15} className="spin" /> : <WandSparkles size={15} />}用 {llmProvider === 'lmstudio' ? 'LM Studio' : 'Ollama'} 润色</button><small>{ollamaAvailable ? `${ollamaModel} · 本地` : `${llmProvider === 'lmstudio' ? 'LM Studio' : 'Ollama'} 不可用`}</small></div>
        </div>

        <RenderSize value={resolution} onChange={setResolution} provider="h3image" h3ImageTier={tier} />
        <div className="field-group"><label className="video-checkbox"><input type="checkbox" checked={livePreview} onChange={(event) => setLivePreview(event.target.checked)} />生成时显示实时预览</label><small className="field-help">关闭后新渲染不再输出预览。进度与保存的图片仍可查看。</small></div>
        <div className="zimage-seed-row"><label>种子<input type="number" min="0" max="999999999999" value={seed} disabled={busy} onChange={(event) => setSeed(Number(event.target.value))} /></label><button className="secondary-button" disabled={busy} onClick={() => setSeed(Math.floor(Math.random() * 1_000_000_000))}><Dices size={15} />随机</button></div>

        <details className="zimage-model-settings" open={advancedOpen} id="h3image-advanced">
          <summary>模型组件 <small>高级</small></summary>
          <fieldset className="zimage-mode-picker" disabled={busy}>
            <legend>模型来源</legend>
            <label className={tier === 'dedicated' ? 'selected' : ''}><input type="radio" name="h3image-tier" checked={tier === 'dedicated'} onChange={() => switchTier('dedicated')} /><Sparkles size={18} /><span><strong>{H3_IMAGE_TIERS.dedicated.label}</strong><small>{H3_IMAGE_TIERS.dedicated.summary}</small></span><em className={dedicatedReady ? 'installed' : ''}>{dedicatedReady ? '已安装' : '需要模型'}</em></label>
            <label className={tier === 'fl2va' ? 'selected' : ''}><input type="radio" name="h3image-tier" checked={tier === 'fl2va'} onChange={() => switchTier('fl2va')} /><Gauge size={18} /><span><strong>{H3_IMAGE_TIERS.fl2va.label}</strong><small>{H3_IMAGE_TIERS.fl2va.summary}</small></span><em className={fl2vaReady ? 'installed' : ''}>{fl2vaReady ? '已安装' : '需要模型'}</em></label>
          </fieldset>
          <p className="field-help">{H3_IMAGE_TIERS[tier].detail}</p>
          {tierOverride === 'fl2va' && dedicatedReady && <p className="field-help">已手动选择视频同款，但专用模型已就绪：它更快、可直出 4K。</p>}
          <div className="zimage-models">{fields.map((field) => <label key={field.label}>{field.label}<select value={field.value} disabled={busy} onChange={(event) => field.set(event.target.value)}>{!choices(info, field.node, field.field).includes(field.value) && <option value={field.value}>{field.value} · 不可用</option>}{choices(info, field.node, field.field).map((name) => <option key={name}>{name}</option>)}</select></label>)}</div>
          {!available && <p className="field-help">{!engineUsable ? '引擎离线或尚未加载模型清单。' : !tierReady ? (tier === 'dedicated' ? (signals.dedicatedNodeReady ? '请在 ComfyUI 中安装 H3-Image DiT 与图像 VAE（文本编码器与视频共用）。' : '当前 ComfyUI 缺少 MiniMaxH3ImageConditioning 节点，请升级到 0.45 或更高版本后使用 H3-Image 专用模型；「H3 视频同款模型」无需该节点。') : `请在 ComfyUI 中安装 H3 视频 DiT、视频 VAE、文本编码器与 Turbo 8 步 LoRA。`) : '请选择 ComfyUI 中已注册、与之匹配的模型文件。'}</p>}
        </details>

        {message && <div className={`zimage-message ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'}>{busy && <LoaderCircle size={16} className="spin" />}<span>{message}</span></div>}
        <div className="zimage-generate-bar">{busy && <button className="danger-button" onClick={() => void cancel()}><CircleStop size={16} />取消</button>}<button className="primary-button" disabled={generateDisabled} onClick={() => void create()}>{busy ? <LoaderCircle size={18} className="spin" /> : <Sparkles size={18} />}{busy ? '正在生成图片…' : '生成图片'}</button></div>
      </section>

      <PreviewPanel>
        <div className="panel-heading"><div><span>输出</span><strong>图片预览</strong></div>{result && <span className="zimage-complete"><Check size={13} />就绪</span>}</div>
        <div className="zimage-preview-stage">{result?.file.preview ? <img src={result.file.preview} alt="生成的 H3-Image 成果" /> : visibleLivePreview ? <figure className="live-preview zimage-live-preview"><img src={visibleLivePreview.url} alt="H3-Image 采样实时预览" /><figcaption>采样实时预览{visibleLivePreview.step && visibleLivePreview.totalSteps ? ` · 第 ${visibleLivePreview.step} 步，共 ${visibleLivePreview.totalSteps} 步` : ''}</figcaption></figure> : busy ? <div className="render-state"><ProductionLoading label={liveProgress?.label || '正在准备图片条件'} /><strong>正在生成你的图片</strong><span>{liveProgress?.label ?? `${resolution.replace('x', ' × ')} · ${livePreview ? '等待实时预览' : '渲染中（无实时预览）'}`}</span></div> : <div className="empty-preview"><div className="preview-icon"><ImagePlus size={28} /></div><strong>你的图片会显示在这里</strong><span>描述画面、选择画幅，然后在本地生成。</span></div>}</div>
        <div className="zimage-preview-actions"><span>{result ? `${result.file.name} · ${result.resolution.replace('x', ' × ')}` : '生成后保存到 ComfyUI · MiniMax_first_frames，并留存到 App · Created Images'}</span><div><button className="secondary-button" disabled={!result} onClick={() => result && onUse(result.file, result.resolution)}><ImagePlus size={16} />发送到 MiniMax I2V</button><button className="primary-button" disabled={!result} onClick={() => result && onUseLtx(result.file)} title="载入保留身份特征的 LTX 图生视频提示词"><Film size={16} />发送到 LTX 2.5</button></div></div>
      </PreviewPanel>
    </div>
  </div>
}
