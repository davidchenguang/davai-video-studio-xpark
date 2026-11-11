import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, ImagePlus, LoaderCircle, RotateCcw, Sparkles, X } from 'lucide-react'
import type { MediaFile } from '../types'
import type { ObjectInfo } from '../lib/comfyInfo'
import { buildFireRedEditWorkflow, FIRE_RED_REQUIRED_NODES, inferFireRedSelection } from '../lib/fireRedEditWorkflow'
import { queuePromptState } from '../lib/comfyJobState'
import { defaultFrameResolution, resolveFrameSize, type FrameResolution, type FrameSize } from '../lib/frameResolution'
import { FrameResolutionControl } from './FrameResolutionControl'
import './photo-edit.css'

const storageKey = 'oyama.photo-edit.workspace.v1'
type EditJob = { id: string; url: string }
type Draft = { source: MediaFile | null; references: MediaFile[]; prompt: string; seed: number; mode: 'turbo' | 'quality'; resolution: FrameResolution; result: MediaFile | null; job: EditJob | null }
type HistoryEntry = { status?: { status_str?: string }; outputs?: Record<string, { images?: Array<{ filename: string; subfolder?: string; type?: string }> }> }

function readDraft(): Draft {
  const fresh: Draft = { source: null, references: [], prompt: '', seed: Math.floor(Math.random() * 1_000_000_000), mode: 'turbo', resolution: defaultFrameResolution, result: null, job: null }
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? '{}') as Partial<Draft>
    return { ...fresh, ...saved, references: Array.isArray(saved.references) ? saved.references.filter((file): file is MediaFile => typeof file?.path === 'string' && Boolean(file.path)).slice(0, 2) : [], resolution: saved.resolution?.mode ? saved.resolution : defaultFrameResolution, mode: saved.mode === 'quality' ? 'quality' : 'turbo', source: saved.source?.path ? saved.source : null, result: saved.result?.path ? saved.result : null, job: saved.job?.id && saved.job.url ? saved.job : null }
  } catch { return fresh }
}

function ReferenceImage({ file, number, disabled, onReplace, onRemove }: { file: MediaFile; number: number; disabled: boolean; onReplace(): void; onRemove(): void }) {
  const [preview, setPreview] = useState('')
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let active = true
    setPreview(''); setFailed(false)
    window.minimax.mediaUrl(file.path).then(value => { if (active) setPreview(value) }).catch(() => { if (active) setFailed(true) })
    return () => { active = false }
  }, [file.path])
  return <div className="photo-edit-reference">
    <div className="photo-edit-reference-preview">{preview && !failed ? <img src={preview} alt={`Image ${number} 参考图`} onError={() => setFailed(true)}/> : <ImagePlus size={24} aria-hidden="true"/>}</div>
    <div className="photo-edit-reference-detail"><strong>Image {number} · 参考图</strong><span title={file.path}>{file.name}</span>{failed && <small role="alert">无法打开此图片。请在渲染前替换。</small>}</div>
    <div className="photo-edit-reference-actions"><button type="button" onClick={onReplace} disabled={disabled}>替换</button><button type="button" onClick={onRemove} disabled={disabled} aria-label={`移除 Image ${number} 参考图`}><X size={15}/></button></div>
  </div>
}

