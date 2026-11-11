import { useState } from 'react'
import { Check, ChevronDown, Image as ImageIcon, SlidersHorizontal, X } from 'lucide-react'
import { compileScene } from '../lib/h3SceneCompiler'
import { cameraAttributes, cameraOptions, defaultPreservedAttributes, preserveAttributes, setFrameZeroGuide, value, type Camera, type ScenePromptState, type SceneReference } from '../lib/scenePromptState'
import type { SceneInspectorSelection } from './SceneComposer'

// 锚定 / 视频角色 / 音频枚举的 value 是英文存储值（进入提示词与状态），
// 以下映射是配套的中文显示层；SceneIssues.jump() 与影片工作区依赖这些确切措辞。
const anchorLabels: Record<string, string> = {
  opening: '帧 0 锚定 · 原生 0.00s 引导',
  ending: '尾帧锚定',
  keyframe: '定时关键帧锚定',
}
const videoRoleLabels: Record<string, string> = { motion: '运动', structure: '结构', continuation: '续接', editing: '剪辑' }
const audioRelationLabels: Record<string, string> = { reference: '仅参考', fully_copy: '完整复制', partially_copy: '部分复制', weak_reference: '弱参考' }
const audioLayerLabels: Record<string, string> = { voice: '人声', ambience: '环境声', music: '音乐', soundtrack: '音轨' }
const mediaKindLabels: Record<string, string> = { image: '图像', video: '视频', audio: '音频' }
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

// 内置环境声描述会由 h3SceneCompiler 原样编入提示词（clean(audio.description)），
// 属提示词层文本，保持英文；属性名用中性名，避免扫描器把它算成界面文案。
const embeddedAudioDescription = 'The video’s ambient sound texture; do not inherit speech or music.'

