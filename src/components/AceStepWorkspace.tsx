import { PreviewPanel, ProductionLoading } from './Workspace'
import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Check, CircleStop, Disc3, Gauge, Headphones, LoaderCircle, Music2, Play, RotateCcw, Sparkles, WandSparkles } from 'lucide-react'
import type { AceStepGenerationOptions, AceStepModelSelection, AppSettings, GenerationJob } from '../types'
import { resolveLlmConnection } from '../lib/llmProvider'
import { SmartPromptEditor } from './SmartPromptEditor'

type MusicState = {
  model: 'sft' | 'base'
  tags: string
  lyrics: string
  instrumental: boolean
  duration: number
  bpm: number
  timeSignature: string
  language: string
  keyScale: string
  seed: number
  generateAudioCodes: boolean
}

const defaults: MusicState = {
  model: 'sft', tags: '', lyrics: '', instrumental: false, duration: 60, bpm: 120,
  timeSignature: '4', language: 'en', keyScale: 'C major',
  seed: Math.floor(Math.random() * 1_000_000_000), generateAudioCodes: true,
}

const keys = [['C major', 'C 大调'], ['C minor', 'C 小调'], ['C# major', 'C# 大调'], ['C# minor', 'C# 小调'], ['D major', 'D 大调'], ['D minor', 'D 小调'], ['E♭ major', 'E♭ 大调'], ['E♭ minor', 'E♭ 小调'], ['E major', 'E 大调'], ['E minor', 'E 小调'], ['F major', 'F 大调'], ['F minor', 'F 小调'], ['F# major', 'F# 大调'], ['F# minor', 'F# 小调'], ['G major', 'G 大调'], ['G minor', 'G 小调'], ['A♭ major', 'A♭ 大调'], ['A♭ minor', 'A♭ 小调'], ['A major', 'A 大调'], ['A minor', 'A 小调'], ['B♭ major', 'B♭ 大调'], ['B♭ minor', 'B♭ 小调'], ['B major', 'B 大调'], ['B minor', 'B 小调']] as const
const languages = [['en', '英语'], ['es', '西班牙语'], ['fr', '法语'], ['de', '德语'], ['it', '意大利语'], ['pt', '葡萄牙语'], ['ja', '日语'], ['ko', '韩语'], ['zh', '中文']] as const

function readState(): MusicState {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem('acestep.workspace') ?? '{}') } }
  catch { return defaults }
}