export function PhotoEditWorkspace({ url, info, connected, outputDirectory, incomingSource, onConsumeIncoming, onUseRipple, onOpenRipple }: {
  url: string
  info: ObjectInfo
  connected: boolean
  outputDirectory: string
  incomingSource: { file: MediaFile; size: FrameSize } | null
  onConsumeIncoming(): void
  onUseRipple(file: MediaFile, size: FrameSize): void
  onOpenRipple(): void
}) {
  const initial = useMemo(readDraft, [])
  const [source, setSource] = useState<MediaFile | null>(incomingSource?.file ?? initial.source)
  const [references, setReferences] = useState<MediaFile[]>(initial.references)
  const [sourceSize, setSourceSize] = useState<FrameSize | null>(null)
  const [resultSize, setResultSize] = useState<FrameSize | null>(null)
  const [resolution, setResolution] = useState<FrameResolution>(incomingSource ? { mode: 'custom', ...incomingSource.size } : initial.resolution)
  const [prompt, setPrompt] = useState(initial.prompt)
  const [seed, setSeed] = useState(initial.seed)
  const [mode, setMode] = useState<'turbo' | 'quality'>(initial.mode)
  const [result, setResult] = useState<MediaFile | null>(incomingSource ? null : initial.result)
  const [job, setJob] = useState<EditJob | null>(initial.job)
  const [preparing, setPreparing] = useState(false)
  const [message, setMessage] = useState(incomingSource ? 'Ripple 的首帧已就绪，可以编辑。' : '')
  const [error, setError] = useState(false)
  const [saveProblem, setSaveProblem] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [resultUrl, setResultUrl] = useState('')
  const outputSize = resolveFrameSize(sourceSize, resolution)
  const selected = inferFireRedSelection(info)
  const missingNodes: string[] = FIRE_RED_REQUIRED_NODES.filter(node => !info[node])
  if (selected.modelLoader === 'UnetLoaderGGUF' && !info.UnetLoaderGGUF) missingNodes.push('UnetLoaderGGUF')
  if (selected.lightningLora && !info.LoraLoaderModelOnly) missingNodes.push('LoraLoaderModelOnly')
  const missing = [
    ...(!connected ? ['请在设置中连接 ComfyUI。'] : []),
    ...(connected && missingNodes.length ? [`请为以下节点更新 ComfyUI：${missingNodes.join(', ')}。`] : []),
    ...(connected && !selected.model ? ['请在 ComfyUI/models/diffusion_models 中安装 FireRed Image Edit transformer（GGUF 或 safetensors）。'] : []),
    ...(connected && !selected.encoder ? ['请在 ComfyUI/models/text_encoders 中安装 Qwen 2.5 VL 7B 文本编码器。'] : []),
    ...(connected && !selected.vae ? ['请在 ComfyUI/models/vae 中安装 qwen_image_vae.safetensors。'] : []),
    ...(connected && mode === 'turbo' && !selected.lightningLora ? ['Turbo 需要 FireRed 8-step Lightning LoRA。切换到画质模式可在没有它的情况下渲染。'] : []),
  ]
  const busy = preparing || Boolean(job && !saveProblem)

  useEffect(() => { if (incomingSource) onConsumeIncoming() }, [incomingSource, onConsumeIncoming])
  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify({ source: source ? { ...source, preview: undefined } : null, references: references.map(file => ({ ...file, preview: undefined })), prompt, seed, mode, resolution, result: result ? { ...result, preview: undefined } : null, job }))
  }, [source, references, prompt, seed, mode, resolution, result, job])
  useEffect(() => {
    let active = true
    setSourceUrl(''); setSourceSize(null)
    if (source) window.minimax.mediaUrl(source.path).then(value => { if (active) setSourceUrl(value) }).catch(reason => { if (active) { setMessage(`无法打开源图片：${String(reason)}`); setError(true) } })
    return () => { active = false }
  }, [source])
  useEffect(() => {
    let active = true
    setResultUrl(''); setResultSize(null)
    if (result) window.minimax.mediaUrl(result.path).then(value => { if (active) setResultUrl(value) }).catch(reason => { if (active) { setMessage(`无法打开编辑后的图片：${String(reason)}`); setError(true) } })
    return () => { active = false }
  }, [result])
  useEffect(() => {
    if (!job || saveProblem) return
    let active = true
    let timer: ReturnType<typeof setTimeout>
    let missingOutputPolls = 0
    let missingJobPolls = 0
    const poll = async () => {
      try {
        const history = await window.minimax.getHistory(job.url, job.id)
        if (!active) return
        const entry = history[job.id] as HistoryEntry | undefined
        if (entry?.status?.status_str === 'error') {
          setJob(null); setMessage('FireRed 在 ComfyUI 中运行失败。请检查其执行日志与所选模型文件。'); setError(true)
          return
        }
        const image = entry?.outputs?.['14']?.images?.[0]
        if (image) {
          setMessage('正在保存编辑后的帧……')
          const saved = await window.minimax.saveComfyOutputImage(job.url, image, outputDirectory, 'photo-edit').catch(reason => {
            throw new Error(`FireRed 已完成，但图片未能保存到本地。请重试保存，或从 ComfyUI 输出中选择完成的图片。${reason instanceof Error ? reason.message : String(reason)}`)
          })
          if (active) { setResult({ ...saved, kind: 'image' }); setJob(null); setMessage('照片编辑完成。满意后发送到 Ripple。'); setError(false) }
          return
        }
        if (entry?.status?.status_str === 'success') {
          missingOutputPolls += 1
          if (missingOutputPolls > 2) {
            setJob(null); setMessage('FireRed 已完成但没有保存图片。请检查 ComfyUI 中的 SaveImage 节点。'); setError(true)
            return
          }
          setMessage('正在收集编辑后的图片……')
        } else if (entry) {
          missingJobPolls = 0
          setMessage('FireRed 正在 ComfyUI 中编辑照片……')
        } else {
          const queue = await window.minimax.getQueue(job.url)
          if (!active) return
          const state = queuePromptState(queue, job.id)
          if (state) missingJobPolls = 0
          else missingJobPolls += 1
          if (missingJobPolls >= 5) {
            setJob(null); setMessage('ComfyUI 中已找不到此次编辑。请从 ComfyUI 输出中选择图片，或重新渲染。'); setError(true)
            return
          }
          setMessage(state === 'queued' ? 'FireRed 编辑已进入 ComfyUI 队列……' : state === 'running' ? 'FireRed 正在 ComfyUI 中编辑照片……' : '正在检查 ComfyUI 中的 FireRed 编辑……')
        }
      } catch (reason) {
        if (active) {
          const problem = reason instanceof Error ? reason.message : String(reason)
          if (problem.startsWith('FireRed 已完成，但')) { setSaveProblem(problem); setMessage(problem); setError(true); return }
          setMessage('与 ComfyUI 的连接已断开。正在等待重连并恢复此次编辑……'); setError(false)
        }
      }
      if (active) timer = setTimeout(poll, 2000)
    }
    void poll()
    return () => { active = false; clearTimeout(timer) }
  }, [job, outputDirectory, saveProblem])

  const chooseSource = async () => {
    try {
      const picked = await window.minimax.chooseMedia('image')
      if (!picked) return
      setSource({ ...picked, kind: 'image' }); setResult(null); setJob(null); setSaveProblem(''); setMessage('源图片已就绪。描述你想要的修改。'); setError(false)
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : String(reason)); setError(true) }
  }
  const chooseReference = async (index: number) => {
    try {
      const picked = await window.minimax.chooseMedia('image')
      if (!picked) return
      setReferences(current => {
        const next = [...current]
        next[index] = { ...picked, kind: 'image' }
        return next.slice(0, 2)
      })
      setResult(null); setMessage(`Image ${index + 2} 参考图已就绪。在编辑指令中用编号引用它。`); setError(false)
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : String(reason)); setError(true) }
  }
  const removeReference = (index: number) => {
    setReferences(current => current.filter((_, at) => at !== index))
    setResult(null)
    setMessage('参考图已移除。再次渲染前请检查指令中的图片编号。')
    setError(false)
  }
  const render = async () => {
    if (!source || !outputSize || !prompt.trim() || missing.length || job || preparing) return
    setPreparing(true); setResult(null); setMessage('正在上传源图片……'); setError(false)
    try {
      const uploaded = await window.minimax.uploadInput(url, source.path)
      const uploadedReferences = []
      for (const [index, reference] of references.entries()) {
        setMessage(`正在上传 Image ${index + 2} 参考图……`)
        uploadedReferences.push(await window.minimax.uploadInput(url, reference.path))
      }
      const graph = buildFireRedEditWorkflow(uploaded, prompt, seed, selected, mode, outputSize, uploadedReferences)
      const response = await window.minimax.submitPrompt(url, graph)
      setJob({ id: response.prompt_id, url })
      setMessage('FireRed 编辑已提交到 ComfyUI……')
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : String(reason)); setError(true) }
    finally { setPreparing(false) }
  }
  const cancel = async () => {
    if (!job) return
    if (saveProblem) { setJob(null); setSaveProblem(''); setMessage('已忽略保存重试。完成的图片仍保留在 ComfyUI 输出中。'); setError(false); return }
    try { await window.minimax.cancelPrompt(job.url, job.id); setJob(null); setMessage('已取消照片编辑。'); setError(false) }
    catch (reason) { setMessage(`无法取消：${reason instanceof Error ? reason.message : String(reason)}`); setError(true) }
  }
  const chooseExistingResult = async () => {
    try {
      const picked = await window.minimax.chooseMedia('image')
      if (!picked) return
      setResult({ ...picked, kind: 'image' }); setJob(null); setSaveProblem(''); setMessage('编辑后的图片已就绪，可发送到 Ripple。'); setError(false)
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : String(reason)); setError(true) }
  }
  const reset = () => { setSource(null); setReferences([]); setPrompt(''); setMode('turbo'); setResolution(defaultFrameResolution); setResult(null); setJob(null); setSaveProblem(''); setSeed(Math.floor(Math.random() * 1_000_000_000)); setMessage('已清空照片编辑。'); setError(false) }

  return <div className="photo-edit-workspace">
    <header className="photo-edit-heading"><div><span className="photo-edit-eyebrow">创作 · FIRERED 图像编辑</span><h1>照片编辑</h1><p>从一张照片开始，描述一处修改，然后把结果用作 Ripple 的替换帧。</p></div><button type="button" className="photo-edit-reset" onClick={reset} disabled={busy}><RotateCcw size={15}/>重置</button></header>
    <div className="photo-edit-grid">
      <div className="photo-edit-left">
        <section className="photo-edit-card"><div className="photo-edit-card-heading"><span>01</span><div><h2>Image 1 · 源照片</h2><p>你要修改的那一帧。</p></div></div><button className="photo-edit-image-picker" type="button" onClick={() => void chooseSource()} disabled={busy}>{sourceUrl ? <img src={sourceUrl} alt="FireRed 编辑的 Image 1 源照片" onLoad={event => setSourceSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}/> : <span><ImagePlus size={31}/><strong>选择照片</strong><small>或使用从 Ripple 发来的帧 0</small></span>}</button>{source && <div className="photo-edit-file"><span title={source.path}>{source.name}</span><button type="button" onClick={() => void chooseSource()} disabled={busy}>替换</button></div>}<FrameResolutionControl source={sourceSize} value={resolution} onChange={setResolution} disabled={busy}/></section>
        <section className="photo-edit-card"><div className="photo-edit-card-heading"><span>02</span><div><h2>参考图与编辑</h2><p>Image 1 是上方所选源图。最多可添加两张参考图，用于身份、服装、物品或风格。</p></div></div>
          <div className="photo-edit-references" aria-label="FireRed 参考图">
            {references.map((file, index) => <ReferenceImage key={`${index}-${file.path}`} file={file} number={index + 2} disabled={busy} onReplace={() => void chooseReference(index)} onRemove={() => removeReference(index)}/>)}
            {references.length < 2 && <button type="button" className="photo-edit-add-reference" onClick={() => void chooseReference(references.length)} disabled={busy}><ImagePlus size={17}/>添加 Image {references.length + 2} 参考图 <span>可选</span></button>}
          </div>
          <label className="photo-edit-prompt" htmlFor="fire-red-prompt">要修改什么？<textarea id="fire-red-prompt" value={prompt} onChange={event => setPrompt(event.target.value)} rows={5} disabled={busy} placeholder="例如：Keep Image 1's pose and background. Use the jacket from Image 2 and the hat from Image 3." /></label><small className="photo-edit-hint">在指令中用 Image 1、Image 2、Image 3 按编号引用。Image 1 决定输出的构图与分辨率。</small></section>
      </div>
      <div className="photo-edit-right">
        <section className="photo-edit-card photo-edit-result">
          <div className="photo-edit-card-heading"><span>03</span><div><h2>编辑后的帧</h2><p>发送到 Ripple 前先检查。</p></div></div>
          <div className="photo-edit-result-stage">{resultUrl ? <img src={resultUrl} alt="FireRed 编辑后的帧" onLoad={event => setResultSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}/> : busy ? <div className="photo-edit-placeholder" role="status"><LoaderCircle className="photo-edit-spin" size={30}/><strong>{message || '正在 ComfyUI 中编辑……'}</strong></div> : <div className="photo-edit-placeholder"><Sparkles size={30}/><strong>编辑后的照片会显示在这里</strong><span>选择源照片并描述修改。</span><button type="button" className="photo-edit-secondary" onClick={() => void chooseExistingResult()}>选择已有的编辑图片</button></div>}</div>
          {result && resultUrl && <div className="photo-edit-result-actions"><span className="photo-edit-result-size">{resultSize ? `${resultSize.width} × ${resultSize.height}` : '正在读取图片尺寸……'}</span><a href={resultUrl} download={result.name} className="photo-edit-secondary">保存图片</a><button type="button" className="photo-edit-use" disabled={!resultSize} onClick={() => { if (resultSize) onUseRipple(result, resultSize) }}><Check size={16}/>用作 Ripple 替换帧<ArrowRight size={16}/></button></div>}
        </section>
        <section className="photo-edit-card photo-edit-run">
          <div className="photo-edit-engine"><span className={missing.length ? 'photo-edit-engine-dot missing' : 'photo-edit-engine-dot'} /><span>{missing.length ? '需要准备环境' : `FireRed 就绪 · ${mode === 'turbo' ? '8 步 Turbo' : '40 步画质'}`}</span></div>
          <fieldset className="photo-edit-mode" disabled={busy}><legend>渲染模式</legend><label className={mode === 'turbo' ? 'selected' : ''}><input type="radio" name="photo-edit-mode" checked={mode === 'turbo'} onChange={() => setMode('turbo')}/>Turbo <small>8 步 · Lightning LoRA</small></label><label className={mode === 'quality' ? 'selected' : ''}><input type="radio" name="photo-edit-mode" checked={mode === 'quality'} onChange={() => setMode('quality')}/>画质 <small>40 步 · 无 LoRA</small></label></fieldset>
          {missing.length > 0 && <div className="photo-edit-setup" role="status">{missing.map(item => <p key={item}>{item}</p>)}<a href="https://huggingface.co/FireRedTeam/FireRed-Image-Edit-1.1-ComfyUI" target="_blank" rel="noreferrer">获取官方 FireRed 模型 <ArrowRight size={13}/></a></div>}
          {message && <p className={error ? 'photo-edit-message error' : 'photo-edit-message'} role={error ? 'alert' : 'status'} aria-live="polite">{message}</p>}
          <div className="photo-edit-run-actions"><button type="button" className="photo-edit-generate" onClick={() => void render()} disabled={Boolean(job) || preparing || !source || !outputSize || !prompt.trim() || missing.length > 0}>{busy ? <LoaderCircle className="photo-edit-spin" size={17}/> : <Sparkles size={17}/>} {busy ? '正在编辑照片……' : '编辑照片'}</button>{saveProblem && <button type="button" className="photo-edit-secondary" onClick={() => { setSaveProblem(''); setMessage('正在重试保存……'); setError(false) }}>重试保存</button>}{job && <button type="button" className="photo-edit-secondary" onClick={() => void cancel()}><X size={15}/>{saveProblem ? '忽略' : '取消'}</button>}</div>
          <button type="button" className="photo-edit-back" onClick={onOpenRipple}><ArrowLeft size={15}/>返回 Ripple</button>
        </section>
      </div>
    </div>
  </div>
}
