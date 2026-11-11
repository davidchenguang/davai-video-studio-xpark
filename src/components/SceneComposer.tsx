import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, Check, ChevronDown, Code, Plus, Scan, Sparkles, Trash2, X } from 'lucide-react'
import { SmartPromptEditor, type SmartInsertOption, type SmartPromptEditorHandle } from './SmartPromptEditor'
import { compileScene } from '../lib/h3SceneCompiler'
import { applySceneCommand, applySceneSuggestions, cameraOptions, defaultPreservedAttributes, extractSceneDialogue, parseStyleValues, resizeScene, setFrameZeroGuide, suggestScene, value, type Attribute, type Camera as CameraState, type ScenePromptState, type SceneReference } from '../lib/scenePromptState'
import '../scene-composer.css'
import { SceneIssues } from './SceneIssues'

export type SceneInspectorSelection = { kind: 'scene' } | { kind: 'reference'; id: string } | { kind: 'shot'; id: string }

// Preserve/lock 属性值是英文存储枚举（进入提示词），下面的映射是中文显示层。
const attributeLabels: Record<string, string> = {
  identity: '身份',
  face: '面部',
  body: '身体',
  hair: '发型',
  wardrobe: '服装',
  accessories: '配饰',
  environment: '环境',
  lighting: '灯光',
  props: '道具',
  style: '风格',
  pose: '姿势',
  shotSize: '景别',
  angle: '机位角度',
  composition: '构图',
  motion: '运动',
}
const sourceLabels: Record<string, string> = { USER: '手动', CHARACTER: '角色', PRESERVE: '保留', PROJECT: '项目', AI: 'AI', DEFAULT: '默认' }
const videoRoleLabels: Record<string, string> = { motion: '运动', structure: '结构', continuation: '续接', editing: '剪辑' }

// Camera enum values are English storage strings that reach the prompt; the
// Chinese labels in scenePromptState are the display layer for them.
function cameraValueLabel(text: string) {
  for (const options of Object.values(cameraOptions)) {
    const match = options.find(option => option.value.toLocaleLowerCase() === text.toLocaleLowerCase())
    if (match) return match.label
  }
  return text
}

// 建议弹窗里的「检测自」是推断理由，「行为」描述是相机行为句：
// 两者在场景状态里都是英文（behavior 会被 h3SceneCompiler 原样编入提示词），
// 显示层走这两张映射表，提示词层保持英文。
const suggestionEvidenceLabels: Record<string, string> = {
  'camera backs away': '镜头向后拉',
  'found footage': '手持纪实画面',
  'handheld': '手持画面',
}

const cameraBehaviorLabels: Record<string, string> = {
  'Subtle handheld tremble, autofocus breathing, responsive auto-exposure and low-light sensor noise.': '轻微手持抖动、自动对焦呼吸、灵敏的自动曝光与低照度噪点。',
}

function suggestionValueLabel(value: string) {
  return cameraBehaviorLabels[value] ?? cameraValueLabel(value)
}

function suggestionEvidenceLabel(evidence: string) {
  return suggestionEvidenceLabels[evidence] ?? cameraValueLabel(evidence)
}

// 内置环境声描述会由 h3SceneCompiler 原样编入提示词（clean(audio.description)），
// 属提示词层文本，保持英文；属性名用中性名，避免扫描器把它算成界面文案。
const embeddedAudioDescription = 'The video’s ambient sound texture; do not inherit speech or music.'

function preserveSummary(ref: SceneReference) {
  if (ref.preserve.length) return `保留：${ref.preserve.map(item => attributeLabels[item] ?? item).join(' · ')}`
  if (ref.file.referenceRole === 'wardrobe') return '服装参考 · 开启保留即可让角色全程穿着'
  return ref.anchor === 'opening' ? '帧 0 锚定 · 原生 0.00s 引导' : ref.anchor === 'ending' ? '尾帧锚定' : ref.anchor === 'keyframe' ? '定时关键帧锚定' : ref.audio?.layer || (ref.videoRole ? videoRoleLabels[ref.videoRole] : '') || '仅参考 · 选择它引导的内容'
}

