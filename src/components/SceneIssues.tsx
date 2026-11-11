import { AlertCircle, ArrowRight, CheckCircle2 } from 'lucide-react'
import type { Conflict, ScenePromptState } from '../lib/scenePromptState'

const help: Record<string, [string, string]> = {
  'empty-scene': ['场景指令', '在「场景指令」中描述动作。灰色示例只是占位符，不属于你的场景。'],
  'duration': ['镜头规划', '把「片段时长」设置为 1 到 15 秒之间的数字。'],
  'missing-shots': ['镜头规划', '先添加一个镜头，然后设置它在片段内的起止时间。'],
  'shot-timing': ['镜头规划', '检查每个镜头的「结束（秒）」。镜头之间必须无缝衔接，不能有空隙或重叠。「镜头适配片段」会把各镜头的长度平均重新分配。'],
  'shot-end': ['镜头规划', '把最后一个镜头的「结束（秒）」设为片段时长，或使用「镜头适配片段」。'],
  'camera-conflict': ['镜头规划', '让机位控件与你的场景描述一致。修改控件，或编辑冲突的措辞。'],
  'wardrobe-conflict': ['角色', '让角色的服装字段与「场景」中提到的服装一致。两个明确的选项都不会被悄悄替换。'],
  'wardrobe-nudity-conflict': ['场景', '「保留服装」与明确的裸露或脱衣描述不能同时成立。想保留这身服装时，请从「场景」中删除裸露措辞；如果有意为之，请关闭服装来源上的「保留」。'],
  'attribute-sources': ['参考图', '展开「保留属性与归属」。对同一归属者，只在一个参考图上选中该属性；身份特征可以在多个视图上同时选中。'],
  'owner-required': ['参考图', '展开此卡片的「保留属性与归属」，并选择它的角色归属者。如有需要，请先在「角色」中添加该角色。'],
  'missing-owner': ['参考图', '在此参考卡片上选择一个现有的角色归属者。'],
  'role-required': ['参考图', '选择「仅参考」并勾选这张图贡献的内容；如果它必须约束 0.00 秒的开场，就把它指定为唯一的「帧 0 锚定」。'],
  'multiple-anchors': ['帧 0 引导', '只选择一个「帧 0 锚定」。其他图片可以保持仅参考；此外最多还可以有一个独立的尾帧。'],
  'missing-opening': ['参考图', '在「来源」中选择一张图片作为首帧。它将是 0.00 秒处的确切画面状态。'],
  'missing-ending': ['参考图', '在「来源」中选择一张图片作为尾帧。在「首尾帧端点」模式下，开场图片是可选的。'],
  'visual-required': ['参考图', '用「添加参考图」至少附加一张图片或一段视频。'],
  'reference-limit': ['参考图', '打开「角色素材库与媒体」并移除多余的参考：最多 9 张图片、3 段视频与 3 路音频输入（含已启用的视频音轨）。'],
  'duplicate-reference': ['参考图', '打开「角色素材库与媒体」并移除重复的来源。'],
  'anchor-kind': ['参考图', '只有静帧图片可以作为首帧或尾帧。请先从源视频中提取一帧。'],
  'anchor-review': ['参考图', '展开此卡片，设置观察到的「帧景别」与「帧机位角度」，再把图片与你的指令对照检查。只有实际目视核对之后，才勾选「我已核对该帧」。'],
  'anchor-conflict': ['帧 0 引导', '要保留原生「帧 0 锚定」，请修改请求的镜头景别。想重新生成开场画面时，可以关闭该引导，并把这张图保留为仅参考。'],
  'anchor-attribute': ['帧 0 引导', '保留「帧 0 锚定」并修改冲突的角色或环境指令，或关闭锚定并改用仅参考引导。'],
  'reference-lock': ['参考图', '展开此卡片并取消勾选冲突的「锁定」控件，或修改场景以匹配该锁定值。'],
  'continuation-anchor': ['帧 0 引导', '续接必须使用帧 0，但还没有图片被指派到原生 frame_idx 0。请在「帧 0 引导」设置中选择提取出的尾帧。如果你只是想让新构图沿用同样的演员阵容、服装或地点，请改用仅参考的场景连贯性。'],
  'speech-disabled': ['对白', '启用对白，或从「场景指令」与「对白」中删除所有台词。'],
  'dialogue-time': ['对白', '展开该台词的「时机与语气」。选择一个镜头，并在该镜头内选择开始时间。'],
  'dialogue-fields': ['对白', '为每句台词选择说话人、填写语言（例如 English），并输入台词内容。'],
  'dialogue-markup': ['对白', '从对白字段中移除 H3 标签与尖括号。只需输入台词与语言；语法由编译器添加。'],
  'speaker-missing': ['对白', '在「角色」中仍列出的角色里，为这句台词选择说话人。'],
  'audio-speaker': ['参考图', '展开这条语音参考并选择它的「说话人」。在「对白」中为该角色添加一句台词；如果此来源不是人声，请选择「环境声」。'],
  'speech-fit': ['对白', '缩短台词或加长其镜头时长。需要延续台词时使用「跨切续接」，需要有意的打断时使用「在片段结尾截断」。'],
  'speech-continuation': ['对白', '在相邻镜头中为同一说话人添加下一部分或上一部分，并保持「跨切续接」选项一致。否则请选择「完整台词」。'],
  'full-audio-conflict': ['声音与音乐', '完整复制的原声与额外的对白或音频相冲突。删除多余的音频指令，或把来源的「音频关系」改为「仅参考」或「部分复制」。'],
  'legacy-format': ['场景', '电影化的镜头语言请写在「场景」中。要直接编辑现有的 H3 提示词，请选择「手动覆盖」并粘贴到那里。'],
  'empty-manual': ['手动覆盖', '请在「手动覆盖」中输入你的 H3 提示词，或返回场景编辑器使用自动编译。'],
  'manual-reference': ['手动覆盖', '以手动提示词中的标签为准，核对「H3 调试」中的参考映射。附加缺失的媒体，或更新标签。'],
  'manual-timing': ['手动覆盖', '把这次剪切移动到所选片段结束之前，或加长「片段时长」。'],
  'command-target': ['场景', '在命令中写明图片名称，例如：//preserve Picture 3 wardrobe, environment, lighting'],
}

