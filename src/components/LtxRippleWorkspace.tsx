import { useEffect, useState } from 'react'
import { ArrowRight, Film, ImagePlus, LoaderCircle, RotateCcw, Sparkles, Upload, Video } from 'lucide-react'
import type { AppSettings, GenerationJob, MediaFile } from '../types'
import { LTX_RIPPLE_DEFAULT_PROMPT, LTX_RIPPLE_PRESET_SECONDS, rippleFrameOptions, rippleFramesForSeconds, type LtxRippleOptions } from '../lib/ltxRippleWorkflow'
import { defaultFrameResolution, isValidFrameSize, resolveFrameSize, type FrameResolution, type FrameSize } from '../lib/frameResolution'
import type { LivePreview } from '../lib/useLivePreview'
import { FrameResolutionControl } from './FrameResolutionControl'
import { planRippleChunks } from '../lib/ltxRippleBatch'
import { ReliableVideo } from './ReliableVideo'
import { VideoExportButtons } from './VideoExportButtons'
import './ltx-ripple.css'

type RippleDraft = { source: MediaFile | null; editedFrame: MediaFile | null; frames: number; lengthMode: 'preset' | 'custom'; customSeconds: number; longMode: boolean; chunkSeconds: number; overlapSeconds: number; blendTransitions: boolean; prompt: string; negativePrompt: string; strength: number; guideStrength: number; seed: number; resolution: FrameResolution; livePreview: boolean; previewMode: 'standard' | 'sampling-override' }
const storageKey = 'ltx-ripple.workspace.v1'
const initialDraft: RippleDraft = { source: null, editedFrame: null, frames: 97, lengthMode: 'custom', customSeconds: 4, longMode: false, chunkSeconds: 10, overlapSeconds: 1, blendTransitions: true, prompt: LTX_RIPPLE_DEFAULT_PROMPT, negativePrompt: '', strength: 1.35, guideStrength: 1, seed: Math.floor(Math.random() * 1_000_000_000), resolution: defaultFrameResolution, livePreview: true, previewMode: 'standard' }

function readDraft(): RippleDraft {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) ?? '{}') as Partial<RippleDraft>
    return { ...initialDraft, ...stored, guideStrength: typeof stored.guideStrength === 'number' && stored.guideStrength >= 0.5 && stored.guideStrength <= 1 ? stored.guideStrength : 1, resolution: stored.resolution?.mode ? stored.resolution : defaultFrameResolution, source: stored.source?.path ? stored.source : null, editedFrame: stored.editedFrame?.path ? stored.editedFrame : null }
  } catch { return initialDraft }
}

