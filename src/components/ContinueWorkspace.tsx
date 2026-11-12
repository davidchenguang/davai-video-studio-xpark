import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { VideoExportButtons } from './VideoExportButtons'
import { MovieMediaThumbnail } from './MovieMediaThumbnail'
import { AlertTriangle, ArrowDown, ArrowUp, Check, ChevronRight, CircleStop, Copy, Film, FolderOpen, GitBranch, LoaderCircle, PanelRight, Play, Plus, RefreshCw, RotateCcw, Search, Settings2, Trash2, X } from 'lucide-react'
import { createId } from '../lib/createId'
import { normalizeContinuationSources, continuationBeatSignature, continuationLongestSequence, continuationOutputName, continuationSourcePrompt, continuationTiming, type ContinuationOpenRequest } from '../lib/continuation'
import type { LivePreview } from '../lib/useLivePreview'
import type { GenerationJob, MediaFile } from '../types'
import './continue-workspace.css'

export type ContinueMethod = 'motion' | 'last' | 'frame'
export type ContinueMode = 'text' | 'reference'
export type ContinuationSettings = {
  dialogueMode: 'inherit' | 'none' | 'allow'
  contextFrames: number
  blendFrames: number
  carryAudio: boolean
}
export type ContinueBeat = {
  id: string
  name: string
  prompt: string
  duration: number
  frameTime: number
  cameraOverride: string
  shotSize?: string
  cameraAngle?: string
  cameraMovement?: string
  continuityBreak: boolean
  replacements: Partial<Record<'character' | 'wardrobe' | 'location' | 'prop', MediaFile>>
  replacementOwnerIds?: Partial<Record<'character' | 'wardrobe', string>>
  sourceMode?: 'previous' | 'original' | 'beat'
  sourceBeatId?: string
}
export type ContinueScript = { version: 1; id: string; videoName: string; mode: ContinueMode; method: ContinueMethod; continuity: ContinuationSettings; sourceJobId?: string; externalSource?: MediaFile; sourcePromptDrafts?: Record<string, string>; beats: ContinueBeat[] }

const storageKey = 'oyama.continue.script.v1'
const defaultContinuity = (): ContinuationSettings => ({ dialogueMode: 'inherit', contextFrames: 22, blendFrames: 0, carryAudio: true })
const newBeat = (name = '节拍 1'): ContinueBeat => ({ id: createId(), name, prompt: '', duration: 5, frameTime: 0, cameraOverride: '', continuityBreak: false, replacements: {}, sourceMode: 'original' })
const emptyScript = (): ContinueScript => ({ version: 1, id: createId(), videoName: '', mode: 'text', method: 'last', continuity: defaultContinuity(), beats: [newBeat()] })
function loadScript(): ContinueScript {
  try {
    type LegacyBeat = ContinueBeat & Partial<ContinuationSettings> & { branchFromBeatId?: string }
    const raw = JSON.parse(localStorage.getItem(storageKey) || 'null') as (Omit<ContinueScript, 'beats' | 'continuity'> & { continuity?: Partial<ContinuationSettings>; beats: LegacyBeat[] }) | null
    if (raw?.version === 1 && Array.isArray(raw.beats)) {
      const legacySettings = raw.beats[0]
      const continuity = { ...defaultContinuity(), ...legacySettings, ...raw.continuity }
      return { ...raw, videoName: raw.videoName ?? '', continuity, beats: raw.beats.length ? normalizeBeatSources(raw.beats.map((beat, index) => {
        const normalizedBeat = { ...beat }
        delete normalizedBeat.contextFrames
        delete normalizedBeat.blendFrames
        delete normalizedBeat.carryAudio
        delete normalizedBeat.dialogueMode
        const branchFromBeatId = normalizedBeat.branchFromBeatId
        delete normalizedBeat.branchFromBeatId
        return { ...newBeat(), ...normalizedBeat, replacements: beat.replacements ?? {}, name: beat.name?.trim() || `节拍 ${index + 1}`, sourceMode: beat.sourceMode ?? (branchFromBeatId ? 'beat' : index === 0 ? 'original' : 'previous'), sourceBeatId: beat.sourceBeatId ?? branchFromBeatId }
      })) : [newBeat()] }
    }
  } catch { /* A damaged draft should not block the workspace. */ }
  return emptyScript()
}

function nextBeatName(beats: ContinueBeat[]) {
  let number = 1
  const names = new Set(beats.map(beat => beat.name.trim().toLocaleLowerCase()))
  // Older drafts stored the default name in English; both spellings have to
  // count as taken so a new beat never collides with an existing one.
  while (names.has(`节拍 ${number}`) || names.has(`beat ${number}`)) number += 1
  return `节拍 ${number}`
}

function sourceName(file: GenerationJob | MediaFile | undefined) {
  if (!file) return ''
  const raw = 'status' in file ? file.localOutputPath?.split(/[\\/]/).at(-1) : file.name
  return raw?.replace(/\.[^.]+$/, '') ?? ''
}

// Job status values stay English in storage and CSS classes; this map is the
// Chinese display layer for the beat list and the status chip.
const beatStatusLabels: Record<string, string> = { planned: '待生成', queued: '排队中', running: '渲染中', completed: '已完成', failed: '已失败', cancelled: '已取消' }
function beatStatusLabel(status: string) { return beatStatusLabels[status] ?? status }

// Replacement roles stay English in storage; this map is the Chinese display layer.
const replacementRoleLabels: Record<string, string> = { character: '角色', wardrobe: '服装', location: '地点', prop: '道具' }

function sourceBeatIdFor(beats: ContinueBeat[], beat: ContinueBeat, index: number) {
  if (beat.sourceMode === 'original') return undefined
  if (beat.sourceMode === 'beat') return beat.sourceBeatId
  return beats[index - 1]?.id
}

const normalizeBeatSources = normalizeContinuationSources

