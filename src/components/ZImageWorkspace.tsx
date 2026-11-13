import { PreviewPanel, ProductionLoading } from './Workspace'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, Check, CircleStop, Dices, Film, Gauge, ImagePlus, LoaderCircle, Sparkles, WandSparkles } from 'lucide-react'
import { buildZImage, ZIMAGE_DEFAULT_NEGATIVE_PROMPT, type ZImageVariant } from '../lib/zimage'
import { choices, type ObjectInfo } from '../lib/comfyInfo'
import { RenderSize } from './RenderSize'
import { SmartPromptEditor } from './SmartPromptEditor'
import type { MediaFile, WorkflowGpuRouting } from '../types'
import { useLivePreview, type LiveProgress } from '../lib/useLivePreview'

type StoredWorkspace = {
  prompt: string
  negativePrompt: string
  negativePromptInitialized: boolean
  resolution: string
  variant: ZImageVariant
  model: string
  encoder: string
  vae: string
  seed: number
  steps: number
  guidance: number
  livePreview: boolean
}

const defaults: StoredWorkspace = {
  prompt: '',
  negativePrompt: ZIMAGE_DEFAULT_NEGATIVE_PROMPT,
  negativePromptInitialized: true,
  resolution: '1344x768',
  variant: 'turbo',
  model: 'z_image_turbo_bf16.safetensors',
  encoder: 'qwen_3_4b.safetensors',
  vae: 'ae.safetensors',
  seed: Math.floor(Math.random() * 1_000_000_000),
  steps: 8,
  guidance: 1,
  livePreview: true,
}

function readWorkspace(): StoredWorkspace {
  try {
    const saved = JSON.parse(localStorage.getItem('minimax.zimage-workspace') ?? '{}') as Partial<StoredWorkspace>
    const negativePrompt = saved.negativePromptInitialized || saved.negativePrompt?.trim()
      ? saved.negativePrompt ?? ZIMAGE_DEFAULT_NEGATIVE_PROMPT
      : ZIMAGE_DEFAULT_NEGATIVE_PROMPT
    return { ...defaults, ...saved, negativePrompt, negativePromptInitialized: true, variant: saved.variant === 'base' ? 'base' : 'turbo' }
  }
  catch { return defaults }
}

const isZImageModel = (name: string) => /z[_\s-]?image/i.test(name)
const isTurboModel = (name: string) => isZImageModel(name) && /turbo/i.test(name)
const isBaseModel = (name: string) => isZImageModel(name) && !/turbo/i.test(name)
const preferredModel = (models: string[], variant: ZImageVariant) => models.find(variant === 'turbo' ? isTurboModel : isBaseModel)
  ?? (variant === 'turbo' ? 'z_image_turbo_bf16.safetensors' : 'z_image_bf16.safetensors')

type ZImageJob = { id: string; url: string }
type HistoryEntry = {
  status?: { status_str?: string }
  outputs?: Record<string, { images?: Array<{ filename: string; subfolder?: string; type?: string }> }>
}