export function LtxRippleWorkspace({ settings, outputDirectory, connected, liveConnected, livePreview, samplingPreviewNodeType, batchPromptId, missingNodes, lora, modelReady, latestJob, submitting, incomingReplacement, onConsumeReplacement, onEditFirstFrame, onGenerate, onGenerateLong, onCancel }: {
  settings: AppSettings
  outputDirectory: string
  connected: boolean
  liveConnected: boolean
  livePreview: LivePreview | null
  samplingPreviewNodeType: string | null
  batchPromptId: string | null
  missingNodes: string[]
  lora: string
  modelReady: boolean
  latestJob?: GenerationJob
  submitting: boolean
  incomingReplacement: { file: MediaFile; size: FrameSize } | null
  onConsumeReplacement(): void
  onEditFirstFrame(file: MediaFile, size: FrameSize): void
  onGenerate(options: LtxRippleOptions, source: MediaFile, editedFrame: MediaFile): Promise<string | null>
  onGenerateLong(options: LtxRippleOptions, source: MediaFile, editedFrame: MediaFile, chunkSeconds: number, overlapSeconds: number, blend: boolean): Promise<string | null>
  onCancel(job: GenerationJob): void
}) {
  const [draft, setDraft] = useState<RippleDraft>(() => {
    const stored = readDraft()
    if (!incomingReplacement) return stored
    const aligned = isValidFrameSize(incomingReplacement.size) ? incomingReplacement.size : resolveFrameSize(incomingReplacement.size, { ...defaultFrameResolution, mode: 'source' })
    return { ...stored, editedFrame: incomingReplacement.file, resolution: aligned ? { mode: 'custom', ...aligned } : defaultFrameResolution }
  })
  const [sourceUrl, setSourceUrl] = useState('')
  const [editedUrl, setEditedUrl] = useState('')
  const [editedSize, setEditedSize] = useState<FrameSize | null>(null)
  const [sourceFirstUrl, setSourceFirstUrl] = useState('')
  const [sourceFirstFrame, setSourceFirstFrame] = useState<MediaFile | null>(null)
  const [metadata, setMetadata] = useState<{ duration: number; frameCount: number; width: number; height: number } | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)
  const patch = (values: Partial<RippleDraft>) => setDraft(current => ({ ...current, ...values }))
  useEffect(() => {
    if (!incomingReplacement) return
    const aligned = isValidFrameSize(incomingReplacement.size) ? incomingReplacement.size : resolveFrameSize(incomingReplacement.size, { ...defaultFrameResolution, mode: 'source' })
    setDraft(current => ({ ...current, editedFrame: incomingReplacement.file, resolution: aligned ? { mode: 'custom', ...aligned } : defaultFrameResolution }))
    onConsumeReplacement()
  }, [incomingReplacement, onConsumeReplacement])
  useEffect(() => {
    const saved = { ...draft, source: draft.source ? { ...draft.source, preview: undefined } : null, editedFrame: draft.editedFrame ? { ...draft.editedFrame, preview: undefined } : null }
    localStorage.setItem(storageKey, JSON.stringify(saved))
  }, [draft])
  useEffect(() => {
    let active = true
    setMetadata(null); setSourceUrl(''); setSourceFirstUrl(''); setSourceFirstFrame(null)
    if (!draft.source) return
    setBusy('正在读取源片段')
    Promise.all([
      window.minimax.mediaUrl(draft.source.path),
      window.minimax.getVideoMetadata(draft.source.path, settings.ffmpegPath),
      window.minimax.extractVideoFrame(draft.source.path, 0, outputDirectory, settings.ffmpegPath),
    ]).then(async ([url, meta, frame]) => {
      const firstUrl = await window.minimax.mediaUrl(frame.path)
      if (!active) return
      setSourceUrl(url); setSourceFirstUrl(firstUrl); setSourceFirstFrame({ path: frame.path, name: frame.name, kind: 'image' }); setMetadata(meta); setBusy('')
    }).catch(reason => { if (active) { setBusy(''); setError(`无法读取源视频。${reason instanceof Error ? reason.message : String(reason)}`) } })
    return () => { active = false }
  }, [draft.source, settings.ffmpegPath, outputDirectory])
  useEffect(() => {
    let active = true
    setEditedUrl(''); setEditedSize(null)
    if (draft.editedFrame) window.minimax.mediaUrl(draft.editedFrame.path).then(url => { if (active) setEditedUrl(url) }).catch(reason => { if (active) setError(`无法读取编辑后的帧。${String(reason)}`) })
    return () => { active = false }
  }, [draft.editedFrame])
  const choose = async (kind: 'video' | 'image') => {
    try {
      const selected = await window.minimax.chooseMedia(kind)
      if (!selected) return
      setError('')
      if (kind === 'video') patch({ source: { ...selected, kind } })
      else patch({ editedFrame: { ...selected, kind } })
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
  }
  const frameOptions = rippleFrameOptions(metadata ? Math.floor(metadata.duration * 24) : 0)
  const frames = draft.frames
  const durationPreset = draft.lengthMode === 'preset' ? LTX_RIPPLE_PRESET_SECONDS.find(seconds => rippleFramesForSeconds(seconds) === frames) : undefined
  let batchCount = 0
  let batchProblem = ''
  if (draft.longMode && metadata) {
    try { batchCount = planRippleChunks(metadata.duration, draft.chunkSeconds, draft.overlapSeconds).length; if (batchCount < 2) batchProblem = '此片段一次渲染即可完成。请关闭长视频模式。' }
    catch (reason) { batchProblem = reason instanceof Error ? reason.message : String(reason) }
  }
  const size = resolveFrameSize(metadata, draft.resolution)
  const blendTransitions = draft.blendTransitions && draft.overlapSeconds > 0
  const running = Boolean(latestJob && ['queued', 'running'].includes(latestJob.status))
  const preparing = working || submitting
  const announcedStage = latestJob?.progressLabel?.replace(/\s*·\s*step \d+ of \d+/i, '') ?? '正在渲染 Ripple 编辑'
  const missing = [
    ...(!connected ? ['请在设置中连接 ComfyUI'] : []),
    ...(!modelReady ? ['请安装 LTX 2.5 蒸馏模型、Gemma 编码器与视频/音频 VAE'] : []),
    ...(connected && !lora ? ['请在 ComfyUI/models/loras 中安装 LTX25_Ripple_v11.safetensors'] : []),
    ...(connected && missingNodes.length ? [`请启用这些 ComfyUI 节点：${missingNodes.join(', ')}`] : []),
    ...(draft.livePreview && draft.previewMode === 'sampling-override' && !samplingPreviewNodeType ? ['请安装或启用 ComfyUI-KJNodes 的 LTX2SamplingPreviewOverride 以使用采样预览'] : []),
  ]
  const canRender = Boolean(draft.source && draft.editedFrame && editedSize && size && (draft.longMode ? batchCount >= 2 && !batchProblem : frameOptions.includes(frames) && (draft.lengthMode !== 'custom' || draft.customSeconds >= 2 && draft.customSeconds <= 20)) && !missing.length && !busy && !working && !submitting && !running)
  const render = async () => {
    if (!draft.source || !draft.editedFrame || !size || !frames || !canRender) return
    setWorking(true); setError('')
    try {
      const options: LtxRippleOptions = { prompt: draft.prompt, negativePrompt: draft.negativePrompt, width: size.width, height: size.height, frames, strength: draft.strength, guideStrength: draft.guideStrength, seed: draft.seed, filenamePrefix: 'LTX_Ripple/FFAF', livePreview: draft.livePreview, previewOverride: draft.livePreview && draft.previewMode === 'sampling-override' && samplingPreviewNodeType ? { nodeType: samplingPreviewNodeType, fps: 24 } : undefined }
      const problem = draft.longMode ? await onGenerateLong(options, draft.source, draft.editedFrame, draft.chunkSeconds, draft.overlapSeconds, blendTransitions) : await onGenerate(options, draft.source, draft.editedFrame)
      if (problem) setError(problem)
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setWorking(false) }
  }
  return <div className="ripple-workspace">
    <header className="ripple-heading"><div><span className="ripple-kicker">LTX 2.5 · 首帧到全帧</span><h1>Ripple</h1><p>修改首帧，并让这次编辑沿原始片段的运动与节奏延续到每一帧。</p></div><button type="button" className="ripple-reset" disabled={preparing} onClick={() => { localStorage.removeItem(storageKey); setDraft({ ...initialDraft, seed: Math.floor(Math.random() * 1_000_000_000) }); setError('') }}><RotateCcw size={15}/> 重置输入</button></header>
    <div className="ripple-grid">
      <div className="ripple-controls">
        <section className="ripple-card"><div className="ripple-section-title"><span>01</span><div><h2>源视频运动</h2><p>视频提供运动、构图、节奏与音频。</p></div></div>{sourceUrl ? <div className="ripple-source"><ReliableVideo src={sourceUrl} controls preload="metadata" playsInline /></div> : <button className="ripple-source" type="button" onClick={() => void choose('video')}><span className="ripple-empty-media"><Video size={28}/><strong>选择源视频</strong><small>MP4 或其他受支持的本地片段</small></span></button>}{draft.source && <div className="ripple-file-row"><span title={draft.source.path}>{draft.source.name}</span><button type="button" onClick={() => void choose('video')}>替换</button></div>}{busy && <p className="ripple-muted" role="status"><LoaderCircle size={14} className="ripple-spin"/> {busy}…</p>}{metadata && <p className="ripple-muted">{metadata.width} × {metadata.height} · {metadata.duration.toFixed(1)} 秒 · {metadata.frameCount} 帧</p>}</section>
        <section className="ripple-card"><div className="ripple-section-title"><span>02</span><div><h2>编辑后的首帧</h2><p>把这张图片用作编辑后视频的开场帧。</p></div></div><div className="ripple-frame-compare"><div><small>原始帧 0</small><div className="ripple-frame">{sourceFirstUrl ? <img src={sourceFirstUrl} alt="从源片段提取的首帧"/> : <Film size={27}/>}</div>{sourceFirstFrame && size && <button className="ripple-edit-frame" type="button" onClick={() => onEditFirstFrame(sourceFirstFrame, size)}><Sparkles size={14}/> 用 FireRed 编辑此帧 <ArrowRight size={14}/></button>}</div><ArrowRight size={20} aria-hidden="true"/><div><small>替换帧 0</small><button className="ripple-frame ripple-frame-button" type="button" onClick={() => void choose('image')}>{editedUrl ? <img src={editedUrl} alt="已选的替换帧" onLoad={event => setEditedSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} onError={() => { setEditedSize(null); setError('无法解码替换图片。请选择受支持的 PNG、JPEG 或 WebP 图片。') }}/> : <span><ImagePlus size={25}/> 选择图片</span>}</button></div></div>{draft.editedFrame && <div className="ripple-file-row"><span title={draft.editedFrame.path}>{draft.editedFrame.name}</span><button type="button" onClick={() => void choose('image')}>替换</button></div>}{editedSize && size && (editedSize.width !== size.width || editedSize.height !== size.height) && <p className="ripple-warning" role="status">替换图为 {editedSize.width} × {editedSize.height}；Ripple 会把它缩放并居中裁剪到 {size.width} × {size.height}。在图片编辑中设置相同尺寸可避免重采样。</p>}</section>
        <section className="ripple-card"><div className="ripple-section-title"><span>03</span><div><h2>指挥这次编辑</h2><p>只描述要改变什么或保持什么不变。</p></div></div><label className="ripple-field">编辑提示词<textarea value={draft.prompt} rows={4} onChange={event => patch({ prompt: event.target.value })} placeholder={LTX_RIPPLE_DEFAULT_PROMPT}/></label><details className="ripple-advanced"><summary>高级控制</summary><label className="ripple-field">反向提示词<textarea value={draft.negativePrompt} rows={2} onChange={event => patch({ negativePrompt: event.target.value })}/></label><label className="ripple-field">Ripple 强度 <output>{draft.strength.toFixed(2)}</output><input type="range" min="0.5" max="2" step="0.05" value={draft.strength} onChange={event => patch({ strength: Number(event.target.value) })}/></label><label className="ripple-field">运动引导强度 <output>{draft.guideStrength.toFixed(2)}</output><input type="range" min="0.5" max="1" step="0.05" value={draft.guideStrength} onChange={event => patch({ guideStrength: Number(event.target.value) })}/></label><small className="ripple-muted">数值越低，源视频引导越松；满强度最能保留其运动。</small><label className="ripple-field">种子<input type="number" min="0" max="2147483647" value={draft.seed} onChange={event => patch({ seed: Number(event.target.value) })}/></label></details></section>
      </div>
      <aside className="ripple-output"><section className="ripple-card ripple-render-card"><div className="ripple-section-title"><span>04</span><div><h2>渲染区间</h2><p>Ripple 会在 24 fps 下编辑源片段的开头。</p></div></div>
        <label className="ripple-long-toggle"><input type="checkbox" checked={draft.longMode} onChange={event => patch({ longMode: event.target.checked })}/> 分块处理整个视频</label>
        {draft.longMode ? <div className="ripple-long-settings"><label className="ripple-field">分块长度<select value={draft.chunkSeconds} onChange={event => patch({ chunkSeconds: Number(event.target.value) })}><option value="5">5 秒 · 更低显存</option><option value="10">10 秒 · 更多上下文</option><option value="15">15 秒 · 高显存</option></select></label><label className="ripple-field">重叠<select value={draft.overlapSeconds} onChange={event => { const overlapSeconds = Number(event.target.value); patch({ overlapSeconds, blendTransitions: overlapSeconds > 0 && draft.blendTransitions }) }}><option value="0">无</option><option value="0.3333333333333333">⅓ 秒</option><option value="0.6666666666666666">⅔ 秒</option><option value="1">1 秒</option><option value="2">2 秒</option></select></label><label className="ripple-long-toggle"><input type="checkbox" checked={blendTransitions} disabled={draft.overlapSeconds === 0} onChange={event => patch({ blendTransitions: event.target.checked })}/> 混合过渡</label><p className="ripple-muted">{batchCount ? `${batchCount} 个连续分块 · ${(metadata?.duration ?? 0).toFixed(1)} 秒源视频 · 保留原始音频` : '请选择 2 秒到 5 分钟的源片段。'}</p><small>每个分块以前一分块重叠处提取的编辑帧开始。组装完成前请保持应用开启。</small>{batchProblem && <p className="ripple-warning" role="status">{batchProblem}</p>}</div> : <>
          <label className="ripple-field">Ripple 编辑长度<select aria-label="Ripple 编辑长度" value={durationPreset ?? 'custom'} onChange={event => { const seconds = Number(event.target.value); if (Number.isFinite(seconds)) patch({ lengthMode: 'preset', frames: rippleFramesForSeconds(seconds) }); else patch({ lengthMode: 'custom', customSeconds: Math.min(20, Math.max(2, frames / 24)) }) }}><option value="custom">自定义</option>{LTX_RIPPLE_PRESET_SECONDS.map(seconds => <option key={seconds} value={seconds} disabled={metadata ? !frameOptions.includes(rippleFramesForSeconds(seconds)) : false}>{seconds} 秒</option>)}</select></label>
          {!durationPreset && <label className="ripple-field">自定义秒数<input type="number" min="2" max="20" step="0.1" value={draft.customSeconds} onChange={event => { const seconds = Number(event.target.value); patch({ customSeconds: seconds, ...(seconds >= 2 && seconds <= 20 ? { frames: rippleFramesForSeconds(seconds) } : {}) }) }}/></label>}
          <p className="ripple-muted">{frames} 帧 · {(frames / 24).toFixed(2)} 秒输出 · {frames - 1} 帧源视频。LTX 会把帧数取整到 8n + 1。</p>
          {frames > 121 && <p className="ripple-warning" role="status">长的单次渲染需要更多显存与时间。Ripple 在超过 5 秒时使用分块引导编码，但 10–20 秒的单次渲染仍可能显存不足。</p>}
        </>}
        <FrameResolutionControl source={metadata} value={draft.resolution} onChange={resolution => patch({ resolution })}/>
        <div className="ripple-preview-controls"><label><input type="checkbox" checked={draft.livePreview} onChange={event => patch({ livePreview: event.target.checked })}/> 实时预览</label><select aria-label="预览来源" value={draft.previewMode} disabled={!draft.livePreview} onChange={event => patch({ previewMode: event.target.value as RippleDraft['previewMode'] })}><option value="standard">标准解码帧</option><option value="sampling-override" disabled={!samplingPreviewNodeType}>LTX 采样 · 24 fps</option></select><small>{draft.livePreview ? liveConnected ? draft.previewMode === 'sampling-override' ? '已连接 · 渲染期间出现采样帧' : '已连接 · 接近完成时出现解码帧' : '正在连接 ComfyUI 预览…' : '预览已关闭 · 进度与保存的视频仍可查看'}</small></div>
        {size && <div className="ripple-facts"><span>输出 <strong>{size.width} × {size.height}</strong></span><span>适配器 <strong>{`Ripple v11 · ${draft.strength.toFixed(2)}`}</strong></span><span>采样器 <strong>8 步 · Euler</strong></span></div>}
        {metadata && !draft.longMode && !frameOptions.includes(frames) && <p className="ripple-warning">此源片段对所选区间来说太短。请选择更短的长度或更长的片段。</p>}
        {missing.length > 0 && <div className="ripple-warning" role="status"><strong>需要准备环境</strong>{missing.map(message => <p key={message}>{message}</p>)}</div>}{error && <p className="ripple-error" role="alert">{error}</p>}<button type="button" className="ripple-generate" onClick={() => void render()} disabled={!canRender}>{working || submitting ? <LoaderCircle size={17} className="ripple-spin"/> : <Sparkles size={17}/>} {working || submitting ? '正在准备 Ripple…' : draft.longMode ? '渲染整个视频' : '渲染 Ripple 编辑'}</button><small className="ripple-render-note">源视频会被保留。渲染使用所选区间的规范化副本。</small></section>
      <section className="ripple-card ripple-result"><div className="ripple-result-heading"><div><small>输出</small><h2>编辑后的视频</h2></div>{latestJob && <span className={`status-badge ${latestJob.status}`}>{latestJob.status}</span>}</div>{running && draft.livePreview && livePreview && livePreview.promptId === (batchPromptId ?? latestJob?.promptId) && <figure className="ripple-live-preview">{livePreview.mime.startsWith('video/') ? <video src={livePreview.url} aria-label="LTX Ripple 采样实时预览" autoPlay muted loop playsInline/> : <img src={livePreview.url} alt="LTX Ripple 采样实时预览"/>}<figcaption>{draft.previewMode === 'sampling-override' ? 'LTX 采样预览' : '解码首帧'}{livePreview.step && livePreview.totalSteps ? ` · 第 ${livePreview.step} 步，共 ${livePreview.totalSteps} 步` : ''}</figcaption></figure>}{running && <span className="sr-only" role="status" aria-live="polite">{announcedStage}</span>}<div className="ripple-result-stage">{running ? <div className="ripple-result-empty"><LoaderCircle size={27} className="ripple-spin"/><strong>{latestJob?.progressLabel || '正在渲染 Ripple 编辑'}</strong><span>{Math.round(latestJob?.progress ?? 0)}% · ComfyUI</span></div> : latestJob?.outputUrl ? <ReliableVideo src={latestJob.outputUrl} controls preload="metadata" playsInline/> : <div className="ripple-result-empty"><Upload size={27}/><strong>你编辑后的片段会显示在这里</strong><span>选择源视频与编辑后的首帧即可开始。</span></div>}</div>{latestJob?.status === 'failed' && <p className="ripple-error" role="alert">{latestJob.error || '渲染失败。请检查 ComfyUI 后重试。'}</p>}{running && latestJob && <button type="button" className="ripple-cancel" onClick={() => onCancel(latestJob)}>取消渲染</button>}{latestJob && <VideoExportButtons job={latestJob}/>}</section></aside>
    </div>
  </div>
}