function ContinuationRenderPreview({ job, livePreview, liveConnected, compact = false }: { job: GenerationJob; livePreview: LivePreview | null; liveConnected: boolean; compact?: boolean }) {
  const [playbackStatus, setPlaybackStatus] = useState('')
  useEffect(() => setPlaybackStatus(''), [job.outputUrl])
  const live = job.promptId && livePreview?.promptId === job.promptId ? livePreview : null
  const rendering = ['queued', 'running'].includes(job.status)
  return <div className={`continue-render-preview ${compact ? 'compact' : ''}`}>
    {job.outputUrl ? <video src={job.outputUrl} controls preload="metadata" onWaiting={() => setPlaybackStatus('正在缓冲视频…')} onCanPlay={() => setPlaybackStatus('')} onPlaying={() => setPlaybackStatus('')} onError={() => setPlaybackStatus('无法解码该视频。可导出片段后在其他播放器中打开，或检查源文件是否仍然可用。')} /> : live ? <figure><div>{live.mime === 'video/mp4' ? <video key={live.url} src={live.url} aria-label="续接动画实时预览" autoPlay loop muted playsInline preload="auto" /> : <img key={live.url} src={live.url} alt={live.animated ? '续接动画实时预览' : '续接实时预览'} />}</div><figcaption><span><i />实时预览</span><small>{live.animated ? `H3 动画${live.step && live.totalSteps ? ` · 第 ${live.step}/${live.totalSteps} 步` : ''}` : '中间解码帧'}</small></figcaption></figure> : <div className={`continue-render-placeholder ${job.status}`}><span>{rendering ? <LoaderCircle className="spin" size={28} /> : <Film size={28} />}</span><strong>{job.status === 'queued' ? job.promptId ? '在 ComfyUI 队列中等待' : '提交 ComfyUI 前正在本地准备' : job.status === 'running' ? '等待第一个预览帧' : job.status === 'cancelled' ? '节拍已取消' : '预览不可用'}</strong><small>{rendering && job.promptId ? liveConnected ? '实时画面已连接 · 渲染结果会自动出现在这里' : '实时画面正在重连 · ComfyUI 中渲染继续' : job.progressLabel ?? `${job.width} × ${job.height} · ${job.duration} 秒`}</small></div>}
    {rendering && <div className="continue-render-progress"><span><i style={{ width: `${Math.max(2, job.progress)}%` }} /></span><small>{job.currentStep !== undefined && job.totalSteps ? `第 ${job.currentStep} 步，共 ${job.totalSteps} 步` : job.progressLabel ?? '正在准备预览'}<b>{Math.round(job.progress)}%</b></small></div>}
    <div className="continue-render-details" role="status" aria-live="polite"><strong>{job.progressLabel ?? (job.status === 'completed' ? '合并视频已保存' : job.status === 'failed' ? '渲染失败' : '正在本地准备')}</strong><span>{job.promptId ? `ComfyUI 提示词 ${job.promptId} · ` : '尚未提交到 ComfyUI · '}{job.queuePosition ? `队列位置 ${job.queuePosition} · ` : ''}{job.currentStep !== undefined && job.totalSteps ? `采样第 ${job.currentStep} 步，共 ${job.totalSteps} 步 · ` : ''}{job.width} × {job.height} · {job.duration} 秒</span></div>
    {(job.comfyActivity?.length || job.execution) && <details className="continue-render-activity" open={job.status === 'failed'}><summary>渲染活动与配置</summary>{job.execution && <p>{[job.execution.diffusionModel && `模型：${job.execution.diffusionModel}`, job.execution.gpuRouting && `GPU：${job.execution.gpuRouting}`, job.execution.sampler && `采样器：${job.execution.sampler}`, job.execution.preview && `预览：${job.execution.preview}`].filter(Boolean).join(' · ')}</p>}{Boolean(job.comfyActivity?.length) && <ol>{job.comfyActivity?.map((entry, index) => <li key={`${entry.at}-${index}`}><time dateTime={new Date(entry.at).toISOString()}>{new Date(entry.at).toLocaleTimeString()}</time> {entry.message}</li>)}</ol>}</details>}
    {playbackStatus && <p role="status" aria-live="polite">{playbackStatus}</p>}
  </div>
}

