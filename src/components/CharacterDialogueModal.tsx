import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Check, LoaderCircle, MessageSquareText, Sparkles, X } from 'lucide-react'
import type { CharacterProject } from '../types'

export type CharacterDialogueDraft = {
  character: CharacterProject
  intent: string
  requiredWords: string
  delivery: string
  length: string
  language: string
}

type CharacterDialogueModalProps = {
  characters: CharacterProject[]
  duration: number
  generating: boolean
  ollamaAvailable: boolean
  providerLabel: string
  onClose(): void
  onGenerate(draft: CharacterDialogueDraft): Promise<string>
  onInsert(text: string): void
}

// value stays the English prompt-layer enum (flows into the dialogue request and the
// inserted delivery direction); label is the Chinese display layer.
const deliveryOptions = [
  { value: 'Natural and conversational', label: '自然、口语化' },
  { value: 'Warm and reassuring', label: '温暖、令人安心' },
  { value: 'Quiet and intimate', label: '轻声、亲密' },
  { value: 'Confident and direct', label: '自信、直接' },
  { value: 'Tense and restrained', label: '紧绷、克制' },
  { value: 'Urgent and breathless', label: '急促、气喘' },
  { value: 'Dry and understated', label: '平淡、低调' },
  { value: 'Playful and energetic', label: '俏皮、有活力' },
]