export function AceStepWorkspace({ settings, models, connected, pipelineReady, missingNodes, latestJob, submitting, cancelling, ollamaAvailable, onGenerate, onCancel, onSelectMusic3 }: {
  settings: AppSettings
  models: AceStepModelSelection
  connected: boolean
  pipelineReady: boolean
  missingNodes: readonly string[]
  latestJob?: GenerationJob
  submitting: boolean
  cancelling: boolean
  ollamaAvailable: boolean
  onGenerate(options: AceStepGenerationOptions): void
  onCancel(job: GenerationJob): void
  onSelectMusic3(): void
}) {
  const initial = useMemo(readState, [])
  const [state, setState] = useState(initial)
  const llm = resolveLlmConnection(settings)
  const [refining, setRefining] = useState(false)
  const [suggestion, setSuggestion] = useState('')
  const [assistantError, setAssistantError] = useState('')
  const set = <K extends keyof MusicState>(key: K, value: MusicState[K]) => setState((current) => ({ ...current, [key]: value }))
  const selectedModel = state.model === 'sft' ? models.sft : models.base
  const sharedReady = Boolean(models.vae && models.textEncoderSmall && models.textEncoderLarge)
  const modelReady = Boolean(selectedModel && sharedReady && pipelineReady)

  useEffect(() => { localStorage.setItem('acestep.workspace', JSON.stringify(state)) }, [state])
  useEffect(() => {
    const loadPrompt = (event: Event) => set('tags', (event as CustomEvent<string>).detail)
    window.addEventListener('davai:load-music-prompt', loadPrompt)
    return () => window.removeEventListener('davai:load-music-prompt', loadPrompt)
  }, [])
  useEffect(() => {
    if (state.model === 'sft' && !models.sft && models.base) set('model', 'base')
    if (state.model === 'base' && !models.base && models.sft) set('model', 'sft')
  }, [models.base, models.sft, state.model])

  const refine = async () => {
    if (!state.tags.trim() || !llm.model) return
    setRefining(true); setSuggestion(''); setAssistantError('')
    try {
      const result = await window.minimax.generateWithOllama(llm.url, llm.model, `Rewrite this as a concise production brief for ACE-Step 1.5 music generation. Preserve the intent and specify genre, mood, tempo feel, instruments, vocal character, arrangement, and production texture. Do not write lyrics. Return only the finished music direction.\n\nDRAFT:\n${state.tags.trim()}`, llm.provider)
      setSuggestion(result)
    } catch (cause) { setAssistantError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setRefining(false) }
  }

  const reset = () => { setState({ ...defaults, seed: Math.floor(Math.random() * 1_000_000_000), model: models.sft ? 'sft' : 'base' }); setSuggestion('') }
  const running = latestJob && ['queued', 'running'].includes(latestJob.status)
  const generate = () => onGenerate({ ...state, lyrics: state.instrumental ? '' : state.lyrics, filenamePrefix: `audio/ACE_Step_1.5_${state.model}_${Date.now()}` })

  return <div className="create-page ace-workspace">
    <div className="page-heading">
      <div><p className="eyebrow">创作 · ACE‑STEP 1.5</p><h1>音乐创作</h1><p>用音乐方向、歌词与专注的音频控制塑造完整歌曲与纯音乐。</p></div>
      <div className="heading-state"><span className={modelReady ? 'ok' : 'warn'}>{modelReady ? <Check size={15} /> : <AlertCircle size={15} />}{modelReady ? `${state.model.toUpperCase()} 管线就绪` : missingNodes.length ? '请更新 ComfyUI' : '缺少 ACE-Step 模型'}</span></div>
    </div>
    <div className="workspace-grid ace-workspace-grid ace-generator-grid">
      <section className="composer-panel">
        <div className="provider-note ace-provider-note"><Music2 size={18} /><span><strong>ComfyUI 原生生成</strong><small>选择 XL SFT 或 XL Base。音乐设置与历史独立于视频项目。</small></span><button type="button" onClick={onSelectMusic3}>Music 3</button><button type="button" onClick={reset}><RotateCcw size={14} />重置音乐</button></div>

        <fieldset className="model-picker"><legend>ACE-Step 模型</legend><div className="model-choice-grid">
          <label className={state.model === 'sft' ? 'selected' : ''}><input type="radio" name="ace-model" checked={state.model === 'sft'} disabled={!models.sft} onChange={() => set('model', 'sft')} /><span><strong>XL SFT</strong><small>指令微调 · 官方 CFG 7</small></span><em>{models.sft ? '就绪' : '缺失'}</em></label>
          <label className={state.model === 'base' ? 'selected' : ''}><input type="radio" name="ace-model" checked={state.model === 'base'} disabled={!models.base} onChange={() => set('model', 'base')} /><span><strong>XL Base</strong><small>基础模型 · 官方 CFG 6</small></span><em>{models.base ? '就绪' : '缺失'}</em></label>
        </div></fieldset>

        <div className="field-group prompt-field ace-direction-field"><div className="field-label"><label htmlFor="ace-tags">音乐方向</label><span>{state.tags.length.toLocaleString()} 字符</span></div><SmartPromptEditor id="ace-tags" value={state.tags} onChange={(value) => set('tags', value)} placeholder="流派、情绪、乐器、人声风格、编曲与制作质感…输入 // 可使用制作指令。" />
          <div className="prompt-tools"><div className="prompt-tool-buttons"><button type="button" onClick={() => void refine()} disabled={!ollamaAvailable || refining || !state.tags.trim()}>{refining ? <LoaderCircle size={14} className="spin" /> : <WandSparkles size={14} />}润色音乐方向</button></div><span className={`local-model-chip ${ollamaAvailable ? 'online' : ''}`}><span />{ollamaAvailable ? llm.model : `${llm.label} 离线`}</span></div>
          {suggestion && <div className="assistant-result"><div className="assistant-result-heading"><span><Sparkles size={14} />本地建议</span><small>应用前请先检查</small></div><textarea aria-label="ACE-Step 音乐方向建议" value={suggestion} readOnly /><div className="assistant-actions"><button className="secondary-button" onClick={() => setSuggestion('')}>忽略</button><button className="primary-button" onClick={() => { set('tags', suggestion); setSuggestion('') }}><Check size={14} />使用建议</button></div></div>}
          {assistantError && <p className="field-help error"><AlertCircle size={13} />{assistantError}</p>}
        </div>

        <div className="ace-lyrics-heading"><span><strong>歌词</strong><small>使用 [Verse]、[Chorus]、[Bridge] 等段落标签。</small></span><label className="compact-toggle"><input type="checkbox" checked={state.instrumental} onChange={(event) => set('instrumental', event.target.checked)} /><span>纯音乐</span></label></div>
        <textarea className="ace-lyrics" aria-label="歌词" disabled={state.instrumental} value={state.lyrics} onChange={(event) => set('lyrics', event.target.value)} placeholder={state.instrumental ? '纯音乐模式不使用演唱歌词。' : '[Verse 1]\n在这里写歌词…\n\n[Chorus]\n写副歌钩子…'} />

        <div className="ace-control-grid">
          <div className="field-group"><label htmlFor="ace-duration">时长</label><div className="range-line"><input id="ace-duration" type="range" min="10" max="240" step="5" value={state.duration} onChange={(event) => set('duration', Number(event.target.value))} /><output>{state.duration} 秒</output></div></div>
          <div className="field-group"><label htmlFor="ace-bpm">节奏</label><div className="number-suffix"><input id="ace-bpm" type="number" min="10" max="300" value={state.bpm} onChange={(event) => set('bpm', Math.max(10, Math.min(300, Number(event.target.value))))} /><span>BPM</span></div></div>
          <div className="field-group"><label htmlFor="ace-key">调性</label><select id="ace-key" value={state.keyScale} onChange={(event) => set('keyScale', event.target.value)}>{keys.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
          <div className="field-group"><label htmlFor="ace-time">拍号</label><select id="ace-time" value={state.timeSignature} onChange={(event) => set('timeSignature', event.target.value)}><option value="4">4/4</option><option value="3">3/4</option><option value="6">6/8</option></select></div>
          <div className="field-group"><label htmlFor="ace-language">歌词语言</label><select id="ace-language" value={state.language} disabled={state.instrumental} onChange={(event) => set('language', event.target.value)}>{languages.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
          <div className="field-group"><label htmlFor="ace-seed">种子</label><input id="ace-seed" className="number-input" type="number" min="0" max="999999999999" value={state.seed} onChange={(event) => set('seed', Number(event.target.value))} /></div>
        </div>
        <label className="audio-code-option"><input type="checkbox" checked={state.generateAudioCodes} onChange={(event) => set('generateAudioCodes', event.target.checked)} /><span><strong>生成音频编码</strong><small>建议开启以获得更好的质量；会在扩散前增加语言模型处理。</small></span></label>
        {!modelReady && <div className="pipeline-warning" role="status"><AlertCircle size={16} /><span><strong>ACE-Step 尚未就绪</strong><small>{missingNodes.length ? `缺少 ComfyUI 节点：${missingNodes.join(', ')}。` : `请将 ${!selectedModel ? `${state.model.toUpperCase()} 检查点、` : ''}${!models.vae ? 'ace_1.5_vae、' : ''}${!models.textEncoderSmall || !models.textEncoderLarge ? '以及两个 Qwen ACE 1.5 编码器' : ''}添加到配置的模型文件夹。`}</small></span></div>}
        <div className="generate-bar"><div className="generation-summary"><Gauge size={17} /><span><strong>{state.duration} 秒 · {state.bpm} BPM</strong><small>{state.model.toUpperCase()} · 50 步 Euler · FLAC</small></span></div><div className="generate-actions">{running && <button className="danger-button" onClick={() => onCancel(latestJob)} disabled={cancelling}><CircleStop size={16} />{cancelling ? '正在停止…' : '取消'}</button>}<button className="primary-button" disabled={submitting || !connected || !modelReady || !state.tags.trim() || (!state.instrumental && !state.lyrics.trim())} onClick={generate}>{submitting ? <LoaderCircle size={18} className="spin" /> : <Play size={18} fill="currentColor" />}{submitting ? '正在提交…' : '生成音乐'}</button></div></div>
      </section>

      <PreviewPanel><div className="panel-heading"><div><span>ACE-STEP 输出</span><strong>当前音乐工作区</strong></div>{latestJob && <span className={`status-badge ${latestJob.status}`}>{latestJob.status}</span>}</div>
        <div className="ace-preview-stage">{latestJob?.outputUrl ? <div className="audio-result"><div className="album-placeholder"><Disc3 size={64} /><span>{state.model.toUpperCase()}</span></div><strong>{state.tags || '生成的音轨'}</strong><audio src={latestJob.outputUrl} controls preload="metadata" /><a className="secondary-button" href={latestJob.outputUrl} target="_blank" rel="noreferrer">打开音频文件</a></div> : running ? <div className="render-state"><ProductionLoading label={latestJob.progressLabel || '正在渲染音频'} progress={latestJob.progress || undefined}/><strong>{latestJob.progressLabel ?? '正在使用 ACE-Step 生成音乐'}</strong><span>{state.duration} 秒 · {state.bpm} BPM · {state.model.toUpperCase()}</span><div className="progress"><i style={{ width: `${latestJob.progress}%` }} /></div><small>{Math.round(latestJob.progress)}% · ComfyUI 实时状态</small></div> : <div className="empty-preview"><div className="preview-icon"><Headphones size={30} /></div><strong>你的音轨会显示在这里</strong><span>描述音乐、填写歌词或选择纯音乐，然后发送到 ComfyUI。</span></div>}</div>
        <div className="pipeline-summary"><Pipeline ready={Boolean(selectedModel)} label={`${state.model.toUpperCase()} 扩散模型`} value={selectedModel} /><Pipeline ready={Boolean(models.textEncoderSmall && models.textEncoderLarge)} label="ACE 文本编码器" value={models.textEncoderSmall && models.textEncoderLarge ? `${models.textEncoderSmall} + ${models.textEncoderLarge}` : ''} /><Pipeline ready={Boolean(models.vae)} label="音频 VAE" value={models.vae} /></div>
      </PreviewPanel>
    </div>
  </div>
}

function Pipeline({ ready, label, value }: { ready: boolean; label: string; value: string }) {
  return <div className="pipeline-item"><span className={ready ? 'ready' : ''}>{ready ? <Check size={13} /> : <AlertCircle size={13} />}</span><div><strong>{label}</strong><small title={value}>{value || '未检测到'}</small></div></div>
}