export function ContinueWorkspace({ openRequest, jobs, connected, liveConnected, motionReady, assemblyReady, missingNodes, livePreview, cancellingIds, onChooseVideo, onChooseImage, onGenerate, onCancel, onResetSource, onEditSourcePrompt }: {
  openRequest: ContinuationOpenRequest
  jobs: GenerationJob[]
  connected: boolean
  liveConnected: boolean
  motionReady: boolean
  assemblyReady: boolean
  missingNodes: string[]
  livePreview: LivePreview | null
  cancellingIds: Set<string>
  onChooseVideo(): Promise<MediaFile | null>
  onChooseImage(): Promise<MediaFile | null>
  onGenerate(script: ContinueScript, beat: ContinueBeat, source: GenerationJob | MediaFile, method: ContinueMethod, onProgress: (stage: string) => void): Promise<void>
  onCancel(job: GenerationJob): Promise<void>
  onResetSource(): void
  onEditSourcePrompt(job: GenerationJob, prompt: string): void
}) {
  const launchLock = useRef(false)
  const [script, setScript] = useState<ContinueScript>(loadScript)
  const [activeBeatId, setActiveBeatId] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(true)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false)
  const [sourceQuery, setSourceQuery] = useState('')
  const [sourceImporting, setSourceImporting] = useState(false)
  const [sourcePickerError, setSourcePickerError] = useState('')
  const [runningAll, setRunningAll] = useState(false)
  const [preparing, setPreparing] = useState<string | null>(null)
  const [preparationStage, setPreparationStage] = useState('')
  const [error, setError] = useState('')
  const [queueNotice, setQueueNotice] = useState('')
  const [frameDuration, setFrameDuration] = useState(0)
  const [sourcePlaybackError, setSourcePlaybackError] = useState('')
  const [sequenceTime, setSequenceTime] = useState(0)
  const [sequenceDuration, setSequenceDuration] = useState(0)
  const [cutCueTime, setCutCueTime] = useState(2.5)
  const sequencePlayer = useRef<HTMLVideoElement>(null)
  const [beatFrameDurations, setBeatFrameDurations] = useState<Record<string, number>>({})
  const appliedSourceRequest = useRef(0)
  const launched = useRef(new Set<string>())
  const sourcePickerRef = useRef<HTMLElement>(null)
  const completedJobs = useMemo(() => jobs.filter(job => job.mediaType !== 'image' && job.mediaType !== 'audio' && job.status === 'completed' && job.outputUrl), [jobs])
  const filteredSourceJobs = useMemo(() => {
    const query = sourceQuery.trim().toLocaleLowerCase()
    return query ? completedJobs.filter(job => `${job.prompt} ${sourceName(job)}`.toLocaleLowerCase().includes(query)) : completedJobs
  }, [completedJobs, sourceQuery])
  const sourceJob = completedJobs.find(job => job.id === script.sourceJobId)
  const source = sourceJob ?? script.externalSource
  const sourceUrl = sourceJob?.outputUrl ?? script.externalSource?.preview
  useEffect(() => { setSourcePlaybackError(''); setFrameDuration(0) }, [sourceUrl])
  const motionAvailable = motionReady && Boolean(sourceJob?.latentFile || jobs.some(job => job.continuation?.scriptId === script.id && job.status === 'completed' && job.latentFile))
  const method: ContinueMethod = script.method === 'motion' && !motionAvailable ? 'last' : script.method
  const beatJobs = useMemo(() => {
    const found = new Map<string, GenerationJob | undefined>()
    script.beats.forEach((beat, index) => {
      const parentId = sourceBeatIdFor(script.beats, beat, index)
      const parentSource = parentId ? found.get(parentId) : source
      const parentJobId = parentId && parentSource && 'status' in parentSource ? parentSource.id : parentId ? undefined : script.sourceJobId ?? script.externalSource?.path
      const beatMethod = method === 'motion' && (!parentSource || !('status' in parentSource) || !parentSource.latentFile) ? 'last' : method
      found.set(beat.id, parentId && !parentJobId ? undefined : jobs.find(job => job.continuation?.scriptId === script.id && job.continuation.beatId === beat.id && job.continuation.sourceJobId === parentJobId && job.continuation.beatSignature === continuationBeatSignature(beat, script.videoName, `${script.mode}:${beatMethod}`, script.continuity)))
    })
    return found
  }, [jobs, method, script, source])
  const continuationJobs = jobs.filter(job => job.continuation?.scriptId === script.id && script.beats.some(beat => beat.id === job.continuation?.beatId))
  const activeBeatJob = continuationJobs.find(job => ['queued', 'running'].includes(job.status))
  const displayedBeatJob = activeBeatJob ?? continuationJobs.find(job => job.outputUrl || job.status === 'failed' || job.status === 'cancelled')
  const displayedBeatNumber = displayedBeatJob ? script.beats.findIndex(beat => beat.id === displayedBeatJob.continuation?.beatId) + 1 : 0
  const activeBeat = script.beats.find(beat => beat.id === activeBeatId) ?? script.beats[0]
  const activeBeatIndex = Math.max(0, script.beats.findIndex(beat => beat.id === activeBeat.id))
  const activeJob = beatJobs.get(activeBeat.id)
  const sequence = useMemo(() => continuationLongestSequence(script, beatJobs, frameDuration || sourceJob?.duration || 0), [script, beatJobs, frameDuration, sourceJob?.duration])
  const sequenceUrl = sequence.job?.outputUrl ?? sourceUrl
  useEffect(() => { setSequenceTime(0); setSequenceDuration(0); setSourcePlaybackError('') }, [sequenceUrl])

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(script)) }
    catch { setError('续接草稿无法保存。请释放本地存储空间，然后再次编辑以重试。请保持工作室开启。') }
  }, [script])
  useEffect(() => {
    if (!openRequest.sourceId || appliedSourceRequest.current === openRequest.id) return
    if (activeBeatJob || preparing || runningAll) return
    appliedSourceRequest.current = openRequest.id
    const requestedJob = jobs.find(job => job.id === openRequest.sourceId)
    setScript(current => ({ ...current, videoName: current.videoName.trim() || sourceName(requestedJob), sourceJobId: openRequest.sourceId!, externalSource: undefined, method: motionReady && requestedJob?.latentFile ? 'motion' : 'last' }))
  }, [openRequest, jobs, motionReady, activeBeatJob, preparing, runningAll])
  useEffect(() => {
    if (!script.beats.some(beat => beat.id === activeBeatId)) setActiveBeatId(script.beats[0]?.id ?? null)
  }, [activeBeatId, script.beats])
  useEffect(() => {
    if (!sourcePickerOpen) return
    const doc = sourcePickerRef.current?.ownerDocument ?? document
    const previousFocus = doc.activeElement as HTMLElement | null
    sourcePickerRef.current?.querySelector<HTMLInputElement>('input[type="search"]')?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSourcePickerOpen(false)
      if (event.key !== 'Tab') return
      const elements = Array.from(sourcePickerRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)') ?? [])
      const first = elements[0]; const last = elements.at(-1)
      if (event.shiftKey && doc.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && doc.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    doc.addEventListener('keydown', onKey)
    return () => { doc.removeEventListener('keydown', onKey); previousFocus?.focus() }
  }, [sourcePickerOpen])

  const updateBeat = (id: string, patch: Partial<ContinueBeat>) => setScript(current => ({ ...current, beats: current.beats.map(beat => beat.id === id ? { ...beat, ...patch } : beat) }))
  const insertCutCue = (beat: ContinueBeat) => {
    const seconds = Math.max(0, Math.min(beat.duration, cutCueTime))
    const framing = [beat.shotSize, beat.cameraAngle, beat.cameraMovement].filter(Boolean).join(', ')
    const cue = `At ${seconds.toFixed(1)} seconds, hard cut to ${framing || 'a new camera angle'}; continue the action without a dissolve.`
    updateBeat(beat.id, { prompt: `${beat.prompt.trimEnd()}${beat.prompt.trim() ? '\n' : ''}${cue}` })
  }
  const updateContinuity = (patch: Partial<ContinuationSettings>) => setScript(current => ({ ...current, continuity: { ...current.continuity, ...patch } }))
  const sourceFor = useCallback((beat: ContinueBeat): GenerationJob | MediaFile | undefined => {
    const index = script.beats.findIndex(item => item.id === beat.id)
    const parentId = sourceBeatIdFor(script.beats, beat, index)
    if (parentId) return beatJobs.get(parentId)?.status === 'completed' ? beatJobs.get(parentId) : undefined
    return source
  }, [script.beats, beatJobs, source])
  const launch = useCallback(async (beat: ContinueBeat) => {
    if (!connected) { setError('请先启动 ComfyUI 并测试连接，然后再生成。'); setRunningAll(false); return }
    const prior = sourceFor(beat)
    if (!prior) { setError('请先生成上一个节拍，或选择一个已完成的来源片段。'); setRunningAll(false); return }
    if (!script.videoName.trim()) { setError('生成节拍前请先给源视频命名。'); setRunningAll(false); return }
    if (!beat.name.trim()) { setError('生成这个节拍前请先为它命名。'); setRunningAll(false); return }
    if (script.beats.some(item => item.id !== beat.id && item.name.trim().toLocaleLowerCase() === beat.name.trim().toLocaleLowerCase())) { setError('每个节拍的名称都必须唯一。请重命名这个节拍后再生成。'); setRunningAll(false); return }
    if (!beat.prompt.trim()) { setError('请写下这个节拍接下来发生什么。'); setRunningAll(false); return }
    const sourceCharacters = 'status' in prior ? prior.continuityState?.characters ?? [] : []
    const ambiguousReplacement = (['character', 'wardrobe'] as const).find(role => beat.replacements[role] && sourceCharacters.length > 1 && !beat.replacementOwnerIds?.[role])
    if (ambiguousReplacement) { setError(`请选择接收${ambiguousReplacement === 'character' ? '角色' : '服装'}替换的角色。`); setRunningAll(false); return }
    if (launchLock.current || preparing || activeBeatJob) return
    if (!assemblyReady) { setError('请安装 H3 Extender 的 Trim 与 Merge 节点，然后重新连接后再生成。'); setRunningAll(false); return }
    launchLock.current = true
    const beatMethod: ContinueMethod = method === 'motion' && (!('status' in prior) || !prior.latentFile) ? 'last' : method
    setPreparing(beat.id); setPreparationStage('检查来源与渲染要求'); setError(''); setQueueNotice('')
    try {
      await onGenerate(script, beat, prior, beatMethod, setPreparationStage)
      launched.current.add(beat.id)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setRunningAll(false)
    } finally { launchLock.current = false; setPreparing(null); setPreparationStage('') }
  }, [connected, sourceFor, preparing, activeBeatJob, assemblyReady, onGenerate, script, method])
  const cancel = useCallback(async (job: GenerationJob) => {
    setRunningAll(false)
    setQueueNotice('')
    try { await onCancel(job) } catch (cause) { setError(`无法取消：${cause instanceof Error ? cause.message : String(cause)}。请再次尝试取消。`) }
  }, [onCancel])
  useEffect(() => {
    if (!runningAll || preparing || activeBeatJob) return
    const next = script.beats.find(beat => (!beatJobs.get(beat.id) || ['failed', 'cancelled'].includes(beatJobs.get(beat.id)?.status ?? '')) && !launched.current.has(beat.id))
    if (!next) {
      const stopped = script.beats.find(beat => ['failed', 'cancelled'].includes(beatJobs.get(beat.id)?.status ?? ''))
      if (stopped) { setRunningAll(false); setError(`${stopped.name} 未完成。请解决问题，然后选择「继续生成全部」从该节拍重试。`) }
      else if (script.beats.every(beat => beatJobs.get(beat.id)?.status === 'completed')) setRunningAll(false)
      return
    }
    const index = script.beats.indexOf(next)
    const parentId = sourceBeatIdFor(script.beats, next, index)
    const parent = parentId ? beatJobs.get(parentId) : null
    if (parent?.status === 'failed' || parent?.status === 'cancelled') { setRunningAll(false); setError('上一个节拍未完成。请先重新生成它，再恢复「继续生成全部」。'); return }
    if (!parentId || parent?.status === 'completed') void launch(next)
  }, [runningAll, jobs, preparing, activeBeatJob, script, beatJobs, launch])

  const chooseSourceJob = (job: GenerationJob) => {
    setScript(current => ({ ...current, videoName: current.videoName.trim() || sourceName(job), sourceJobId: job.id, externalSource: undefined, method: motionReady && job.latentFile ? 'motion' : 'last' }))
    setError(''); setQueueNotice(''); setSourcePickerError(''); setSourcePickerOpen(false)
  }
  const openSourcePicker = () => { setSourceQuery(''); setSourcePickerError(''); setSourcePickerOpen(true) }
  const pickExternal = async () => {
    setSourceImporting(true); setError(''); setSourcePickerError('')
    try {
      const file = await onChooseVideo()
      if (!file) return
      setScript(current => ({ ...current, videoName: current.videoName.trim() || sourceName(file), sourceJobId: undefined, externalSource: file, method: 'last' }))
      setSourcePickerOpen(false); setQueueNotice(`${file.name} 已就绪，可作为续接来源。`)
    } catch (cause) {
      setSourcePickerError(`视频无法加载：${cause instanceof Error ? cause.message : String(cause)}。请选择其他文件，或确认它仍然存在。`)
    } finally { setSourceImporting(false) }
  }
  const chooseReplacement = async (beat: ContinueBeat, role: keyof ContinueBeat['replacements']) => {
    const file = await onChooseImage()
    if (file) updateBeat(beat.id, { replacements: { ...beat.replacements, [role]: { ...file, referenceRole: role === 'character' ? 'subject' : role } } })
  }
  const insert = (index: number, sourceBeatId?: string) => setScript(current => { const beats = [...current.beats]; beats.splice(index + 1, 0, { ...newBeat(nextBeatName(current.beats)), sourceMode: sourceBeatId ? 'beat' : 'previous', sourceBeatId }); return { ...current, beats } })
  const move = (index: number, direction: -1 | 1) => setScript(current => { const beats = [...current.beats]; const target = index + direction; if (target < 0 || target >= beats.length) return current; [beats[index], beats[target]] = [beats[target], beats[index]]; return { ...current, beats: normalizeBeatSources(beats) } })
  const resetContinuation = () => {
    if (activeBeatJob) return
    if (!window.confirm('重置续接工作区？这会清空所选来源与节拍脚本。已渲染的文件与生成历史会保留。')) return
    launched.current.clear()
    setRunningAll(false)
    setPreparing(null)
    setError('')
    setQueueNotice('')
    setFrameDuration(0)
    setBeatFrameDurations({})
    onResetSource()
    setScript(emptyScript())
  }

  const clearBeatSetup = async () => {
    setRunningAll(false)
    if (preparing) { setError('这个节拍仍在准备中。请等待提交完成，然后再清空它的设置。'); return }
    const runningJob = continuationJobs.find(job => job.continuation?.beatId === activeBeat.id && ['queued', 'running'].includes(job.status))
    if (runningJob) {
      try { await onCancel(runningJob) }
      catch (cause) { setError(`清空前无法停止这个节拍：${cause instanceof Error ? cause.message : String(cause)}`); return }
    }
    launched.current.delete(activeBeat.id)
    setScript(current => ({ ...current, beats: current.beats.map(beat => beat.id === activeBeat.id ? { ...newBeat(beat.name), id: beat.id, sourceMode: beat.sourceMode, sourceBeatId: beat.sourceBeatId } : beat) }))
    setError('')
    setQueueNotice(`${activeBeat.name} 的设置已清空。它的来源与脚本位置保持不变。`)
  }

  const resetQueue = async () => {
    setRunningAll(false)
    launched.current.clear()
    setError('')
    if (activeBeatJob) {
      try {
        await onCancel(activeBeatJob)
      } catch (cause) {
        setError(`队列已暂停，但无法停止正在运行的节拍：${cause instanceof Error ? cause.message : String(cause)}`)
        return
      }
    }
    setQueueNotice('队列已重置。脚本与已完成的节拍保持不变。准备好后选择「继续生成全部」。')
  }

  const locked = Boolean(activeBeatJob || preparing || runningAll)
  const finalJob = beatJobs.get(script.beats.at(-1)?.id ?? '')
  const activeBeatSource = sourceFor(activeBeat)
  const activeBeatMethod: ContinueMethod = method === 'motion' && (!activeBeatSource || !('status' in activeBeatSource) || !activeBeatSource.latentFile) ? 'last' : method
  const activeSourceCharacters = activeBeatSource && 'status' in activeBeatSource ? activeBeatSource.continuityState?.characters ?? [] : []
  const sourceChoice = activeBeat.sourceMode === 'beat' && activeBeat.sourceBeatId ? `beat:${activeBeat.sourceBeatId}` : activeBeatIndex === 0 || activeBeat.sourceMode === 'original' ? 'original' : 'previous'
  const duplicateName = script.beats.some(item => item.id !== activeBeat.id && item.name.trim().toLocaleLowerCase() === activeBeat.name.trim().toLocaleLowerCase())
  const activeTiming = continuationTiming(activeBeat.duration, !activeBeat.continuityBreak && activeBeatMethod === 'motion' ? script.continuity.contextFrames : 0, activeBeat.continuityBreak ? 0 : script.continuity.blendFrames)
  const completedCount = script.beats.filter(beat => beatJobs.get(beat.id)?.status === 'completed').length
  const nextIncomplete = script.beats.find(beat => !beatJobs.get(beat.id) || ['failed', 'cancelled'].includes(beatJobs.get(beat.id)?.status ?? ''))
  const failedBeat = script.beats.find(beat => beatJobs.get(beat.id)?.status === 'failed')
  const frameSourceUrl = activeBeatSource ? 'status' in activeBeatSource ? activeBeatSource.outputUrl : activeBeatSource.preview : undefined
  const selectedSourceName = sourceJob ? sourceName(sourceJob) || sourceJob.prompt.trim().split('\n')[0] || '已完成的渲染' : script.externalSource?.name ?? ''
  const editableSourceJob = sourceJob?.provider === 'minimax' && !sourceJob.continuation ? sourceJob : undefined
  const originalSourcePrompt = editableSourceJob ? continuationSourcePrompt(editableSourceJob) : ''
  const sourcePromptDraft = editableSourceJob ? script.sourcePromptDrafts?.[editableSourceJob.id] ?? originalSourcePrompt : ''

  return <div className={`continue-workspace ${settingsOpen ? '' : 'settings-collapsed'} ${script.beats.length === 1 ? 'single-beat' : ''}`}>
    <header className="continue-heading">
      <div><p className="eyebrow">续接 / H3</p><h1>续接视频</h1><p>从一个已完成的片段构建下一个镜头。每个完成的节拍都可以作为可复用的来源。</p></div>
      <div className="continue-heading-actions"><button className="secondary-button" type="button" disabled={locked} onClick={openSourcePicker}><FolderOpen size={15} />{source ? '更换来源' : '选择来源'}</button><button className="secondary-button" type="button" aria-pressed={settingsOpen} onClick={() => setSettingsOpen(value => !value)}><PanelRight size={15} />{settingsOpen ? '收起设置' : '展开设置'}</button></div>
    </header>

    <section className="continue-source-banner" aria-label="当前来源" role="status" aria-live="polite">
      <span className="continue-source-banner-icon"><Film size={19} /></span>
      <span><small>起始片段</small><strong>{source ? selectedSourceName : '未选择视频'}</strong><small>{sourceJob ? `${sourceJob.width} × ${sourceJob.height} · ${sourceJob.duration} 秒${sourceJob.latentFile ? ' · 运动上下文可用' : ''}` : source ? '导入的视频 · 帧连贯性' : '选择一个已完成的渲染，或导入一段视频开始'}</small></span>
      {source && <button className="secondary-button" type="button" disabled={locked} onClick={openSourcePicker}>替换</button>}
    </section>

    {editableSourceJob && <details className="continue-source-prompt" key={editableSourceJob.id}>
      <summary><span><strong>原始 H3 提示词</strong><small>{sourcePromptDraft !== originalSourcePrompt ? '续接中保存了修改稿' : '查看或修改这个来源片段使用的提示词'}</small></span><span>编辑提示词</span></summary>
      <div className="continue-source-prompt-body"><label htmlFor="continue-original-prompt">来源片段提示词</label><textarea id="continue-original-prompt" rows={5} value={sourcePromptDraft} onChange={event => { const text = event.target.value; setScript(current => ({ ...current, sourcePromptDrafts: { ...current.sourcePromptDrafts, [editableSourceJob.id]: text } })) }} /><p>已保存的片段不会改变。在「H3 创建」中打开这份草稿渲染新版本，然后把该渲染选为续接来源。</p><div><button className="secondary-button" type="button" disabled={sourcePromptDraft === originalSourcePrompt} onClick={() => setScript(current => { const sourcePromptDrafts = { ...current.sourcePromptDrafts }; delete sourcePromptDrafts[editableSourceJob.id]; return { ...current, sourcePromptDrafts } })}>恢复已保存的提示词</button><button className="primary-button" type="button" disabled={locked || !sourcePromptDraft.trim()} onClick={() => onEditSourcePrompt(editableSourceJob, sourcePromptDraft)}>在 H3 创建中打开草稿</button></div></div>
    </details>}

    {(script.beats.length > 1 || activeBeatJob || preparing || failedBeat || error) && <section className="continue-queuebar" aria-label="序列队列">
      <div><span className={`continue-queue-dot ${activeBeatJob ? 'working' : failedBeat ? 'failed' : completedCount === script.beats.length ? 'complete' : ''}`} /><span><strong>{activeBeatJob ? `${activeBeatJob.promptId ? '正在渲染' : '正在准备'}节拍 ${displayedBeatNumber}` : failedBeat ? `${failedBeat.name} 需要处理` : completedCount === script.beats.length ? '序列已完成' : '序列已就绪'}</strong><small>已完成 {completedCount} / {script.beats.length} 个节拍{activeBeatJob ? ` · ${Math.round(activeBeatJob.progress)}%` : ''}</small></span></div>
      <div><button className="secondary-button" type="button" disabled={!activeBeatJob && !runningAll && !preparing && !failedBeat && !error} onClick={() => void resetQueue()}><RotateCcw size={14} />重置队列</button>{activeBeatJob ? <button className="danger-button" type="button" disabled={cancellingIds.has(activeBeatJob.id)} onClick={() => void cancel(activeBeatJob)}><CircleStop size={14} />{cancellingIds.has(activeBeatJob.id) ? '正在停止…' : '停止当前'}</button> : <button className="primary-button" type="button" disabled={!connected || !source || !assemblyReady || !nextIncomplete || Boolean(preparing)} onClick={() => { launched.current.clear(); setError(''); setQueueNotice(''); setRunningAll(true) }}><Play size={14} />{failedBeat ? '继续生成全部' : '生成剩余节拍'}</button>}</div>
    </section>}

    {error && <section className="continue-recovery" role="alert"><AlertTriangle size={20} /><div><strong>{failedBeat && beatJobs.get(failedBeat.id)?.promptId ? '续接在 ComfyUI 中停止' : '节拍在提交到 ComfyUI 前停止'}</strong><p>{error}</p><span>{failedBeat && <button className="secondary-button" type="button" disabled={locked || !sourceFor(failedBeat)} onClick={() => { setActiveBeatId(failedBeat.id); void launch(failedBeat) }}><RefreshCw size={14} />重试 {failedBeat.name}</button>}<button className="secondary-button" type="button" onClick={() => setError('')}>忽略</button></span></div></section>}
    {queueNotice && <p className="continue-queue-notice" role="status" aria-live="polite"><Check size={15} />{queueNotice}</p>}
    {!connected ? <section className="continue-recovery" role="alert"><AlertTriangle size={20} /><div><strong>ComfyUI 已离线</strong><p>启动 ComfyUI，然后在设置中使用「测试连接」。你仍然可以继续规划片段，但在本地引擎可用之前「生成」会保持禁用。</p></div></section> : !assemblyReady && <section className="continue-recovery" role="alert"><AlertTriangle size={20} /><div><strong>续接工具未安装</strong><p>缺少：<code>{missingNodes.join(', ')}</code>。在 ComfyUI Manager 中安装 <a href="https://github.com/pmhaidn/ComfyUI-Minimax-H3-Extender" target="_blank" rel="noreferrer">MiniMax H3 Extender</a>，重启 ComfyUI，然后使用「测试连接」。编辑功能仍然可用，但「生成」会保持禁用，以免应用提交 ComfyUI 会拒绝的工作流。</p></div></section>}

    <div className="continue-layout">
      <aside className="continue-script-sidebar" aria-label="续接脚本大纲">
        <header><span><strong>脚本</strong><small>{script.beats.length} 个节拍</small></span><button className="icon-button" type="button" disabled={locked} aria-label="添加节拍" title="添加节拍" onClick={() => insert(script.beats.length - 1)}><Plus size={17} /></button></header>
        <nav><div className="continue-origin-tile"><span className="continue-script-number"><Film size={13} /></span><span><strong>原始</strong><small>{source ? selectedSourceName : '选择来源'}</small></span></div>{script.beats.map((beat, index) => { const job = beatJobs.get(beat.id); const status = job?.status ?? 'planned'; const parentId = sourceBeatIdFor(script.beats, beat, index); const parent = script.beats.find(item => item.id === parentId); return <button type="button" key={beat.id} className={`continue-script-item ${beat.id === activeBeat.id ? 'selected' : ''} status-${status}`} aria-current={beat.id === activeBeat.id ? 'step' : undefined} onClick={() => setActiveBeatId(beat.id)}><span className="continue-script-number">{job?.status === 'completed' ? <Check size={13} /> : index + 1}</span><span><strong>{beat.name.trim() || `节拍 ${index + 1}`}</strong><small>来自 {parent?.name.trim() || '原始'} · {beatStatusLabel(status)}{beat.continuityBreak ? ' · 硬切' : ''}</small></span><ChevronRight size={14} /></button> })}</nav>
        <footer><button className="secondary-button" type="button" disabled={locked} onClick={() => insert(script.beats.length - 1)}><Plus size={14} />添加节拍</button><button className="secondary-button" type="button" disabled={locked} title="清除来源与脚本；已完成的文件与历史会保留" onClick={resetContinuation}><Trash2 size={14} />新建脚本</button></footer>
      </aside>

      <div className="continue-editor">
        <section className={`continue-live-monitor ${activeBeatJob || preparing ? 'active' : ''}`} aria-label="序列播放器">
          <header>
            <span><small>序列播放器</small><strong>{sequence.job ? `最长的已完成序列 · 原始 + ${sequence.beats.length} 个节拍` : source ? '原始片段 · 可以开始节拍 1' : '请在上方选择来源'}</strong></span>
            <span className={`continue-live-health ${!connected ? 'offline' : liveConnected ? 'connected' : 'disconnected'}`} title={!connected ? 'ComfyUI 已离线' : liveConnected ? '已连接 ComfyUI 实时预览' : '实时预览正在重连'}><i />{!connected ? '实时画面不可用' : liveConnected ? '实时画面就绪' : '实时画面正在重连'}</span>
          </header>
          {sourceUrl && <video key={`source-metadata:${sourceUrl}`} className="continue-metadata-video" src={sourceUrl} preload="metadata" onLoadedMetadata={event => setFrameDuration(event.currentTarget.duration || 0)} aria-hidden="true" tabIndex={-1} />}
          {sequenceUrl ? <><video ref={sequencePlayer} key={sequenceUrl} className="continue-preview" src={sequenceUrl} controls preload="metadata" onLoadedMetadata={event => setSequenceDuration(event.currentTarget.duration || 0)} onTimeUpdate={event => setSequenceTime(event.currentTarget.currentTime)} onWaiting={event => event.currentTarget.setAttribute('aria-busy', 'true')} onCanPlay={event => { event.currentTarget.removeAttribute('aria-busy'); setSourcePlaybackError('') }} onError={event => { event.currentTarget.removeAttribute('aria-busy'); setSourcePlaybackError('无法播放该序列。请确认源文件仍然存在，并使用受支持的视频编码。') }} /><div className="continue-timeline" aria-label="已完成的序列时间线"><div className="continue-timeline-summary"><strong>{sequence.beats.length ? '已完成的序列' : '起始片段'}</strong><span>{sequenceDuration ? sequenceDuration.toFixed(2) : sequence.duration.toFixed(2)} 秒 · 24 fps 输出</span></div><div className="continue-timeline-track">{sequence.segments.map(segment => <button key={segment.id} type="button" className={`continue-timeline-segment ${segment.id === 'original' ? 'original' : ''} ${sequenceTime >= segment.start && sequenceTime < segment.start + segment.duration ? 'playing' : ''}`} style={{ flexGrow: Math.max(1, segment.duration) }} title={`${segment.label}：${segment.start.toFixed(2)} 秒 至 ${(segment.start + segment.duration).toFixed(2)} 秒`} onClick={() => { if (sequencePlayer.current) sequencePlayer.current.currentTime = Math.min(segment.start, Math.max(0, (sequencePlayer.current.duration || sequence.duration) - 0.04)) }}><span>{segment.label}</span><small>{segment.duration.toFixed(1)} 秒</small></button>)}</div><small>点击分段可以跳转。每个完成的节拍都会追加到合并视频中。</small></div>{sourcePlaybackError && <p className="continue-source-playback-error" role="status" aria-live="polite">{sourcePlaybackError}</p>}</> : <div className="continue-monitor-empty"><Film size={28} /><strong>未选择来源</strong><span>用上方的「选择来源」选择一个已完成的渲染，或导入一段视频。</span></div>}
          {(activeBeatJob || preparing || displayedBeatJob) && <details className="continue-render-drawer" open={Boolean(activeBeatJob || preparing)}><summary>{activeBeatJob ? `正在渲染节拍 ${displayedBeatNumber} · ${Math.round(activeBeatJob.progress)}%` : preparing ? preparationStage : `最近的节拍渲染 · ${beatStatusLabel(displayedBeatJob?.status ?? 'planned')}`}</summary>{preparing ? <div className="continue-render-placeholder" role="status" aria-live="polite"><LoaderCircle className="spin" size={28} /><strong>{preparationStage}</strong><small>正在准备来源，尚未提交到 ComfyUI。</small></div> : displayedBeatJob && <ContinuationRenderPreview job={displayedBeatJob} livePreview={livePreview} liveConnected={liveConnected} compact />}</details>}
        </section>

        <section className="continue-editor-card">
          <header className="continue-editor-heading"><span><small>下一片段 {script.beats.length > 1 ? `· 第 ${activeBeatIndex + 1} 个，共 ${script.beats.length} 个` : ''}</small><input aria-label="节拍名称" disabled={locked} value={activeBeat.name} maxLength={48} aria-invalid={duplicateName || !activeBeat.name.trim()} onChange={event => updateBeat(activeBeat.id, { name: event.target.value })} /></span><div><span className={`continue-status status-${activeJob?.status ?? 'planned'}`}>{beatStatusLabel(activeJob?.status ?? 'planned')}</span><button className="secondary-button continue-tools-toggle" type="button" aria-expanded={advancedOpen} onClick={() => setAdvancedOpen(value => !value)}>节拍工具</button></div></header>
          {advancedOpen && <div className="continue-beat-tools" aria-label="高级节拍工具"><button className="icon-button" type="button" title="上移" aria-label={`上移节拍 ${activeBeatIndex + 1}`} disabled={locked || activeBeatIndex === 0} onClick={() => move(activeBeatIndex, -1)}><ArrowUp size={15} /></button><button className="icon-button" type="button" title="下移" aria-label={`下移节拍 ${activeBeatIndex + 1}`} disabled={locked || activeBeatIndex === script.beats.length - 1} onClick={() => move(activeBeatIndex, 1)}><ArrowDown size={15} /></button><button className="icon-button" type="button" title="复制节拍" aria-label={`复制节拍 ${activeBeatIndex + 1}`} disabled={locked} onClick={() => setScript(current => { const beats = [...current.beats]; const copy: ContinueBeat = { ...activeBeat, id: createId(), name: nextBeatName(current.beats), sourceMode: 'previous', sourceBeatId: undefined }; beats.splice(activeBeatIndex + 1, 0, copy); setActiveBeatId(copy.id); return { ...current, beats } })}><Copy size={15} /></button><button className="icon-button" type="button" title="从节拍分叉" aria-label={`从节拍 ${activeBeatIndex + 1} 分叉`} disabled={locked} onClick={() => insert(activeBeatIndex, activeBeat.id)}><GitBranch size={15} /></button><button className="icon-button" type="button" title="删除节拍" aria-label={`删除节拍 ${activeBeatIndex + 1}`} disabled={locked || script.beats.length === 1} onClick={() => setScript(current => ({ ...current, beats: normalizeBeatSources(current.beats.filter(item => item.id !== activeBeat.id)) }))}><Trash2 size={15} /></button><button className="secondary-button" type="button" onClick={() => void clearBeatSetup()}>清除此片段</button></div>}
          {duplicateName && <p className="continue-field-error" role="alert">节拍名称必须唯一，这样输出文件与恢复点才不会混淆。</p>}
          <div className="continue-handoff"><span>传入来源</span><strong>{activeBeatSource ? sourceBeatIdFor(script.beats, activeBeat, activeBeatIndex) ? `已完成的 ${script.beats.find(beat => beat.id === sourceBeatIdFor(script.beats, activeBeat, activeBeatIndex))?.name ?? '节拍'}` : '原始片段' : sourceBeatIdFor(script.beats, activeBeat, activeBeatIndex) ? `请先生成 ${script.beats.find(beat => beat.id === sourceBeatIdFor(script.beats, activeBeat, activeBeatIndex))?.name ?? '上一个节拍'}` : '请选择原始片段'}</strong><small>{activeBeat.continuityBreak ? '硬切：此节拍开始一个新镜头，不继承上一帧或运动参考。' : activeBeatMethod === 'motion' ? '继承上一个节拍末尾的运动与音频上下文。' : activeBeatMethod === 'frame' ? '使用所选的来源帧作为画面参考。' : '使用输入视频的最后一帧作为画面参考。'}</small></div>
          <label className="continue-prompt-field"><span>接下来发生什么？</span><textarea disabled={locked} value={activeBeat.prompt} rows={6} placeholder="只描述这个节拍里新的动作、机位变化或对白…" onChange={event => updateBeat(activeBeat.id, { prompt: event.target.value })} /><small>保持聚焦。来源的外观、地点与之前的动作会自动延续。</small></label>
          <div className="continue-cut-cue"><span><strong>节拍内切换</strong><small>向提示词添加一条带时间的机位切换指令。时间只是生成提示；若需要精确的剪辑点，请使用下方的节拍间切换。</small></span><label>第 <input type="number" min="0" max={activeBeat.duration} step="0.5" value={cutCueTime} onChange={event => setCutCueTime(Number(event.target.value) || 0)} /> 秒</label><button className="secondary-button" type="button" disabled={locked} onClick={() => insertCutCue(activeBeat)}>添加切换提示</button></div>
          <div className="continue-camera-controls"><div><strong>镜头设计</strong><small>指导新的取景与运镜</small></div><div><label>景别<select disabled={locked} value={activeBeat.shotSize ?? ''} onChange={event => updateBeat(activeBeat.id, { shotSize: event.target.value })}><option value="">继承 / 自动</option><option value="wide shot">全景</option><option value="medium shot">中景</option><option value="close-up">近景</option><option value="extreme close-up">特写</option></select></label><label>机位角度<select disabled={locked} value={activeBeat.cameraAngle ?? ''} onChange={event => updateBeat(activeBeat.id, { cameraAngle: event.target.value })}><option value="">继承 / 自动</option><option value="eye-level angle">平视</option><option value="low angle">仰拍</option><option value="high angle">俯拍</option><option value="over-the-shoulder angle">过肩</option></select></label><label>运镜<select disabled={locked} value={activeBeat.cameraMovement ?? ''} onChange={event => updateBeat(activeBeat.id, { cameraMovement: event.target.value })}><option value="">继承 / 自动</option><option value="locked-off camera">固定机位</option><option value="slow pan">慢摇</option><option value="tracking shot">跟拍</option><option value="handheld camera">手持</option></select></label></div><label className="continue-switch"><span><strong>节拍间切换</strong><small>仅当这个节拍开始新镜头时使用。合并视频会在此处硬切，不带帧或运动参考。</small></span><input type="checkbox" role="switch" disabled={locked} checked={activeBeat.continuityBreak} onChange={event => updateBeat(activeBeat.id, { continuityBreak: event.target.checked })} /></label></div>
          {advancedOpen && <div className="continue-output-name"><small>已保存的输出</small><code>{continuationOutputName(script, activeBeat)}</code></div>}
          <div className="continue-editor-actions">{activeJob && ['queued', 'running'].includes(activeJob.status) ? <button className="danger-button" type="button" disabled={cancellingIds.has(activeJob.id)} onClick={() => void cancel(activeJob)}><CircleStop size={14} />{cancellingIds.has(activeJob.id) ? '正在停止…' : '取消渲染'}</button> : <button className="primary-button" type="button" disabled={locked || !connected || !assemblyReady || !activeBeatSource} onClick={() => void launch(activeBeat)}>{activeJob ? <RefreshCw size={14} /> : <Play size={14} />}{activeJob ? '再次生成' : '生成下一片段'}</button>}<button className="secondary-button" type="button" disabled={locked} onClick={() => insert(activeBeatIndex)}><Plus size={14} />再添加一个片段</button></div>
        </section>

        {activeJob?.error && <section className="continue-inline-error" role="alert"><AlertTriangle size={16} /><span><strong>这个节拍没有完成</strong>{activeJob.error}</span></section>}
        {activeJob && <VideoExportButtons job={activeJob} />}
        {finalJob?.status === 'completed' && activeJob?.id !== finalJob.id && <section className="continue-final-output"><span><Check size={16} /><strong>最终合并视频已就绪</strong></span><VideoExportButtons job={finalJob} /></section>}
      </div>

      {settingsOpen && <aside className="continue-settings" aria-label="续接设置">
        <header><Settings2 size={16} /><span><strong>设置</strong><small>序列与连贯性</small></span></header>
        <fieldset className="continue-fields" disabled={locked}>
          <section><h2>序列</h2><label>视频名称<input value={script.videoName} maxLength={64} placeholder="为这个视频命名" onChange={event => setScript(current => ({ ...current, videoName: event.target.value }))} /></label></section>
          <section className="continue-beat-source-settings"><h2>节拍 {activeBeatIndex + 1}</h2><label>该节拍的来源<select value={sourceChoice} onChange={event => { const choice = event.target.value; updateBeat(activeBeat.id, choice.startsWith('beat:') ? { sourceMode: 'beat', sourceBeatId: choice.slice(5) } : { sourceMode: choice as 'previous' | 'original', sourceBeatId: undefined }) }}>{activeBeatIndex > 0 && <option value="previous">上一个节拍</option>}<option value="original">原始来源视频</option>{script.beats.slice(0, activeBeatIndex).map((candidate, index) => <option value={`beat:${candidate.id}`} key={candidate.id}>节拍 {index + 1} · {candidate.name}</option>)}</select><small>这个选择只保存在 {activeBeat.name.trim() || `节拍 ${activeBeatIndex + 1}`} 上。</small></label><label>时长<div className="continue-number-field"><input type="number" min="1" max="15" step="0.5" value={activeBeat.duration} onChange={event => updateBeat(activeBeat.id, { duration: Math.max(1, Math.min(15, Number(event.target.value) || 5)) })} /><span>秒</span></div><small>{activeTiming.renderFrames > 362 ? '请缩短时长或减少高级运动上下文。' : `H3 帧对齐后约 ${activeTiming.deliveredDuration.toFixed(2)} 秒。`}</small></label></section>
          <details className="continue-advanced" open={advancedOpen} onToggle={event => setAdvancedOpen(event.currentTarget.open)}><summary>高级连贯性</summary>
            <section><h2>工作流</h2><div className="continue-segmented" role="group" aria-label="续接模式"><button type="button" className={script.mode === 'text' ? 'selected' : ''} onClick={() => setScript(current => ({ ...current, mode: 'text' }))}>仅文本</button><button type="button" className={script.mode === 'reference' ? 'selected' : ''} onClick={() => setScript(current => ({ ...current, mode: 'reference' }))}>替换参考图</button></div><label>衔接方式<select value={script.method} onChange={event => setScript(current => ({ ...current, method: event.target.value as ContinueMethod }))}><option value="motion" disabled={!motionReady}>运动 + 音频上下文</option><option value="last">尾帧</option><option value="frame">选择帧</option></select></label><p className="continue-note" role="status" aria-live="polite">{motionAvailable ? '运动上下文可用，是实现平滑衔接的首选。' : '尾帧连贯性是这个来源的兼容回退方案。'}</p></section>
            {method === 'frame' && <section><h2>所选帧</h2><label>来源帧<input type="range" min="0" max={Math.max(0, (beatFrameDurations[activeBeat.id] ?? frameDuration) - 0.05)} step="0.04" value={activeBeat.frameTime} onChange={event => updateBeat(activeBeat.id, { frameTime: Number(event.target.value) })} /><output>{activeBeat.frameTime.toFixed(2)} 秒</output></label>{frameSourceUrl && <video className="continue-frame-preview" src={frameSourceUrl} muted playsInline preload="metadata" onLoadedMetadata={event => { setBeatFrameDurations(current => ({ ...current, [activeBeat.id]: event.currentTarget.duration || 0 })); event.currentTarget.currentTime = activeBeat.frameTime }} ref={element => { if (element && element.readyState >= 1 && Math.abs(element.currentTime - activeBeat.frameTime) > 0.06) element.currentTime = activeBeat.frameTime }} />}</section>}
            <section><h2>所有片段</h2><label>对白<select value={script.continuity.dialogueMode} onChange={event => updateContinuity({ dialogueMode: event.target.value as ContinuationSettings['dialogueMode'] })}><option value="inherit">沿用来源</option><option value="none">无对白</option><option value="allow">允许对白</option></select></label>{method === 'motion' && <><label>运动上下文<select value={script.continuity.contextFrames} onChange={event => updateContinuity({ contextFrames: Number(event.target.value) })}>{![1, 5, 22, 39].includes(script.continuity.contextFrames) && <option value={script.continuity.contextFrames}>{script.continuity.contextFrames} 帧（旧版）</option>}{[1, 5, 22, 39].map(frames => <option key={frames} value={frames}>{frames} 帧</option>)}</select></label><label className="continue-switch"><span><strong>跨衔接保留音频</strong><small>在每个接缝处保持音频时间连续</small></span><input type="checkbox" role="switch" checked={script.continuity.carryAudio} onChange={event => updateContinuity({ carryAudio: event.target.checked })} /></label></>}<label>接缝混合<input type="number" min="0" max="16" value={script.continuity.blendFrames} onChange={event => updateContinuity({ blendFrames: Math.max(0, Math.min(16, Number(event.target.value) || 0)) })} /></label></section>
            <section><h2>机位细节</h2><label>补充指令<input value={activeBeat.cameraOverride} onChange={event => updateBeat(activeBeat.id, { cameraOverride: event.target.value })} placeholder="可选的镜头或运镜细节" /></label></section>
            {script.mode === 'reference' && <section><h2>参考图替换</h2><p className="continue-note">除非在这里替换，否则一切都会继承。</p><div className="continue-replacements">{(['character', 'wardrobe', 'location', 'prop'] as const).map(role => <div key={role}><span><strong>{replacementRoleLabels[role]}</strong><small>{activeBeat.replacements[role]?.name ?? '继承'}</small></span>{activeBeat.replacements[role] && (role === 'character' || role === 'wardrobe') && activeSourceCharacters.length > 1 && <select aria-label={`选择用于${replacementRoleLabels[role]}替换的角色`} value={activeBeat.replacementOwnerIds?.[role] ?? ''} onChange={event => updateBeat(activeBeat.id, { replacementOwnerIds: { ...activeBeat.replacementOwnerIds, [role]: event.target.value || undefined } })}><option value="">选择角色</option>{activeSourceCharacters.map(character => <option key={character.id} value={character.id}>{character.name}</option>)}</select>}<button className="secondary-button" type="button" onClick={() => void chooseReplacement(activeBeat, role)}>替换</button>{activeBeat.replacements[role] && <button className="icon-button" type="button" aria-label={`恢复继承的${replacementRoleLabels[role]}`} onClick={() => { const replacements = { ...activeBeat.replacements }; delete replacements[role]; const replacementOwnerIds = { ...activeBeat.replacementOwnerIds }; if (role === 'character' || role === 'wardrobe') delete replacementOwnerIds[role]; updateBeat(activeBeat.id, { replacements, replacementOwnerIds }) }}><X size={13} /></button>}</div>)}</div></section>}
          </details>
        </fieldset>
      </aside>}
    </div>
    {sourcePickerOpen && <div className="continue-source-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setSourcePickerOpen(false) }}><section className="continue-source-modal" ref={sourcePickerRef} role="dialog" aria-modal="true" aria-labelledby="continue-source-picker-title">
      <header><span><strong id="continue-source-picker-title">选择来源视频</strong><small>选择一个已完成的视频渲染，或从电脑导入一段片段。</small></span><button className="icon-button" type="button" aria-label="关闭来源视频选择器" onClick={() => setSourcePickerOpen(false)}><X size={18} /></button></header>
      <div className="continue-source-toolbar"><label><Search size={15} /><input type="search" value={sourceQuery} onChange={event => setSourceQuery(event.target.value)} placeholder="搜索视频…" aria-label="搜索来源视频" /></label><button className="primary-button" type="button" disabled={sourceImporting} onClick={() => void pickExternal()}>{sourceImporting ? <LoaderCircle className="spin" size={15} /> : <FolderOpen size={15} />}{sourceImporting ? '正在加载视频…' : '导入视频'}</button>{sourcePickerError && <p className="continue-source-picker-error" role="alert">{sourcePickerError}</p>}</div>
      <div className="continue-source-modal-body">{script.externalSource && <section><h2>导入的视频</h2><button type="button" className="continue-source-card selected" onClick={() => setSourcePickerOpen(false)}><span className="continue-source-card-media">{script.externalSource.preview ? <MovieMediaThumbnail source={script.externalSource.preview} /> : <Film size={28} />}</span><span><strong>{script.externalSource.name}</strong><small>导入的文件 · 帧连贯性</small></span><i><Check size={14} />已选择</i></button></section>}<section><div className="continue-source-section-title"><h2>已完成的渲染</h2><small>{filteredSourceJobs.length} 个视频</small></div>{filteredSourceJobs.length ? <div className="continue-source-grid">{filteredSourceJobs.map(job => { const title = sourceName(job) || job.prompt.trim().split('\n')[0] || '未命名渲染'; const selected = script.sourceJobId === job.id; return <button type="button" className={`continue-source-card ${selected ? 'selected' : ''}`} key={job.id} aria-pressed={selected} onClick={() => chooseSourceJob(job)}><span className="continue-source-card-media"><MovieMediaThumbnail source={job.outputUrl!} posterUrl={job.thumbnailUrl} /></span><span><strong title={title}>{title}</strong><small>{job.width} × {job.height} · {job.duration} 秒 · {new Date(job.createdAt).toLocaleDateString()}</small><em>{job.latentFile ? '运动上下文就绪' : `${job.provider === 'ltx25' ? 'LTX 2.5 · ' : ''}帧续接`}</em></span>{selected && <i><Check size={14} />已选择</i>}</button> })}</div> : <div className="continue-source-picker-empty"><Film size={28} /><strong>{sourceQuery ? '没有匹配搜索的视频' : '还没有已完成的渲染'}</strong><span>{sourceQuery ? '换一个标题或提示词试试。' : '现在导入一段视频，或完成一次视频渲染，它会自动出现在这里。'}</span>{sourceQuery && <button className="secondary-button" type="button" onClick={() => setSourceQuery('')}>清除搜索</button>}</div>}</section></div>
      <footer><small>所选视频只作为来源读取，不会被修改。</small><button className="secondary-button" type="button" onClick={() => setSourcePickerOpen(false)}>取消</button></footer>
    </section></div>}
  </div>
}
