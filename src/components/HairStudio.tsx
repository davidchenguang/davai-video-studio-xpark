import { AssetLibraryRail } from './AssetLibraryRail'
import { useEffect, useMemo, useState } from 'react'
import { Check, CircleStop, ImagePlus, LoaderCircle, Scissors, Sparkles, Trash2, WandSparkles, X } from 'lucide-react'
import { HAIR_LIBRARY_EVENT, loadHairStyleProjects, newHairStyleProject, saveHairStyleProjects } from '../lib/hairLibrary'
import { choices, type ObjectInfo } from '../lib/comfyInfo'
import { buildZImage } from '../lib/zimage'
import { resolveAttentionBackend } from '../lib/attentionBackend'
import type { AppSettings, HairStyleProject, MediaFile } from '../types'
import { ReferenceApprovalModal } from './ReferenceApprovalModal'
import { resolveLlmConnection } from '../lib/llmProvider'
import { analyzeReferenceImage } from '../lib/referenceAnalysis'

function cleanPrompt(value: string) {
  return value.replace(/\\\s*(?:\r?\n|$)/g, ' ').replace(/[*_#`]+/g, '').replace(/\s+/g, ' ').trim()
}

const hairTextureLabels: Record<string, string> = {
  'straight and sleek': '顺滑直发',
  'soft waves': '柔和波浪',
  'defined waves': '分明波浪',
  'loose curls': '松散卷发',
  'tight curls': '紧密卷发',
  'coily natural texture': '天然螺旋卷',
  locs: '脏辫',
  'box braids': '方形细辫',
  cornrows: '贴头辫',
  twists: '两股扭转辫',
  'buzzed texture': '极短寸头',
  'natural texture': '自然质地',
}

const hairLengthLabels: Record<string, string> = {
  shaved: '剃光',
  cropped: '极短',
  'ear length': '及耳',
  'chin length': '及下巴',
  'shoulder length': '及肩',
  'medium length': '中等长度',
  'mid-back length': '及背中部',
  'waist length': '及腰',
}

export function HairStudio({ settings, info, connected, ollamaAvailable, onNotice }: { settings: AppSettings; info: ObjectInfo; connected: boolean; ollamaAvailable: boolean; onNotice(tone: 'error' | 'success' | 'neutral', text: string): void }) {
  const initial = useMemo(() => { const saved = loadHairStyleProjects(); return saved.length ? saved : [newHairStyleProject()] }, [])
  const [projects, setProjects] = useState(initial)
  const [activeId, setActiveId] = useState(initial[0].id)
  const [job, setJob] = useState<{ id: string; url: string; hairStyleId: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [assisting, setAssisting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState(false)
  const [candidate, setCandidate] = useState<{ hairStyleId: string; file: MediaFile } | null>(null)
  const active = projects.find((item) => item.id === activeId) ?? projects[0]
  const llm = resolveLlmConnection(settings)
  const commit = (next: HairStyleProject[]) => { setProjects(next); saveHairStyleProjects(next) }
  const patch = (change: Partial<HairStyleProject>) => commit(projects.map((item) => item.id === active.id ? { ...item, ...change, updatedAt: Date.now() } : item))
  const patchById = (id: string, change: Partial<HairStyleProject>) => setProjects((current) => { const next = current.map((item) => item.id === id ? { ...item, ...change, updatedAt: Date.now() } : item); saveHairStyleProjects(next); return next })
  useEffect(() => { const refresh = () => { const next = loadHairStyleProjects(); if (next.length) setProjects(next) }; window.addEventListener(HAIR_LIBRARY_EVENT, refresh); return () => window.removeEventListener(HAIR_LIBRARY_EVENT, refresh) }, [])

  const prompt = active.referencePrompt.trim() || [
    `Professional three-view hairstyle design board for “${active.name}”.`,
    active.description,
    `Hair texture: ${active.texture}. Hair length: ${active.length}.`,
    active.color && `Exact hair color and tonal variation: ${active.color}.`,
    `Hairline and part: ${active.hairline}. Finish: ${active.finish}.`,
    `${active.visualStyle}. Show the exact same hairstyle from front, clean side profile, and back on one neutral featureless salon mannequin head. Hair is the only subject: preserve exact silhouette, volume, parting, fringe, layers, curl or braid pattern, edges, length, and color in every view. Crop from upper shoulders to above the head. Seamless mid-gray background, soft even salon lighting, sharp individual strands, no facial identity, no clothing details, no jewelry, no hat, no hands, no text, no labels, no logo, no duplicate hairstyle, no fantasy ornaments unless specified.`,
  ].filter(Boolean).join(' ')
  const zModel = choices(info, 'UNETLoader', 'unet_name').find((name) => /z[_-]?image.*turbo/i.test(name)) ?? 'z_image_turbo_bf16.safetensors'
  const zEncoder = choices(info, 'CLIPLoader', 'clip_name').find((name) => /qwen[_-]?3[_-]?4b/i.test(name)) ?? 'qwen_3_4b.safetensors'
  const zVae = choices(info, 'VAELoader', 'vae_name').find((name) => /^ae\.safetensors$/i.test(name)) ?? 'ae.safetensors'
  const zReady = connected && choices(info, 'UNETLoader', 'unet_name').includes(zModel) && choices(info, 'CLIPLoader', 'clip_name').includes(zEncoder) && choices(info, 'VAELoader', 'vae_name').includes(zVae)

  const enhance = async () => {
    if (!ollamaAvailable || assisting) return
    setAssisting(true)
    try {
      const result = await window.minimax.generateWithOllama(llm.url, llm.model, `Rewrite these notes as one precise hairstyle reference prompt. Preserve exact texture, curl or braid pattern, silhouette, length, layers, part, fringe, hairline, edges, color, tonal variation, volume, and finish. Describe hair only; never invent a face, person, outfit, jewelry, headwear, or accessory. End with: the same hairstyle shown from front, side, and back on a neutral featureless salon mannequin head, upper-shoulder crop, mid-gray background, even studio lighting, sharp individual strands, no text or labels. Return one plain-text paragraph only.\n\nName: ${active.name}\nDesign: ${active.description}\nTexture: ${active.texture}\nLength: ${active.length}\nColor: ${active.color}\nHairline and part: ${active.hairline}\nFinish: ${active.finish}`, llm.provider)
      patch({ referencePrompt: cleanPrompt(result) }); onNotice('success', `发型设计提示词已用 ${llm.label} 在本地打磨。`)
    } catch (cause) { onNotice('error', cause instanceof Error ? cause.message : String(cause)) }
    finally { setAssisting(false) }
  }
  const chooseImage = async () => { const picked = await window.minimax.chooseMedia('image'); if (!picked) return; const projectId = active.id; patch({ referenceImage: { ...picked, kind: 'image', preview: await window.minimax.mediaUrl(picked.path) } }); if (!ollamaAvailable) { onNotice('neutral', '图片已添加。连接本地视觉模型即可自动填充发型档案。'); return } onNotice('neutral', '图片已添加。本地视觉模型正在填充空白的发型字段…'); try { const result = await analyzeReferenceImage(settings, picked.path, 'hair'); const current = loadHairStyleProjects().find((item) => item.id === projectId); if (!current) return; const textures = ['straight and sleek','soft waves','defined waves','loose curls','tight curls','coily natural texture','locs','box braids','cornrows','twists','buzzed texture','natural texture']; const lengths = ['shaved','cropped','ear length','chin length','shoulder length','medium length','mid-back length','waist length']; patchById(projectId, { name: !current.name.trim() || /^(Hair design|发型设计) \d+$/i.test(current.name) ? result.name || current.name : current.name, description: current.description.trim() ? current.description : result.description, texture: current.texture !== 'natural texture' || !textures.includes(result.texture) ? current.texture : result.texture, length: current.length !== 'medium length' || !lengths.includes(result.length) ? current.length : result.length, color: current.color.trim() ? current.color : result.color, hairline: current.hairline !== 'natural hairline' ? current.hairline : result.hairline || current.hairline, finish: current.finish !== 'soft natural finish' ? current.finish : result.finish || current.finish, visualStyle: current.visualStyle !== 'high-end salon reference photography' ? current.visualStyle : result.visualStyle || current.visualStyle }); onNotice('success', '图片分析完成；空白的发型字段已填充，供你检查。') } catch (reason) { onNotice('error', `图片已添加，但自动描述失败：${reason instanceof Error ? reason.message : String(reason)}`) } }
  const createReference = async () => {
    if (!zReady || busy || !active.name.trim()) return
    setBusy(true); setError(false); setMessage('正在提交发型设计图版…')
    try { const response = await window.minimax.submitPrompt(settings.comfyUrl, buildZImage(prompt, 1024, 1024, Math.floor(Math.random() * 1_000_000_000), zModel, zEncoder, zVae, 8, 1, 'turbo', '', resolveAttentionBackend(settings.attentionBackend, choices(info, 'ModelAttentionBackend', 'attention')))); setJob({ id: response.prompt_id, url: settings.comfyUrl, hairStyleId: active.id }); setMessage('正在 ComfyUI 中渲染发型…') }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : String(cause)); setError(true); setBusy(false) }
  }
  const cancel = async () => { if (!job) return; try { await window.minimax.cancelPrompt(job.url, job.id) } finally { setJob(null); setBusy(false); setMessage('发型渲染已取消。') } }
  useEffect(() => {
    if (!job) return
    let disposed = false; let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        const history = await window.minimax.getHistory(job.url, job.id)
        const entry = history[job.id] as { status?: { status_str?: string }; outputs?: Record<string, { images?: Array<{ filename: string; subfolder?: string; type?: string }> }> } | undefined
        if (entry?.status?.status_str === 'error') throw new Error('发型生成失败。请查看 ComfyUI 日志。')
        const image = Object.values(entry?.outputs ?? {}).flatMap((output) => output.images ?? [])[0]
        if (image) { const preview = await window.minimax.getOutputImage(job.url, image); const saved = await window.minimax.saveComfyOutputImage(job.url, image, settings.outputDirectory); if (!disposed) { setCandidate({ hairStyleId: job.hairStyleId, file: { ...saved, preview, kind: 'image' } }); setBusy(false); setJob(null); setMessage('发型设计已就绪，等待确认。') }; return }
      } catch (cause) { if (!disposed) { setMessage(cause instanceof Error ? cause.message : String(cause)); setError(true); setBusy(false); setJob(null) }; return }
      timer = setTimeout(poll, 2000)
    }
    void poll(); return () => { disposed = true; clearTimeout(timer) }
  }, [job, settings.outputDirectory])

  const add = () => { const item = newHairStyleProject(projects.length + 1); commit([...projects, item]); setActiveId(item.id) }
  const remove = () => { if (!window.confirm(`删除发型设计「${active.name}」？图片会保留在磁盘上。`)) return; const next = projects.filter((item) => item.id !== active.id); const fallback = next.length ? next : [newHairStyleProject()]; commit(fallback); setActiveId(fallback[0].id) }

  return <><div className="standard-page character-studio hair-studio"><div className="page-heading"><div><p className="eyebrow">全局发型库</p><h1>发型工作室</h1><p>设计可复用的发型，确认一张干净的参考图版，再把发型指派给任意角色。</p></div><div className="heading-state"><span className={active.referenceImage ? 'ok' : 'warn'}>{active.referenceImage ? <Check size={15} /> : <Scissors size={15} />}{active.referenceImage ? '发型参考图就绪' : '先创建一张发型参考图'}</span></div></div><div className="character-studio-grid"><AssetLibraryRail title="发型设计" items={projects.map(item => ({ id: item.id, name: item.name, detail: `${hairTextureLabels[item.texture] ?? item.texture} · ${item.referenceImage ? '已确认' : '待补图片'}`, preview: item.referenceImage?.preview, placeholder: <Scissors size={18} /> }))} activeId={active.id} onAdd={add} onSelect={setActiveId} /><section className="character-workbench"><header><div><Scissors size={18} /><span><strong>发型身份</strong><small>发型与面部身份分离，角色换发型更干净。</small></span></div><button className="danger-button" onClick={remove}><Trash2 size={14} />删除设计</button></header><div className="wardrobe-workspace"><section className="character-setup-panel"><div className="character-section-heading"><span><Scissors size={15} /></span><div><strong>设计档案</strong><small>定义轮廓、质地、结构、颜色与造型效果。</small></div></div><div className="character-form"><label>设计名称<input value={active.name} onChange={(event) => patch({ name: event.target.value, referencePrompt: '' })} /></label><label>质地<select value={active.texture} onChange={(event) => patch({ texture: event.target.value, referencePrompt: '' })}>{['straight and sleek','soft waves','defined waves','loose curls','tight curls','coily natural texture','locs','box braids','cornrows','twists','buzzed texture','natural texture'].map((value) => <option key={value} value={value}>{hairTextureLabels[value] ?? value}</option>)}</select></label><label>长度<select value={active.length} onChange={(event) => patch({ length: event.target.value, referencePrompt: '' })}>{['shaved','cropped','ear length','chin length','shoulder length','medium length','mid-back length','waist length'].map((value) => <option key={value} value={value}>{hairLengthLabels[value] ?? value}</option>)}</select></label><label>颜色<input value={active.color} onChange={(event) => patch({ color: event.target.value, referencePrompt: '' })} placeholder="深咖棕色，带细腻暖色高光" /></label><label className="wide">剪裁、形状与造型细节<textarea value={active.description} onChange={(event) => patch({ description: event.target.value, referencePrompt: '' })} placeholder="轮廓、层次、刘海、渐变、编发纹路、蓬松度、碎发…" /></label><label>发际线与分缝<input value={active.hairline} onChange={(event) => patch({ hairline: event.target.value, referencePrompt: '' })} /></label><label>造型效果<input value={active.finish} onChange={(event) => patch({ finish: event.target.value, referencePrompt: '' })} placeholder="光泽、柔顺、湿发感、飘发…" /></label></div><div className="character-assist"><span><WandSparkles size={15} /><span><strong>提示词助手</strong><small>把设计档案变成一条精确的纯发型参考提示词。</small></span></span><button className="secondary-button" disabled={!ollamaAvailable || assisting} onClick={() => void enhance()}>{assisting ? <LoaderCircle className="spin" size={14} /> : <WandSparkles size={14} />}{assisting ? '打磨中…' : '打磨提示词'}</button></div></section><section className="character-setup-panel wardrobe-render-panel"><div className="character-section-heading"><span><Sparkles size={15} /></span><div><strong>三视图发型参考图</strong><small>中性的假人头图版可避免引入他人的脸。</small></div><em>{zReady ? '就绪' : '不可用'}</em></div><label className="character-reference-prompt"><span><strong>可编辑渲染提示词</strong><small>正面、侧面与背面保持一致。</small></span><textarea value={prompt} onChange={(event) => patch({ referencePrompt: event.target.value })} /></label>{message && <div className={`character-master-message ${error ? 'error' : ''}`} role="status">{busy && <LoaderCircle className="spin" size={13} />}<span>{message}</span></div>}<footer><button className="secondary-button" disabled={busy} onClick={() => void chooseImage()}><ImagePlus size={14} />选择现有图片</button>{busy && <button className="danger-button" onClick={() => void cancel()}><CircleStop size={14} />取消</button>}<button className="primary-button" disabled={busy || !zReady || !active.name.trim()} onClick={() => void createReference()}><Sparkles size={14} />{busy ? '生成中…' : active.referenceImage ? '重新生成发型' : '生成发型参考图'}</button></footer>{active.referenceImage && <figure className="accessory-reference-preview hair-reference-preview"><img src={active.referenceImage.preview} alt={`${active.name} 发型参考图`} /><figcaption><span><Check size={13} />已确认发型参考图</span><button aria-label="移除发型参考图" onClick={() => patch({ referenceImage: undefined })}><X size={13} /></button></figcaption></figure>}</section></div></section></div></div>{candidate && <ReferenceApprovalModal title="确认发型设计" description="确认正面、侧面与背面呈现同一个一致的发型，且质地、轮廓、发际线、长度与颜色符合预期。" image={candidate.file.preview ?? ''} approveLabel="确认发型参考图" nextStep="稍后在角色工作室指派该发型。参考图模式会让它与该角色保持配对。" onClose={() => setCandidate(null)} onRetry={() => { setCandidate(null); void createReference() }} onApprove={() => { patchById(candidate.hairStyleId, { referenceImage: candidate.file }); setCandidate(null); onNotice('success', '发型设计已确认并加入全局库。') }} />}</>
}
