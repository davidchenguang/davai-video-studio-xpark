import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Check, ChevronDown, CircleStop, Film, ImagePlus, Images, LoaderCircle, Mic2, Orbit, Plus, Scissors, Shirt, SlidersHorizontal, Sparkles, Star, Trash2, UserRound, WandSparkles, Watch, X } from 'lucide-react'
import { CHARACTER_LIBRARY_EVENT, characterReferences, loadCharacterProjects, newCharacterProject, removeCharacterImage, saveCharacterProjects } from '../lib/characterLibrary'
import { choices, type ObjectInfo } from '../lib/comfyInfo'
import { buildZImage } from '../lib/zimage'
import { resolveAttentionBackend } from '../lib/attentionBackend'
import { loadWardrobeProjects, wardrobeReferences, WARDROBE_LIBRARY_EVENT } from '../lib/wardrobeLibrary'
import { ACCESSORY_LIBRARY_EVENT, loadAccessoryProjects } from '../lib/accessoryLibrary'
import { HAIR_LIBRARY_EVENT, loadHairStyleProjects } from '../lib/hairLibrary'
import { ReferenceApprovalModal } from './ReferenceApprovalModal'
import { CharacterReadiness, type CharacterDetailTab } from './CharacterReadiness'
import { CharacterLibraryPanel } from './CharacterLibraryPanel'
import { CharacterReferenceList } from './CharacterReferenceList'
import { WorkspaceSectionTabs, type WorkspaceSectionTab } from './WorkspaceSectionTabs'
import { ReliableVideo } from './ReliableVideo'
import { characterAppearancePresets, characterPerformancePresets, characterVisualStylePresets, characterVoicePresets, appendPreset } from '../lib/characterPresets'
import { COPILOT_DECISION_EVENT, offerCopilotSuggestion } from '../lib/copilot'
import { createId } from '../lib/createId'
import { resolveLlmConnection } from '../lib/llmProvider'
import { analyzeReferenceImage } from '../lib/referenceAnalysis'
import type { AppSettings, CharacterProject, GenerationJob, MediaFile, ReferenceImageType } from '../types'
import { Badge, Button, Checkbox, Field, Input, ScrollArea, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Separator, Tabs, TabsList, TabsTrigger, Textarea } from './ui'

const referenceTypeOptions: Array<{ value: ReferenceImageType; label: string }> = [
  { value: 'master', label: '主参考' },
  { value: 'face', label: '面部特写' },
  { value: 'full-body', label: '全身' },
  { value: 'three-quarter', label: '四分之三侧' },
  { value: 'profile', label: '侧面' },
  { value: 'back', label: '背面' },
  { value: 'detail', label: '特征细节' },
  { value: 'other', label: '其他角度' },
]

const referenceTypeLabel = (type: ReferenceImageType | undefined) => referenceTypeOptions.find(option => option.value === (type ?? 'other'))?.label ?? (type ?? 'other')

const jobStatusLabels: Record<string, string> = { queued: '排队中', running: '渲染中', completed: '已完成', failed: '已失败', cancelled: '已取消' }

const skinToneLabels: Record<string, string> = {
  'MST 1 · very light': 'MST 1 · 极浅',
  'MST 2 · light': 'MST 2 · 浅',
  'MST 3 · light-medium': 'MST 3 · 浅中',
  'MST 4 · medium-light': 'MST 4 · 中浅',
  'MST 5 · medium': 'MST 5 · 中等',
  'MST 6 · medium-deep': 'MST 6 · 中深',
  'MST 7 · deep': 'MST 7 · 深',
  'MST 8 · deep-rich': 'MST 8 · 深厚',
  'MST 9 · very deep': 'MST 9 · 极深',
  'MST 10 · deepest': 'MST 10 · 最深',
}

const hairPresetLabels: Record<string, string> = {
  manual: '手动描述',
  'short straight hair': '短直发',
  'long straight hair': '长直发',
  'short wavy hair': '短波浪',
  'long wavy hair': '长波浪',
  'short curly hair': '短卷发',
  'long curly hair': '长卷发',
  'coily natural hair': '天然螺旋卷',
  'braided hair': '编发',
  locs: '脏辫',
  'buzz cut': '寸头',
  'shaved head': '光头',
}