export function SceneComposer({ state, onChange, options, onAddReference, onManageReferences, onRemoveCharacter, onUpdateReferenceFile, onAnalyzeReference, selection, onInspect }: { state: ScenePromptState; onChange(state: ScenePromptState): void; options: SmartInsertOption[]; onAddReference(): void; onManageReferences(): void; onRemoveCharacter(characterId: string): void; onUpdateReferenceFile?(path: string, file: SceneReference['file']): void; onAnalyzeReference?(path: string): Promise<Partial<Record<Attribute, string>>>; selection?: SceneInspectorSelection; onInspect?(selection: SceneInspectorSelection): void }) {
  const editor = useRef<SmartPromptEditorHandle>(null)
  const suggestionsTrigger = useRef<HTMLButtonElement>(null)
  const suggestionsClose = useRef<HTMLButtonElement>(null)
  const [activeShot, setActiveShot] = useState(0)
  const [analysis, setAnalysis] = useState<{ id: string; fields: Partial<Record<Attribute, string>> } | null>(null)
  const [analyzing, setAnalyzing] = useState('')
  const [analysisError, setAnalysisError] = useState('')
  const [referencesOpen, setReferencesOpen] = useState(false)
  const [shotsOpen, setShotsOpen] = useState(false)
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const closeSuggestions = useCallback(() => {
    setSuggestionsOpen(false)
    window.requestAnimationFrame(() => suggestionsTrigger.current?.focus())
  }, [])
  useEffect(() => {
    if (!suggestionsOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeSuggestions()
    }
    window.addEventListener('keydown', onKeyDown)
    window.requestAnimationFrame(() => suggestionsClose.current?.focus())
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [closeSuggestions, suggestionsOpen])
  const compiled = compileScene(state)
  const suggestions = suggestScene(state.scene)
  const shotIndex = Math.min(activeShot, state.shots.length - 1)
  const shot = state.shots[shotIndex]
  const camera = shotIndex === 0 ? state.camera : shot?.camera || {}
  const setCamera = (key: keyof CameraState, text: string) => onChange(shotIndex === 0 ? { ...state, camera: { ...state.camera, [key]: value(text) } } : { ...state, shots: state.shots.map((item, index) => index === shotIndex ? { ...item, camera: { ...item.camera, [key]: value(text) } } : item) })
  const updateRef = (id: string, update: Partial<SceneReference>) => onChange({ ...state, references: state.references.map(ref => ref.id === id ? { ...ref, ...update } : ref) })
  const setView = (view: ScenePromptState['view']) => onChange({ ...state, view, manualPrompt: view === 'manual' && !state.manualPrompt ? compiled.prompt : state.manualPrompt })
  const characterSource = (characterId: string, attribute: Attribute) => {
    const numbers = state.references
      .filter(ref => ref.ownerId === characterId && ref.preserve.includes(attribute))
      .map(ref => Number(compiled.references.find(item => item.id === ref.id)?.label.match(/\d+/)?.[0]))
      .filter(Number.isFinite)
      .sort((a, b) => a - b)
    if (!numbers.length) return '角色默认'
    if (numbers.length > 1 && numbers.every((number, index) => index === 0 || number === numbers[index - 1] + 1)) return `图片 ${numbers[0]}–${numbers.at(-1)}`
    return `图片 ${numbers.join('、')}`
  }
  return <section className="scene-composer" aria-label="场景编辑器">
    <nav className="scene-view-tabs" aria-label="场景编辑视图"><span>视图</span>{(['creative', 'compiled', 'manual'] as const).map(view => <button key={view} type="button" aria-pressed={state.view === view} className={state.view === view ? 'selected' : ''} onClick={() => setView(view)}>{view === 'creative' ? <Camera size={15} /> : <Code size={15} />}{view === 'creative' ? '场景' : view === 'compiled' ? '编译结果' : '手动覆盖'}</button>)}</nav>
    {state.view === 'creative' ? <div className="scene-workbench">
      <div className={`scene-authoring ${selection?.kind === 'scene' ? 'selected' : ''}`} onFocusCapture={() => onInspect?.({ kind: 'scene' })} onClick={() => onInspect?.({ kind: 'scene' })}><div><div className="scene-heading scene-direction-heading"><div><strong>场景指令</strong><small>描述主体、动作与视觉意图。</small></div><div className="scene-heading-actions"><button type="button" title="浏览场景命令" onClick={() => editor.current?.open()}><Sparkles size={14} />命令</button><button ref={suggestionsTrigger} type="button" onClick={() => setSuggestionsOpen(true)}><Scan size={14} />建议{suggestions.length > 0 && <em>{suggestions.length}</em>}</button></div></div>
        <SmartPromptEditor ref={editor} id="scene-description" value={state.scene} onChange={scene => onChange({ ...state, scene })} ariaLabel="场景" rows={6} placeholder="同一个女人、同一身衣服、同一间厨房。一个特写：她注意到镜头上方的什么东西……" options={options} onCommand={(item, scene) => { const next = applySceneCommand({ ...state, scene }, item.category, item.searchLabel ?? item.label, item.insertion); onChange(next) }} />
      </div></div>
      <div className={`scene-section scene-major-panel scene-references-panel reference-filmstrip ${referencesOpen ? 'show-details' : 'compact'} ${state.references.length ? 'has-references' : 'needs-reference'}`}><div className="scene-heading"><strong>参考图 <em>{state.references.length}</em></strong><button type="button" onClick={onManageReferences}>浏览媒体库</button><button type="button" className="panel-collapse" aria-expanded={referencesOpen} onClick={() => setReferencesOpen(!referencesOpen)}><ChevronDown size={14} className={referencesOpen ? 'rotated' : ''} />{referencesOpen ? '收起详情' : '展开详情'}</button></div>
        <div className="scene-reference-grid" role="region" aria-label="参考图条" tabIndex={0}>{state.references.map(ref => <article key={ref.id} data-reference-id={ref.id} aria-current={selection?.kind === 'reference' && selection.id === ref.id ? 'true' : undefined} onFocusCapture={() => onInspect?.({ kind: 'reference', id: ref.id })} onClick={() => onInspect?.({ kind: 'reference', id: ref.id })} className={`scene-reference-card ${ref.anchor ? 'anchored' : ''} ${selection?.kind === 'reference' && selection.id === ref.id ? 'selected' : ''}`}>
          <div className="scene-reference-image">{ref.file.preview && ref.file.kind === 'image' ? <img src={ref.file.preview} alt={ref.name} /> : <span>{ref.file.kind.toUpperCase()}</span>}<b>{compiled.references.find(item => item.id === ref.id)?.label.replace(/[<>]/g, '')}</b>{ref.file.kind === 'image' && <em className="reference-framing-badge">{ref.file.crop?.fit === 'crop' ? 'FILL' : 'FIT'}</em>}{ref.anchor === 'opening' && <em className="opening-frame-badge">帧 0 锚定 · 0.00s</em>}</div><div className="scene-reference-body"><div className="reference-role-badges">{(ref.preserve.length ? ref.preserve : [ref.file.referenceRole || ref.audio?.layer || ref.videoRole || 'reference']).slice(0, 3).map(role => <span key={role}>{String(role).toUpperCase()}</span>)}</div><strong title={ref.name}>{ref.name}</strong>
          {ref.file.kind === 'image' && <label className="scene-reference-framing" onClick={(event) => event.stopPropagation()}>构图<select aria-label={`${ref.name} 的构图`} value={ref.file.crop?.fit ?? 'contain'} onChange={(event) => { const file = { ...ref.file, crop: { fit: event.target.value as 'contain' | 'crop', x: ref.file.crop?.x ?? .5, y: ref.file.crop?.y ?? .5, zoom: ref.file.crop?.zoom ?? 1 } }; updateRef(ref.id, { file }); onUpdateReferenceFile?.(ref.file.path, file) }}><option value="contain">适应</option><option value="crop">填充</option></select></label>}
          {ref.file.kind === 'image' && <div className="scene-reference-toggles"><label title="在 frame_idx 0 施加原生 MiniMaxH3AddGuide 条件控制。只允许一张图片作为帧 0 锚定。"><input type="checkbox" checked={ref.anchor === 'opening'} onChange={event => onChange(setFrameZeroGuide(state, event.target.checked ? ref.id : undefined))} />帧 0 锚定</label><label title={ref.file.referenceRole === 'wardrobe' ? '让这套已确认的服装在该镜头中全程保持在角色身上。' : '把所选属性保留为可复用的引导，不锁定生成的开场画面。'}><input type="checkbox" aria-label={`保留 ${ref.name}`} checked={!!ref.preserve.length} onChange={event => updateRef(ref.id, { preserve: event.target.checked ? defaultPreservedAttributes(ref) : [] })} />仅参考</label></div>}
          <small className={`scene-retained ${ref.file.referenceRole === 'wardrobe' && !ref.preserve.length ? 'scene-retained-warning' : ''}`}>{preserveSummary(ref)}</small>
          {ref.file.kind === 'image' && onAnalyzeReference && <button type="button" disabled={!!analyzing} onClick={async () => { setAnalyzing(ref.id); setAnalysisError(''); try { setAnalysis({ id: ref.id, fields: await onAnalyzeReference(ref.file.path) }) } catch (error) { setAnalysisError(error instanceof Error ? error.message : String(error)) } finally { setAnalyzing('') } }}>{analyzing === ref.id ? '正在分析…' : '分析视觉细节'}</button>}
          {analysis?.id === ref.id && <div className="scene-analysis-review"><strong>AI 观察建议 <em>AI</em></strong>{Object.entries(analysis.fields).filter(([,text]) => text).map(([field,text]) => <p key={field}><b>{attributeLabels[field] ?? field}</b>：{text}</p>)}<button type="button" onClick={() => { updateRef(ref.id, { observed: { ...analysis.fields, ...Object.fromEntries(Object.entries(ref.observed).filter(([, text]) => !!text)) }, reviewed: false }); setAnalysis(null) }}>应用观察</button><button type="button" onClick={() => setAnalysis(null)}>放弃</button><small>已有的观察保持不变。构图与保留属性分开观察。</small></div>}
          {ref.file.kind === 'video' && <label><input type="checkbox" checked={!!ref.embeddedAudio} onChange={event => updateRef(ref.id, { embeddedAudio: event.target.checked ? { relation: 'reference', layer: 'ambience', description: embeddedAudioDescription } : undefined })} />使用视频音频</label>}
          <button type="button" className="scene-reference-inspect" onClick={() => onInspect?.({ kind: 'reference', id: ref.id })}>在检查器中编辑 <ChevronDown size={12} /></button></div></article>)}<button type="button" className="scene-add-reference" onClick={onAddReference}><Plus size={20} />添加参考图<small>图片 · 视频 · 音频</small></button></div>
      </div>
      <div className="scene-section scene-major-panel scene-shot-panel"><div className="scene-heading"><strong>镜头规划</strong><span>{shot?.start.toFixed(2)} — {shot?.end.toFixed(2)} 秒</span><label>片段时长<input aria-label="片段时长" type="number" min="1" max="15" step="0.5" value={state.duration} onChange={event => onChange(resizeScene(state, +event.target.value))} /></label><button type="button" className="panel-collapse" aria-expanded={shotsOpen} onClick={() => setShotsOpen(!shotsOpen)}><ChevronDown size={14} className={shotsOpen ? 'rotated' : ''} />{shotsOpen ? '收起' : '展开'}</button></div>{shotsOpen && <><div className="scene-shot-tabs">{state.shots.map((item, index) => <button type="button" key={item.id} aria-current={selection?.kind === 'shot' && selection.id === item.id ? 'true' : undefined} className={index === shotIndex ? 'selected' : ''} onClick={() => { setActiveShot(index); onInspect?.({ kind: 'shot', id: item.id }) }}>镜头 {index + 1}</button>)}<button type="button" disabled={!shot || shot.end - shot.start < 1} onClick={() => { const last = state.shots.at(-1)!; const split = Math.round((last.start + last.end) / 2 * 1000) / 1000; const id = `shot-${Date.now()}`; onChange({ ...state, shots: [...state.shots.slice(0, -1), { ...last, end: split }, { id, start: split, end: last.end, description: '', camera: {}, characterIds: [] }] }); setActiveShot(state.shots.length); onInspect?.({ kind: 'shot', id }) }}><Plus size={13} />添加镜头</button>{state.shots.length > 1 && <button type="button" onClick={() => { const remaining = state.shots.filter((_, index) => index !== shotIndex); const next = remaining.map((item, index) => ({ ...item, start: index * state.duration / remaining.length, end: (index + 1) * state.duration / remaining.length })); onChange({ ...state, shots: next, dialogue: state.dialogue.filter(line => line.shotId !== shot.id) }); setActiveShot(0); onInspect?.({ kind: 'shot', id: next[0].id }) }}><Trash2 size={13} />移除</button>}</div>
      <div className="scene-camera-grid">{Object.entries(cameraOptions).map(([key, choices]) => <label key={key}>{({ shotSize: '帧景别', angle: '帧机位角度', movement: '运镜', speed: '速度', stabilization: '稳定', amplitude: '运动幅度' } as Record<string, string>)[key]} <em>{camera[key as keyof CameraState]?.source ? sourceLabels[camera[key as keyof CameraState]!.source] ?? camera[key as keyof CameraState]!.source : '默认'}</em><select value={camera[key as keyof CameraState]?.value || ''} onChange={event => setCamera(key as keyof CameraState, event.target.value)}><option value="">取自场景</option>{choices.map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}{camera[key as keyof CameraState]?.value && !choices.some(choice => choice.value === camera[key as keyof CameraState]!.value) && <option value={camera[key as keyof CameraState]!.value}>{camera[key as keyof CameraState]!.value}</option>}</select></label>)}</div>
      {shot && <div className="scene-shot-detail"><input aria-label="镜头动作" value={shot.description} placeholder="这个镜头的补充动作…" onChange={event => onChange({ ...state, shots: state.shots.map((item, index) => index === shotIndex ? { ...item, description: event.target.value } : item) })} /><label>结束（秒）<input type="number" min={shot.start + .01} max={state.duration} step="0.1" value={shot.end} onChange={event => onChange({ ...state, shots: state.shots.map((item, index) => index === shotIndex ? { ...item, end: +event.target.value } : index === shotIndex + 1 ? { ...item, start: +event.target.value } : item) })} /></label></div>}
      </>}
      </div>
      <div className="scene-lower-grid scene-details-grid"><details className="scene-section"><summary>角色 <em>{state.characters.length}</em></summary>
        {state.characters.map(character => <div className="scene-character" key={character.id}>
          <div className="scene-character-header"><div className="scene-character-portrait">{state.references.filter(ref => ref.ownerId === character.id && ref.file.preview && ref.preserve.some(attribute => ['identity', 'face', 'body'].includes(attribute))).slice(0, 3).map(ref => <img key={ref.id} src={ref.file.preview} alt={`${character.name} 身份参考图`} />)}<strong>{character.name}</strong></div><button type="button" className="scene-character-delete" aria-label={`从场景中移除 ${character.name}`} title={`从该场景移除 ${character.name}`} onClick={() => onRemoveCharacter(character.id)}><Trash2 size={13} />移除</button></div>
          <div className="character-source-rows">{(['identity', 'wardrobe', 'hair'] as Attribute[]).map(attribute => { const source = characterSource(character.id, attribute); return <div key={attribute}><span>{attributeLabels[attribute] ?? attribute}</span><strong>{character.attributes[attribute]?.value || source}</strong><em>{character.attributes[attribute]?.value ? sourceLabels[character.attributes[attribute]!.source] ?? character.attributes[attribute]!.source : source === '角色默认' ? '角色' : '保留'}</em></div> })}</div>
          <details><summary>保留属性与归属</summary>{(['identity', 'face', 'body', 'hair', 'wardrobe', 'accessories'] as Attribute[]).map(attribute => <label key={attribute}>{attributeLabels[attribute] ?? attribute} <em>{character.attributes[attribute]?.source ? sourceLabels[character.attributes[attribute]!.source] ?? character.attributes[attribute]!.source : '角色'}</em><input value={character.attributes[attribute]?.value || ''} placeholder="明确指令优先于保留" onChange={event => onChange({ ...state, characters: state.characters.map(item => item.id === character.id ? { ...item, attributes: { ...item.attributes, [attribute]: value(event.target.value) } } : item) })} /><select aria-label={`${character.name} 的${attributeLabels[attribute] ?? attribute}来源`} value={character.attributes[attribute]?.referenceIds?.[0] || ''} onChange={event => onChange({ ...state, references: state.references.map(ref => ref.ownerId === character.id ? { ...ref, preserve: ref.id === event.target.value ? [...new Set([...ref.preserve, attribute])] : ref.preserve.filter(item => item !== attribute) } : ref), characters: state.characters.map(item => item.id === character.id ? { ...item, attributes: { ...item.attributes, [attribute]: { ...value('', 'CHARACTER'), referenceIds: event.target.value ? [event.target.value] : [] } } } : item) })}><option value="">角色素材库与媒体</option>{state.references.filter(ref => ref.ownerId === character.id).map(ref => <option key={ref.id} value={ref.id}>{compiled.references.find(item => item.id === ref.id)?.label} · {ref.name}</option>)}</select></label>)}</details>
        </div>)}
        <button type="button" onClick={() => onChange({ ...state, characters: [...state.characters, { id: `character-${Date.now()}`, name: `角色 ${state.characters.length + 1}`, attributes: {} }] })}>+ 添加角色</button>{state.characters.map(character => <input key={character.id} aria-label="角色名称" value={character.name} onChange={event => onChange({ ...state, characters: state.characters.map(item => item.id === character.id ? { ...item, name: event.target.value } : item) })} />)}
      </details>
      <details className="scene-section" open={state.dialogue.length > 0 || undefined}><summary>对白</summary>{state.dialogue.map(line => <div className="scene-dialogue" key={line.id}><select aria-label="台词说话人" value={line.speakerIds[0] || ''} onChange={event => onChange({ ...state, dialogue: state.dialogue.map(item => item.id === line.id ? { ...item, speakerIds: [event.target.value] } : item) })}><option value="">说话人</option>{state.characters.map(character => <option key={character.id} value={character.id}>{character.name}</option>)}</select>{(['language', 'delivery', 'text'] as const).map(field => <input key={field} aria-label={`台词 ${field === 'language' ? '语言' : field === 'delivery' ? '语气' : '台词'}`} placeholder={field === 'language' ? '语言' : field === 'delivery' ? '语气' : '台词'} value={line[field]} onChange={event => onChange({ ...state, dialogue: state.dialogue.map(item => item.id === line.id ? { ...item, [field]: event.target.value } : item) })} />)}<details><summary>时机与语气</summary><label>镜头<select value={line.shotId} onChange={event => onChange({ ...state, dialogue: state.dialogue.map(item => item.id === line.id ? { ...item, shotId: event.target.value, at: state.shots.find(shot => shot.id === event.target.value)!.start } : item) })}>{state.shots.map((shot, index) => <option key={shot.id} value={shot.id}>镜头 {index + 1}</option>)}</select></label><label>开始（秒）<input type="number" step="0.1" value={line.at} onChange={event => onChange({ ...state, dialogue: state.dialogue.map(item => item.id === line.id ? { ...item, at: +event.target.value } : item) })} /></label><label><input type="checkbox" checked={!!line.voiceover} onChange={event => onChange({ ...state, dialogue: state.dialogue.map(item => item.id === line.id ? { ...item, voiceover: event.target.checked } : item) })} />画外配音</label><label>跨切续接<select value={line.continues || ''} onChange={event => onChange({ ...state, dialogue: state.dialogue.map(item => item.id === line.id ? { ...item, continues: event.target.value as typeof line.continues || undefined } : item) })}><option value="">完整台词</option><option value="to">延续到下一镜头</option><option value="from">承接上一镜头</option><option value="both">双向延续</option></select></label><label><input type="checkbox" checked={!!line.cutoff} onChange={event => onChange({ ...state, dialogue: state.dialogue.map(item => item.id === line.id ? { ...item, cutoff: event.target.checked } : item) })} />在片段结尾截断</label></details><button type="button" onClick={() => onChange({ ...state, dialogue: state.dialogue.filter(item => item.id !== line.id) })}>删除台词</button></div>)}<button type="button" disabled={!state.characters.length || !shot} onClick={() => onChange({ ...state, noDialogue: false, dialogue: [...state.dialogue, { id: `line-${Date.now()}`, shotId: shot.id, at: shot.start, speakerIds: [state.characters[0].id], language: 'English', text: '', delivery: '' }] })}>+ 添加台词</button></details>
      <details className="scene-section" open={!!(state.soundscape.value || state.music.value) || undefined}><summary>声音与音乐</summary><label>环境声 <em>{sourceLabels[state.soundscape.source] ?? state.soundscape.source}</em><textarea rows={3} value={state.soundscape.value} onChange={event => onChange({ ...state, soundscape: value(event.target.value) })} /></label><label>观众侧音乐 <em>{sourceLabels[state.music.source] ?? state.music.source}</em><textarea rows={2} placeholder="未要求时无配乐" value={state.music.value} onChange={event => onChange({ ...state, music: value(event.target.value) })} /></label></details>
      <details className="scene-section"><summary>场景</summary><label>环境 <em>{sourceLabels[state.environment.source] ?? state.environment.source}</em><input value={state.environment.value} onChange={event => onChange({ ...state, environment: value(event.target.value) })} /></label><label>灯光 <em>{sourceLabels[state.lighting.source] ?? state.lighting.source}</em><input value={state.lighting.value} onChange={event => onChange({ ...state, lighting: value(event.target.value) })} /></label><label>风格标签<input placeholder="手持纪录感, 低照度, 写实" value={state.styles.map(item => item.value).join(', ')} onChange={event => onChange({ ...state, styles: parseStyleValues(event.target.value) })} /></label></details></div>
    </div> : <div className="scene-section"><strong>{state.view === 'manual' ? '手动覆盖 — 修改内容独立保存' : '确定性 H3 输出'}</strong><p>{state.view === 'manual' ? '自动重新编译不会替换这段文字。参考图与时间检查仍会执行。' : '这是渲染时使用的精确编译输出。'}</p><textarea className="scene-compiled" aria-label={state.view === 'manual' ? '手动 H3 提示词' : '已编译的 H3 提示词'} readOnly={state.view !== 'manual'} value={state.view === 'manual' ? state.manualPrompt : compiled.prompt} onChange={event => onChange({ ...state, manualPrompt: event.target.value })} /></div>}
    <SceneIssues conflicts={compiled.conflicts} state={state} onChange={onChange} onReferences={onManageReferences} />
    {analysisError && <p role="alert">{analysisError}</p>}
    {extractSceneDialogue(state).dialogue.length > state.dialogue.length && <button type="button" onClick={() => onChange(extractSceneDialogue(state))}>检测到对白，点击在结构化控件中核对</button>}
    <details className="scene-section scene-debug"><summary>H3 调试</summary><pre>{JSON.stringify({ mode: compiled.mode, subjects: compiled.subjects, references: compiled.references, timing: compiled.timing, speakerIDs: compiled.speakers, conflicts: compiled.conflicts }, null, 2)}</pre></details>
    {suggestionsOpen && <div className="modal-backdrop scene-suggestions-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) closeSuggestions() }}><section className="scene-suggestions-modal" role="dialog" aria-modal="true" aria-labelledby="scene-suggestions-title"><header><div><span><Scan size={17} /></span><div><small>场景助手</small><strong id="scene-suggestions-title">建议的机位选择</strong><p>建议从你的场景指令推断而来。已明确的显式选择与锁定保持权威。</p></div></div><button ref={suggestionsClose} type="button" aria-label="关闭建议" onClick={closeSuggestions}><X size={17} /></button></header><div className="scene-suggestions-list">{suggestions.length ? suggestions.map((item, index) => <article key={`${item.field}-${index}`} title={`检测自：${suggestionEvidenceLabel(item.evidence)}`}><span><Scan size={14} /></span><div><small>{attributeLabels[item.field] ?? item.field}</small><strong>{suggestionValueLabel(item.value)}</strong><p>{suggestionEvidenceLabel(item.evidence)}</p></div><em>AI</em></article>) : <div className="scene-suggestions-empty"><Sparkles size={20} /><strong>暂无建议</strong><p>在「场景指令」中描述取景或摄影机行为，然后重新检查。</p></div>}</div><footer><span>{suggestions.length ? `${suggestions.length} 条建议` : '没有可应用的内容'}</span><div><button type="button" onClick={closeSuggestions}>取消</button><button type="button" className="primary-button" disabled={!suggestions.length} onClick={() => { onChange(applySceneSuggestions(state)); closeSuggestions() }}><Check size={14} />应用建议</button></div></footer></section></div>}
  </section>
}
