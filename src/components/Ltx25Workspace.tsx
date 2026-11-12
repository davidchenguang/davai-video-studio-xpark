import { PreviewPanel } from './Workspace'
import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Check, CircleStop, Film, Gauge, Image as ImageIcon, LoaderCircle, Play, RotateCcw, Sparkles, WandSparkles } from 'lucide-react'
import { ImageCrop } from './ImageCrop'
import { RenderConstruction } from './RenderConstruction'
import { ReliableVideo } from './ReliableVideo'
import { SmartPromptEditor } from './SmartPromptEditor'
import type { AppSettings, GenerationJob, Ltx25GenerationOptions, Ltx25ModelSelection, MediaFile } from '../types'
import { ltx25FrameCount } from '../lib/ltx25Workflow'
import { LTX25_RESOLUTIONS, type Ltx25Orientation, ltx25ResolutionLabel } from '../lib/ltx25Resolutions'
import { applyDialoguePolicy } from '../lib/dialogPolicy'
import { resolveLlmConnection } from '../lib/llmProvider'
import { hasSensitivePreviewWording } from '../lib/previewSafety'

type WorkspaceState = {
  mode: 'text' | 'image'
  prompt: string
  identityPrompt: string
  referenceMode: 'start-frame' | 'msr'
  msrReferences: MediaFile[]
  msrLora: string
  duration: number
  resolution: string
  preset: 'quality' | 'turbo'
  seed: number
  liveEnabled: boolean
  livePreviewMode: 'standard' | 'sampling-override'
  noDialogue: boolean
  firstFrame: MediaFile | null
}

const defaults: WorkspaceState = {
  mode: 'text', prompt: '', identityPrompt: '', referenceMode: 'start-frame', msrReferences: [], msrLora: '', duration: 5, resolution: '1056x608', preset: 'quality',
  seed: Math.floor(Math.random() * 1_000_000_000), liveEnabled: true, livePreviewMode: 'standard', noDialogue: true, firstFrame: null,
}

const LTX25_MAX_DURATION = 20

function readWorkspace(): WorkspaceState {
  try {
    const stored = JSON.parse(localStorage.getItem('ltx25.workspace') ?? '{}') as Partial<WorkspaceState>
    return { ...defaults, ...stored, duration: Math.max(2, Math.min(LTX25_MAX_DURATION, Number(stored.duration) || defaults.duration)) }
  }
  catch { return defaults }
}

function withoutPreview(file: MediaFile | null) {
  if (!file) return null
  const result = { ...file }
  delete result.preview
  return result
}