const characterVisualStyleLabels: Record<string, string> = {
  'cinematic photorealism': '电影级写实',
  'naturalistic 35mm film': '自然 35mm 胶片',
  'large-format cinematic realism': '大画幅电影写实',
  'prestige television realism': '高端剧集写实',
  'documentary naturalism': '纪录片自然主义',
  'editorial fashion photography': '杂志时尚摄影',
  'commercial beauty photography': '商业美妆摄影',
  'neo-noir cinematic realism': '新黑色电影写实',
  'warm romantic drama': '温暖浪漫剧',
  'gritty independent film': '粗粝独立电影',
  'retro 1970s film realism': '复古 1970 年代胶片写实',
  'high-key studio realism': '高调影棚写实',
  'stylized graphic realism': '风格化图形写实',
  'premium 3D animation': '高端 3D 动画',
  'hand-painted storybook animation': '手绘绘本动画',
  'anime-inspired cinematic illustration': '动漫风电影插画',
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

const accessoryCategoryLabels: Record<string, string> = { jewelry: '珠宝', eyewear: '眼镜', watch: '手表', bag: '箱包', headwear: '头饰', prop: '常驻道具', other: '其他' }

type CharacterWorkspaceSection = 'library' | 'design' | 'generate'
const characterSections: readonly WorkspaceSectionTab<CharacterWorkspaceSection>[] = [
  { id: 'library', label: '角色', description: '浏览已保存的身份' },
  { id: 'design', label: '设计', description: '身份、外观与声音' },
  { id: 'generate', label: '生成', description: '生成并确认参考图' },
]

function cleanSinglePrompt(value: string) {
  return value
    .replace(/\\\s*(?:\r?\n|$)/g, ' ')
    .replace(/[*_#`]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export type CharacterSurveyRenderOptions = {
  turbo: 'off' | '8'
  steps: number
  width: number
  height: number
}

export function CharacterStudio({ settings, info, connected, ollamaAvailable, automationJobs, onCreateTurntable, onNotice, onUseInScene, onOpenLibrary }: {
  settings: AppSettings
  info: ObjectInfo
  connected: boolean
  ollamaAvailable: boolean
  automationJobs?: GenerationJob[]
  onCreateTurntable(project: CharacterProject, options: CharacterSurveyRenderOptions): Promise<string | null>
  onNotice(tone: 'error' | 'success' | 'neutral', text: string): void
  onUseInScene(characterId: string): void
  onOpenLibrary(view: 'hair' | 'wardrobes' | 'accessories'): void
}) {
  const initial = useMemo(() => {
    const stored = loadCharacterProjects()
    return stored.length ? stored : [newCharacterProject()]
  }, [])
  const [projects, setProjects] = useState(initial)
  const [activeId, setActiveId] = useState(initial[0].id)
  const [videoDuration, setVideoDuration] = useState(0)
  const [splitting, setSplitting] = useState(false)
  const [assisting, setAssisting] = useState(false)
  const [masterJob, setMasterJob] = useState<{ id: string; url: string; characterId: string; target: 'master' | 'sheet' } | null>(null)
  const [masterBusy, setMasterBusy] = useState(false)
  const [masterMessage, setMasterMessage] = useState('')
  const [masterError, setMasterError] = useState(false)
  const [identityCandidateCount, setIdentityCandidateCount] = useState<1 | 2 | 4>(4)
  const [identitySteps, setIdentitySteps] = useState(8)
  const [surveyProfile, setSurveyProfile] = useState<'native' | 'turbo8' | 'turbo10' | 'turbo12'>('turbo10')
  const [surveyResolution, setSurveyResolution] = useState<'608x1056' | '768x1344'>('768x1344')
  const [sheetLayout, setSheetLayout] = useState<'coverage' | 'turnaround'>('coverage')
  const [candidate, setCandidate] = useState<{ characterId: string; target: 'master' | 'sheet'; file: MediaFile } | null>(null)
  const [batchJobs, setBatchJobs] = useState<Array<{ id: string; url: string; characterId: string }>>([])
  const [identityCandidates, setIdentityCandidates] = useState<MediaFile[]>([])
  const [selectedCandidatePaths, setSelectedCandidatePaths] = useState<string[]>([])
  const [candidateStep, setCandidateStep] = useState<'choose' | 'survey'>('choose')
  const [approvedFlowProject, setApprovedFlowProject] = useState<CharacterProject | null>(null)
  const [identitySurveyStartedAt, setIdentitySurveyStartedAt] = useState<number | null>(null)
  const [identitySurveySubmitting, setIdentitySurveySubmitting] = useState(false)
  const [identitySurveyError, setIdentitySurveyError] = useState('')
  const [refinementSuggestionId, setRefinementSuggestionId] = useState('')
  const [refinementSuggestion, setRefinementSuggestion] = useState('')
  const [wardrobes, setWardrobes] = useState(loadWardrobeProjects)
  const [accessories, setAccessories] = useState(loadAccessoryProjects)
  const [hairStyles, setHairStyles] = useState(loadHairStyleProjects)
  const [activeTab, setActiveTab] = useState<CharacterDetailTab>('identity')
  const [workspaceSection, setWorkspaceSection] = useState<CharacterWorkspaceSection>('design')
  const [selectedReferencePath, setSelectedReferencePath] = useState('')
  const active = projects.find((project) => project.id === activeId) ?? projects[0]
  const llm = resolveLlmConnection(settings)
  const activeAutomation = automationJobs?.find((job) => job.characterProjectId === active.id)
  const surveyTurbo = surveyProfile === 'native' ? 'off' as const : '8' as const
  const surveySteps = surveyProfile === 'native' ? 30 : surveyProfile === 'turbo8' ? 8 : surveyProfile === 'turbo12' ? 12 : 10
  const [surveyWidth, surveyHeight] = surveyResolution.split('x').map(Number)
  const surveyRenderOptions: CharacterSurveyRenderOptions = { turbo: surveyTurbo, steps: surveySteps, width: surveyWidth, height: surveyHeight }

  useEffect(() => {
    const refresh = () => {
      const next = loadCharacterProjects()
      if (next.length) setProjects(next)
    }
    window.addEventListener(CHARACTER_LIBRARY_EVENT, refresh)
    return () => window.removeEventListener(CHARACTER_LIBRARY_EVENT, refresh)
  }, [])
  useEffect(() => { const refresh = () => setWardrobes(loadWardrobeProjects()); window.addEventListener(WARDROBE_LIBRARY_EVENT, refresh); return () => window.removeEventListener(WARDROBE_LIBRARY_EVENT, refresh) }, [])
  useEffect(() => { const refresh = () => setAccessories(loadAccessoryProjects()); window.addEventListener(ACCESSORY_LIBRARY_EVENT, refresh); return () => window.removeEventListener(ACCESSORY_LIBRARY_EVENT, refresh) }, [])
  useEffect(() => { const refresh = () => setHairStyles(loadHairStyleProjects()); window.addEventListener(HAIR_LIBRARY_EVENT, refresh); return () => window.removeEventListener(HAIR_LIBRARY_EVENT, refresh) }, [])
  useEffect(() => {
    const decide = (event: Event) => {
      const detail = (event as CustomEvent<{ id: string; decision: 'approve' | 'dismiss' }>).detail
      if (!refinementSuggestionId || detail.id !== refinementSuggestionId) return
      if (detail.decision === 'approve') { patchProject(active.id, { referencePrompt: cleanSinglePrompt(refinementSuggestion) }); onNotice('success', '身份打磨结果已应用到主提示词。') }
      setRefinementSuggestionId(''); setRefinementSuggestion('')
    }
    window.addEventListener(COPILOT_DECISION_EVENT, decide)
    return () => window.removeEventListener(COPILOT_DECISION_EVENT, decide)
  }, [active.id, onNotice, refinementSuggestion, refinementSuggestionId])

  const commit = (next: CharacterProject[]) => { setProjects(next); saveCharacterProjects(next) }
  const patchProject = (id: string, change: Partial<CharacterProject>) => setProjects((current) => {
    const next = current.map((project) => project.id === id ? { ...project, ...change, updatedAt: Date.now() } : project)
    saveCharacterProjects(next)
    return next
  })
  const patch = (change: Partial<CharacterProject>) => commit(projects.map((project) => project.id === active.id ? { ...project, ...change, updatedAt: Date.now() } : project))
  const add = () => {
    const project = newCharacterProject(projects.length + 1)
    commit([...projects, project]); setActiveId(project.id)
  }
  const remove = () => {
    if (!window.confirm(`删除角色项目「${active.name}」？原始图片和视频文件会保留在磁盘上。`)) return
    const next = projects.filter((project) => project.id !== active.id)
    const fallback = next.length ? next : [newCharacterProject()]
    commit(fallback); setActiveId(fallback[0].id)
  }
  const chooseImage = async (target: 'base' | 'reference') => {
    const picked = await window.minimax.chooseMedia('image')
    if (!picked) return
    if (target === 'reference' && active.referenceImages.length >= 9 && !active.referenceImages.some(file => file.path === picked.path)) {
      onNotice('error', '该角色已有 9 张已确认图片。请先移除一张再添加。')
      return
    }
    const projectId = active.id
    const file: MediaFile = { ...picked, kind: 'image', referenceType: target === 'base' ? 'master' : 'full-body', preview: await window.minimax.mediaUrl(picked.path) }
    patch(target === 'base' ? { baseImage: file } : {
      referenceImages: active.referenceImages.some(item => item.path === file.path) ? active.referenceImages.map(item => item.path === file.path ? file : item) : [...active.referenceImages, file],
      selectedReferencePaths: active.selectedReferencePaths === undefined ? undefined : [...new Set([...active.selectedReferencePaths, file.path])],
    })
    if (!ollamaAvailable) { onNotice('neutral', `图片已添加。连接本地视觉模型即可自动填充${target === 'base' ? '角色档案' : '缺失的档案字段'}。`); return }
    onNotice('neutral', '图片已添加。本地视觉模型正在填充空白的角色字段…')
    try {
      const result = await analyzeReferenceImage(settings, picked.path, 'character')
      const current = loadCharacterProjects().find((item) => item.id === projectId)
      if (!current) return
      patchProject(projectId, {
        name: !current.name.trim() || /^Character \d+$/i.test(current.name) ? result.name || current.name : current.name,
        description: current.description.trim() ? current.description : result.description,
        hairPreset: current.hairPreset.trim() ? current.hairPreset : result.hairPreset,
        visualStyle: current.visualStyle.trim() && current.visualStyle !== 'cinematic photorealism' ? current.visualStyle : result.visualStyle || current.visualStyle,
      })
      onNotice('success', '图片分析完成；空白的角色字段已填充，供你检查。')
    } catch (reason) { onNotice('error', `图片已添加，但自动描述失败：${reason instanceof Error ? reason.message : String(reason)}`) }
  }
  const addDetailReference = () => patch({ detailReferences: [...active.detailReferences, { id: createId(), label: '', notes: '', images: [] }] })
  const patchDetailReference = (id: string, change: Partial<CharacterProject['detailReferences'][number]>) => patch({ detailReferences: active.detailReferences.map((detail) => detail.id === id ? { ...detail, ...change } : detail) })
  const removeDetailReference = (id: string) => patch({ detailReferences: active.detailReferences.filter((detail) => detail.id !== id) })
  const chooseDetailReferenceImage = async (id: string, imageIndex: number) => {
    const picked = await window.minimax.chooseMedia('image')
    if (!picked) return
    const image = { ...picked, kind: 'image' as const, preview: await window.minimax.mediaUrl(picked.path) }
    const detail = active.detailReferences.find((item) => item.id === id)
    if (!detail) return
    const images = [...detail.images]
    images[imageIndex] = image
    patchDetailReference(id, { images: images.filter(Boolean) })
  }
  const removeDetailReferenceImage = (id: string, imageIndex: number) => {
    const detail = active.detailReferences.find((item) => item.id === id)
    if (detail) patchDetailReference(id, { images: detail.images.filter((_, index) => index !== imageIndex) })
  }
  const chooseTurntable = async () => {
    const picked = await window.minimax.chooseMedia('video')
    if (!picked) return
    patch({ turntableVideo: { ...picked, kind: 'video', preview: await window.minimax.mediaUrl(picked.path) } })
    setVideoDuration(0)
  }
  const enhance = async () => {
    if (!ollamaAvailable || assisting) return
    setAssisting(true)
    try {
      const instruction = `Rewrite the character notes below as one concise, production-ready Z-Image identity reference prompt. Preserve every intentional identity detail, but remove repeated facts. Include the name, complexion when supplied, stable face geometry, age range, assigned hair, build, distinguishing marks, and the visible performance baseline. If reference images are attached, inspect them and express only stable visible traits that agree across the images; never infer sensitive traits or invent hidden details. Do not introduce wardrobe, jewelry, accessories, or recurring props; those are managed by their own studios. End with the requested visual style and these constraints: plain neutral studio background, even soft lighting, eye-level 50mm lens, relaxed symmetrical stance, hands visible, accurate anatomy, plain fitted neutral studio clothing, no text, no props, one adult person only. Return exactly one plain-text paragraph with no Markdown or line breaks.\n\nName: ${active.name}\nAppearance: ${active.description}\nAssigned hair: ${hairDirection || 'No separate hair design assigned.'}\nVoice and performance: ${active.voiceNotes}\nVisual style: ${active.visualStyle}`
      const imagePaths = [active.baseImage?.path, ...active.referenceImages.map((file) => file.path), activeHairStyle?.referenceImage?.path].filter(Boolean) as string[]
      let result: string
      if (imagePaths.length) {
        try { result = await window.minimax.generateWithOllamaVision(llm.url, llm.model, instruction, imagePaths, llm.provider) }
        catch { result = await window.minimax.generateWithOllama(llm.url, llm.model, instruction, llm.provider) }
      } else result = await window.minimax.generateWithOllama(llm.url, llm.model, instruction, llm.provider)
      const id = createId(); const cleaned = cleanSinglePrompt(result)
      setRefinementSuggestionId(id); setRefinementSuggestion(cleaned)
      offerCopilotSuggestion({ id, title: `打磨 ${active.name} 的身份`, text: cleaned, target: 'character-identity', targetId: active.id, sourceLabel: `${llm.model} · ${llm.label} · ${imagePaths.length ? `${Math.min(6, imagePaths.length)} 张视觉参考图` : '角色档案文字'}` })
      onNotice('neutral', '身份打磨结果已生成，可在本地助手建议中确认或忽略。')
    } catch (error) { onNotice('error', error instanceof Error ? error.message : String(error)) }
    finally { setAssisting(false) }
  }
  const activeHairStyle = hairStyles.find((item) => item.id === active.hairStyleIds[0])
  const hairDirection = activeHairStyle ? `Hair design: ${activeHairStyle.name}. ${activeHairStyle.description} Texture: ${activeHairStyle.texture}. Length: ${activeHairStyle.length}. ${activeHairStyle.color ? `Color: ${activeHairStyle.color}.` : ''} Hairline and part: ${activeHairStyle.hairline}. Finish: ${activeHairStyle.finish}.` : active.hairPreset ? `Hair: ${active.hairPreset}.` : ''
  const defaultZPrompt = [
    `Create exactly one full-body identity portrait of one adult character: ${active.name}.`, active.identityTemplate !== 'custom' && `${active.identityTemplate} casting reference treatment.`, active.skinTone && `Skin tone: ${active.skinTone}.`, hairDirection, active.description,
    `${active.visualStyle}. The complete body is visible from head through both feet, centered and front-facing, with the face large enough to identify. Plain fitted neutral studio clothing without jewelry or accessories. Plain neutral studio background, even soft lighting, eye-level 50mm lens, relaxed symmetrical stance, both hands visible, accurate anatomy. One person, one view, one frame; no collage, split panel, contact sheet, duplicate person, cropped feet, text, labels, logos, or props.`,
  ].filter(Boolean).join(' ')
  const editableZPrompt = active.referencePrompt.trim() || defaultZPrompt
  const identityGuardrails = 'Identity render contract: exactly one adult person and one coherent view. Preserve the requested identity traits without adding relatives, alternates, duplicates, inset portraits, collages, split panels, text, labels, props, or additional people. Show accurate anatomy with both hands and both feet visible.'
  const zPrompt = `${editableZPrompt} ${identityGuardrails}`
  const sheetPrompt = [
    `Experimental character reference sheet for one adult character: ${active.name}.`, active.skinTone && `Skin tone: ${active.skinTone}.`, active.description, hairDirection,
    sheetLayout === 'coverage'
      ? 'Create one clean 2-by-2 studio contact sheet with exactly four equal panels in this fixed order: top left is a complete straight-on full-body view with head, hands, and feet visible; top right is a sharp front-facing face close-up from shoulders up; bottom left is a complete left side-profile view with head and feet visible; bottom right is a complete straight rear view with head, hair, hands, and feet visible.'
      : 'Create one clean horizontal turnaround sheet with exactly four evenly spaced complete full-body views in this fixed order: straight front, three-quarter front, exact left side profile, and straight rear. Every view includes the complete head, both hands, and both feet.',
    `${active.visualStyle}. Every panel depicts the exact same person at the same age with identical face geometry, skin tone, hairstyle, body proportions, neutral expression, and fitted neutral studio clothing. Keep scale, lighting, white balance, and lens character consistent. Seamless neutral background with clear gutters. Do not blend anatomy across panels. Exactly four views of one identity; no extra people, duplicate panels, alternate outfits, pose changes, action, props, jewelry, text, labels, logos, borders through the body, cropped limbs, or invented details.`,
  ].filter(Boolean).join(' ')
  const zModel = choices(info, 'UNETLoader', 'unet_name').find((name) => /z[_-]?image.*turbo/i.test(name)) ?? 'z_image_turbo_bf16.safetensors'
  const zEncoder = choices(info, 'CLIPLoader', 'clip_name').find((name) => /qwen[_-]?3[_-]?4b/i.test(name)) ?? 'qwen_3_4b.safetensors'
  const zVae = choices(info, 'VAELoader', 'vae_name').find((name) => /^ae\.safetensors$/i.test(name)) ?? 'ae.safetensors'
  const zReady = connected && choices(info, 'UNETLoader', 'unet_name').includes(zModel) && choices(info, 'CLIPLoader', 'clip_name').includes(zEncoder) && choices(info, 'VAELoader', 'vae_name').includes(zVae)
  const identitySurveyRef2vaModel = choices(info, 'UNETLoader', 'unet_name').find((name) => /minimax_h3_ref2va/i.test(name))
  const identitySurveyTurboLora = choices(info, 'LoraLoaderModelOnly', 'lora_name').find((name) => /minimax_h3_ref2v_turbo_8step/i.test(name))
  const identitySurveyTextEncoder = choices(info, 'CLIPLoader', 'clip_name').find((name) => /qwen3vl_32b_minimax_h3/i.test(name))
  const identitySurveyVideoVae = choices(info, 'VAELoader', 'vae_name').find((name) => /minimax_h3_video_vae/i.test(name))
  const identitySurveyAudioVae = choices(info, 'VAELoader', 'vae_name').find((name) => /minimax_h3_audio_vae/i.test(name))
  const identitySurveyRef2vaReady = connected && Boolean(identitySurveyRef2vaModel && (surveyTurbo === 'off' || identitySurveyTurboLora) && identitySurveyTextEncoder && identitySurveyVideoVae && identitySurveyAudioVae)
  const identitySurveyRef2vaReason = !connected
    ? '请启动 ComfyUI 并测试连接。'
    : !identitySurveyRef2vaModel
      ? '请安装 MiniMax H3 Ref2VA 扩散模型并重新扫描模型。'
      : surveyTurbo !== 'off' && !identitySurveyTurboLora
        ? '请安装 MiniMax H3 Ref2V Turbo 8 步 LoRA 并重新扫描模型。'
      : !identitySurveyTextEncoder
        ? '请安装 MiniMax H3 Qwen3-VL 文本编码器并重新扫描模型。'
        : !identitySurveyVideoVae || !identitySurveyAudioVae ? '请同时安装 MiniMax H3 的视频与音频 VAE，然后重新扫描模型。' : ''
  const createMaster = async (target: 'master' | 'sheet' = 'master') => {
    const renderPrompt = target === 'sheet' ? sheetPrompt : zPrompt
    if (!zReady || masterBusy || !renderPrompt.trim()) return
    setMasterBusy(true); setMasterError(false); setMasterMessage(target === 'sheet' ? '正在向 Z-Image Turbo 提交四视图角色表…' : '正在向 Z-Image Turbo 提交主参考图…')
    try {
      const response = await window.minimax.submitPrompt(settings.comfyUrl, buildZImage(renderPrompt.trim(), target === 'sheet' ? 1024 : 768, target === 'sheet' ? 1024 : 1024, Math.floor(Math.random() * 1_000_000_000), zModel, zEncoder, zVae, identitySteps, 1, 'turbo', '', resolveAttentionBackend(settings.attentionBackend, choices(info, 'ModelAttentionBackend', 'attention'))))
      setMasterJob({ id: response.prompt_id, url: settings.comfyUrl, characterId: active.id, target })
      setMasterMessage(target === 'sheet' ? '正在 ComfyUI 中构建角色表…' : '正在 ComfyUI 中渲染角色主参考图…')
    } catch (error) {
      setMasterMessage(error instanceof Error ? error.message : String(error)); setMasterError(true); setMasterBusy(false)
    }
  }
  const createIdentityBatch = async (requestedCount = identityCandidateCount) => {
    const count = requestedCount === 4 ? identityCandidateCount : requestedCount
    if (!zReady || masterBusy || !zPrompt.trim()) return
    setMasterBusy(true); setMasterError(false); setIdentityCandidates([]); setSelectedCandidatePaths([]); setCandidateStep('choose'); setApprovedFlowProject(null); setIdentitySurveyStartedAt(null); setMasterMessage(`正在排队 ${count} 个互不相同的身份候选…`)
    try {
      const responses = await Promise.allSettled(Array.from({ length: count }, () => window.minimax.submitPrompt(settings.comfyUrl, buildZImage(zPrompt.trim(), 768, 1024, Math.floor(Math.random() * 1_000_000_000), zModel, zEncoder, zVae, identitySteps, 1, 'turbo', '', resolveAttentionBackend(settings.attentionBackend, choices(info, 'ModelAttentionBackend', 'attention'))))))
      const queued = responses.flatMap((response) => response.status === 'fulfilled' ? [{ id: response.value.prompt_id, url: settings.comfyUrl, characterId: active.id }] : [])
      if (!queued.length) throw new Error(responses.find((response) => response.status === 'rejected')?.reason instanceof Error ? responses.find((response) => response.status === 'rejected')!.reason.message : '无法排队任何身份候选。')
      setBatchJobs(queued)
      setMasterMessage(queued.length === count ? `${count} 个候选已排队，完成后会一起出现供确认。` : `${queued.length} / ${count} 个候选已排队。成功的渲染仍会出现供确认。`)
    } catch (error) { setMasterMessage(error instanceof Error ? error.message : String(error)); setMasterError(true); setMasterBusy(false) }
  }
  const cancelBatch = async () => { await Promise.allSettled(batchJobs.map((item) => window.minimax.cancelPrompt(item.url, item.id))); setBatchJobs([]); setMasterBusy(false); setMasterMessage('身份批次已取消。') }
  const cancelMaster = async () => {
    if (!masterJob) return
    try { await window.minimax.cancelPrompt(masterJob.url, masterJob.id); setMasterMessage('主参考图渲染已取消。'); setMasterError(false) }
    catch (error) { setMasterMessage(error instanceof Error ? error.message : String(error)); setMasterError(true) }
    finally { setMasterJob(null); setMasterBusy(false) }
  }

  useEffect(() => {
    if (!masterJob) return
    let disposed = false
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        const history = await window.minimax.getHistory(masterJob.url, masterJob.id)
        const entry = history[masterJob.id] as { status?: { status_str?: string }; outputs?: Record<string, { images?: Array<{ filename: string; subfolder?: string; type?: string }> }> } | undefined
        if (entry?.status?.status_str === 'error') throw new Error('主参考图生成失败。请查看 ComfyUI 日志。')
        const image = Object.values(entry?.outputs ?? {}).flatMap((output) => output.images ?? [])[0]
        if (image) {
          const preview = await window.minimax.getOutputImage(masterJob.url, image)
          const saved = await window.minimax.saveComfyOutputImage(masterJob.url, image, settings.outputDirectory)
          if (!disposed) {
            const file = { ...saved, preview, kind: 'image' as const }
            setCandidate({ characterId: masterJob.characterId, target: masterJob.target, file })
            setMasterMessage('参考图已就绪，等待确认。'); setMasterJob(null); setMasterBusy(false); setMasterError(false)
          }
          return
        }
      } catch (error) {
        if (!disposed) { setMasterMessage(error instanceof Error ? error.message : String(error)); setMasterError(true); setMasterBusy(false); setMasterJob(null) }
        return
      }
      if (!disposed) timer = setTimeout(poll, 2000)
    }
    void poll()
    return () => { disposed = true; clearTimeout(timer) }
  }, [masterJob, onNotice, settings.outputDirectory])
  useEffect(() => {
    if (!batchJobs.length) return
    let disposed = false; let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        const completed: Array<{ batchJob: (typeof batchJobs)[number]; image: { filename: string; subfolder?: string; type?: string } }> = []
        for (const batchJob of batchJobs) {
          const history = await window.minimax.getHistory(batchJob.url, batchJob.id)
          const entry = history[batchJob.id] as { status?: { status_str?: string }; outputs?: Record<string, { images?: Array<{ filename: string; subfolder?: string; type?: string }> }> } | undefined
          if (entry?.status?.status_str === 'error') throw new Error('一个身份候选失败。请查看 ComfyUI 日志。')
          const image = Object.values(entry?.outputs ?? {}).flatMap((output) => output.images ?? [])[0]
          if (image) completed.push({ batchJob, image })
        }
        if (completed.length === batchJobs.length) {
          const ready = await Promise.all(completed.map(async ({ batchJob, image }) => { const preview = await window.minimax.getOutputImage(batchJob.url, image); const saved = await window.minimax.saveComfyOutputImage(batchJob.url, image, settings.outputDirectory); return { ...saved, preview, kind: 'image' as const } }))
          if (!disposed) { setIdentityCandidates(ready); setSelectedCandidatePaths(ready.map((file) => file.path)); setBatchJobs([]); setMasterBusy(false); setMasterMessage(`${ready.length} 张身份候选已就绪。请确认一张或多张。`) }; return
        }
        if (!disposed) setMasterMessage(`正在渲染身份批次… ${completed.length} / ${batchJobs.length} 就绪`)
      } catch (error) { if (!disposed) { setMasterMessage(error instanceof Error ? error.message : String(error)); setMasterError(true); setBatchJobs([]); setMasterBusy(false) }; return }
      timer = setTimeout(poll, 2000)
    }
    void poll(); return () => { disposed = true; clearTimeout(timer) }
  }, [batchJobs, settings.outputDirectory])
  const splitTurntable = async () => {
    if (!active.turntableVideo || videoDuration <= 0 || splitting) return
    setSplitting(true)
    try {
      const positions = [0.05, 0.25, 0.5, 0.75, 0.95].map((ratio) => Math.max(0, Math.min(videoDuration - 0.04, videoDuration * ratio)))
      const angleTypes: ReferenceImageType[] = ['full-body', 'face', 'three-quarter', 'profile', 'back']
      const extracted = await Promise.all(positions.map(async (position, index) => {
        const result = await window.minimax.extractVideoFrame(active.turntableVideo!.path, position, settings.outputDirectory, settings.ffmpegPath)
        return { ...result, kind: 'image' as const, referenceType: angleTypes[index], preview: await window.minimax.mediaUrl(result.path) }
      }))
      patch({ referenceImages: extracted, referenceMode: 'set', selectedReferencePaths: undefined })
      onNotice('success', '已从巡检视频提取五个角度到该角色的参考图组。')
    } catch (error) { onNotice('error', error instanceof Error ? error.message : String(error)) }
    finally { setSplitting(false) }
  }
  const approveCandidate = () => {
    if (!candidate) return
    const project = loadCharacterProjects().find((item) => item.id === candidate.characterId)
    if (!project) { setCandidate(null); return }
    if (candidate.target === 'sheet') {
      patchProject(project.id, { referenceMode: 'set', referenceImages: [...project.referenceImages, { ...candidate.file, referenceType: 'other' }], selectedReferencePaths: [...new Set([...(project.selectedReferencePaths ?? project.referenceImages.map((item) => item.path)), candidate.file.path])] })
      setCandidate(null); setMasterMessage('四视图角色表已确认。'); onNotice('success', '角色表已加入已确认参考图组。')
      return
    }
    patchProject(project.id, { baseImage: { ...candidate.file, referenceType: 'master' } })
    setCandidate(null); setMasterMessage('主图已确认。正在准备巡检…')
    void onCreateTurntable({ ...project, baseImage: { ...candidate.file, referenceType: 'master' } }, surveyRenderOptions).then((failure) => {
      if (failure) { setMasterMessage(failure); setMasterError(true); onNotice('error', failure) }
    })
  }
  const closeIdentityFlow = () => { setIdentityCandidates([]); setApprovedFlowProject(null); setIdentitySurveyStartedAt(null); setIdentitySurveySubmitting(false); setIdentitySurveyError(''); setCandidateStep('choose') }
  const approveIdentitySelection = () => {
    const chosen = selectedCandidatePaths.map((path) => identityCandidates.find((file) => file.path === path)).filter(Boolean) as MediaFile[]
    if (!chosen.length) return
    const master = { ...chosen[0], referenceType: 'master' as const }
    const references = [...active.referenceImages, ...chosen.map((file, index) => index === 0 ? master : { ...file, referenceType: file.referenceType ?? 'three-quarter' as const })].filter((file, index, all) => all.findIndex((item) => item.path === file.path) === index)
    const project = { ...active, baseImage: master, referenceImages: references, referenceMode: 'set' as const, selectedReferencePaths: references.map((file) => file.path) }
    patchProject(active.id, { baseImage: master, referenceMode: 'set', referenceImages: references, selectedReferencePaths: references.map((file) => file.path) })
    setApprovedFlowProject(project); setCandidateStep('survey'); setIdentitySurveyError(''); setMasterMessage(`${chosen.length} 张身份候选已确认。可以进行 MiniMax H3 Ref2VA 角度巡检。`)
    onNotice('success', `${chosen.length} 张身份候选已确认。接下来检查 MiniMax H3 Ref2VA 角度巡检。`)
  }
  const identitySurveyJob = identitySurveyStartedAt !== null && activeAutomation && activeAutomation.createdAt >= identitySurveyStartedAt - 1000 ? activeAutomation : undefined
  const startIdentitySurvey = async () => {
    if (!approvedFlowProject || !connected) return
    setIdentitySurveyStartedAt(Date.now()); setIdentitySurveySubmitting(true); setIdentitySurveyError('')
    try {
      const failure = await onCreateTurntable(approvedFlowProject, surveyRenderOptions)
      if (failure) { setIdentitySurveyStartedAt(null); setIdentitySurveyError(failure) }
    } catch (error) { setIdentitySurveyStartedAt(null); setIdentitySurveyError(error instanceof Error ? error.message : String(error)) }
    finally { setIdentitySurveySubmitting(false) }
  }
  const renderTurntable = async () => {
    if (!active.baseImage) return
    setIdentitySurveyError(''); setMasterMessage('正在准备 MiniMax H3 Ref2VA 身份巡检…'); setMasterError(false)
    try {
      const failure = await onCreateTurntable(active, surveyRenderOptions)
      if (failure) { setMasterMessage(failure); setMasterError(true) }
      else setMasterMessage('身份巡检已提交到 MiniMax H3。进度会显示在这里和队列中。')
    } catch (error) { setMasterMessage(error instanceof Error ? error.message : String(error)); setMasterError(true) }
  }

  const selectedReference = active.referenceImages.find((file) => file.path === selectedReferencePath)
  const removeImageFromCharacter = (path: string) => {
    patch(removeCharacterImage(active, path))
    if (selectedReferencePath === path) setSelectedReferencePath('')
    onNotice('success', '图片已从该角色移除。原文件已保留。')
  }
  const toggleReferenceUse = (path: string, use: boolean) => {
    const current = active.selectedReferencePaths ?? active.referenceImages.map(file => file.path)
    const selectedReferencePaths = use ? [...new Set([...current, path])] : current.filter(selected => selected !== path)
    if (!selectedReferencePaths.length) {
      onNotice('error', '请保留至少一张选中的身份图片，或将该图片从角色中移除。')
      return
    }
    patch({ referenceMode: 'set', selectedReferencePaths })
  }
  const tabs = [
    ['identity', '身份', UserRound], ['hair', '发型', Scissors], ['wardrobe', '服装', Shirt],
    ['accessories', '配饰', Watch], ['voice', '声音', Mic2], ['references', '参考图', Images],
  ] as const
  const moveReference = (path: string, direction: -1 | 1) => {
    const index = active.referenceImages.findIndex((file) => file.path === path)
    const target = index + direction
    if (index < 0 || target < 0 || target >= active.referenceImages.length) return
    const next = [...active.referenceImages]
    ;[next[index], next[target]] = [next[target], next[index]]
    patch({ referenceImages: next })
  }

  return <><div className="standard-page character-studio character-workspace-v2">
    <div className="character-studio-grid">
      <section className={`character-workbench character-tab-${activeTab}`}>
        <header className="character-titlebar"><div><span><strong>{active.name || '未命名角色'}</strong><small>{active.description || '在检查器中补充稳定的身份描述。'}</small></span><button className={`character-favorite ${active.favorite ? 'active' : ''}`} aria-label={active.favorite ? '取消收藏' : '加入收藏'} onClick={() => patch({ favorite: !active.favorite })}><Star size={14} fill={active.favorite ? 'currentColor' : 'none'} /></button></div><div><Badge tone={active.baseImage ? 'success' : 'warning'}>{active.baseImage ? '主图就绪' : '待补主图'}</Badge><Button variant="primary" onClick={() => onUseInScene(active.id)} disabled={!characterReferences(active).length}>用于场景</Button><Button variant="icon" aria-label="删除角色" title="删除角色" onClick={remove}><Trash2 size={15} /></Button></div></header>
        <WorkspaceSectionTabs<CharacterWorkspaceSection> tabs={characterSections} active={workspaceSection} onChange={setWorkspaceSection} label="角色工作流分区" />
        <div className="character-library-tab-panel" hidden={workspaceSection !== 'library'}>
          <CharacterLibraryPanel projects={projects} activeId={active.id} onAdd={() => { add(); setWorkspaceSection('design') }} onSelect={id => { setActiveId(id); setVideoDuration(0); setSelectedReferencePath(''); setWorkspaceSection('design') }} />
        </div>
        <section className="character-visual-canvas" aria-label={`${active.name} 角色画布`}>
          <figure className="character-primary-preview">{active.baseImage?.preview ? <img src={active.baseImage.preview} alt={`${active.name} 主参考图`} /> : <button type="button" onClick={() => void chooseImage('base')}><ImagePlus size={30} /><strong>添加主图</strong><span>选择一张身份锚定图</span></button>}<figcaption><Badge tone="primary">主图</Badge><span className="character-primary-actions"><Button size="sm" variant="ghost" onClick={() => void chooseImage('base')}>{active.baseImage ? '替换' : '选择'}</Button>{active.baseImage && <Button size="sm" variant="ghost" aria-label="从角色移除主图" title="从角色移除该图片；原文件保留在磁盘" onClick={() => { if (active.baseImage) removeImageFromCharacter(active.baseImage.path) }}><Trash2 size={14} /></Button>}</span></figcaption></figure>
          <div className="character-reference-mosaic">{active.referenceImages.slice(0,6).map((file,index) => <button type="button" className={file.path === selectedReferencePath ? 'selected' : ''} key={file.path} onClick={() => { setSelectedReferencePath(file.path); setWorkspaceSection('design'); setActiveTab('references') }}>{file.preview ? <img src={file.preview} alt={`${active.name} 参考图 ${index+1}`} /> : <Images size={22} />}<span>{referenceTypeLabel(file.referenceType)}</span></button>)}<button type="button" className="character-add-tile" onClick={() => void chooseImage('reference')}><Plus size={21} /><span>添加图片</span></button></div>
        </section>
        <div className="character-readiness-panel" hidden={workspaceSection === 'library'}>
          <CharacterReadiness primaryReady={Boolean(active.baseImage)} referenceCount={active.referenceImages.length} hairName={activeHairStyle?.name || active.hairPreset} wardrobeCount={active.wardrobeIds.length} accessoryCount={active.accessoryIds.length} onOpen={(tab: CharacterDetailTab) => { setWorkspaceSection('design'); setActiveTab(tab) }} onAddPrimary={() => void chooseImage('base')} />
        </div>
        <Tabs hidden={workspaceSection !== 'design'} value={activeTab} onValueChange={value => setActiveTab(value as typeof activeTab)} className="character-workspace-tabs"><TabsList>{tabs.map(([id,label,Icon]) => <TabsTrigger value={id} key={id}><Icon size={14}/>{label}</TabsTrigger>)}</TabsList></Tabs>
        <aside hidden={workspaceSection !== 'design'} className="character-context-inspector" aria-label={`${tabs.find(([id]) => id === activeTab)?.[1]}检查器`}><header><strong>{tabs.find(([id]) => id === activeTab)?.[1]}</strong><span><SlidersHorizontal size={13}/>检查器</span></header><ScrollArea className="character-inspector-scroll"><div className="character-inspector-body">
          {activeTab === 'identity' && <>
            <Field label="角色名称"><Input value={active.name} onChange={event => patch({ name:event.target.value,referencePrompt:'' })}/></Field>
            <Field label="身份优先级"><Select value={active.identityPriority} onValueChange={value => patch({identityPriority:value as CharacterProject['identityPriority']})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="balanced">身份均衡</SelectItem><SelectItem value="face">面部优先</SelectItem><SelectItem value="full-body">全身优先</SelectItem></SelectContent></Select></Field>
            <Field label="身份模板"><Select value={active.identityTemplate} onValueChange={value => patch({identityTemplate:value as CharacterProject['identityTemplate'],referencePrompt:''})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="cinematic">电影感</SelectItem><SelectItem value="editorial">杂志选角</SelectItem><SelectItem value="everyday">自然日常</SelectItem><SelectItem value="custom">自定义</SelectItem></SelectContent></Select></Field>
            <Field label="肤色"><Select value={active.skinTone || 'manual'} onValueChange={value => patch({skinTone:value === 'manual' ? '' : value,referencePrompt:''})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="manual">手动描述</SelectItem>{['MST 1 · very light','MST 2 · light','MST 3 · light-medium','MST 4 · medium-light','MST 5 · medium','MST 6 · medium-deep','MST 7 · deep','MST 8 · deep-rich','MST 9 · very deep','MST 10 · deepest'].map(tone=><SelectItem value={tone} key={tone}>{skinToneLabels[tone] ?? tone}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="外貌描述"><Textarea value={active.description} onChange={event => patch({description:event.target.value,referencePrompt:''})} placeholder="年龄、脸型、眼睛、体型、辨识标记…"/></Field>
            <Field label="体型与比例备注"><Textarea value={active.bodyNotes} onChange={event => patch({bodyNotes:event.target.value,referencePrompt:''})} placeholder="身高、比例、姿态、轮廓、行动方式…"/></Field>
            <Field label="视觉风格"><Input value={active.visualStyle} onChange={event => patch({visualStyle:event.target.value,referencePrompt:''})}/></Field>
            <Separator/><div className="character-inspector-actions"><Button variant="secondary" disabled={!ollamaAvailable || assisting} onClick={() => void enhance()}>{assisting?<LoaderCircle className="spin" size={14}/>:<WandSparkles size={14}/>}打磨身份描述</Button><Button variant="outline" onClick={() => void chooseImage('base')}><ImagePlus size={14}/>选择主图</Button></div>
            <details className="character-inspector-advanced"><summary>高级身份提示词<ChevronDown size={13}/></summary><Field label="主提示词" help={`${zPrompt.length} 字符`}><Textarea value={editableZPrompt} onChange={event=>patch({referencePrompt:event.target.value})}/></Field><div className="character-preset-compact"><Field label="外貌预设"><select defaultValue="custom" onChange={event=>{const preset=characterAppearancePresets.find(([id])=>id===event.target.value);if(preset?.[2])patch({description:appendPreset(active.description,preset[2]),referencePrompt:''})}}>{characterAppearancePresets.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></Field><Field label="风格预设"><select value={characterVisualStylePresets.includes(active.visualStyle as typeof characterVisualStylePresets[number])?active.visualStyle:'custom'} onChange={event=>{if(event.target.value!=='custom')patch({visualStyle:event.target.value,referencePrompt:''})}}><option value="custom">自定义</option>{characterVisualStylePresets.map(style=><option key={style} value={style}>{characterVisualStyleLabels[style] ?? style}</option>)}</select></Field></div></details>
          </>}
          {activeTab === 'hair' && <><div className="character-inspector-intro"><Scissors size={16}/><span><strong>已指定发型</strong><small>每个角色只以一个发型为准。</small></span></div>{activeHairStyle ? <article className="character-attached-asset">{activeHairStyle.referenceImage?.preview?<img src={activeHairStyle.referenceImage.preview} alt=""/>:<Scissors/>}<span><strong>{activeHairStyle.name}</strong><small>{hairTextureLabels[activeHairStyle.texture] ?? activeHairStyle.texture} · {hairLengthLabels[activeHairStyle.length] ?? activeHairStyle.length}</small><small>{activeHairStyle.color}</small></span><Button variant="icon" size="sm" onClick={()=>patch({hairStyleIds:[],referencePrompt:''})}><X size={13}/></Button></article>:<p className="character-empty-copy">尚未指定发型库中的发型。</p>}<Field label="手动填写"><Select value={active.hairPreset || 'manual'} disabled={Boolean(activeHairStyle)} onValueChange={value=>patch({hairPreset:value==='manual'?'':value,referencePrompt:''})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{['manual','short straight hair','long straight hair','short wavy hair','long wavy hair','short curly hair','long curly hair','coily natural hair','braided hair','locs','buzz cut','shaved head'].map(value=><SelectItem value={value} key={value}>{hairPresetLabels[value] ?? value}</SelectItem>)}</SelectContent></Select></Field><Separator/><strong className="character-inspector-label">发型库</strong><div className="character-library-assets">{hairStyles.map(hair=><label key={hair.id} className={active.hairStyleIds[0]===hair.id?'selected':''}><Checkbox checked={active.hairStyleIds[0]===hair.id} disabled={!hair.referenceImage} onCheckedChange={checked=>patch({hairStyleIds:checked?[hair.id]:[],referencePrompt:''})}/>{hair.referenceImage?.preview?<img src={hair.referenceImage.preview} alt=""/>:<span><Scissors size={14}/></span>}<span><strong>{hair.name}</strong><small>{hair.referenceImage?`${hairTextureLabels[hair.texture] ?? hair.texture} · ${hairLengthLabels[hair.length] ?? hair.length}`:'需要参考图'}</small></span></label>)}</div><Button variant="outline" onClick={()=>onOpenLibrary('hair')}>打开发型库</Button>{activeHairStyle?.referenceImage&&<Button variant="primary" disabled={masterBusy||!zReady||!active.name.trim()} onClick={()=>void createMaster('master')}><Sparkles size={14}/>把发型渲染到主图</Button>}</>}
          {activeTab === 'wardrobe' && <><div className="character-inspector-intro"><Shirt size={16}/><span><strong>已挂接服装</strong><small>第一件选中的服装优先渲染。</small></span></div><div className="character-library-assets">{wardrobes.map(item=>{const count=wardrobeReferences(item).length;const checked=active.wardrobeIds.includes(item.id);return <label key={item.id} className={checked?'selected':''}><Checkbox checked={checked} disabled={!count} onCheckedChange={value=>patch({wardrobeIds:value?[...new Set([...active.wardrobeIds,item.id])]:active.wardrobeIds.filter(id=>id!==item.id)})}/>{item.referenceImages[0]?.preview?<img src={item.referenceImages[0].preview} alt=""/>:<span><Shirt size={14}/></span>}<span><strong>{item.name}{active.wardrobeIds[0]===item.id?' · 优先':''}</strong><small>{count?`${count} 张已确认图片`:'暂无已确认图片'}</small></span></label>})}</div><Button variant="outline" onClick={()=>onOpenLibrary('wardrobes')}>打开服装库</Button></>}
          {activeTab === 'accessories' && <><div className="character-inspector-intro"><Watch size={16}/><span><strong>已挂接配饰</strong><small>只有勾选的库项目会跟随该角色。</small></span></div><div className="character-library-assets">{accessories.map(item=>{const checked=active.accessoryIds.includes(item.id);return <label key={item.id} className={checked?'selected':''}><Checkbox checked={checked} disabled={!item.referenceImage} onCheckedChange={value=>patch({accessoryIds:value?[...new Set([...active.accessoryIds,item.id])]:active.accessoryIds.filter(id=>id!==item.id)})}/>{item.referenceImage?.preview?<img src={item.referenceImage.preview} alt=""/>:<span><Watch size={14}/></span>}<span><strong>{item.name}</strong><small>{item.referenceImage?accessoryCategoryLabels[item.category] ?? item.category:'需要参考图'}</small></span></label>})}</div><Button variant="outline" onClick={()=>onOpenLibrary('accessories')}>打开配饰库</Button></>}
          {activeTab === 'voice' && <><Field label="声音预设"><select defaultValue="custom" onChange={event=>{const preset=characterVoicePresets.find(([id])=>id===event.target.value);if(preset?.[2])patch({voiceNotes:appendPreset(active.voiceNotes,preset[2]),referencePrompt:''})}}>{characterVoicePresets.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></Field><Field label="表演预设"><select defaultValue="custom" onChange={event=>{const preset=characterPerformancePresets.find(([id])=>id===event.target.value);if(preset?.[2])patch({voiceNotes:appendPreset(active.voiceNotes,preset[2]),referencePrompt:''})}}>{characterPerformancePresets.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></Field><Field label="说话人 / 音色 ID"><Input value={active.voiceSpeakerId} onChange={event=>patch({voiceSpeakerId:event.target.value})} placeholder="可选的本地说话人 ID"/></Field><Field label="语言"><Input value={active.voiceLanguage} onChange={event=>patch({voiceLanguage:event.target.value})}/></Field><Field label="声音与表演基线"><Textarea value={active.voiceNotes} onChange={event=>patch({voiceNotes:event.target.value,referencePrompt:''})} placeholder="音域、语速、口音、咬字、情绪幅度、姿态、视线…"/></Field></>}
          {activeTab === 'references' && <><div className="character-reference-mode"><Field label="取图来源"><Select value={active.referenceMode} onValueChange={value=>patch({referenceMode:value as CharacterProject['referenceMode']})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="single">仅主图</SelectItem><SelectItem value="set">选定的参考图组</SelectItem></SelectContent></Select></Field><Field label="巡检画质"><Select value={surveyProfile} onValueChange={value=>setSurveyProfile(value as typeof surveyProfile)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="native">原生 · 30 步</SelectItem><SelectItem value="turbo8">Turbo · 8 步</SelectItem><SelectItem value="turbo10">Turbo · 10 步</SelectItem><SelectItem value="turbo12">Turbo · 12 步</SelectItem></SelectContent></Select></Field><Field label="巡检分辨率"><Select value={surveyResolution} onValueChange={value=>setSurveyResolution(value as typeof surveyResolution)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="608x1056">608 × 1056</SelectItem><SelectItem value="768x1344">768 × 1344</SelectItem></SelectContent></Select></Field></div><CharacterReferenceList files={active.referenceImages} selectedPath={selectedReferencePath} selectedReferencePaths={active.selectedReferencePaths} onSelect={setSelectedReferencePath} onRemove={removeImageFromCharacter} onAdd={() => void chooseImage("reference")} />{selectedReference?<><Separator/><div className="character-selected-reference">{selectedReference.preview&&<img src={selectedReference.preview} alt=""/>}<strong>{selectedReference.name}</strong><Field label="参考图角色"><Select value={selectedReference.referenceType??'other'} onValueChange={value=>patch({referenceImages:active.referenceImages.map(file=>file.path===selectedReference.path?{...file,referenceType:value as ReferenceImageType}:file)})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{referenceTypeOptions.map(option=><SelectItem value={option.value} key={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></Field><Field label="保留方式"><Select value={selectedReference.referenceRetention??'preserve'} onValueChange={value=>patch({referenceImages:active.referenceImages.map(file=>file.path===selectedReference.path?{...file,referenceRetention:value as 'preserve'|'guide'}:file)})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="preserve">保留身份</SelectItem><SelectItem value="guide">仅作视觉参考</SelectItem></SelectContent></Select></Field><label className="character-reference-include"><input type="checkbox" checked={active.selectedReferencePaths === undefined || active.selectedReferencePaths.includes(selectedReference.path)} onChange={event => toggleReferenceUse(selectedReference.path, event.target.checked)} />在选定参考图组中使用</label><div className="character-reference-order"><Button size="sm" variant="outline" onClick={()=>moveReference(selectedReference.path,-1)}>前移</Button><Button size="sm" variant="outline" onClick={()=>moveReference(selectedReference.path,1)}>后移</Button></div><Button size="sm" variant="outline" onClick={() => removeImageFromCharacter(selectedReference.path)}><Trash2 size={14} />从角色移除图片</Button></div></>:<p className="character-empty-copy">在上方选择一张已确认图片，即可编辑其角色、保留方式与顺序。</p>}<Separator/><details className="character-inspector-advanced"><summary>专家参考图控制<ChevronDown size={13}/></summary><div className="character-preset-compact"><Field label="身份候选数"><Select value={String(identityCandidateCount)} onValueChange={value=>setIdentityCandidateCount(Number(value) as 1|2|4)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="1">1 个候选</SelectItem><SelectItem value="2">2 个候选</SelectItem><SelectItem value="4">4 个候选</SelectItem></SelectContent></Select></Field><Field label="采样步数"><Input type="number" min={4} max={30} value={identitySteps} onChange={event=>setIdentitySteps(Math.max(4,Math.min(30,Number(event.target.value)||8)))}/></Field><Field label="角色表版式"><Select value={sheetLayout} onValueChange={value=>setSheetLayout(value as typeof sheetLayout)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="coverage">面部 + 全身覆盖</SelectItem><SelectItem value="turnaround">全身转面</SelectItem></SelectContent></Select></Field></div></details></>}
        </div></ScrollArea></aside>
        <div className="character-production-workspace" hidden={workspaceSection !== 'generate'}>
        {settings.characterDetailReferencesEnabled && <section className="character-detail-references" aria-labelledby="character-detail-references-title"><header><div><span><Images size={16} /></span><span><strong id="character-detail-references-title">角色细节参考图</strong><small>为每个命名的身体部位或视觉细节最多添加两张聚焦图片。仅当该附加项启用时，它们才会占用角色共享的 9 张渲染配额。</small></span></div><button type="button" className="secondary-button" onClick={addDetailReference}><Plus size={14} />添加细节</button></header>{active.detailReferences.length ? <div className="character-detail-reference-list">{active.detailReferences.map((detail, index) => <article key={detail.id}><div className="character-detail-image-pair">{[0, 1].map((imageIndex) => { const image = detail.images[imageIndex]; return <div className="character-detail-image-slot" key={imageIndex}><button type="button" className="character-detail-image" onClick={() => void chooseDetailReferenceImage(detail.id, imageIndex)} aria-label={image ? `替换细节 ${index + 1} 视图 ${imageIndex + 1}` : `上传细节 ${index + 1} 视图 ${imageIndex + 1}`}>{image?.preview ? <img src={image.preview} alt={`${detail.label || `角色细节参考图 ${index + 1}`} 视图 ${imageIndex + 1}`} /> : <><ImagePlus size={17} /><span>视图 {imageIndex + 1}</span></>}</button>{image && <button type="button" className="character-detail-image-remove" onClick={() => removeDetailReferenceImage(detail.id, imageIndex)} aria-label={`移除细节 ${index + 1} 视图 ${imageIndex + 1}`}><X size={11} /></button>}</div> })}</div><div><label>细节名称或身体部位<input value={detail.label} onChange={(event) => patchDetailReference(detail.id, { label: event.target.value })} placeholder="按需随意命名" /></label><label>渲染备注<textarea value={detail.notes} onChange={(event) => patchDetailReference(detail.id, { notes: event.target.value })} placeholder="精确描述两个视图都必须保留的内容" /></label></div><button type="button" className="icon-button" onClick={() => removeDetailReference(detail.id)} aria-label={`移除细节参考图 ${index + 1}`}><X size={16} /></button></article>)}</div> : <p className="character-detail-empty">还没有额外的细节参考图。只添加确实需要更高精度的细节，9 张渲染配额才能用在刀刃上。</p>}</section>}
        {!settings.characterDetailReferencesEnabled && <div className="character-detail-disabled" role="status"><Images size={16} /><span><strong>角色细节参考图已关闭</strong><small>在设置中启用该可选附加项，即可上传聚焦的身体部位或视觉细节参考图。</small></span></div>}
        <div className="character-production-heading"><span>参考图制作</span><small>先做主图，再生成巡检，然后确认有用的角度。</small><em>{Number(Boolean(active.baseImage)) + Number(Boolean(active.turntableVideo)) + Number(characterReferences(active, settings.characterDetailReferencesEnabled).length > 0)} / 3 已就绪</em></div>
        <div className="identity-render-controls character-survey-render-controls"><label><span>巡检画质</span><select aria-label="身份巡检画质" value={surveyProfile} disabled={Boolean(activeAutomation && ['queued', 'running'].includes(activeAutomation.status))} onChange={(event) => setSurveyProfile(event.target.value as typeof surveyProfile)}><option value="native">原生画质 · 30 步</option><option value="turbo8">Turbo · 8 步</option><option value="turbo10">Turbo · 10 步（推荐）</option><option value="turbo12">Turbo · 12 步</option></select></label><label><span>巡检分辨率</span><select aria-label="身份巡检分辨率" value={surveyResolution} disabled={Boolean(activeAutomation && ['queued', 'running'].includes(activeAutomation.status))} onChange={(event) => setSurveyResolution(event.target.value as typeof surveyResolution)}><option value="608x1056">608 × 1056 · 更快</option><option value="768x1344">768 × 1344 · 推荐</option></select></label><small>{surveyTurbo === 'off' ? '不带 Turbo LoRA 的原生 Ref2VA。' : `Ref2VA Turbo 8 步 LoRA，采样 ${surveySteps} 步。`}</small></div>
        <div className="character-production-grid">
          <article className="character-master-card"><header><span><strong>1. 身份生成</strong><small>生成单张聚焦身份或一组对比候选，然后确认最满意的结果。</small></span><span className={`master-engine-state ${zReady ? 'ready' : ''}`}>{zReady ? <Check size={12} /> : <AlertCircle size={12} />}{zReady ? 'Z-Image 就绪' : 'Z-Image 不可用'}</span></header>
            <div className="character-media-stage">{active.baseImage?.preview ? <img src={active.baseImage.preview} alt={`${active.name} 主参考图`} /> : masterBusy ? <div><LoaderCircle className="spin" size={26} /><span>正在生成角色参考图…</span></div> : <div><ImagePlus size={26} /><span>暂无已确认身份</span></div>}</div>
            {masterMessage && <div className={`character-master-message ${masterError ? 'error' : ''}`} role={masterError ? 'alert' : 'status'}>{masterBusy && <LoaderCircle className="spin" size={13} />}<span>{masterMessage}</span></div>}
            <div className="identity-render-controls"><label><span>候选数量</span><select aria-label="身份候选数量" value={identityCandidateCount} disabled={masterBusy} onChange={event => setIdentityCandidateCount(Number(event.target.value) as 1 | 2 | 4)}><option value={1}>1 个候选</option><option value={2}>2 个候选</option><option value={4}>4 个候选</option></select></label><label><span>采样步数</span><input aria-label="身份采样步数" type="number" min={4} max={30} step={1} value={identitySteps} disabled={masterBusy} onChange={event => setIdentitySteps(Math.max(4, Math.min(30, Math.round(Number(event.target.value) || 8))))} /></label><label className="identity-sheet-layout"><span>实验性角色表</span><select aria-label="角色表版式" value={sheetLayout} disabled={masterBusy} onChange={event => setSheetLayout(event.target.value as 'coverage' | 'turnaround')}><option value="coverage">全身 · 面部 · 侧面 · 背面</option><option value="turnaround">全身转面</option></select></label></div>
            <small className="identity-render-note">每个候选使用独立种子。步数越高耗时越长；8 是 Z-Image Turbo 的基线。角色表版式会输出一张恰好包含四个同身份视图的图像。</small>
            <footer><button className="secondary-button" disabled={masterBusy} onClick={() => void chooseImage('base')}><ImagePlus size={14} />选择现有图片</button>{masterBusy && <button className="danger-button" onClick={() => batchJobs.length ? void cancelBatch() : void cancelMaster()}><CircleStop size={14} />取消队列</button>}<button className="secondary-button experimental-sheet-button" disabled={masterBusy || !active.name.trim() || !zReady} onClick={() => void createMaster('sheet')}><Images size={14} />实验性四视图角色表</button><button className="primary-button" disabled={masterBusy || !active.name.trim() || !zReady || !zPrompt.trim()} onClick={() => void createIdentityBatch(identityCandidateCount)}><Sparkles size={14} />{masterBusy ? '正在渲染队列…' : `生成 ${identityCandidateCount} 个候选`}</button></footer>
          </article>
          <article><header><span><strong>2. 身份巡检</strong><small>按选定的 Ref2VA 渲染配置，生成一段从面部覆盖到全身的中性巡检。</small></span>{activeAutomation ? <span className={`status-badge ${activeAutomation.status}`}>{jobStatusLabels[activeAutomation.status] ?? activeAutomation.status}</span> : <span className={`master-engine-state ${identitySurveyRef2vaReady ? 'ready' : ''}`}>{identitySurveyRef2vaReady ? <Check size={12} /> : <AlertCircle size={12} />}{identitySurveyRef2vaReady ? `${surveyTurbo === 'off' ? '原生' : 'Turbo'} ${surveySteps} 步就绪` : '需先配置巡检'}</span>}</header><div className="character-media-stage">{active.turntableVideo?.preview ? <ReliableVideo src={active.turntableVideo.preview} controls preload="metadata" onLoadedMetadata={(event) => setVideoDuration(event.currentTarget.duration)} /> : activeAutomation && ['queued', 'running'].includes(activeAutomation.status) ? <div><LoaderCircle className="spin" size={26} /><span>{activeAutomation.progressLabel ?? '正在渲染身份巡检…'} · {Math.round(activeAutomation.progress)}%</span></div> : <div><Orbit size={26} /><span>暂无巡检视频</span></div>}</div>{!identitySurveyRef2vaReady && <p className="field-help error"><AlertCircle size={13} />{identitySurveyRef2vaReason}</p>}<footer><button className="secondary-button" onClick={() => void chooseTurntable()}><Film size={14} />选择已渲染的视频</button><button className="primary-button" disabled={!connected || !active.baseImage || !identitySurveyRef2vaReady || Boolean(activeAutomation && ['queued', 'running'].includes(activeAutomation.status))} title={!connected ? '渲染前请先连接 ComfyUI' : !active.baseImage ? '请先确认一张身份主图' : !identitySurveyRef2vaReady ? identitySurveyRef2vaReason : ''} onClick={() => void renderTurntable()}><Orbit size={14} />{activeAutomation && ['queued', 'running'].includes(activeAutomation.status) ? '渲染中…' : `渲染 ${surveyTurbo === 'off' ? '原生' : 'Turbo'} ${surveySteps} 步巡检`}</button></footer></article>
        </div>
        <section className="character-reference-set"><header><span><strong>3. 已确认参考图</strong><small>为每张图片归类，让面部与全身锚点在影片和 MiniMax Reference 中正确分配。</small></span><button className="secondary-button" disabled={!active.turntableVideo || !videoDuration || splitting} onClick={() => void splitTurntable()}>{splitting ? <LoaderCircle className="spin" size={14} /> : <Images size={14} />}{splitting ? '正在提取…' : '拆分为 5 个角度'}</button></header><fieldset><legend>在影片中使用</legend><label><input type="radio" name="character-reference-mode" checked={active.referenceMode === 'single'} onChange={() => patch({ referenceMode: 'single' })} />单张主图</label><label><input type="radio" name="character-reference-mode" checked={active.referenceMode === 'set'} onChange={() => patch({ referenceMode: 'set' })} />选定的参考图片</label></fieldset><div className="character-reference-grid">{active.referenceImages.map((file, index) => { const selected = active.selectedReferencePaths === undefined || active.selectedReferencePaths.includes(file.path); return <figure className={selected ? 'selected' : ''} key={`${file.path}-${index}`}><img src={file.preview} alt={`${active.name} 参考图 ${index + 1}`} /><figcaption><label><input type="checkbox" checked={selected} onChange={(event) => toggleReferenceUse(file.path, event.target.checked)} />使用角度 {index + 1}</label><label className="reference-type-picker">类型<select aria-label={`角度 ${index + 1} 的参考图类型`} value={file.referenceType ?? 'other'} onChange={(event) => patch({ referenceImages: active.referenceImages.map((item, itemIndex) => itemIndex === index ? { ...item, referenceType: event.target.value as ReferenceImageType } : item) })}>{referenceTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label></figcaption><button aria-label={`移除参考角度 ${index + 1}`} onClick={() => removeImageFromCharacter(file.path)}><X size={13} /></button></figure> })}<button className="character-add-reference" onClick={() => void chooseImage('reference')}><ImagePlus size={19} /><span>添加参考图</span></button></div></section>
        </div>
      </section>
    </div>
  </div>{identityCandidates.length > 0 && <div className="character-candidate-backdrop"><section className="character-candidate-modal" role="dialog" aria-modal="true" aria-labelledby="character-candidate-title"><header><span><strong id="character-candidate-title">{candidateStep === 'choose' ? '选择身份候选' : '创建身份角度巡检'}</strong><small>{candidateStep === 'choose' ? '确认一张或多张。第一张选中的图像将成为主图；所有选中项都会加入已确认参考图组。' : 'MiniMax H3 Ref2VA 会把已确认的图片作为身份锚点，同时拍摄面部与全身。'}</small></span><button className="icon-button" aria-label="关闭角色构建器" onClick={closeIdentityFlow}><X size={18} /></button></header>{candidateStep === 'choose' ? <><div className="character-candidate-grid">{identityCandidates.map((file, index) => { const selected = selectedCandidatePaths.includes(file.path); return <label className={selected ? 'selected' : ''} key={file.path}><img src={file.preview} alt={`${active.name} 身份候选 ${index + 1}`} /><span><input type="checkbox" checked={selected} onChange={(event) => setSelectedCandidatePaths(event.target.checked ? [...selectedCandidatePaths, file.path] : selectedCandidatePaths.filter((path) => path !== file.path))} /><strong>候选 {index + 1}</strong>{selectedCandidatePaths[0] === file.path && <em>主图</em>}</span></label> })}</div><footer><span>{selectedCandidatePaths.length} / {identityCandidates.length} 已选</span><div><button className="secondary-button" onClick={() => { closeIdentityFlow(); void createIdentityBatch(4) }}>再生成一组</button><button className="primary-button" disabled={!selectedCandidatePaths.length} onClick={approveIdentitySelection}><Check size={14} />确认并继续</button></div></footer></> : <><div className="character-survey-stage">{identitySurveySubmitting && !identitySurveyJob ? <div className="character-survey-progress"><LoaderCircle className="spin" size={30} /><strong>正在准备已确认的 Ref2VA 身份图片…</strong><p>正在构建并提交原生画质的 MiniMax H3 Ref2VA 工作流。</p><small>请保持此窗口开启。</small></div> : identitySurveyJob && ['queued', 'running'].includes(identitySurveyJob.status) ? <div className="character-survey-progress"><LoaderCircle className="spin" size={30} /><strong>{identitySurveyJob.progressLabel ?? '正在渲染 MiniMax H3 Ref2VA 身份巡检'}</strong><p>同一条片段中正在生成以参考图锚定的面部覆盖与全身角度。</p><div className="progress"><i style={{ width: `${identitySurveyJob.progress}%` }} /></div><small>{Math.round(identitySurveyJob.progress)}%</small></div> : identitySurveyJob?.status === 'completed' ? <div className="character-survey-result"><div>{active.turntableVideo?.preview ? <ReliableVideo src={active.turntableVideo.preview} controls preload="metadata" /> : <Film size={30} />}</div><span><Check size={18} /><span><strong>身份巡检完成</strong><small>五帧会自动提取到「已确认参考图」。请在那里检查并取消勾选不佳的角度。</small></span></span></div> : <div className="character-survey-plan"><figure>{approvedFlowProject?.baseImage?.preview && <img src={approvedFlowProject.baseImage.preview} alt={`${active.name} 已确认的身份主图`} />}<figcaption>图 1 · Ref2VA 主身份锚定图</figcaption></figure><div><span className="recommended-badge">MiniMax H3 Ref2VA · 10 秒</span><strong>面部 + 全身覆盖</strong><ol><li><b>0–2 秒</b><span>中性全身正面视图，手部与足部可见。</span></li><li><b>2–5 秒</b><span>缓慢而稳定的推近，呈现清晰的头肩近景。</span></li><li><b>5–7 秒</b><span>正面与四分之三侧的面部结构保持清晰。</span></li><li><b>7–10 秒</b><span>拉回全身，随后展现侧面与背面角度。</span></li></ol><p>无剪辑、姿势变化、表情变化、服装变化、运动模糊、拖影或身份漂移。</p>{!identitySurveyRef2vaReady && <div className="character-survey-error" role="alert"><AlertCircle size={15} /><span><strong>需要 MiniMax H3 Ref2VA</strong><small>{identitySurveyRef2vaReason}</small></span></div>}{identitySurveyError && <div className="character-survey-error" role="alert"><AlertCircle size={15} /><span><strong>巡检未能启动</strong><small>{identitySurveyError}</small></span></div>}{!connected && <small className="location-builder-note">启动 ComfyUI 以渲染这条 MiniMax H3 巡检。</small>}</div></div>}</div><footer><span>{identitySurveyJob?.status === 'completed' ? `${characterReferences(active).length} 张已确认参考图就绪` : identitySurveySubmitting ? '正在准备 MiniMax H3 Ref2VA…' : '第 2 步 / 共 2 步 · MiniMax H3 Ref2VA 巡检'}</span><div>{identitySurveyJob?.status === 'completed' ? <button className="primary-button" onClick={closeIdentityFlow}><Check size={14} />完成角色</button> : <><button className="secondary-button" disabled={identitySurveySubmitting || Boolean(identitySurveyJob && ['queued', 'running'].includes(identitySurveyJob.status))} onClick={() => setCandidateStep('choose')}>返回候选</button><button className="primary-button" disabled={!connected || !identitySurveyRef2vaReady || identitySurveySubmitting || Boolean(identitySurveyJob && ['queued', 'running'].includes(identitySurveyJob.status))} title={!identitySurveyRef2vaReady ? identitySurveyRef2vaReason : ''} onClick={() => void startIdentitySurvey()}>{identitySurveySubmitting ? <LoaderCircle className="spin" size={14} /> : <Orbit size={14} />}{identitySurveySubmitting ? '正在准备巡检…' : identitySurveyJob && ['queued', 'running'].includes(identitySurveyJob.status) ? '正在渲染巡检…' : '渲染 Ref2VA 巡检'}</button></>}</div></footer></>}</section></div>}{candidate && <ReferenceApprovalModal title={candidate.target === 'sheet' ? '确认角色表' : '确认角色主图'} description={candidate.target === 'sheet' ? '检查正面、侧面与背面视图的身份一致性。' : '在自动巡检开始前，先确认这张身份锚定图。'} image={candidate.file.preview ?? ''} approveLabel={candidate.target === 'sheet' ? '确认角色表' : '确认并生成 Ref2VA 巡检'} nextStep={candidate.target === 'sheet' ? '确认后，这张角色表会加入该角色选定的参考图片。' : '确认后会保存这张主图、排队 MiniMax H3 Ref2VA 巡检，然后把视频与五个参考角度导入这里。'} approveStartsGeneration={candidate.target !== 'sheet'} onClose={() => setCandidate(null)} onRetry={() => { const target = candidate.target; setCandidate(null); void createMaster(target) }} onApprove={approveCandidate} />}</>
}