export function SceneIssues({ conflicts, state, onChange, onReferences }: { conflicts: Conflict[]; state: ScenePromptState; onChange(state: ScenePromptState): void; onReferences(): void }) {
  const errors = conflicts.filter(item => item.severity === 'error').length
  const jump = (section: string, referenceId?: string) => {
    if (section === '手动覆盖') { onChange({ ...state, view: 'manual' }); return }
    const root = document.querySelector('.scene-composer')
    const card = referenceId ? Array.from(root?.querySelectorAll<HTMLElement>('[data-reference-id]') || []).find(el => el.dataset.referenceId === referenceId) : undefined
    const target = card || Array.from(root?.querySelectorAll<HTMLElement>('.scene-section, .scene-authoring') || []).find(el => el.textContent?.includes(section))
    if (card) card.querySelector('details')?.setAttribute('open', '')
    if (target instanceof HTMLDetailsElement) target.open = true
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    target?.querySelector<HTMLElement>('input, textarea, select, button')?.focus({ preventScroll: true })
  }
  return <section className={`scene-issues ${errors ? 'has-errors' : ''}`} aria-label="场景就绪度">
    <header>{errors ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}<div><strong>{errors ? `渲染前需要修改 ${errors} 处` : '场景检查已通过'}</strong><p>{errors ? '下面每一项都说明了问题所在以及修改位置。' : conflicts.length ? '查看下方的建议。它们不会阻塞渲染。' : '你的场景、参考图与时间设置相互一致。'}</p></div></header>
    {conflicts.map((conflict, index) => {
      const [section, guidance] = help[conflict.code] || ['参考图', '请在「参考图」中检查此来源的指派，并在「H3 调试」中核对映射。']
      return <article key={`${conflict.code}-${conflict.referenceId}-${index}`}><div className="scene-issue-title"><span>{conflict.severity === 'error' ? '必须处理' : '建议'}</span><strong>{conflict.message}</strong></div><p>{guidance}</p><div className="scene-issue-actions">
        {conflict.code === 'continuation-anchor' && <button type="button" onClick={() => onChange({ ...state, continuity: { ...state.continuity, exactFrame: false, scene: true } })}>改用场景连贯性</button>}
        {conflict.code === 'speech-disabled' && <button type="button" onClick={() => onChange({ ...state, noDialogue: false })}>启用对白</button>}
        {['shot-timing', 'shot-end', 'missing-shots'].includes(conflict.code) && Number.isFinite(state.duration) && state.duration > 0 && <button type="button" onClick={() => { const shots = state.shots.length ? state.shots : [{ id: 'shot-1', start: 0, end: state.duration, description: '', camera: {}, characterIds: [] }]; onChange({ ...state, shots: shots.map((shot, i) => ({ ...shot, start: state.duration * i / shots.length, end: state.duration * (i + 1) / shots.length })) }) }}>镜头适配片段</button>}
        {['missing-opening', 'missing-ending', 'visual-required', 'reference-limit', 'duplicate-reference'].includes(conflict.code) ? <button type="button" onClick={onReferences}>{state.mode === 'image' || state.mode === 'frames' ? '选择来源帧' : '打开参考图库'} <ArrowRight size={12} /></button> : <button type="button" onClick={() => jump(section, conflict.referenceId)}>查看{section} <ArrowRight size={12} /></button>}
      </div></article>
    })}
  </section>
}
