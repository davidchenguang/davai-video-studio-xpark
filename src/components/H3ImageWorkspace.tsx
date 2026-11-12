import { PreviewPanel, ProductionLoading } from './Workspace'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, Check, CircleStop, Dices, Film, Gauge, ImagePlus, LoaderCircle, Sparkles, WandSparkles } from 'lucide-react'
import { buildH3Image, H3_IMAGE_TIERS, isH3Fl2vaModel, isH3ImageModel, isH3TurboLora, type H3ImageTier } from '../lib/h3Image'
import { choices, hasInput, type ObjectInfo } from '../lib/comfyInfo'
import { RenderSize } from './RenderSize'
import { SmartPromptEditor } from './SmartPromptEditor'
import type { MediaFile, WorkflowGpuRouting } from '../types'
import { useLivePreview, type LiveProgress } from '../lib/useLivePreview'

type StoredWorkspace = {
  prompt: string
  resolution: string
  tier: H3ImageTier
  model: string
  encoder: string
  vae: string
  lora: string
  seed: number
  steps: number
  livePreview: boolean
}

const defaults: StoredWorkspace = {
  prompt: '',
  resolution: '1344x768',
  tier: 'dedicated',
  model: H3_IMAGE_TIERS.dedicated.model,
  encoder: H3_IMAGE_TIERS.dedicated.encoder,
  vae: H3_IMAGE_TIERS.dedicated.vae,
  lora: H3_IMAGE_TIERS.fl2va.lora ?? '',
  seed: Math.floor(Math.random() * 1_000_000_000),
  steps: H3_IMAGE_TIERS.dedicated.steps,
  livePreview: true,
}

function readWorkspace(): StoredWorkspace {
  try {
    const saved = JSON.parse(localStorage.getItem('minimax.h3image-workspace') ?? '{}') as Partial<StoredWorkspace>
    const tier: H3ImageTier = saved.tier === 'fl2va' ? 'fl2va' : 'dedicated'
    return { ...defaults, ...saved, tier, steps: Number(saved.steps) > 0 ? Number(saved.steps) : H3_IMAGE_TIERS[tier].steps }
  }
  catch { return defaults }
}

type H3ImageJob = { id: string; url: string }
type HistoryEntry = {
  status?: { status_str?: string }
  outputs?: Record<string, { images?: Array<{ filename: string; subfolder?: string; type?: string }> }>
}