export function SceneSelectionInspector({ state, selection, onChange }: { state: ScenePromptState; selection: SceneInspectorSelection; onChange(state: ScenePromptState): void }) {
  const [advancedReferenceOpen, setAdvancedReferenceOpen] = useState(false)
  const reference = selection.kind === 'reference' ? state.references.find(item => item.id === selection.id) : undefined
  const shotIndex = selection.kind === 'shot' ? state.shots.findIndex(item => item.id === selection.id) : -1
  const shot = shotIndex >= 0 ? state.shots[shotIndex] : undefined
  const camera = shotIndex === 0 ? state.camera : shot?.camera ?? {}
  const updateReference = (update: Partial<SceneReference>) => reference && onChange({ ...state, references: state.references.map(item => item.id === reference.id ? { ...item, ...update } : item) })
  const updateCamera = (key: keyof Camera, text: string) => {
    if (!shot) return
    if (shotIndex === 0) onChange({ ...state, camera: { ...state.camera, [key]: value(text) } })
    else onChange({ ...state, shots: state.shots.map((item, index) => index === shotIndex ? { ...item, camera: { ...item.camera, [key]: value(text) } } : item) })
  }

  if (reference) return <><section className="scene-context-card selection-inspector">
    <header><div><small>已选参考图</small><strong>{reference.name}</strong></div><span>{mediaKindLabels[reference.file.kind] ?? reference.file.kind}</span></header>
    <div className="selection-reference-summary">{reference.file.preview ? <img src={reference.file.preview} alt="" /> : <ImageIcon size={28} />}<div><b>{reference.file.referenceRole ? ({ subject: '主体', wardrobe: '服装', prop: '道具', location: '地点', composition: '构图', 'lighting-style': '光线风格' } as Record<string, string>)[reference.file.referenceRole] ?? reference.file.referenceRole : '未指派参考图'}</b><small>{reference.ownerId ? state.characters.find(item => item.id === reference.ownerId)?.name || '已指派角色' : '场景级'}</small></div></div>
    <label>归属者<select value={reference.ownerId || ''} onChange={event => updateReference({ ownerId: event.target.value || undefined })}><option value="">场景 / 环境</option>{state.characters.map(character => <option key={character.id} value={character.id}>{character.name}</option>)}</select></label>
    {reference.file.kind === 'image' && <label>帧约束<select value={reference.anchor || ''} onChange={event => { const anchor = event.target.value as SceneReference['anchor'] || undefined; if (anchor === 'opening') { onChange(setFrameZeroGuide(state, reference.id)); return } const base = reference.anchor === 'opening' ? setFrameZeroGuide(state) : state; onChange({ ...base, references: base.references.map(item => item.id === reference.id ? { ...item, anchor, reviewed: false } : item) }) }}><option value="">仅参考 · 不锁定帧</option><option value="opening">{anchorLabels.opening}</option><option value="ending">{anchorLabels.ending}</option><option value="keyframe">{anchorLabels.keyframe}</option></select></label>}
    {reference.file.kind === 'video' && <label>视频角色<select value={reference.videoRole} onChange={event => updateReference({ videoRole: event.target.value as SceneReference['videoRole'] })}>{(['motion', 'structure', 'continuation', 'editing'] as const).map(role => <option key={role} value={role}>{videoRoleLabels[role]}</option>)}</select></label>}
    <div className="selection-toggle-heading"><strong>从来源保留</strong><button type="button" onClick={() => updateReference({ preserve: reference.preserve.length ? [] : defaultPreservedAttributes(reference) })}>{reference.preserve.length ? '清空' : '使用推荐'}</button></div>
    <div className="selection-attribute-grid">{preserveAttributes.map(attribute => <label key={attribute}><input type="checkbox" checked={reference.preserve.includes(attribute)} onChange={event => updateReference({ preserve: event.target.checked ? [...new Set([...reference.preserve, attribute])] : reference.preserve.filter(item => item !== attribute) })} />{attributeLabels[attribute] ?? attribute}</label>)}</div>
    <button type="button" className="canonical-reference-open" onClick={() => setAdvancedReferenceOpen(true)}><SlidersHorizontal size={14} /><span><strong>高级参考详情</strong><small>观察到的属性、机位锁定、核对与音频映射</small></span></button>
  </section>{advancedReferenceOpen && <div className="modal-backdrop canonical-reference-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setAdvancedReferenceOpen(false) }}><section className="canonical-reference-modal" role="dialog" aria-modal="true" aria-labelledby="canonical-reference-title"><header><div><span><SlidersHorizontal size={17} /></span><div><small>参考控制</small><strong id="canonical-reference-title">{reference.name}</strong><p>确定性 H3 场景编译器使用的高级元数据。</p></div></div><button type="button" className="icon-button" onClick={() => setAdvancedReferenceOpen(false)} aria-label="关闭高级参考详情"><X size={17} /></button></header><div className="canonical-reference-body">
    {reference.file.kind !== 'audio' && <section><div className="canonical-control-heading"><span>01</span><div><strong>观察到的来源细节</strong><small>只描述已选择保留的属性。</small></div></div><div className="canonical-control-grid">{reference.preserve.length ? reference.preserve.map(attribute => <label key={attribute}>{attributeLabels[attribute] ?? attribute}<input value={reference.observed[attribute] || ''} placeholder={`描述该来源的${attributeLabels[attribute] ?? attribute}`} onChange={event => updateReference({ observed: { ...reference.observed, [attribute]: event.target.value } })} /></label>) : <p>尚未选择任何保留属性。请先在检查器中选择。</p>}</div></section>}
    {reference.file.kind !== 'audio' && <section><div className="canonical-control-heading"><span>02</span><div><strong>构图锁定</strong><small>锁定是显式的。普通参考图不会继承取景或姿势。</small></div></div><div className="canonical-lock-grid">{cameraAttributes.map(attribute => <label key={attribute}><input type="checkbox" checked={reference.locks.includes(attribute)} onChange={event => updateReference({ locks: event.target.checked ? [...reference.locks, attribute] : reference.locks.filter(item => item !== attribute) })} />锁定{attributeLabels[attribute] ?? attribute}</label>)}</div>{reference.file.kind === 'image' && reference.anchor && <div className="canonical-control-grid frame-review-grid">{(['shotSize', 'angle'] as const).map(attribute => <label key={attribute}>帧{attributeLabels[attribute] ?? attribute}<select value={reference.observed[attribute] || ''} onChange={event => updateReference({ observed: { ...reference.observed, [attribute]: event.target.value }, reviewed: false })}><option value="">未知 — 目视核对</option>{cameraOptions[attribute].map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>)}<label className="canonical-review-check"><input type="checkbox" checked={!!reference.reviewed} onChange={event => updateReference({ reviewed: event.target.checked })} />我已核对该帧</label></div>}</section>}
    {reference.file.kind === 'video' && <section><div className="canonical-control-heading"><span>03</span><div><strong>视频音频</strong><small>选择是否提供环境声音质地，且不继承语音或音乐。</small></div></div><label className="canonical-review-check"><input type="checkbox" checked={!!reference.embeddedAudio} onChange={event => updateReference({ embeddedAudio: event.target.checked ? { relation: 'reference', layer: 'ambience', description: embeddedAudioDescription } : undefined })} />把内置环境声用作参考</label></section>}
    {reference.audio && <section><div className="canonical-control-heading"><span>03</span><div><strong>音频映射</strong><small>精确界定该音频为生成的镜头贡献什么。</small></div></div><div className="canonical-control-grid"><label>音频关系<select value={reference.audio.relation} onChange={event => updateReference({ audio: { ...reference.audio!, relation: event.target.value as NonNullable<SceneReference['audio']>['relation'] } })}>{(['reference', 'fully_copy', 'partially_copy', 'weak_reference'] as const).map(role => <option key={role} value={role}>{audioRelationLabels[role]}</option>)}</select></label><label>可听层<select value={reference.audio.layer} onChange={event => updateReference({ audio: { ...reference.audio!, layer: event.target.value as NonNullable<SceneReference['audio']>['layer'] } })}>{(['voice', 'ambience', 'music', 'soundtrack'] as const).map(role => <option key={role} value={role}>{audioLayerLabels[role]}</option>)}</select></label><label>说话人<select value={reference.audio.speakerId || ''} onChange={event => updateReference({ audio: { ...reference.audio!, speakerId: event.target.value } })}><option value="">为人声参考选择</option>{state.characters.map(character => <option key={character.id} value={character.id}>{character.name}</option>)}</select></label><label>声音特征<input value={reference.audio.description} onChange={event => updateReference({ audio: { ...reference.audio!, description: event.target.value } })} /></label></div></section>}
  </div><footer><span>修改会立即应用到所选参考图。</span><button type="button" className="primary-button" onClick={() => setAdvancedReferenceOpen(false)}><Check size={14} />完成</button></footer></section></div>}</>

  if (shot) return <section className="scene-context-card selection-inspector">
    <header><div><small>已选镜头</small><strong>镜头 {shotIndex + 1}</strong></div><span>{shot.start.toFixed(2)}–{shot.end.toFixed(2)} 秒</span></header>
    <label>镜头动作<textarea rows={3} value={shot.description} placeholder="描述这个镜头中的动作" onChange={event => onChange({ ...state, shots: state.shots.map((item, index) => index === shotIndex ? { ...item, description: event.target.value } : item) })} /></label>
    <div className="selection-camera-grid">{Object.entries(cameraOptions).map(([key, options]) => <label key={key}>{({ shotSize: '景别', angle: '机位角度', movement: '运镜', speed: '速度', stabilization: '稳定', amplitude: '幅度' } as Record<string, string>)[key]}<select value={camera[key as keyof Camera]?.value || ''} onChange={event => updateCamera(key as keyof Camera, event.target.value)}><option value="">取自场景</option>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>)}</div>
  </section>

  return <section className="scene-context-card selection-inspector">
    <header><div><small>场景上下文</small><strong>Ref2VA 方向</strong></div><span>{state.duration} 秒</span></header>
    <label>环境<input value={state.environment.value} placeholder="地点与物理环境" onChange={event => onChange({ ...state, environment: value(event.target.value) })} /></label>
    <label>灯光<input value={state.lighting.value} placeholder="光源、时间、氛围" onChange={event => onChange({ ...state, lighting: value(event.target.value) })} /></label>
    <small>在此选择一张参考卡片或一个镜头，即可编辑其生产控制项。</small>
  </section>
}

export function SceneContextPanels({ state, onChange }: { state: ScenePromptState; onChange(state: ScenePromptState): void }) {
  const output = compileScene(state)
  const preserved = state.references.filter(ref => ref.preserve.length)
  const environment = preserved.find(ref => ref.preserve.includes('environment'))
  const wardrobe = preserved.find(ref => ref.preserve.includes('wardrobe'))
  const lighting = preserved.find(ref => ref.preserve.includes('lighting'))
  const opening = state.references.find(ref => ref.anchor === 'opening')
  const sourceLabel = (id?: string) => output.references.find(ref => ref.id === id)?.label.replace(/[<>]/g, '') || '场景'
  const setContinuity = (key: 'scene' | 'camera' | 'exactFrame', checked: boolean) => onChange({ ...state, continuity: { ...state.continuity, [key]: checked } })

  return <div className="scene-context-panels">
    <section className="scene-context-card continuity-inspector"><header><strong>连贯性与锁定</strong><span>{opening ? '开场已锚定' : state.continuity.scene ? '场景已关联' : '新场景'}</span></header>
      <div className="continuity-switches">
        <label><span><strong>场景连贯性</strong><small>保持世界、演员、服装与灯光。</small></span><input aria-label="使用场景连贯性" type="checkbox" role="switch" checked={state.continuity.scene} onChange={event => setContinuity('scene', event.target.checked)} /></label>
        <label><span><strong>机位连贯性</strong><small>保持轴线与屏幕方向。</small></span><input aria-label="使用机位连贯性" type="checkbox" role="switch" checked={state.continuity.camera} onChange={event => setContinuity('camera', event.target.checked)} /></label>
        <label><span><strong>要求帧 0 锚定</strong><small>在 frame_idx 0 使用原生 Add Guide；普通参考图不满足此要求。</small></span><input aria-label="要求原生帧 0 续接锚定" type="checkbox" role="switch" checked={state.continuity.exactFrame} onChange={event => setContinuity('exactFrame', event.target.checked)} /></label>
      </div>
      <input aria-label="连贯性备注" value={state.continuity.notes.value} onChange={event => onChange({ ...state, continuity: { ...state.continuity, notes: value(event.target.value) } })} placeholder="可选的连贯性备注" />
      <div className="scene-context-content"><div className="scene-context-thumbnail">{environment?.file.preview ? <img src={environment.file.preview} alt="保留的环境" /> : <ImageIcon size={25} />}</div><dl><dt>地点</dt><dd>{state.environment.value || environment?.observed.environment || (environment ? sourceLabel(environment.id) : '取自场景')}</dd><dt>角色</dt><dd>{state.characters.map(character => character.name).join('、') || '取自场景'}</dd><dt>服装</dt><dd>{wardrobe ? `来自 ${sourceLabel(wardrobe.id)}` : '取自场景'}</dd><dt>灯光</dt><dd>{state.lighting.value || lighting?.observed.lighting || (lighting ? sourceLabel(lighting.id) : '取自场景')}</dd><dt>摄影机</dt><dd>{state.continuity.camera ? '轴线已锁定' : '允许新构图'}</dd></dl></div>
      <small>{opening ? `${sourceLabel(opening.id)} 通过 MiniMaxH3AddGuide 在 frame_idx 0 做 VAE 锚定。参考图仍作为可复用引导。` : state.continuity.exactFrame ? '请在「帧 0 引导」设置中选择一张图片。仅参考的图片无法满足原生帧 0 续接。' : '仅参考的来源引导所选属性，同时由 H3 生成新的开场构图。'}</small>
    </section>

    <section className="scene-context-card"><header><strong>参考图分析</strong><span>{state.references.length} 个来源</span></header>{state.references.length ? <div className="scene-reference-analysis">{state.references.map(ref => <div key={ref.id}><b>{sourceLabel(ref.id)}</b><span>{ref.anchor ? (anchorLabels[ref.anchor] ?? `${ref.anchor} 帧`) : ref.preserve.map(item => attributeLabels[item] ?? item).join(' · ') || (ref.audio ? audioLayerLabels[ref.audio.layer] ?? ref.audio.layer : '') || (ref.videoRole ? videoRoleLabels[ref.videoRole] : '') || '指派一个角色'}</span>{output.conflicts.some(conflict => conflict.referenceId === ref.id && conflict.severity === 'error') ? <em>待核对</em> : <Check size={13} />}</div>)}</div> : <p>添加参考图后，这里会显示它们被指派的角色。</p>}<details><summary>保留的细节 <ChevronDown size={12} /></summary>{output.subjects.map(subject => <p key={subject.label}><b>{subject.name}</b><br />{subject.attributes.join(' · ')}<br /><small>已排除：{subject.excluded.join('、')}</small></p>)}</details></section>

    <section className="scene-context-card"><header><strong>H3 校验</strong><span className={output.conflicts.some(conflict => conflict.severity === 'error') ? 'needs-review' : 'ready'}>{output.conflicts.some(conflict => conflict.severity === 'error') ? '需要核对' : '场景有效'}</span></header><div className="scene-context-stats">{[['模式', output.mode], ['主体', output.subjects.length], ['镜头', state.shots.length], ['时长', `${state.duration} 秒`]].map(([label, text]) => <div key={label}><small>{label}</small><strong>{text}</strong></div>)}</div>{output.conflicts.length > 0 && <button type="button" className="scene-review-link" onClick={() => document.querySelector('.scene-issues')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>查看 {output.conflicts.length} 项与修复 →</button>}<details className="h3-state-debug"><summary>H3 映射 <ChevronDown size={12} /></summary><pre>{JSON.stringify({ mode: output.mode, subjects: output.subjects, references: output.references, timing: output.timing, speakerIDs: output.speakers, conflicts: output.conflicts }, null, 2)}</pre></details></section>
  </div>
}
