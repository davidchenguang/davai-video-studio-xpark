import { AssetLibraryRail } from './AssetLibraryRail'
import { useEffect, useMemo, useState } from 'react'
import { Building2, Camera, Check, CircleStop, Film, ImagePlus, Images, LoaderCircle, MapPin, Orbit, Play, Sparkles, Trash2, TreePine, WandSparkles, X } from 'lucide-react'
import { choices, type ObjectInfo } from '../lib/comfyInfo'
import { buildZImage } from '../lib/zimage'
import { resolveAttentionBackend } from '../lib/attentionBackend'
import { loadLocationProjects, locationReferences, newLocationProject, saveLocationProjects, LOCATION_LIBRARY_EVENT } from '../lib/locationLibrary'
import type { AppSettings, GenerationJob, LocationProject, MediaFile } from '../types'
import { ReferenceApprovalModal } from './ReferenceApprovalModal'
import { RenderConstruction } from './RenderConstruction'
import { ReliableVideo } from './ReliableVideo'
import { resolveLlmConnection } from '../lib/llmProvider'
import { analyzeReferenceImage } from '../lib/referenceAnalysis'

function cleanSinglePrompt(value: string) {
  return value.replace(/\\\s*(?:\r?\n|$)/g, ' ').replace(/[*_#`]+/g, '').replace(/\s+/g, ' ').trim()
}

const natureOnlyRule = 'Untouched natural landscape only. No buildings, houses, cabins, sheds, ruins, roads, streets, bridges, fences, signs, vehicles, power lines, utility poles, constructed paths, furniture, or other human-made structures and objects.'
const surveyCameras = [
  { id: 'wide-reveal', label: '广角揭示', note: '推荐 · 地理关系最清晰', cameraLanguage: 'Use only wide and extra-wide shots with an 18–24mm lens. Begin from an elevated wide establishing position, then perform a slow forward crane and gentle three-quarter sweep that reveals foreground, middle ground, background, and the spatial relationship between major landmarks. Never use close-ups.' },
  { id: 'perimeter', label: '外围绕行', note: '围绕地点的广角环行', cameraLanguage: 'Use only wide shots with a 20–24mm lens. Travel slowly around the outer perimeter in one continuous stabilized arc, keeping the whole environment readable while revealing each side and every major landmark. Never use close-ups.' },
  { id: 'forward-scout', label: '前行探路', note: '穿行相连分区的广角路径', cameraLanguage: 'Use only wide shots with a 24mm lens. Glide slowly forward through the environment and use restrained left-right pans to expose connected zones, sightlines, terrain layers, and landmarks without cutting. Never use close-ups.' },
  { id: 'high-survey', label: '高处俯瞰', note: '广角下降概览', cameraLanguage: 'Use only wide aerial-style shots with a 20–24mm lens. Start high enough to read the complete geography, descend gradually, and finish in a broad eye-level establishing view while keeping all landmarks spatially consistent. Never use close-ups.' },
] as const

const jobStatusLabels: Record<string, string> = { queued: '排队中', running: '渲染中', completed: '已完成', failed: '已失败', cancelled: '已取消' }

export function LocationStudio({ settings, info, connected, ollamaAvailable, automationJobs, onNotice, onCreateWalkthrough }: {
  settings: AppSettings
  info: ObjectInfo
  connected: boolean
  ollamaAvailable: boolean
  automationJobs?: GenerationJob[]
  onNotice(tone: 'error' | 'success' | 'neutral', text: string): void
  onCreateWalkthrough(project: LocationProject, options?: { duration: number; cameraLanguage: string }): Promise<string | null | void>
}) {
  const initial = useMemo(() => { const saved = loadLocationProjects(); return saved.length ? saved : [newLocationProject()] }, [])
  const [projects, setProjects] = useState(initial)
  const llm = resolveLlmConnection(settings)
  const [activeId, setActiveId] = useState(initial[0].id)
  const [job, setJob] = useState<{ id: string; url: string; locationId: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [splitting, setSplitting] = useState(false)
  const [assisting, setAssisting] = useState(false)
  const [guidedOpen, setGuidedOpen] = useState(false)
  const [guidedDuration, setGuidedDuration] = useState(10)
  const [guidedCamera, setGuidedCamera] = useState<(typeof surveyCameras)[number]['id']>('wide-reveal')
  const [guidedRunStartedAt, setGuidedRunStartedAt] = useState<number | null>(null)
  const [guidedPreviousSignature, setGuidedPreviousSignature] = useState('')
  const [videoDuration, setVideoDuration] = useState(0)
  const [message, setMessage] = useState('')
  const [error, setError] = useState(false)
  const [candidate, setCandidate] = useState<{ locationId: string; file: MediaFile } | null>(null)
  const active = projects.find((project) => project.id === activeId) ?? projects[0]
  const activeAutomation = automationJobs?.find((job) => job.locationProjectId === active.id)
  const guidedAutomation = guidedRunStartedAt !== null && activeAutomation && activeAutomation.createdAt >= guidedRunStartedAt - 1000 ? activeAutomation : undefined
  const referenceSignature = active.referenceImages.map((file) => file.path).join('|')
  const guidedSetReady = Boolean(guidedAutomation?.status === 'completed' && active.referenceImages.length && referenceSignature !== guidedPreviousSignature)
  const commit = (next: LocationProject[]) => { setProjects(next); saveLocationProjects(next) }
  const patchById = (id: string, change: Partial<LocationProject>) => setProjects((current) => { const next = current.map((project) => project.id === id ? { ...project, ...change, updatedAt: Date.now() } : project); saveLocationProjects(next); return next })
  const patch = (change: Partial<LocationProject>) => patchById(active.id, change)
  useEffect(() => { const refresh = () => { const next = loadLocationProjects(); if (next.length) setProjects(next) }; window.addEventListener(LOCATION_LIBRARY_EVENT, refresh); return () => window.removeEventListener(LOCATION_LIBRARY_EVENT, refresh) }, [])

  const natureOnly = active.environmentMode === 'nature'
  const authoredPrompt = active.referencePrompt.trim() || [
    natureOnly ? `Cinematic natural-landscape reference image for ${active.name}.` : `Cinematic establishing reference image for ${active.name}.`, active.description,
    active.atmosphere && `Atmosphere: ${active.atmosphere}.`, active.timeOfDay && `Time of day and weather: ${active.timeOfDay}.`,
    active.continuityAnchors && `Continuity anchors: ${active.continuityAnchors}.`,
    active.locationContext !== 'mixed' && `This is an ${active.locationContext} location; preserve that context.`, active.accuracyDetails && `Must remain accurate: ${active.accuracyDetails}.`,
    natureOnly && natureOnlyRule,
    `${active.visualStyle}. Wide, clear view of the full location, stable ${natureOnly ? 'terrain, ecology, vegetation, water, rock formations,' : 'architectural and environmental details,'} coherent geography, no people as the focal subject, no text, no logos.`,
  ].filter(Boolean).join(' ')
  const prompt = natureOnly && !authoredPrompt.includes(natureOnlyRule) ? `${authoredPrompt} ${natureOnlyRule}` : authoredPrompt
  const enhance = async () => {
    if (!ollamaAvailable || assisting) return
    setAssisting(true)
    try {
      const modeInstruction = natureOnly
        ? `This location is NATURE ONLY. Enforce this exact rule in the result: ${natureOnlyRule}`
        : active.environmentMode === 'built'
          ? 'This is a built environment. Describe stable architecture, circulation, materials, entrances, structural landmarks, and spatial relationships.'
          : 'This environment may combine natural terrain and built elements, but only retain elements intentionally supplied by the user.'
      const result = await window.minimax.generateWithOllama(llm.url, llm.model, `Rewrite the location notes below as one concise, production-ready establishing-reference prompt. Preserve all intentional geography, layout, materials, ecology, lighting, weather, context, accuracy requirements, and continuity anchors. Make spatial relationships explicit and repeatable across future shots. ${modeInstruction} End with: wide clear establishing view, coherent geography, no people as the focal subject, no text, no logos. Return exactly one plain-text paragraph without Markdown, headings, field labels, bullets, or line breaks.\n\nName: ${active.name}\nEnvironment type: ${active.environmentMode}\nContext: ${active.locationContext}\nLayout or terrain: ${active.description}\nAtmosphere and lighting: ${active.atmosphere}\nTime and weather: ${active.timeOfDay}\nContinuity anchors: ${active.continuityAnchors}\nMust remain accurate: ${active.accuracyDetails}\nVisual style: ${active.visualStyle}`, llm.provider)
      patch({ referencePrompt: cleanSinglePrompt(result) })
      onNotice('success', natureOnly ? '仅自然地点提示词已打磨，并强制排除人工结构。' : `地点连贯性提示词已用 ${llm.label} 在本地打磨。`)
    } catch (reason) { onNotice('error', reason instanceof Error ? reason.message : String(reason)) }
    finally { setAssisting(false) }
  }
  const zModel = choices(info, 'UNETLoader', 'unet_name').find((name) => /z[_-]?image.*turbo/i.test(name)) ?? 'z_image_turbo_bf16.safetensors'
  const zEncoder = choices(info, 'CLIPLoader', 'clip_name').find((name) => /qwen[_-]?3[_-]?4b/i.test(name)) ?? 'qwen_3_4b.safetensors'
  const zVae = choices(info, 'VAELoader', 'vae_name').find((name) => /^ae\.safetensors$/i.test(name)) ?? 'ae.safetensors'
  const zReady = connected && choices(info, 'UNETLoader', 'unet_name').includes(zModel) && choices(info, 'CLIPLoader', 'clip_name').includes(zEncoder) && choices(info, 'VAELoader', 'vae_name').includes(zVae)
  const chooseImage = async (target: 'base' | 'reference' = 'reference') => {
    const picked = await window.minimax.chooseMedia('image'); if (!picked) return
    const projectId = active.id
    const file: MediaFile = { ...picked, kind: 'image', preview: await window.minimax.mediaUrl(picked.path) }
    patch(target === 'base' ? { baseImage: file } : { referenceImages: [...active.referenceImages, file], selectedReferencePaths: active.selectedReferencePaths === undefined ? undefined : [...active.selectedReferencePaths, file.path] })
    if (!ollamaAvailable) { onNotice('neutral', '图片已添加。连接本地视觉模型即可自动填充地点档案。'); return }
    onNotice('neutral', '图片已添加。本地视觉模型正在填充空白的地点字段…')
    try {
      const result = await analyzeReferenceImage(settings, picked.path, 'location')
      const current = loadLocationProjects().find((item) => item.id === projectId)
      if (!current) return
      const environmentMode = current.environmentMode !== 'mixed' ? current.environmentMode : ['mixed', 'nature', 'built'].includes(result.environmentMode) ? result.environmentMode as LocationProject['environmentMode'] : current.environmentMode
      patchById(projectId, { name: !current.name.trim() || /^(Location|地点) \d+$/i.test(current.name) ? result.name || current.name : current.name, environmentMode, description: current.description.trim() ? current.description : result.description, atmosphere: current.atmosphere.trim() ? current.atmosphere : result.atmosphere, timeOfDay: current.timeOfDay.trim() ? current.timeOfDay : result.timeOfDay, continuityAnchors: current.continuityAnchors.trim() ? current.continuityAnchors : result.continuityAnchors, visualStyle: current.visualStyle.trim() && current.visualStyle !== 'cinematic photorealism' ? current.visualStyle : result.visualStyle || current.visualStyle })
      onNotice('success', '图片分析完成；空白的地点字段已填充，供你检查。')
    } catch (reason) { onNotice('error', `图片已添加，但自动描述失败：${reason instanceof Error ? reason.message : String(reason)}`) }
  }
  const chooseWalkthrough = async () => { const picked = await window.minimax.chooseMedia('video'); if (!picked) return; patch({ walkthroughVideo: { ...picked, kind: 'video', preview: await window.minimax.mediaUrl(picked.path) } }); setVideoDuration(0) }
  const createMaster = async () => {
    if (!zReady || busy || !prompt.trim()) return
    setBusy(true); setError(false); setMessage('正在向 Z-Image Turbo 提交地点参考图…')
    try { const response = await window.minimax.submitPrompt(settings.comfyUrl, buildZImage(prompt, 1344, 768, Math.floor(Math.random() * 1_000_000_000), zModel, zEncoder, zVae, 8, 1, 'turbo', '', resolveAttentionBackend(settings.attentionBackend, choices(info, 'ModelAttentionBackend', 'attention')))); setJob({ id: response.prompt_id, url: settings.comfyUrl, locationId: active.id }); setMessage('正在 ComfyUI 中构建地点参考图…') }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : String(reason)); setError(true); setBusy(false) }
  }
  const cancel = async () => { if (!job) return; try { await window.minimax.cancelPrompt(job.url, job.id); setMessage('地点参考图渲染已取消。') } catch (reason) { setMessage(reason instanceof Error ? reason.message : String(reason)); setError(true) } finally { setJob(null); setBusy(false) } }
  useEffect(() => {
    if (!job) return
    let disposed = false; let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        const history = await window.minimax.getHistory(job.url, job.id)
        const entry = history[job.id] as { status?: { status_str?: string }; outputs?: Record<string, { images?: Array<{ filename: string; subfolder?: string; type?: string }> }> } | undefined
        if (entry?.status?.status_str === 'error') throw new Error('地点参考图生成失败。请查看 ComfyUI 日志。')
        const image = Object.values(entry?.outputs ?? {}).flatMap((output) => output.images ?? [])[0]
        if (image) { const preview = await window.minimax.getOutputImage(job.url, image); const saved = await window.minimax.saveComfyOutputImage(job.url, image, settings.outputDirectory); if (!disposed) { setCandidate({ locationId: job.locationId, file: { ...saved, preview, kind: 'image' } }); setBusy(false); setJob(null); setError(false); setMessage('地点参考图已就绪，等待确认。') }; return }
      } catch (reason) { if (!disposed) { setMessage(reason instanceof Error ? reason.message : String(reason)); setError(true); setBusy(false); setJob(null) }; return }
      if (!disposed) timer = setTimeout(poll, 2000)
    }
    void poll(); return () => { disposed = true; clearTimeout(timer) }
  }, [job, onNotice, settings.outputDirectory])
  const extractWalkthrough = async () => {
    if (!active.walkthroughVideo || !videoDuration || splitting) return
    setSplitting(true)
    try {
      const positions = [0.05, .25, .5, .75, .95].map((ratio) => Math.max(0, Math.min(videoDuration - .04, videoDuration * ratio)))
      const files = await Promise.all(positions.map(async (position) => { const result = await window.minimax.extractVideoFrame(active.walkthroughVideo!.path, position, settings.outputDirectory, settings.ffmpegPath); return { ...result, kind: 'image' as const, preview: await window.minimax.mediaUrl(result.path) } }))
      patch({ referenceImages: files, referenceMode: 'set', selectedReferencePaths: undefined }); onNotice('success', '已从漫游视频提取五帧到该地点的参考图组。')
    } catch (reason) { onNotice('error', reason instanceof Error ? reason.message : String(reason)) } finally { setSplitting(false) }
  }
  const add = () => { const project = newLocationProject(projects.length + 1); commit([...projects, project]); setActiveId(project.id) }
  const remove = () => { if (!window.confirm(`删除地点「${active.name}」？原始媒体文件会保留在磁盘上。`)) return; const next = projects.filter((project) => project.id !== active.id); const fallback = next.length ? next : [newLocationProject()]; commit(fallback); setActiveId(fallback[0].id) }
  const selected = locationReferences(active)
  const startGuidedSurvey = async () => {
    if (!active.baseImage) return
    setGuidedPreviousSignature(referenceSignature)
    setGuidedRunStartedAt(Date.now())
    const cameraLanguage = surveyCameras.find((camera) => camera.id === guidedCamera)?.cameraLanguage ?? surveyCameras[0].cameraLanguage
    const failure = await onCreateWalkthrough(active, { duration: guidedDuration, cameraLanguage })
    if (failure) { setGuidedRunStartedAt(null); setError(true); setMessage(failure) }
  }
  const approveCandidate = () => {
    if (!candidate) return
    const project = loadLocationProjects().find((item) => item.id === candidate.locationId)
    if (!project) { setCandidate(null); return }
    patchById(project.id, { baseImage: candidate.file })
    setCandidate(null); setMessage('主图已确认。正在准备漫游…')
    if (guidedOpen) {
      setGuidedPreviousSignature(referenceSignature)
      setGuidedRunStartedAt(Date.now())
      const cameraLanguage = surveyCameras.find((camera) => camera.id === guidedCamera)?.cameraLanguage ?? surveyCameras[0].cameraLanguage
      void onCreateWalkthrough({ ...project, baseImage: candidate.file }, { duration: guidedDuration, cameraLanguage }).then((failure) => { if (failure) { setGuidedRunStartedAt(null); setError(true); setMessage(failure) } })
    } else void onCreateWalkthrough({ ...project, baseImage: candidate.file }).then((failure) => { if (failure) { setError(true); setMessage(failure) } })
  }
  return <><div className="standard-page character-studio location-studio">
    <div className="page-heading"><div><p className="eyebrow">全局地点库</p><h1>地点工作室</h1><p>构建可复用的自然地貌、建成场所、漫游视频与连贯性可靠的视图。</p></div><div className="heading-state"><span className={active.baseImage ? 'ok' : 'warn'}>{active.baseImage ? <Check size={15} /> : natureOnly ? <TreePine size={15} /> : <MapPin size={15} />}{active.baseImage ? '主参考图就绪' : natureOnly ? '仅自然模式已启用' : '创建地点参考图'}</span></div></div>
    <div className="character-studio-grid"><AssetLibraryRail title="地点" items={projects.map(project => ({ id: project.id, name: project.name, detail: `${project.environmentMode === 'nature' ? '纯自然' : project.environmentMode === 'built' ? '建成环境' : '混合环境'} · ${locationReferences(project).length} 张参考图`, preview: project.baseImage?.preview, placeholder: project.environmentMode === 'nature' ? <TreePine size={18} /> : project.environmentMode === 'built' ? <Building2 size={18} /> : <MapPin size={18} /> }))} activeId={active.id} onAdd={add} onSelect={id => { setActiveId(id); setVideoDuration(0) }} />
      <section className="character-workbench"><header><div><MapPin size={18} /><span><strong>场所与连贯性</strong><small>可跨镜头、跨影片复用的稳定世界细节。</small></span></div><button className="danger-button" onClick={remove}><Trash2 size={14} />删除地点</button></header>
        <div className="character-setup-grid"><section className="character-setup-panel"><div className="character-section-heading"><span>{natureOnly ? <TreePine size={15} /> : <MapPin size={15} />}</span><div><strong>地点档案</strong><small>先确定环境类型，再描述固定地理。</small></div><em>{active.name.trim() ? '已本地保存' : '需要名称'}</em></div>
          <label className={`location-nature-toggle ${natureOnly ? 'selected' : ''}`}>
            <input type="checkbox" checked={natureOnly} onChange={(event) => patch({ environmentMode: event.target.checked ? 'nature' : 'mixed', referencePrompt: '' })} />
            <TreePine size={16} />
            <span><strong>仅自然</strong><small>排除建筑、道路、市政设施、车辆及其他一切人工物体。</small></span>
          </label>
          {natureOnly && <div className="location-nature-rule"><TreePine size={15} /><span><strong>已强制排除人工结构</strong><small>主图、打磨后的提示词与漫游视频都会阻止建筑等人工元素。</small></span></div>}
          <div className="character-form"><label>地点名称<input value={active.name} onChange={(event) => patch({ name: event.target.value, referencePrompt: '' })} /></label><label>视觉风格<input value={active.visualStyle} onChange={(event) => patch({ visualStyle: event.target.value, referencePrompt: '' })} placeholder="电影级写实" /></label><label>地点情境<select value={active.locationContext} onChange={(event) => patch({ locationContext: event.target.value as LocationProject['locationContext'], referencePrompt: '' })}><option value="interior">室内</option><option value="exterior">室外</option><option value="mixed">室内 + 室外</option></select><small>决定以室内、室外还是两者的连通关系为准。</small></label><label className="wide">{natureOnly ? '地形、生态与地理' : active.environmentMode === 'built' ? '建筑与空间布局' : '环境与空间布局'}<textarea value={active.description} onChange={(event) => patch({ description: event.target.value, referencePrompt: '' })} placeholder={natureOnly ? '地貌、植被分区、水体、岩层、野生动物踩出的小径…' : '材质、地标、房间、动线、地形、街道…'} /></label><label>氛围与光线<textarea value={active.atmosphere} onChange={(event) => patch({ atmosphere: event.target.value, referencePrompt: '' })} placeholder="情绪、光向、色调、雾气、降水…" /></label><label>时间与天气<textarea value={active.timeOfDay} onChange={(event) => patch({ timeOfDay: event.target.value, referencePrompt: '' })} placeholder="季节、时刻、云量、风力、地面状况…" /></label><label className="wide">连贯性锚点<textarea value={active.continuityAnchors} onChange={(event) => patch({ continuityAnchors: event.target.value, referencePrompt: '' })} placeholder={natureOnly ? '独特的林线、瀑布位置、山脊轮廓、河湾、岩群…' : '固定入口、地标、物品位置、视线关系、长期存在的破损或标识…'} /></label><label className="wide"><strong>必须一致的地点细节</strong><small>每次渲染都必须准确的事实：室内布局、房间连通、外立面、标识、家具、窗户、破损、地标、物品位置或受保护细节。</small><textarea value={active.accuracyDetails} onChange={(event) => patch({ accuracyDetails: event.target.value, referencePrompt: '' })} placeholder="示例：室内是一间绿色瓷砖餐厅；请保留 U 形吧台、六张红色高脚凳、西向窗户、霓虹派饼招牌，以及通往厨房的那扇门。" /></label></div>
          <div className="character-assist"><span><Sparkles size={16} /><span><strong>{llm.label} 连贯性助手</strong><small>{natureOnly ? '在保持严格仅自然排除项的前提下打磨地貌。' : '把粗略笔记变成可重复的空间锚点。'}</small></span></span><button className="secondary-button" disabled={!ollamaAvailable || assisting} onClick={() => void enhance()}>{assisting ? <LoaderCircle className="spin" size={14} /> : <WandSparkles size={14} />}打磨地点</button></div></section>
          <section className="character-setup-panel character-prompt-panel"><div className="character-section-heading"><span><Sparkles size={15} /></span><div><strong>主提示词</strong><small>该地点的 Z-Image 提示词原文。</small></div><em>{prompt.length.toLocaleString()} 字符</em></div><label className="character-reference-prompt"><span><strong>可编辑渲染提示词</strong><small>{natureOnly ? '编辑此提示词时，仅自然的结构排除项仍然生效。' : '修改将应用于下一张主参考图。'}</small></span><textarea aria-label="地点主提示词" value={prompt} onChange={(event) => patch({ referencePrompt: event.target.value })} /></label></section></div>
        <section className="location-guided-option"><div className="location-guided-icon"><Orbit size={20} /></div><div><span className="recommended-badge">推荐</span><strong>用 LTX 2.5 创建地点图组</strong><small>生成一段清晰的广角勘景，自动提取五张均衡视图，检查后把确认的图组收入该地点。</small></div><button className="primary-button" onClick={() => { setGuidedRunStartedAt(null); setGuidedPreviousSignature(referenceSignature); setGuidedOpen(true) }}><Sparkles size={14} />打开引导式构建器</button></section>
        <div className="character-production-heading"><span>参考图制作</span><small>先搭建场所，再勘景，然后确认有用的视图。</small><em>{Number(Boolean(active.baseImage)) + Number(Boolean(active.walkthroughVideo)) + Number(selected.length > 0)} / 3 已就绪</em></div>
        <div className="character-production-grid"><article className="character-master-card"><header><span><strong>1. 主参考图</strong><small>生成一个清晰的定场视图。</small></span><span className={`master-engine-state ${zReady ? 'ready' : ''}`}>{zReady ? <Check size={12} /> : <MapPin size={12} />}{zReady ? 'Z-Image 就绪' : 'Z-Image 不可用'}</span></header><div className="character-media-stage">{active.baseImage?.preview ? <img src={active.baseImage.preview} alt={`${active.name} 主参考图`} /> : busy ? <div><LoaderCircle className="spin" size={26} /><span>正在生成主参考图…</span></div> : <div><ImagePlus size={26} /><span>暂无主图</span></div>}</div>{message && <div className={`character-master-message ${error ? 'error' : ''}`}>{busy && <LoaderCircle className="spin" size={13} />}<span>{message}</span></div>}<footer><button className="secondary-button" disabled={busy} onClick={() => void chooseImage('base')}><ImagePlus size={14} />选择现有图片</button>{busy && <button className="danger-button" onClick={() => void cancel()}><CircleStop size={14} />取消</button>}<button className="primary-button" disabled={busy || !zReady || !active.name.trim()} onClick={() => void createMaster()}><Sparkles size={14} />{busy ? '生成中…' : active.baseImage ? '重新生成主图' : '生成主图'}</button></footer></article>
          <article><header><span><strong>2. {natureOnly ? '地貌勘景' : '漫游视频'}</strong><small>{natureOnly ? '勘景地形、植被、水体、岩层与空间地理。' : '走遍每个分区、地标与空间连接。'}</small></span>{activeAutomation && <span className={`status-badge ${activeAutomation.status}`}>{jobStatusLabels[activeAutomation.status] ?? activeAutomation.status}</span>}</header><div className="character-media-stage">{active.walkthroughVideo?.preview ? <ReliableVideo src={active.walkthroughVideo.preview} controls preload="metadata" onLoadedMetadata={(event) => setVideoDuration(event.currentTarget.duration)} /> : activeAutomation && ['queued', 'running'].includes(activeAutomation.status) ? <div className="location-survey-progress"><RenderConstruction /><strong>{activeAutomation.progressLabel ?? '正在渲染 LTX 2.5 勘景'}</strong><span>{activeAutomation.currentStep !== undefined && activeAutomation.totalSteps ? `采样器第 ${activeAutomation.currentStep} / ${activeAutomation.totalSteps} 步` : '正在构建广角地点勘景'}</span><div className="progress"><i style={{ width: `${activeAutomation.progress}%` }} /></div><small>{Math.round(activeAutomation.progress)}% · ComfyUI 实时进度</small></div> : <div><Orbit size={26} /><span>暂无{natureOnly ? '地貌勘景' : '漫游视频'}</span></div>}</div><footer><button className="secondary-button" onClick={() => void chooseWalkthrough()}><Film size={14} />选择已渲染的视频</button><button className="primary-button" disabled={!active.baseImage || Boolean(activeAutomation && ['queued', 'running'].includes(activeAutomation.status))} onClick={() => void onCreateWalkthrough(active)}><Orbit size={14} />{activeAutomation && ['queued', 'running'].includes(activeAutomation.status) ? '渲染中…' : natureOnly ? '渲染地貌勘景' : '渲染完整漫游'}</button></footer></article></div>
        <section className="character-reference-set"><header><span><strong>3. 已确认地点参考图</strong><small>选中的视图可用于参考图渲染与之后的影片。</small></span><button className="secondary-button" disabled={!active.walkthroughVideo || !videoDuration || splitting} onClick={() => void extractWalkthrough()}>{splitting ? <LoaderCircle className="spin" size={14} /> : <Images size={14} />}{splitting ? '正在提取…' : '提取 5 个视图'}</button></header><fieldset><legend>在渲染中使用</legend><label><input type="radio" name="location-reference-mode" checked={active.referenceMode === 'single'} onChange={() => patch({ referenceMode: 'single' })} />单张主图</label><label><input type="radio" name="location-reference-mode" checked={active.referenceMode === 'set'} onChange={() => patch({ referenceMode: 'set' })} />选定的参考视图</label></fieldset><div className="character-reference-grid">{active.referenceImages.map((file, index) => { const checked = active.selectedReferencePaths === undefined || active.selectedReferencePaths.includes(file.path); return <figure className={checked ? 'selected' : ''} key={`${file.path}-${index}`}><img src={file.preview} alt={`${active.name} 参考图 ${index + 1}`} /><figcaption><label><input type="checkbox" checked={checked} onChange={(event) => { const current = active.selectedReferencePaths ?? active.referenceImages.map((item) => item.path); patch({ referenceMode: 'set', selectedReferencePaths: event.target.checked ? [...new Set([...current, file.path])] : current.filter((path) => path !== file.path) }) }} />使用视图 {index + 1}</label></figcaption><button aria-label={`移除参考视图 ${index + 1}`} onClick={() => patch({ referenceImages: active.referenceImages.filter((_, itemIndex) => itemIndex !== index), selectedReferencePaths: active.selectedReferencePaths?.filter((path) => path !== file.path) })}><X size={13} /></button></figure> })}<button className="character-add-reference" onClick={() => void chooseImage()}><ImagePlus size={19} /><span>添加参考图</span></button></div></section>
      </section></div>
  </div>{guidedOpen && <div className="location-builder-backdrop"><section className="location-builder-modal" role="dialog" aria-modal="true" aria-labelledby="location-builder-title" onKeyDown={(event) => { if (event.key === 'Escape') setGuidedOpen(false) }}><header><span><Orbit size={19} /><span><strong id="location-builder-title">LTX 2.5 地点图组构建器</strong><small>广角勘景 → 提取五张图片 → 确认地点参考图</small></span></span><button className="icon-button" aria-label="关闭地点构建器" onClick={() => setGuidedOpen(false)}><X size={18} /></button></header><div className="location-builder-body">
    <ol className="location-builder-steps"><li className={active.baseImage ? 'complete' : 'active'}><span>1</span><div><strong>起始图片</strong><small>{active.baseImage ? '就绪' : '先创建或选择一张'}</small></div></li><li className={guidedAutomation && ['queued', 'running', 'completed'].includes(guidedAutomation.status) ? guidedAutomation.status === 'completed' ? 'complete' : 'active' : ''}><span>2</span><div><strong>LTX 广角勘景</strong><small>{guidedAutomation && ['queued', 'running'].includes(guidedAutomation.status) ? `${Math.round(guidedAutomation.progress)}%` : guidedAutomation?.status === 'completed' ? '已渲染' : `${guidedDuration} 秒`}</small></div></li><li className={guidedSetReady ? 'complete' : ''}><span>3</span><div><strong>五张图片</strong><small>{guidedSetReady ? '已加入地点' : '自动提取'}</small></div></li></ol>
    {candidate ? <section className="location-builder-stage"><div className="location-builder-stage-heading"><span><strong>确认起始图片</strong><small>在 LTX 生成广角勘景前，先核对完整地理。</small></span></div><img className="location-builder-master" src={candidate.file.preview} alt="生成的地点起始图" /><div className="location-builder-actions"><button className="secondary-button" onClick={() => { setCandidate(null); void createMaster() }}>换一张</button><button className="primary-button" onClick={approveCandidate}><Check size={14} />确认并继续</button></div></section>
    : !active.baseImage ? <section className="location-builder-stage location-builder-empty"><ImagePlus size={30} /><strong>从一张清晰的广角图片开始</strong><p>LTX 2.5 会把这张图片作为整段勘景的视觉锚点。生成的片段与提取的帧都会关联到 {active.name}。</p>{message && <div className={`character-master-message ${error ? 'error' : ''}`}>{busy && <LoaderCircle className="spin" size={13} />}<span>{message}</span></div>}<div className="location-builder-actions"><button className="secondary-button" disabled={busy} onClick={() => void chooseImage('base')}><ImagePlus size={14} />选择现有图片</button>{busy && <button className="danger-button" onClick={() => void cancel()}><CircleStop size={14} />取消</button>}<button className="primary-button" disabled={busy || !zReady || !active.name.trim()} onClick={() => void createMaster()}>{busy ? <LoaderCircle className="spin" size={14} /> : <Sparkles size={14} />}{busy ? '生成中…' : '生成起始图片'}</button></div>{!zReady && <small className="location-builder-note">Z-Image 不可用。请选择一张现成的广角图片，或启动加载了所需 Z-Image 模型的 ComfyUI。</small>}</section>
    : !guidedRunStartedAt ? <section className="location-builder-stage"><div className="location-builder-config"><figure><img src={active.baseImage.preview} alt={`${active.name} 起始图片`} /><figcaption>起始图片 · {active.name}</figcaption></figure><div><fieldset><legend>广角镜头语言</legend>{surveyCameras.map((camera) => <label className={guidedCamera === camera.id ? 'selected' : ''} key={camera.id}><input type="radio" name="location-survey-camera" checked={guidedCamera === camera.id} onChange={() => setGuidedCamera(camera.id)} /><Camera size={15} /><span><strong>{camera.label}</strong><small>{camera.note}</small></span></label>)}</fieldset><label className="location-builder-duration"><span><strong>片段时长</strong><small>片段越长能看到的地理越多，耗时也越长。</small></span><input type="range" min="5" max="20" step="1" value={guidedDuration} onChange={(event) => setGuidedDuration(Number(event.target.value))} /><output>{guidedDuration} 秒</output></label><div className="location-builder-clarity"><Check size={14} /><span><strong>清晰帧保护</strong><small>高速快门、稳定运动，无运动模糊、拖影、鬼影、甩镜或果冻畸变。</small></span></div></div></div><div className="location-builder-actions"><button className="secondary-button" onClick={() => void chooseImage('base')}><ImagePlus size={14} />更换起始图片</button><button className="primary-button" disabled={!connected} onClick={startGuidedSurvey}><Play size={14} fill="currentColor" />用 LTX 2.5 生成广角勘景</button></div></section>
    : !guidedAutomation ? <section className="location-builder-stage location-builder-progress"><LoaderCircle className="spin" size={30} /><strong>正在提交 LTX 2.5 勘景…</strong><p>即使关闭，引导式构建器仍会保持与该地点的关联。</p></section>
    : guidedAutomation.status === 'failed' || guidedAutomation.status === 'cancelled' ? <section className="location-builder-stage location-builder-empty"><CircleStop size={30} /><strong>{guidedAutomation.status === 'failed' ? 'LTX 勘景失败' : 'LTX 勘景已取消'}</strong><p>{guidedAutomation.error ?? '未改动任何地点图片。'}</p><div className="location-builder-actions"><button className="primary-button" onClick={() => setGuidedRunStartedAt(null)}>检查并重试</button></div></section>
    : guidedAutomation.status !== 'completed' ? <section className="location-builder-stage location-builder-progress"><RenderConstruction /><strong>{guidedAutomation.progressLabel ?? '正在渲染广角地点勘景'}</strong><p>{guidedDuration} 秒 · {surveyCameras.find((camera) => camera.id === guidedCamera)?.label} · 清晰帧</p><div className="progress"><i style={{ width: `${guidedAutomation.progress}%` }} /></div><small>{Math.round(guidedAutomation.progress)}% · 五张参考图将自动提取</small></section>
    : !guidedSetReady ? <section className="location-builder-stage location-builder-empty"><Images size={30} /><strong>勘景已完成渲染，但图组未导入</strong><p>关闭构建器后使用现有的提取控件，或重试勘景。渲染好的视频仍关联到该地点。</p><div className="location-builder-actions"><button className="secondary-button" onClick={() => setGuidedOpen(false)}>关闭并手动提取</button><button className="primary-button" onClick={() => setGuidedRunStartedAt(null)}>检查并重试</button></div></section>
    : <section className="location-builder-stage"><div className="location-builder-stage-heading"><span><strong>地点图组已就绪</strong><small>这些图片已移入「已确认地点参考图」。不希望参与渲染的视图，取消勾选即可。</small></span><span className="recommended-badge">{locationReferences(active).length} 张已选</span></div><div className="location-builder-results">{active.referenceImages.map((file, index) => { const checked = active.selectedReferencePaths === undefined || active.selectedReferencePaths.includes(file.path); return <label className={checked ? 'selected' : ''} key={`${file.path}-${index}`}><img src={file.preview} alt={`${active.name} 提取的广角视图 ${index + 1}`} /><span><input type="checkbox" checked={checked} onChange={(event) => { const current = active.selectedReferencePaths ?? active.referenceImages.map((item) => item.path); patch({ referenceMode: 'set', selectedReferencePaths: event.target.checked ? [...new Set([...current, file.path])] : current.filter((path) => path !== file.path) }) }} />广角视图 {index + 1}</span></label> })}</div><div className="location-builder-actions"><button className="primary-button" disabled={!locationReferences(active).length} onClick={() => { patch({ referenceMode: 'set' }); setGuidedOpen(false); onNotice('success', `${locationReferences(active).length} 张 LTX 地点视图已可使用。`) }}><Check size={14} />完成地点图组</button></div></section>}
  </div><footer><span><strong>{natureOnly ? '仅自然规则已启用' : '连贯性受保护'}</strong><small>全部机位预设都使用广角镜头，并明确要求无运动模糊。</small></span>{guidedAutomation && ['queued', 'running'].includes(guidedAutomation.status) && <button className="secondary-button" onClick={() => setGuidedOpen(false)}>关闭 · 继续渲染</button>}</footer></section></div>}{candidate && !guidedOpen && <ReferenceApprovalModal title="确认地点主图" description={natureOnly ? '检查地形、生态、光线与反复出现的地标，并确认没有人工建筑。' : '继续之前先检查地理、建筑、光线与反复出现的地标。'} image={candidate.file.preview ?? ''} approveLabel={natureOnly ? '确认并勘景地貌' : '确认并生成漫游'} nextStep={natureOnly ? '确认后会保存主图、排队一段仅自然的地貌勘景，然后把视频与五个地形视图导入这里。' : '确认后会保存主图、在后台排队漫游视频，然后把视频与五个地点视图导入这里。'} approveStartsGeneration onClose={() => setCandidate(null)} onRetry={() => { setCandidate(null); void createMaster() }} onApprove={approveCandidate} />}</>
}