export function H3ImageWorkspace({
  url, info, connected, ollamaAvailable, llmProvider, ollamaUrl, ollamaModel, outputDirectory, gpuRouting, onUse, onUseLtx,
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
  onUse(file: MediaFile, resolution: string): void
  onUseLtx(file: MediaFile): void
}) {
  const initial = useMemo(readWorkspace, [])
  const [prompt, setPrompt] = useState(initial.prompt)
  const [resolution, setResolution] = useState(initial.resolution)
  const [tier, setTier] = useState<H3ImageTier>(initial.tier)
  const [model, setModel] = useState(initial.model)
  const [encoder, setEncoder] = useState(initial.encoder)
  const [vae, setVae] = useState(initial.vae)
  const [lora, setLora] = useState(initial.lora)
  const [seed, setSeed] = useState(initial.seed)
  const [steps, setSteps] = useState(initial.steps)
  const [livePreview, setLivePreview] = useState(initial.livePreview)
  const [job, setJob] = useState<H3ImageJob | null>(null)
  const [result, setResult] = useState<MediaFile | null>(null)
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

  const updateJob = useCallback((next: H3ImageJob | null) => {
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
    localStorage.setItem('minimax.h3image-workspace', JSON.stringify({ prompt, resolution, tier, model, encoder, vae, lora, seed, steps, livePreview }))
  }, [encoder, livePreview, lora, model, prompt, resolution, seed, steps, tier, vae])

  useEffect(() => {
    if (!job) return
    let disposed = false
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        const history = await window.minimax.getHistory(job.url, job.id)
        const entry = history[job.id] as HistoryEntry | undefined
        if (entry?.status?.status_str === 'error') throw new Error('H3-Image 运行失败。请检查所选组件与 ComfyUI 日志。')
        // The workflow's SaveImage is node 15. Prefer it so a preview-node
        // temporary image can never be mistaken for the production output.
        const image = entry?.outputs?.['15']?.images?.[0]
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
          if (!disposed) setMessage('ComfyUI 已完成；正在收集保存的图片……')
        } else if (!disposed) {
          setMessage(liveProgressRef.current?.label ?? '正在 ComfyUI 中渲染图片……')
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
  const installedEncoders = choices(info, 'CLIPLoader', 'clip_name')
  const installedVaes = choices(info, 'VAELoader', 'vae_name')
  const installedLoras = choices(info, 'LoraLoaderModelOnly', 'lora_name')
  const dedicatedInstalled = installedModels.some(isH3ImageModel)
  const fl2vaInstalled = installedModels.some(isH3Fl2vaModel) && installedLoras.some(isH3TurboLora)
  // The dedicated route needs the ComfyUI 0.45 conditioning node; without it the
  // engine answers with an "unknown node type" error, so we gate it up front.
  const engineReady = tier === 'fl2va' ? true : hasInput(info, 'MiniMaxH3ImageConditioning', 'prompt')
  const modelMatchesTier = tier === 'dedicated' ? isH3ImageModel(model) : isH3Fl2vaModel(model)
  const available = installedModels.includes(model) && modelMatchesTier
    && installedEncoders.includes(encoder)
    && installedVaes.includes(vae)
    && (tier === 'fl2va' ? Boolean(lora) && installedLoras.includes(lora) : true)
    && engineReady

  const switchTier = (next: H3ImageTier) => {
    if (busy || next === tier) return
    const spec = H3_IMAGE_TIERS[next]
    setTier(next)
    setModel(spec.model)
    setEncoder(spec.encoder)
    setVae(spec.vae)
    setLora(spec.lora ?? '')
    setSteps(spec.steps)
    setMessage(next === 'dedicated' ? '已选择 H3-Image 专用模型：中文排版最稳，可直出 4K。' : '已选择 H3 视频同款模型：复用视频 DiT，无需新增下载。')
    setError(false)
  }

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

  const create = async () => {
    if (!connected || !available || !prompt.trim()) return
    setBusy(true); setResult(null); setError(false); liveProgressRef.current = null; setLiveProgress(null); setMessage(`正在提交${H3_IMAGE_TIERS[tier].label}工作流……`)
    try {
      const [width, height] = resolution.split('x').map(Number)
      const graph = buildH3Image(prompt.trim(), width, height, seed, { model, encoder, vae, lora: tier === 'fl2va' ? lora : undefined }, tier, steps, livePreview, gpuRouting)
      const response = await window.minimax.submitPrompt(url, graph, live.clientId)
      live.registerWorkflow(response.prompt_id, graph, livePreview)
      if (gpuRouting) console.info('[GPU Routing] H3-Image component routing enabled.', gpuRouting)
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
    setAssisting(true); setError(false); setMessage('正在询问本地提示词助手……')
    try {
      const instruction = `Rewrite this as one polished still-image prompt for the MiniMax H3-Image model. Preserve the subject and intent while improving composition, lens, lighting, environment, texture, color, and clarity. If the prompt contains Chinese text to render, keep every character exactly as written. Do not describe motion, sound, timelines, or multiple shots. Return only the finished prompt.\n\nDRAFT:\n${prompt.trim()}`
      setPrompt(await window.minimax.generateWithOllama(ollamaUrl, ollamaModel, instruction, llmProvider))
      setMessage('提示词已在本地润色。生成前请先检查。')
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : String(caught)); setError(true) }
    finally { setAssisting(false) }
  }

  const visibleLivePreview = livePreview && busy && job && live.preview?.promptId === job.id ? live.preview : null
  const tierInstalled = tier === 'dedicated' ? dedicatedInstalled : fl2vaInstalled

  return <div className="standard-page h3image-workspace">
    <div className="page-heading">
      <div><p className="eyebrow">创作 · H3‑IMAGE</p><h1>图片 · H3-Image</h1><p>用 MiniMax H3-Image 生成中文排版精准的静帧，可直接发往 H3 与 LTX 视频。</p><p className="h3image-attribution">由 MiniMax-H3-Image 生成</p></div>
      <div className="heading-state"><span className={connected && available ? 'ok' : 'warn'}>{connected ? available ? <Check size={15} /> : <AlertCircle size={15} /> : <AlertCircle size={15} />}{connected ? available ? '模型就绪' : !engineReady ? '需要 ComfyUI 0.45+' : '需要模型' : '引擎离线'}</span></div>
    </div>

    <div className="zimage-workspace-grid">
      <section className="zimage-composer">
        <fieldset className="zimage-mode-picker" disabled={busy}>
          <legend>生成模式</legend>
          <label className={tier === 'dedicated' ? 'selected' : ''}><input type="radio" name="h3image-tier" checked={tier === 'dedicated'} onChange={() => switchTier('dedicated')} /><Sparkles size={18} /><span><strong>{H3_IMAGE_TIERS.dedicated.label}</strong><small>{H3_IMAGE_TIERS.dedicated.summary}</small></span><em className={dedicatedInstalled ? 'installed' : ''}>{dedicatedInstalled ? '已安装' : '需要模型'}</em></label>
          <label className={tier === 'fl2va' ? 'selected' : ''}><input type="radio" name="h3image-tier" checked={tier === 'fl2va'} onChange={() => switchTier('fl2va')} /><Gauge size={18} /><span><strong>{H3_IMAGE_TIERS.fl2va.label}</strong><small>{H3_IMAGE_TIERS.fl2va.summary}</small></span><em className={fl2vaInstalled ? 'installed' : ''}>{fl2vaInstalled ? '已安装' : '需要模型'}</em></label>
        </fieldset>
        <p className="field-help">{H3_IMAGE_TIERS[tier].detail}</p>
        <div className="field-group">
          <div className="field-label"><label htmlFor="h3image-prompt">图片提示词</label><span>{prompt.length.toLocaleString()} 字符</span></div>
          <SmartPromptEditor id="h3image-prompt" value={prompt} onChange={setPrompt} placeholder="描述主体、环境、构图、镜头、光线、色彩与需要渲染的中文文字……输入 // 可使用生产命令。" disabled={busy} />
          <div className="zimage-prompt-actions"><button className="secondary-button" onClick={() => void enhance()} disabled={busy || assisting || !ollamaAvailable || !prompt.trim()} title={ollamaAvailable ? `用 ${ollamaModel} 润色` : '请在设置中配置本地 AI 助手'}>{assisting ? <LoaderCircle size={15} className="spin" /> : <WandSparkles size={15} />}用 {llmProvider === 'lmstudio' ? 'LM Studio' : 'Ollama'} 润色</button><small>{ollamaAvailable ? `${ollamaModel} · 本地` : `${llmProvider === 'lmstudio' ? 'LM Studio' : 'Ollama'} 不可用`}</small></div>
        </div>

        <RenderSize value={resolution} onChange={setResolution} provider="h3image" />
        <div className="field-group"><label className="video-checkbox"><input type="checkbox" checked={livePreview} onChange={(event) => setLivePreview(event.target.checked)} />生成时显示实时预览</label><small className="field-help">关闭后新渲染不再输出预览。进度与保存的图片仍可查看。</small></div>
        <div className="zimage-seed-row"><label>种子<input type="number" min="0" max="999999999999" value={seed} disabled={busy} onChange={(event) => setSeed(Number(event.target.value))} /></label><button className="secondary-button" disabled={busy} onClick={() => setSeed(Math.floor(Math.random() * 1_000_000_000))}><Dices size={15} />随机</button></div>

        <details className="zimage-model-settings">
          <summary>模型组件 <small>高级</small></summary>
          <div className="zimage-quality-controls"><label>采样步数<input type="number" min="4" max="12" value={steps} disabled={busy} onChange={(event) => { setSteps(Math.max(4, Math.min(12, Number(event.target.value)))) }} /></label></div>
          <p className="field-help">H3-Image 是无 CFG 的蒸馏模型：引导强度固定为 1，也不使用反向提示词。步数建议保持默认（专用模型 6 步、视频同款 8 步）。</p>
          <div className="zimage-models">{fields.map((field) => <label key={field.label}>{field.label}<select value={field.value} disabled={busy} onChange={(event) => field.set(event.target.value)}>{!choices(info, field.node, field.field).includes(field.value) && <option value={field.value}>{field.value} · 不可用</option>}{choices(info, field.node, field.field).map((name) => <option key={name}>{name}</option>)}</select></label>)}</div>
          {!available && <p className="field-help">{!engineReady ? '当前 ComfyUI 缺少 MiniMaxH3ImageConditioning 节点，请升级到 0.45 或更高版本后使用 H3-Image 专用模型；「H3 视频同款模型」无需该节点。' : tierInstalled ? '请选择 ComfyUI 中已注册、与之匹配的模型文件。' : `请在 ComfyUI 中安装 ${tier === 'dedicated' ? 'H3-Image DiT 与图像 VAE' : 'H3 视频 DiT、Turbo LoRA 与视频 VAE'}。`}</p>}
        </details>

        {message && <div className={`zimage-message ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'}>{busy && <LoaderCircle size={16} className="spin" />}<span>{message}</span></div>}
        <div className="zimage-generate-bar">{busy && <button className="danger-button" onClick={() => void cancel()}><CircleStop size={16} />取消</button>}<button className="primary-button" disabled={busy || !connected || !available || !prompt.trim()} onClick={() => void create()}>{busy ? <LoaderCircle size={18} className="spin" /> : <Sparkles size={18} />}{busy ? '正在生成图片……' : '生成图片'}</button></div>
      </section>

      <PreviewPanel>
        <div className="panel-heading"><div><span>输出</span><strong>图片预览</strong></div>{result && <span className="zimage-complete"><Check size={13} />就绪</span>}</div>
        <div className="zimage-preview-stage">{result?.preview ? <img src={result.preview} alt="生成的 H3-Image 成果" /> : visibleLivePreview ? <figure className="live-preview zimage-live-preview"><img src={visibleLivePreview.url} alt="H3-Image 采样实时预览" /><figcaption>采样实时预览{visibleLivePreview.step && visibleLivePreview.totalSteps ? ` · 第 ${visibleLivePreview.step} 步，共 ${visibleLivePreview.totalSteps} 步` : ''}</figcaption></figure> : busy ? <div className="render-state"><ProductionLoading label={liveProgress?.label || '正在准备图片条件'} /><strong>正在生成你的图片</strong><span>{liveProgress?.label ?? `${resolution.replace('x', ' × ')} · ${livePreview ? '等待实时预览' : '渲染中（无实时预览）'}`}</span></div> : <div className="empty-preview"><div className="preview-icon"><ImagePlus size={28} /></div><strong>你的图片会显示在这里</strong><span>描述画面、选择画幅，然后在本地生成。</span></div>}</div>
        <div className="zimage-preview-actions"><span>{result ? `${result.name} · ${resolution.replace('x', ' × ')}` : '已保存到 ComfyUI · MiniMax_first_frames'}</span><div><button className="secondary-button" disabled={!result} onClick={() => result && onUse(result, resolution)}><ImagePlus size={16} />发送到 MiniMax I2V</button><button className="primary-button" disabled={!result} onClick={() => result && onUseLtx(result)} title="载入保留身份特征的 LTX 图生视频提示词"><Film size={16} />发送到 LTX 2.5</button></div></div>
      </PreviewPanel>
    </div>
  </div>
}