export function ZImageWorkspace({
  url, info, connected, ollamaAvailable, llmProvider, ollamaUrl, ollamaModel, outputDirectory, attentionBackend, gpuRouting, onUse, onUseLtx,
}: {
  url: string
  info: ObjectInfo
  connected: boolean
  ollamaAvailable: boolean
  llmProvider: 'ollama' | 'lmstudio'
  ollamaUrl: string
  ollamaModel: string
  outputDirectory: string
  attentionBackend?: string
  gpuRouting?: WorkflowGpuRouting
  onUse(file: MediaFile, resolution: string): void
  onUseLtx(file: MediaFile): void
}) {
  const initial = useMemo(readWorkspace, [])
  const [prompt, setPrompt] = useState(initial.prompt)
  const [negativePrompt, setNegativePrompt] = useState(initial.negativePrompt)
  const [resolution, setResolution] = useState(initial.resolution)
  const [variant, setVariant] = useState<ZImageVariant>(initial.variant)
  const [model, setModel] = useState(initial.model)
  const [encoder, setEncoder] = useState(initial.encoder)
  const [vae, setVae] = useState(initial.vae)
  const [seed, setSeed] = useState(initial.seed)
  const [steps, setSteps] = useState(initial.steps)
  const [guidance, setGuidance] = useState(initial.guidance)
  const [livePreview, setLivePreview] = useState(initial.livePreview)
  const [job, setJob] = useState<ZImageJob | null>(null)
  const [result, setResult] = useState<MediaFile | null>(null)
  const [busy, setBusy] = useState(false)
  const [assisting, setAssisting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState(false)
  const jobRef = useRef<ZImageJob | null>(null)
  const [liveProgress, setLiveProgress] = useState<LiveProgress | null>(null)
  const liveProgressRef = useRef<LiveProgress | null>(null)
  const onLiveProgress = useCallback((id: string, update: LiveProgress) => {
    if (jobRef.current?.id === id) { liveProgressRef.current = update; setLiveProgress(update) }
  }, [])
  const live = useLivePreview(url, connected, onLiveProgress)

  const updateJob = useCallback((next: ZImageJob | null) => {
    jobRef.current = next
    setJob(next)
  }, [])

  useEffect(() => {
    const loadPrompt = (event: Event) => {
      const value = (event as CustomEvent<string>).detail
      if (value?.trim()) { setPrompt(value.trim()); setMessage('已从 Studio 助手加载图片提示词。'); setError(false) }
    }
    window.addEventListener('minimax:load-image-prompt', loadPrompt)
    return () => window.removeEventListener('minimax:load-image-prompt', loadPrompt)
  }, [])

  useEffect(() => {
    localStorage.setItem('minimax.zimage-workspace', JSON.stringify({ prompt, negativePrompt, negativePromptInitialized: true, resolution, variant, model, encoder, vae, seed, steps, guidance, livePreview }))
  }, [encoder, guidance, livePreview, model, negativePrompt, prompt, resolution, seed, steps, vae, variant])

  useEffect(() => {
    if (!job) return
    let disposed = false
    let timer: ReturnType<typeof setTimeout>
    let completedWithoutOutputPolls = 0
    const poll = async () => {
      try {
        const history = await window.minimax.getHistory(job.url, job.id)
        const entry = history[job.id] as HistoryEntry | undefined
        if (entry?.status?.status_str === 'error') throw new Error('Z-Image 运行失败。请检查所选组件与 ComfyUI 日志。')
        // The workflow's SaveImage is node 10. Prefer it so a preview-node
        // temporary image can never be mistaken for the production output.
        const image = entry?.outputs?.['10']?.images?.[0]
          ?? Object.values(entry?.outputs ?? {}).flatMap((output) => output.images ?? [])[0]
        if (image) {
          const preview = await window.minimax.getOutputImage(job.url, image)
          const saved = await window.minimax.saveComfyOutputImage(job.url, image, outputDirectory, 'image-creation')
          if (!disposed) {
            setResult({ ...saved, preview, kind: 'image' })
            updateJob(null); setBusy(false); setError(false); liveProgressRef.current = null; setLiveProgress(null); setMessage('图片已生成，可以使用。')
          }
          return
        }
        if (entry?.status?.status_str === 'success') {
          completedWithoutOutputPolls += 1
          if (completedWithoutOutputPolls > 2) throw new Error('ComfyUI 已完成 Z-Image，但没有返回保存的图片。请检查 SaveImage 节点与 ComfyUI 日志。')
          if (!disposed) setMessage('ComfyUI 已完成；正在收集保存的图片…')
        } else if (!disposed) {
          setMessage(liveProgressRef.current?.label ?? '正在 ComfyUI 中渲染图片…')
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

  const installedModels = choices(info, 'UNETLoader', 'unet_name')
  const turboInstalled = installedModels.some(isTurboModel)
  const baseInstalled = installedModels.some(isBaseModel)
  const modelMatchesVariant = variant === 'turbo' ? isTurboModel(model) : isBaseModel(model)
  const available = installedModels.includes(model) && modelMatchesVariant
    && choices(info, 'CLIPLoader', 'clip_name').includes(encoder)
    && choices(info, 'VAELoader', 'vae_name').includes(vae)
  const switchVariant = (next: ZImageVariant) => {
    if (busy || next === variant) return
    setVariant(next)
    setModel(preferredModel(installedModels, next))
    setSteps(next === 'turbo' ? 8 : 40)
    setGuidance(next === 'turbo' ? 1 : 4)
    setMessage(next === 'turbo' ? '已选择 Turbo 模式：快速 8 步生成。' : '已选择原版 Z-Image：40 步细节模式，支持 CFG 与反向提示词。')
    setError(false)
  }
  const fields = [
    { label: 'Z-Image 模型', value: model, set: setModel, node: 'UNETLoader', field: 'unet_name' },
    { label: '文本编码器', value: encoder, set: setEncoder, node: 'CLIPLoader', field: 'clip_name' },
    { label: '图片 VAE', value: vae, set: setVae, node: 'VAELoader', field: 'vae_name' },
  ]

  const create = async () => {
    if (!connected || !available || !prompt.trim()) return
    setBusy(true); setResult(null); setError(false); liveProgressRef.current = null; setLiveProgress(null); setMessage(`正在提交${variant === 'turbo' ? ' Z-Image Turbo ' : '原版 Z-Image '}工作流…`)
    try {
      const [width, height] = resolution.split('x').map(Number)
      const graph = buildZImage(prompt.trim(), width, height, seed, model, encoder, vae, steps, guidance, variant, variant === 'base' ? negativePrompt.trim() : '', attentionBackend, gpuRouting, livePreview)
      const response = await window.minimax.submitPrompt(url, graph, live.clientId)
      live.registerWorkflow(response.prompt_id, graph, livePreview)
      if (gpuRouting) console.info('[GPU Routing] Z-Image component routing enabled.', gpuRouting)
      updateJob({ id: response.prompt_id, url })
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : String(caught)); setError(true); setBusy(false)
    }
  }

  const cancel = async () => {
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
      const instruction = `Rewrite this as one polished still-image prompt for ${variant === 'turbo' ? 'Z-Image Turbo' : 'the original Z-Image base model'}. Preserve the subject and intent while improving composition, lens, lighting, environment, texture, color, and clarity. Do not describe motion, sound, timelines, or multiple shots. Return only the finished prompt.\n\nDRAFT:\n${prompt.trim()}`
      setPrompt(await window.minimax.generateWithOllama(ollamaUrl, ollamaModel, instruction, llmProvider))
      setMessage('提示词已在本地润色。生成前请先检查。')
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : String(caught)); setError(true) }
    finally { setAssisting(false) }
  }

  const visibleLivePreview = livePreview && busy && job && live.preview?.promptId === job.id ? live.preview : null

  return <div className="standard-page zimage-workspace">
    <div className="page-heading">
      <div><p className="eyebrow">创作 · Z‑IMAGE</p><h1>生成图片</h1><p>用专注的图片控制设计可投入生产的静帧与开场画面。</p></div>
      <div className="heading-state"><span className={connected && available ? 'ok' : 'warn'}>{connected && available ? <Check size={15} /> : <AlertCircle size={15} />}{connected ? available ? variant === 'turbo' ? 'Turbo 就绪' : '原版就绪' : variant === 'turbo' ? '需要 Turbo 模型' : '需要原版模型' : '引擎离线'}</span></div>
    </div>

    <div className="zimage-workspace-grid">
      <section className="zimage-composer">
        <fieldset className="zimage-mode-picker" disabled={busy}>
          <legend>生成模式</legend>
          <label className={variant === 'turbo' ? 'selected' : ''}><input type="radio" name="zimage-variant" checked={variant === 'turbo'} onChange={() => switchVariant('turbo')} /><Gauge size={18} /><span><strong>Z-Image Turbo</strong><small>快速预览与日常创作 · 8 步</small></span><em className={turboInstalled ? 'installed' : ''}>{turboInstalled ? '已安装' : '需要模型'}</em></label>
          <label className={variant === 'base' ? 'selected' : ''}><input type="radio" name="zimage-variant" checked={variant === 'base'} onChange={() => switchVariant('base')} /><Sparkles size={18} /><span><strong>原版 Z-Image</strong><small>全容量细节与更强的提示词控制 · 40 步</small></span><em className={baseInstalled ? 'installed' : ''}>{baseInstalled ? '已安装' : '需要模型'}</em></label>
        </fieldset>
        <div className="field-group">
          <div className="field-label"><label htmlFor="zimage-prompt">图片提示词</label><span>{prompt.length.toLocaleString()} 字符</span></div>
          <SmartPromptEditor id="zimage-prompt" value={prompt} onChange={setPrompt} placeholder="描述主体、环境、构图、镜头、光线、色彩与开场画面细节…输入 // 可使用制作指令。" disabled={busy} />
          <div className="zimage-prompt-actions"><button className="secondary-button" onClick={() => void enhance()} disabled={busy || assisting || !ollamaAvailable || !prompt.trim()} title={ollamaAvailable ? `用 ${ollamaModel} 润色` : `请在设置中配置 ${llmProvider === 'lmstudio' ? 'LM Studio' : 'Ollama'}`}>{assisting ? <LoaderCircle size={15} className="spin" /> : <WandSparkles size={15} />}用 {llmProvider === 'lmstudio' ? 'LM Studio' : 'Ollama'} 润色</button><small>{ollamaAvailable ? `${ollamaModel} · 本地` : `${llmProvider === 'lmstudio' ? 'LM Studio' : 'Ollama'} 不可用`}</small></div>
        </div>

        {variant === 'base' && <div className="field-group zimage-negative-prompt"><div className="field-label"><label htmlFor="zimage-negative-prompt">反向提示词 <small>画质预设</small></label><span>{negativePrompt.length.toLocaleString()} 字符</span></div><textarea id="zimage-negative-prompt" value={negativePrompt} onChange={(event) => setNegativePrompt(event.target.value)} placeholder="描述要抑制的伪影或不需要的元素…" disabled={busy} /><p className="field-help">预填了一个兼顾伪影、解剖结构、几何与多余文字的过滤器。若这些元素是刻意为之，可编辑或清空。</p></div>}

        <RenderSize value={resolution} onChange={setResolution} provider="zimage" />
        <div className="field-group"><label className="video-checkbox"><input type="checkbox" checked={livePreview} onChange={(event) => setLivePreview(event.target.checked)} />生成时显示实时预览</label><small className="field-help">关闭后新渲染不再输出预览。进度与保存的图片仍可查看。</small></div>
        <div className="zimage-seed-row"><label>种子<input type="number" min="0" max="999999999999" value={seed} disabled={busy} onChange={(event) => setSeed(Number(event.target.value))} /></label><button className="secondary-button" disabled={busy} onClick={() => setSeed(Math.floor(Math.random() * 1_000_000_000))}><Dices size={15} />随机</button></div>

        <details className="zimage-model-settings">
          <summary>模型组件 <small>高级</small></summary>
          <div className="zimage-quality-controls"><label>采样步数<input type="number" min={variant === 'turbo' ? 4 : 28} max={variant === 'turbo' ? 20 : 50} value={steps} disabled={busy} onChange={(event) => { const min = variant === 'turbo' ? 4 : 28; const max = variant === 'turbo' ? 20 : 50; setSteps(Math.max(min, Math.min(max, Number(event.target.value)))) }} /></label><label>引导强度<input type="number" min={variant === 'turbo' ? 1 : 3} max={variant === 'turbo' ? 3 : 5} step="0.1" value={guidance} disabled={busy} onChange={(event) => { const min = variant === 'turbo' ? 1 : 3; const max = variant === 'turbo' ? 3 : 5; setGuidance(Math.max(min, Math.min(max, Number(event.target.value)))) }} /></label></div>
          <p className="field-help">{variant === 'turbo' ? 'Turbo 使用 8 步与引导强度 1。它为速度优化，不使用反向提示词。' : '原版 Z-Image 未做蒸馏。官方范围为 28–50 步、引导强度 3–5；40 步与引导强度 4 可在细节和渲染时间之间取得平衡。'}</p>
          <div className="zimage-models">{fields.map((field) => <label key={field.label}>{field.label}<select value={field.value} disabled={busy} onChange={(event) => field.set(event.target.value)}>{!choices(info, field.node, field.field).includes(field.value) && <option value={field.value}>{field.value} · 不可用</option>}{choices(info, field.node, field.field).map((name) => <option key={name}>{name}</option>)}</select></label>)}</div>
          {!available && <p className="field-help">请选择 ComfyUI 中已注册、与之匹配的{variant === 'turbo' ? 'Z-Image Turbo' : '原版 Z-Image'}模型。预期的扩散模型是 {variant === 'turbo' ? 'z_image_turbo_bf16.safetensors' : 'z_image_bf16.safetensors'}。</p>}
        </details>

        {message && <div className={`zimage-message ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'}>{busy && <LoaderCircle size={16} className="spin" />}<span>{message}</span></div>}
        <div className="zimage-generate-bar">{busy && <button className="danger-button" onClick={() => void cancel()}><CircleStop size={16} />取消</button>}<button className="primary-button" disabled={busy || !connected || !available || !prompt.trim()} onClick={() => void create()}>{busy ? <LoaderCircle size={18} className="spin" /> : <Sparkles size={18} />}{busy ? '正在生成图片…' : '生成图片'}</button></div>
      </section>

      <PreviewPanel>
        <div className="panel-heading"><div><span>输出</span><strong>图片预览</strong></div>{result && <span className="zimage-complete"><Check size={13} />就绪</span>}</div>
        <div className="zimage-preview-stage">{result?.preview ? <img src={result.preview} alt="生成的 Z-Image 输出" /> : visibleLivePreview ? <figure className="live-preview zimage-live-preview"><img src={visibleLivePreview.url} alt="Z-Image 采样实时预览" /><figcaption>采样实时预览{visibleLivePreview.step && visibleLivePreview.totalSteps ? ` · 第 ${visibleLivePreview.step} 步，共 ${visibleLivePreview.totalSteps} 步` : ''}</figcaption></figure> : busy ? <div className="render-state"><ProductionLoading label={liveProgress?.label || '正在准备图片条件'}/><strong>正在生成你的图片</strong><span>{liveProgress?.label ?? `${resolution.replace('x', ' × ')} · ${livePreview ? '等待实时预览' : '渲染中（无实时预览）'}`}</span></div> : <div className="empty-preview"><div className="preview-icon"><ImagePlus size={28} /></div><strong>你的图片会显示在这里</strong><span>描述画面、选择画幅，然后在本地生成。</span></div>}</div>
        <div className="zimage-preview-actions"><span>{result ? `${result.name} · ${resolution.replace('x', ' × ')}` : '已保存到 ComfyUI · MiniMax_first_frames'}</span><div><button className="secondary-button" disabled={!result} onClick={() => result && onUse(result, resolution)}><ImagePlus size={16} />发送到 MiniMax I2V</button><button className="primary-button" disabled={!result} onClick={() => result && onUseLtx(result)} title="载入保留身份特征的 LTX 图生视频提示词"><Film size={16} />发送到 LTX 2.5</button></div></div>
      </PreviewPanel>
    </div>
  </div>
}