export function Ltx25Workspace({ settings, models, pipelineReady, missingNodes, connected, liveConnected, livePreview, samplingPreviewNodeType, blurNsfwPreview, msrEnabled, msrReady, msrLoras, latestJob, submitting, cancelling, ollamaAvailable, onChooseImage, onGenerate, onCancel }: {
  settings: AppSettings
  models: Ltx25ModelSelection
  pipelineReady: boolean
  missingNodes: readonly string[]
  connected: boolean
  liveConnected: boolean
  livePreview: { promptId: string; url: string } | null
  samplingPreviewNodeType?: string
  blurNsfwPreview: boolean
  msrEnabled: boolean
  msrReady: boolean
  msrLoras: string[]
  latestJob?: GenerationJob
  submitting: boolean
  cancelling: boolean
  ollamaAvailable: boolean
  onChooseImage(): Promise<MediaFile | null>
  onGenerate(options: Ltx25GenerationOptions, firstFrame: MediaFile | null, liveEnabled: boolean): void
  onCancel(job: GenerationJob): void
}) {
  const initial = useMemo(readWorkspace, [])
  const [state, setState] = useState(initial)
  const llm = resolveLlmConnection(settings)
  const [refining, setRefining] = useState(false)
  const [suggestion, setSuggestion] = useState('')
  const [assistantError, setAssistantError] = useState('')
  const set = <K extends keyof WorkspaceState>(key: K, value: WorkspaceState[K]) => setState((current) => ({ ...current, [key]: value }))
  useEffect(() => {
    const loadPrompt = (event: Event) => set('prompt', (event as CustomEvent<string>).detail)
    window.addEventListener('oyama:load-ltx-prompt', loadPrompt)
    return () => window.removeEventListener('oyama:load-ltx-prompt', loadPrompt)
  }, [])
  const requiredNodes = 13
  const modelReady = Boolean(models.diffusion && models.textEncoder && models.videoVae && models.audioVae && models.latentUpscaler && pipelineReady)
  const samplingPreviewAvailable = Boolean(samplingPreviewNodeType)
  const msrAvailable = msrEnabled && msrReady && msrLoras.length > 0
  const [width, height] = state.resolution.split('x').map(Number)
  const orientation = width === height ? 'square' : width / height >= 2.1 ? 'ultrawide' : width > height ? 'landscape' : 'portrait'
  const rendering = submitting || Boolean(latestJob && ['queued', 'running'].includes(latestJob.status))

  useEffect(() => {
    localStorage.setItem('ltx25.workspace', JSON.stringify({ ...state, firstFrame: withoutPreview(state.firstFrame) }))
  }, [state])

  useEffect(() => {
    const file = state.firstFrame
    if (!file || file.preview || file.kind !== 'image') return
    void window.minimax.fileDataUrl(file.path).then((preview) => set('firstFrame', { ...file, preview })).catch(() => undefined)
  }, [state.firstFrame])

  useEffect(() => {
    if (state.referenceMode === 'msr' && !state.msrLora && msrLoras[0]) set('msrLora', msrLoras[0])
  }, [msrLoras, state.msrLora, state.referenceMode])

  const refine = async () => {
    if (!state.prompt.trim() || !llm.model) return
    setRefining(true); setSuggestion(''); setAssistantError('')
    try {
      const audioDirection = state.noDialogue ? 'Specify only ambient sound; do not add dialogue, narration, singing, lip-sync, subtitles, captions, or text overlays.' : 'Specify synchronized dialogue or sound when useful.'
      const result = await window.minimax.generateWithOllama(llm.url, llm.model, `Rewrite this as one production-ready LTX-2.5 ${state.mode === 'image' ? 'image-to-video motion' : 'text-to-video'} prompt. Preserve intent. Specify subject action, camera, lighting, physical motion, pacing, and audio. ${audioDirection} Return only the prompt.\n\nDRAFT:\n${state.prompt.trim()}`, llm.provider)
      setSuggestion(result)
    } catch (cause) { setAssistantError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setRefining(false) }
  }

  return <div className="create-page ltx-workspace">
    <div className="page-heading">
      <div><p className="eyebrow">创作 · LTX‑2.5</p><h1>LTX 2.5 创作</h1><p>让首帧动起来，或直接创作带同步音频的原生文生视频镜头。</p></div>
      <div className="heading-state"><span className={modelReady ? 'ok' : 'warn'}>{modelReady ? <Check size={15} /> : <AlertCircle size={15} />}{modelReady ? 'LTX 管线已验证' : missingNodes.length ? '请更新 ComfyUI 节点' : '缺少 LTX 模型'}</span></div>
    </div>
    <div className="workspace-grid">
      <section className="composer-panel">
        <div className="provider-note"><Sparkles size={17} /><span><strong>独立于 MiniMax</strong><small>此工作区的提示词、素材、分辨率、种子、画质预设、实时预览与输出均独立保存。</small></span><button type="button" onClick={() => { setState({ ...defaults, seed: Math.floor(Math.random() * 1_000_000_000) }); setSuggestion('') }}><RotateCcw size={14} />重置 LTX</button></div>
        <div className="mode-tabs ltx-mode-tabs" role="tablist" aria-label="LTX 生成模式">
          <button role="tab" aria-selected={state.mode === 'text'} className={state.mode === 'text' ? 'selected' : ''} onClick={() => set('mode', 'text')}><WandSparkles size={18} /><span><strong>文字</strong><small>提示词生成视频</small></span></button>
          <button role="tab" aria-selected={state.mode === 'image'} className={state.mode === 'image' ? 'selected' : ''} onClick={() => set('mode', 'image')}><ImageIcon size={18} /><span><strong>图片</strong><small>让首帧动起来</small></span></button>
        </div>
        {msrEnabled && <section className={`ltx-msr-control ${msrAvailable ? 'ready' : ''}`} aria-labelledby="ltx-msr-title"><header><span><Sparkles size={15} /><span><small>实验性附加组件</small><strong id="ltx-msr-title">Licon MSR 身份参考</strong></span></span><em>{msrAvailable ? '就绪' : '需要准备环境'}</em></header>{msrAvailable ? <><label>MSR LoRA<select value={state.msrLora} onChange={(event) => set('msrLora', event.target.value)}>{msrLoras.map((name) => <option key={name}>{name}</option>)}</select></label><div className="ltx-msr-reference-list">{state.msrReferences.length ? state.msrReferences.slice(0, 5).map((file, index) => <span key={`${file.path}-${index}`}><b>图片 {index + 1}</b>{file.name}</span>) : <span>还没有 Ref2VA 交接参考图。发送一张包含所选角色或地点的 Ref2VA 静帧，即可附带其确认的源图片。</span>}</div><p>参考图会以固定的 Image 1–5 顺序随 Licon MSR LoRA 一并发送。正常的起始帧图片仍可用于构图。</p></> : <p>请在设置中启用 Licon MSR 附加组件，安装 <code>ComfyUI-LTX2.5-MSR</code>，把它的 LTX 2.5 MSR LoRA 放入 ComfyUI 的 LoRA 文件夹，然后重启 ComfyUI 并刷新连接。</p>}</section>}
        {msrAvailable && <div className="ltx-msr-manual-actions"><button type="button" className="secondary-button" disabled={state.msrReferences.length >= 5} onClick={async () => { const file = await onChooseImage(); if (file) setState((current) => ({ ...current, mode: 'text', referenceMode: 'msr', msrReferences: [...current.msrReferences, file].slice(0, 5), msrLora: current.msrLora || msrLoras[0] || '' })) }}><ImageIcon size={15} />添加 MSR 参考图</button>{state.msrReferences.length > 0 && <button type="button" className="secondary-button" onClick={() => setState((current) => ({ ...current, msrReferences: current.msrReferences.slice(0, -1) }))}>移除最后一张</button>}<small>{state.msrReferences.length}/5 · 手动参考使用 LTX 文字模式；请在下方补充创意方向。</small></div>}
        <div className="field-group prompt-field">
          <div className="field-label"><label htmlFor="ltx-prompt">创意方向</label><span>{state.prompt.length.toLocaleString()} 字符</span></div>
          {state.mode === 'image' && state.identityPrompt.trim() && <details className="prompt-system-chip"><summary><span>身份提示词</span><small>随此图片交接应用</small></summary><p>{state.identityPrompt}</p></details>}
          <SmartPromptEditor id="ltx-prompt" value={state.prompt} onChange={(value) => set('prompt', value)} placeholder={state.mode === 'image' ? '描述首帧如何运动、镜头方向、对白与声音……输入 // 可使用命令。' : '描述场景、动作、镜头、光线、对白与声音……输入 // 可使用命令。'} />
          <label className="no-dialogue-toggle" title="会附加一条渲染指令，屏蔽口播词、旁白、演唱、口型同步、字幕与文字叠加。"><input type="checkbox" checked={state.noDialogue} onChange={(event) => set('noDialogue', event.target.checked)} /><span><strong>无对白</strong><small>{state.noDialogue ? '仅环境声' : '允许对白与口型同步'}</small></span></label>
          <div className="prompt-tools"><div className="prompt-tool-buttons"><button type="button" onClick={() => void refine()} disabled={!ollamaAvailable || refining || !state.prompt.trim()}>{refining ? <LoaderCircle size={14} className="spin" /> : <Sparkles size={14} />}为 LTX 润色</button></div><span className={`local-model-chip ${ollamaAvailable ? 'online' : ''}`}><span />{ollamaAvailable ? llm.model : `${llm.label} 离线`}</span></div>
          {suggestion && <div className="assistant-result"><div className="assistant-result-heading"><span><Sparkles size={14} />本地建议</span><small>应用前请先检查</small></div><textarea aria-label="LTX 提示词建议" value={suggestion} readOnly /><div className="assistant-actions"><button className="secondary-button" onClick={() => setSuggestion('')}>忽略</button><button className="primary-button" onClick={() => { set('prompt', suggestion); setSuggestion('') }}><Check size={14} />使用建议</button></div></div>}
          {assistantError && <p className="field-help error"><AlertCircle size={13} />{assistantError}</p>}
        </div>
        {state.mode === 'image' && <div className="ltx-image-input"><div className={`media-drop ${state.firstFrame ? 'has-file' : ''}`}>{state.firstFrame?.preview && <img src={state.firstFrame.preview} alt="已选的 LTX 首帧" />}<div className="media-drop-content"><span className="upload-icon"><ImageIcon size={19} /></span><strong>{state.firstFrame?.name ?? '首帧'}</strong><small>{state.firstFrame ? '可用于 LTX I2V' : 'PNG、JPG 或 WebP'}</small><button onClick={async () => { const file = await onChooseImage(); if (file) set('firstFrame', file) }}>{state.firstFrame ? '替换' : '选择图片'}</button></div>{state.firstFrame && <button className="remove-media" onClick={() => set('firstFrame', null)} aria-label="移除首帧">×</button>}</div>{state.firstFrame && <ImageCrop label="LTX 首帧" file={state.firstFrame} resolution={state.resolution} onChange={(file) => set('firstFrame', file)} />}</div>}
        <fieldset className="render-size"><legend>输出尺寸</legend><label>方向<select value={orientation} onChange={(event) => { const next = event.target.value as Ltx25Orientation; const resolution = next === 'landscape' ? '1056x608' : next === 'square' ? '768x768' : LTX25_RESOLUTIONS[next][Math.min(3, LTX25_RESOLUTIONS[next].length - 1)]; set('resolution', resolution) }}><option value="landscape">横屏 · 16:9</option><option value="ultrawide">超宽 · 21:9</option><option value="portrait">竖屏 · 9:16</option><option value="square">方形 · 1:1</option></select></label><label>分辨率<select value={state.resolution} onChange={(event) => set('resolution', event.target.value)}>{LTX25_RESOLUTIONS[orientation].map((size) => <option key={size} value={size}>{size.replace('x', ' × ')} · {ltx25ResolutionLabel(size)}</option>)}</select></label><p className="field-help">1056 × 608 是画质与速度的推荐平衡点。所有尺寸均按 LTX‑2.5 做 32 像素对齐；画质模式先以一半尺寸渲染，再使用官方的隐空间 2× 精修管线。</p></fieldset>
        <div className="render-controls"><div className="field-group"><label htmlFor="ltx-duration">时长</label><div className="range-line"><input id="ltx-duration" type="range" min="2" max={LTX25_MAX_DURATION} step="1" value={state.duration} onChange={(event) => set('duration', Number(event.target.value))} /><output>{state.duration} 秒</output></div><p className="field-help">LTX‑2.5 支持最长 {LTX25_MAX_DURATION} 秒的片段。</p></div><div className="field-group"><label htmlFor="ltx-preset">渲染预设</label><select id="ltx-preset" value={state.preset} onChange={(event) => set('preset', event.target.value as 'quality' | 'turbo')}><option value="quality">画质 · 官方两阶段 8 + 3</option><option value="turbo">Turbo · 蒸馏单阶段 8</option></select></div></div>
        <div className="render-extras"><label><input type="checkbox" checked={state.liveEnabled} onChange={(event) => set('liveEnabled', event.target.checked)} />实时预览 <small>{state.liveEnabled ? liveConnected ? '已连接 · 等待 LTX 帧' : '正在连接 ComfyUI……' : '关闭'}</small></label><label className="live-preview-mode"><span>预览来源</span><select value={state.livePreviewMode} disabled={!state.liveEnabled} onChange={(event) => set('livePreviewMode', event.target.value as WorkspaceState['livePreviewMode'])}><option value="standard">标准解码帧</option><option value="sampling-override" disabled={!samplingPreviewAvailable}>LTX 采样覆盖 · 24 fps</option></select></label><p className={`field-help ${state.livePreviewMode === 'sampling-override' && !samplingPreviewAvailable ? 'upscale-warning' : ''}`}>{!state.liveEnabled ? '中间帧已关闭；渲染进度与保存的视频仍可查看。' : state.livePreviewMode === 'sampling-override' && samplingPreviewAvailable ? 'LTX2 Sampling Preview Override 以 24 fps 从扩散模型连接到两个 LTX 引导器，并用视频 VAE 生成采样期帧。隐空间放大器有意不接入。' : state.livePreviewMode === 'sampling-override' ? 'LTX 采样预览需要 ComfyUI-KJNodes 中的 LTX2SamplingPreviewOverride。请安装或启用它，重启 ComfyUI，然后刷新本地引擎。' : samplingPreviewAvailable ? 'LTX 采样覆盖可用。选择它即可在渲染期间收到 24 fps 的采样期帧。' : '会发布解码后的首帧；安装 ComfyUI-KJNodes 可启用采样期 LTX 预览。'}</p></div>
        <details className="ltx-advanced"><summary>高级</summary><div className="advanced-grid"><div className="field-group"><label htmlFor="ltx-seed">种子</label><input id="ltx-seed" className="number-input" type="number" min="0" max="999999999999" value={state.seed} onChange={(event) => set('seed', Number(event.target.value))} /></div><div className="readonly-value">Euler 祖先采样 · CFG 1</div><div className="readonly-value">{state.preset === 'quality' ? '官方 8 + 3 sigmas' : '官方蒸馏 8 sigmas'}</div></div></details>
        <div className={`render-health ${missingNodes.length ? 'warning' : 'ready'}`}>
          <Gauge size={16} />
          <span><strong>{ltx25FrameCount(state.duration)} 帧 · 24 fps</strong><small>原生同步音频 · 已验证 {requiredNodes} 个 LTX 核心节点族</small></span>
          {missingNodes.length > 0 && <details><summary>{missingNodes.length} 个可选节点族不可用</summary><p>{missingNodes.join(', ')}</p></details>}
        </div>
        <div className="generate-bar"><div className="generation-summary"><Gauge size={17} /><span><strong>{state.resolution.replace('x', ' × ')}</strong><small>{state.duration} 秒 · {state.preset === 'quality' ? '两阶段画质' : '8 步 Turbo'}</small></span></div><div className="generate-actions">{latestJob && ['queued', 'running'].includes(latestJob.status) && <button className="danger-button" onClick={() => onCancel(latestJob)} disabled={cancelling}><CircleStop size={16} />{cancelling ? '正在停止……' : '取消'}</button>}<button className="primary-button" disabled={submitting || !connected || !modelReady || !(state.prompt.trim() || state.identityPrompt.trim()) || (state.mode === 'image' && !state.firstFrame) || (state.liveEnabled && state.livePreviewMode === 'sampling-override' && !samplingPreviewAvailable)} onClick={() => onGenerate({ mode: state.mode, prompt: applyDialoguePolicy([state.identityPrompt.trim(), state.referenceMode === 'msr' ? state.msrReferences.map((file, index) => `Image ${index + 1}: ${file.name} is an authoritative identity, subject, item, or background reference.`).join('\n') : '', state.prompt.trim()].filter(Boolean).join('\n\n'), state.noDialogue), width, height, duration: state.duration, seed: state.seed, preset: state.preset, livePreview: state.liveEnabled, previewOverride: state.liveEnabled && state.livePreviewMode === 'sampling-override' && samplingPreviewNodeType ? { nodeType: samplingPreviewNodeType, fps: 24 } : undefined, msr: state.referenceMode === 'msr' && state.msrLora ? { loraName: state.msrLora, references: state.msrReferences.map((file) => file.path) } : undefined, filenamePrefix: `video/LTX_2.5_${Date.now()}` }, state.firstFrame, state.liveEnabled)}>{submitting ? <LoaderCircle size={18} className="spin" /> : <Play size={18} fill="currentColor" />}{submitting ? '正在提交……' : '使用 LTX 生成'}</button></div></div>
      </section>
      <PreviewPanel><div className="panel-heading"><div><span>LTX 输出</span><strong>当前 LTX 工作区</strong></div>{rendering && <span className={`status-badge ${latestJob?.status ?? 'queued'}`}>{submitting && !latestJob ? '准备中' : latestJob?.status}</span>}</div>{state.liveEnabled && livePreview?.promptId === latestJob?.promptId && latestJob && ['queued', 'running'].includes(latestJob.status) && <figure className={`live-preview ${blurNsfwPreview && hasSensitivePreviewWording(latestJob.prompt) ? 'sensitive-preview' : ''}`} tabIndex={blurNsfwPreview && hasSensitivePreviewWording(latestJob.prompt) ? 0 : undefined}><img src={livePreview?.url ?? ''} alt="LTX 生成实时预览" />{blurNsfwPreview && hasSensitivePreviewWording(latestJob.prompt) && <span className="sensitive-preview-notice">敏感预览 · 悬停或聚焦显示</span>}<figcaption>LTX 实时预览 · 中间帧</figcaption></figure>}<div className="preview-stage">{latestJob?.outputUrl ? <ReliableVideo src={latestJob.outputUrl} controls autoPlay loop playsInline /> : rendering ? <div className="render-state constructing" data-render-state={latestJob?.status ?? 'queued'}><RenderConstruction state={latestJob?.status} label={latestJob?.progressLabel} progress={latestJob?.progress || undefined} /><div className="render-status-kicker"><i />{submitting && !latestJob ? '正在准备工作流' : latestJob?.status === 'queued' ? '本地排队中' : '本地引擎运行中'}</div><strong>{submitting && !latestJob ? '正在准备 LTX‑2.5 工作流' : latestJob?.progressLabel ?? (latestJob?.status === 'queued' ? '排队等待中' : '正在使用 LTX‑2.5 渲染')}</strong><span>{latestJob?.currentStep !== undefined && latestJob.totalSteps ? `实时采样第 ${latestJob.currentStep} 步，共 ${latestJob.totalSteps} 步` : latestJob ? `${latestJob.width} × ${latestJob.height} · ${latestJob.duration} 秒` : '正在把任务发送到 ComfyUI'}</span><div className="progress"><i style={{ width: `${latestJob?.progress ?? 2}%` }} /></div><small>{latestJob ? `${Math.round(latestJob.progress)}% · ComfyUI 实时状态` : '提交完成前加载面板会一直显示。'}</small></div> : <div className="empty-preview"><div className="preview-icon"><Film size={28} /></div><strong>你的 LTX 视频会显示在这里</strong><span>选择文字或图片模式，然后把镜头发送到 ComfyUI。</span></div>}</div><div className="pipeline-summary"><Pipeline ready={Boolean(models.diffusion)} label="LTX 扩散模型" value={models.diffusion} /><Pipeline ready={Boolean(models.textEncoder)} label="Gemma 编码器" value={models.textEncoder} /><Pipeline ready={Boolean(models.videoVae && models.audioVae && models.latentUpscaler)} label="视频管线" value={models.videoVae && models.audioVae && models.latentUpscaler ? '视频/音频 VAE + 隐空间 2×' : '缺少组件'} /></div></PreviewPanel>
    </div>
  </div>
}

function Pipeline({ ready, label, value }: { ready: boolean; label: string; value: string }) {
  return <div className="pipeline-item"><span className={ready ? 'ready' : ''}>{ready ? <Check size={13} /> : <AlertCircle size={13} />}</span><div><strong>{label}</strong><small title={value}>{value || '未检测到'}</small></div></div>
}