export function CharacterDialogueModal({ characters, duration, generating, ollamaAvailable, providerLabel, onClose, onGenerate, onInsert }: CharacterDialogueModalProps) {
  const titleId = useId()
  const descriptionId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)
  const [characterId, setCharacterId] = useState(characters[0]?.id ?? '')
  const [intent, setIntent] = useState('')
  const [requiredWords, setRequiredWords] = useState('')
  const [delivery, setDelivery] = useState(deliveryOptions[0].value)
  const [length, setLength] = useState('One concise sentence')
  const [language, setLanguage] = useState('English')
  const [line, setLine] = useState('')
  const [error, setError] = useState('')
  const character = characters.find((item) => item.id === characterId)
  // Chinese display layers for the English length / language enum values.
  const lengthOptions: Array<{ value: string; label: string }> = [
    { value: 'Very short phrase', label: '非常短的短语' },
    { value: 'One concise sentence', label: '一句简洁的话' },
    { value: 'Two short sentences', label: '两个短句' },
  ]

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !generating) onClose() }
    window.addEventListener('keydown', closeOnEscape)
    window.requestAnimationFrame(() => closeRef.current?.focus())
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [generating, onClose])

  const keepFocus = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Tab') return
    const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')]
    const first = controls[0]
    const last = controls.at(-1)
    if (!first || !last) return
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }

  const generate = async () => {
    if (!character || !intent.trim()) return
    setError('')
    try {
      setLine((await onGenerate({ character, intent: intent.trim(), requiredWords: requiredWords.trim(), delivery, length, language: language.trim() || 'English' })).trim().replace(/^['“"]|['”"]$/g, ''))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  const insert = () => {
    if (!character || !line.trim()) return
    const voice = character.voiceNotes.trim()
    const direction = `Dialogue: ${character.name} says, “${line.trim().replace(/^['“"]|['”"]$/g, '')}” Delivery: ${delivery.toLowerCase()}${voice ? `; preserve ${character.name}'s established voice (${voice})` : ''}. Spoken in ${language.trim() || 'English'}, with natural lip-sync and clean production audio.`
    onInsert(direction)
  }

  return <div className="modal-backdrop character-dialogue-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !generating) onClose() }}>
    <section className="character-dialogue-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} onKeyDown={keepFocus}>
      <header>
        <div><span><MessageSquareText size={18} /></span><div><small>参考模式</small><strong id={titleId}>角色对白</strong><p id={descriptionId}>打磨一句简短可演的台词，并插入到提示词光标处。</p></div></div>
        <button ref={closeRef} type="button" aria-label="关闭角色对白" disabled={generating} onClick={onClose}><X size={18} /></button>
      </header>
      <div className="character-dialogue-body">
        {characters.length ? <>
          <section className="dialogue-speaker-section">
            <div className="dialogue-section-heading"><span>01</span><div><strong>说话人</strong><small>使用本次渲染已选定的角色身份与声音备注。</small></div></div>
            <div className="dialogue-character-row">
              <div className="dialogue-character-preview">{character?.baseImage?.preview || character?.referenceImages[0]?.preview ? <img src={character.baseImage?.preview ?? character.referenceImages[0]?.preview} alt="" /> : <MessageSquareText size={21} />}</div>
              <label><span>角色</span><select value={characterId} onChange={(event) => setCharacterId(event.target.value)}>{characters.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
              <div className="dialogue-voice-note"><strong>声音档案</strong><span>{character?.voiceNotes || '尚无已保存的声音备注——将按自然表演处理。'}</span></div>
            </div>
          </section>
          <section>
            <div className="dialogue-section-heading"><span>02</span><div><strong>台词方向</strong><small>描述想表达的意思与潜台词。只有必须原样保留的词才逐字写出。</small></div></div>
            <label className="dialogue-wide-field"><span>{character?.name ?? '角色'}想传达什么？</span><textarea autoFocus value={intent} onChange={(event) => setIntent(event.target.value)} placeholder="例如：安抚团队计划仍在正轨，同时藏起一些疑虑。" /></label>
            <div className="dialogue-form-grid">
              <label><span>语气</span><select value={delivery} onChange={(event) => setDelivery(event.target.value)}>{deliveryOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
              <label><span>长度</span><select value={length} onChange={(event) => setLength(event.target.value)}>{lengthOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
              <label><span>语言</span><input value={language} onChange={(event) => setLanguage(event.target.value)} placeholder="English" /></label>
              <label><span>必须包含的词 <em>可选</em></span><input value={requiredWords} onChange={(event) => setRequiredWords(event.target.value)} placeholder="需要原样保留的短语" /></label>
            </div>
            <div className="dialogue-generate-row"><small>{ollamaAvailable ? `本镜头时长 ${duration} 秒。请为动作与反应留出时间。` : `${providerLabel} 处于离线状态。你仍可以在下方手写台词。`}</small><button className="secondary-button" type="button" title={ollamaAvailable ? '用已配置的本地模型生成一句台词' : `在设置中配置 ${providerLabel}`} disabled={!character || !intent.trim() || generating || !ollamaAvailable} onClick={() => void generate()}>{generating ? <LoaderCircle className="spin" size={14} /> : <Sparkles size={14} />}{generating ? '正在撰写…' : `用 ${providerLabel} 生成`}</button></div>
          </section>
          <section>
            <div className="dialogue-section-heading"><span>03</span><div><strong>检查台词</strong><small>把台词加入生产提示词之前，先核对准确的口播内容。</small></div></div>
            <label className="dialogue-wide-field"><span>口播台词</span><textarea className="dialogue-line-editor" value={line} onChange={(event) => setLine(event.target.value)} placeholder="先生成一句台词，或在此亲自写下准确的对白。" /></label>
            {error && <p className="dialogue-error" role="alert">{error}</p>}
          </section>
        </> : <div className="dialogue-empty"><MessageSquareText size={28} /><strong>请先选择一个角色</strong><p>打开「来源」媒体面板，从角色库中至少选择一个角色，再回到这里以该角色的口吻写对白。</p></div>}
      </div>
      <footer><span>{line.trim() ? `准备插入 ${line.trim().split(/\s+/).length} 个口播词。` : '在你插入之前，当前提示词保持不变。'}</span><div><button className="secondary-button" type="button" disabled={generating} onClick={onClose}>取消</button><button className="primary-button" type="button" disabled={!character || !line.trim() || generating} onClick={insert}><Check size={14} />插入到提示词</button></div></footer>
    </section>
  </div>
}
