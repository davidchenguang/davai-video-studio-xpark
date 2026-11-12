import { useState } from "react"
import { NumberField, SelectField } from "./FormFields"
import { LegacyMigrationControl } from './LegacyMigrationControl'
import { createId } from "../lib/createId"
import { resolveLlmConnection } from "../lib/llmProvider"
import { formatBenchmarkDuration, h3StackReport, type H3BenchmarkConfig, type H3BenchmarkResult } from "../lib/h3Diagnostics"
import { MINIMAX_VIDEO_RESOLUTIONS } from "../lib/videoResolutions"
import type { AppSettings, ComfyStatus, GenerationJob, GpuTelemetry, ModelFile, ModelKind, OllamaModel, LocalLlmStatus, LegacyMigrationStatus, RenderSettingsPreset } from "../types"
import { Activity, AlertCircle, Aperture, Check, ChevronDown, Clock3, Download, ExternalLink, Folder, FolderOpen, Gauge, HardDrive, Image as ImageIcon, LoaderCircle, Minus, Pencil, Plus, RefreshCw, RotateCcw, Save, SlidersHorizontal, Sparkles, Trash2, X } from 'lucide-react'
import { choices, type ObjectInfo } from '../lib/comfyInfo'
import { findH3ParallelAttentionNode, findH3PreviewOverrideNode, findSolAttentionNode, findSolCompatibleCacheNode } from '../lib/h3NodeDetection'
import { attentionBackendLabel, resolveAttentionBackend } from '../lib/attentionBackend'
import { estimatedComponentBytes, formatGiB, resolveGpuRouting, routingGpus, type RoutingComponent } from '../lib/gpuRouting'
import { hasTurbo4Lora, inferLtx25Selections, inferSelections } from '../lib/modelSelection'
import { inferAceStepSelections, buildAceStepWorkflow } from '../lib/aceStepWorkflow'
import { buildMiniMaxWorkflow } from '../lib/workflow'
import { buildLtx25Workflow } from '../lib/ltx25Workflow'
import { buildZImage } from '../lib/zimage'
import { parseSolRuntimeDiagnostics, solRuntimeLabel } from '../lib/solDiagnostics'
import type { Turbo8Profile, UpscaleMode } from '../types'

function formatBytes(bytes: number) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unit]}`
}

type SettingsViewProps = {
  settings: AppSettings
  setSettings(value: AppSettings): void
  info: ObjectInfo
  models: ModelFile[]
  jobs: GenerationJob[]
  gpu: GpuTelemetry | null
  h3Report: ReturnType<typeof h3StackReport>
  scanning: boolean
  status: ComfyStatus
  checking: boolean
  diagnosticRunning: boolean
  benchmarkRunning: boolean
  benchmarkConfig: H3BenchmarkConfig
  setBenchmarkConfig(value: H3BenchmarkConfig): void
  benchmarkResults: H3BenchmarkResult[]
  ollamaModels: OllamaModel[]
  localLlmStatus: LocalLlmStatus | null
  localLlmChecking: boolean
  legacyMigration: LegacyMigrationStatus | null
  legacyMigrationRunning: boolean
  onRefreshOllama(): void
  onScan(): void
  onCheck(): void
  onSave(): void
  onApplyDefaults(): void
  onRunDiagnostics(): void
  onRunBenchmark(): void
  onRunLegacyMigration(): void
  onFactoryReset(): void
}

export function SettingsView({ settings, setSettings, info, models, jobs, gpu, h3Report, scanning, status, checking, diagnosticRunning, benchmarkRunning, benchmarkConfig, setBenchmarkConfig, benchmarkResults, ollamaModels, localLlmStatus, localLlmChecking, legacyMigration, legacyMigrationRunning, onRefreshOllama, onScan, onCheck, onSave, onApplyDefaults, onRunDiagnostics, onRunBenchmark, onRunLegacyMigration, onFactoryReset }: SettingsViewProps) {
  const pathRows: Array<{ kind: ModelKind; label: string; note: string }> = [
    { kind: 'diffusion_models', label: '扩散模型', note: 'FL2VA 与 Ref2VA 检查点' },
    { kind: 'text_encoders', label: '文本编码器', note: 'Qwen3-VL MiniMax 编码器' },
    { kind: 'vae', label: 'VAE 模型', note: '视频与音频解码器' },
    { kind: 'loras', label: 'LoRA 模型', note: '4 步与 8 步 Turbo 适配器' },
    { kind: 'vae_approx', label: '预览模型', note: '微型 H3 预览解码器' },
    { kind: 'clip_vision', label: '视觉编码器', note: '可选的参考图编码器' },
  ]
  const defaults = settings.generationDefaults
  const turbo4Available = hasTurbo4Lora(models)
  const llm = resolveLlmConnection(settings)
  const activeModelField = settings.llmProvider === 'lmstudio' ? 'lmStudioModel' : 'ollamaModel'
  const activeUrlField = settings.llmProvider === 'lmstudio' ? 'lmStudioUrl' : 'ollamaUrl'
  const currentLlmStatus = localLlmStatus?.provider === llm.provider && localLlmStatus.url === llm.url ? localLlmStatus : null
  const llmHealthLabel = localLlmChecking ? '检查中…' : currentLlmStatus?.connected
    ? ollamaModels.length ? `${ollamaModels.length} 个模型就绪` : '已连接 · 无模型'
    : currentLlmStatus?.error ? '无法连接' : '未检查'
  const updateDefaults = (patch: Partial<AppSettings['generationDefaults']>) => setSettings({ ...settings, generationDefaults: { ...defaults, ...patch } })
  const [presetName, setPresetName] = useState('')
  const [workflowKind, setWorkflowKind] = useState<'h3-i2v' | 'ref2va' | 'ltx' | 'zimage' | 'acestep'>('h3-i2v')
  const [workflowExportStatus, setWorkflowExportStatus] = useState('')
  const [solGuideOpen, setSolGuideOpen] = useState(false)
  const [solTestStatus, setSolTestStatus] = useState('')
  const [gpuDiagnosticStatus, setGpuDiagnosticStatus] = useState('')
  const [factoryResetOpen, setFactoryResetOpen] = useState(false)
  const [factoryResetPhrase, setFactoryResetPhrase] = useState('')
  const [devToolsError, setDevToolsError] = useState('')
  const [activeSettingsSection, setActiveSettingsSection] = useState('display')
  const settingsSections = [
    ['display', '显示与操作'],
    ['engine', 'ComfyUI 引擎'],
    ['performance', '性能'],
    ['benchmark', '注意力基准'],
    ['routing', 'GPU 路由'],
    ['workflows', '工作流导出'],
    ['h3', 'H3 引擎栈'],
    ['defaults', '生成默认值'],
    ['assistant', '本地 AI'],
    ['models', '模型位置'],
    ['storage', '输出与工具'],
    ['reset', '恢复出厂设置'],
  ] as const
  const openSettingsSection = (id: typeof settingsSections[number][0]) => {
    setActiveSettingsSection(id)
    document.getElementById(`settings-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const saveRenderPreset = () => {
    const name = presetName.trim()
    if (!name) return
    const now = Date.now()
    const existing = settings.renderSettingsPresets.find((preset) => preset.name.toLowerCase() === name.toLowerCase())
    const preset: RenderSettingsPreset = { id: existing?.id ?? createId(), name, values: { ...defaults, userLoras: [], rtxModel: '', livePreviewMode: 'auto', noDialogue: true, naturalMovement: true, clothingPolicy: 'wardrobe', seed: 0, seedLocked: true }, createdAt: existing?.createdAt ?? now, updatedAt: now }
    setSettings({ ...settings, renderSettingsPresets: [...settings.renderSettingsPresets.filter((item) => item.id !== preset.id), preset] })
    setPresetName('')
  }
  const applyRenderPreset = (preset: RenderSettingsPreset) => updateDefaults({ ...preset.values })
  const renameRenderPreset = (preset: RenderSettingsPreset) => {
    const name = window.prompt('意图名称', preset.name)?.trim()
    if (!name) return
    setSettings({ ...settings, renderSettingsPresets: settings.renderSettingsPresets.map((item) => item.id === preset.id ? { ...item, name: name.slice(0, 60), updatedAt: Date.now() } : item) })
  }
  const deleteRenderPreset = (preset: RenderSettingsPreset) => {
    if (!window.confirm(`删除渲染意图「${preset.name}」？`)) return
    setSettings({ ...settings, renderSettingsPresets: settings.renderSettingsPresets.filter((item) => item.id !== preset.id) })
  }
  const applyPreset = (preset: 'quality' | 'official-turbo' | 'preview') => {
    const common = { resolution: '1344x768', duration: 5, steps: 30, loraStrength: 1, shiftVideo: 12, upscaleMode: 'off' as const }
    if (preset === 'quality') updateDefaults({ ...common, turbo: 'off', sampler: 'res_multistep', scheduler: 'simple', experimentalSampling: false, sigmaShiftMode: 'model', shiftAudio: 3 })
    else if (preset === 'official-turbo') updateDefaults({ ...common, turbo: '8', sampler: 'res_multistep', scheduler: 'simple', experimentalSampling: false, sigmaShiftMode: 'model', shiftAudio: 3 })
    else updateDefaults({ ...common, resolution: '864x480', turbo: '8', sampler: 'res_multistep', scheduler: 'simple', experimentalSampling: false, sigmaShiftMode: 'model', shiftAudio: 3 })
  }
  const samplerOptions = [...new Set([defaults.sampler, 'res_multistep', 'euler', 'gradient_estimation', 'ipndm', 'deis', 'heun', ...choices(info, 'KSamplerSelect', 'sampler_name')])]
  const schedulerOptions = [...new Set([defaults.scheduler, 'simple', 'beta', 'normal', ...choices(info, 'BasicScheduler', 'scheduler')])]
  const warnedSampler = ['euler_ancestral', 'lcm', 'dpmpp_3m_sde'].includes(defaults.sampler)
  const attentionBackends = choices(info, 'ModelAttentionBackend', 'attention')
  const h3ParallelAttentionNode = findH3ParallelAttentionNode(info)
  const solAttentionNode = findSolAttentionNode(info)
  const solCacheNode = findSolCompatibleCacheNode(info)
  const previewRoutingNode = findH3PreviewOverrideNode(info)
  const nvfp4Fl2vaInstalled = models.some((model) => model.kind === 'diffusion_models' && /^minimax_h3_fl2va_pruned_nvfp4\.safetensors$/i.test(model.name))
  const nvfp4Ref2vaInstalled = models.some((model) => model.kind === 'diffusion_models' && /^minimax_h3_ref2va_pruned_nvfp4\.safetensors$/i.test(model.name))
  const nvfp4DiffusionReady = nvfp4Fl2vaInstalled && nvfp4Ref2vaInstalled
  const kitchenAttention = resolveAttentionBackend('kitchen', attentionBackends)
  const sageAttention = resolveAttentionBackend('sage', attentionBackends)
  const nativeAttention = resolveAttentionBackend('native', attentionBackends)
  const selectedAttention = resolveAttentionBackend(settings.attentionBackend, attentionBackends)
  const h3AttentionBackend = settings.attentionBackend === 'sol' ? undefined : selectedAttention
  const routingGpuList = routingGpus(gpu, status.stats?.devices)
  const routingH3Models = inferSelections(models, defaults.turbo, defaults.textEncoderPreference, settings.h3DiffusionPrecision)
  const routingModelNames: Partial<Record<RoutingComponent, string>> = { diffusion: routingH3Models.fl2va, textEncoder: routingH3Models.textEncoder, videoVae: routingH3Models.videoVae, audioVae: routingH3Models.audioVae, previewVae: routingH3Models.previewVae }
  const routingSizes = Object.fromEntries(Object.entries(routingModelNames).map(([component, name]) => [component, estimatedComponentBytes(models.find((model) => model.name === name)?.bytes, component as RoutingComponent)]))
  const gpuRoutingPlan = resolveGpuRouting(settings.gpuRouting, routingGpuList, info, routingSizes, previewRoutingNode)
  const runtimeArgs = status.stats?.system?.argv ?? []
  const detectedOutputDirectory = status.detectedOutputDirectory?.replace(/[\\/]+$/, '')
  const configuredOutputDirectory = settings.outputDirectory.replace(/[\\/]+$/, '')
  const outputDirectoryMismatch = Boolean(detectedOutputDirectory && configuredOutputDirectory.localeCompare(detectedOutputDirectory, undefined, { sensitivity: 'accent' }) !== 0)
  const hasRuntimeArg = (arg: string) => runtimeArgs.some((value) => value === arg || value.startsWith(`${arg}=`))
  const routingCapabilities = [
    { label: '扩散模型', node: info.UNETLoaderMultiGPU ? 'UNETLoaderMultiGPU' : info.SelectModelDevice ? 'SelectModelDevice' : undefined, cpu: Boolean(info.UNETLoaderMultiGPU) },
    { label: '文本编码器', node: info.CLIPLoaderMultiGPU ? 'CLIPLoaderMultiGPU' : info.SelectCLIPDevice ? 'SelectCLIPDevice' : undefined, cpu: Boolean(info.CLIPLoaderMultiGPU || info.SelectCLIPDevice) },
    { label: '视频 / 音频 VAE', node: info.VAELoaderMultiGPU ? 'VAELoaderMultiGPU' : info.SelectVAEDevice ? 'SelectVAEDevice' : undefined, cpu: Boolean(info.VAELoaderMultiGPU) },
    { label: '预览 VAE', node: previewRoutingNode, cpu: false },
  ]
  const runtimeMemoryPolicy = !runtimeArgs.length ? '启动参数不可用' : hasRuntimeArg('--gpu-only') ? '仅 GPU 常驻' : hasRuntimeArg('--highvram') ? '高显存常驻' : hasRuntimeArg('--lowvram') || hasRuntimeArg('--novram') ? '保守显存模式' : '由 ComfyUI 管理内存'
  const solRuntimeDiagnostics = parseSolRuntimeDiagnostics(jobs.flatMap((job) => job.comfyActivity?.map((activity) => activity.message) ?? []).join('\n'))
  const completedBenchmarks = benchmarkResults.filter((item) => item.status === 'completed' && item.elapsedMs !== undefined).sort((a, b) => (a.elapsedMs ?? Infinity) - (b.elapsedMs ?? Infinity))
  const benchmarkWinner = completedBenchmarks[0]
  const benchmarkMachine = gpu?.name ?? status.stats?.devices?.[0]?.name ?? '这台电脑'
  const gpuDeviceOptions: Array<[string, string]> = [['auto', '自动'], ['cpu', 'CPU'], ...routingGpuList.map((device) => [`gpu:${device.index}`, `GPU ${device.index} — ${device.name}`] as [string, string])]
  const updateGpuRouting = (patch: Partial<AppSettings['gpuRouting']>) => setSettings({ ...settings, gpuRouting: { ...settings.gpuRouting, ...patch } })
  const testSolEngine = async () => {
    if (!solAttentionNode) { setSolTestStatus('未检测到 SolAttnH3。请先安装它、重启 ComfyUI，然后测试连接。'); return }
    try {
      const h3 = inferSelections(models, '8', defaults.textEncoderPreference, settings.h3DiffusionPrecision)
      const workflow = buildMiniMaxWorkflow({ mode: 'text', prompt: 'A polished chrome sphere rotates slowly on a dark studio pedestal under one soft overhead light. Locked camera, clean reflections, ambient room tone, no dialogue, no text.', width: 864, height: 480, duration: 5, seed: 12345, steps: 8, turbo: '8', sampler: 'res_multistep', scheduler: 'simple', refImageSize: 'match', loraStrength: 1, gpuRouting: gpuRoutingPlan.workflow, solCache: settings.solCacheEnabled && solCacheNode ? { nodeType: solCacheNode, threshold: 0.1, maxSteps: 5 } : undefined, solAttention: { nodeType: solAttentionNode, tau: settings.solAttnTau }, filenamePrefix: `video/Sol_Engine_Test_${Date.now()}`, referenceImages: [], referenceVideos: [], referenceAudios: [] }, h3, { images: [], videos: [], audios: [] })
      const nodes = Object.values(workflow)
      if (!nodes.some((node) => node.class_type === solAttentionNode)) throw new Error('生成的工作流中没有 Sol-Attn 节点。')
      if (nodes.some((node) => node.class_type === 'ModelAttentionBackend')) throw new Error('安全检查未通过：H3 图中同时存在通用注意力后端。')
      if (!nodes.some((node) => node.class_type === 'LoraLoaderModelOnly')) throw new Error('所选 H3 模型栈中没有官方 Turbo 8 LoRA。')
      if (workflow['14']?.inputs.steps !== 8) throw new Error('Sol 测试图未能解析出恰好 8 个采样步数。')
      if (settings.solCacheEnabled && solCacheNode && !nodes.some((node) => node.class_type === solCacheNode)) throw new Error('所请求的 H3 缓存节点没有出现在 Sol 栈中。')
      const response = await window.minimax.submitPrompt(settings.comfyUrl, workflow)
      setSolTestStatus(`Sol${settings.solCacheEnabled && solCacheNode ? ' + 缓存' : ''} Turbo 8 测试已被接受 · 提示词 ${response.prompt_id}。请观察队列与 ComfyUI 日志中的 backend=triton、correctness gate PASS、稀疏调用与缓存跳过。`)
    } catch (error) {
      setSolTestStatus(`Sol 测试失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }
  const testGpuRouting = async () => {
    if (!status.connected) { setGpuDiagnosticStatus('运行放置诊断前请先连接 ComfyUI。'); return }
    if (!routingH3Models.fl2va || !routingH3Models.textEncoder || !routingH3Models.videoVae || !routingH3Models.audioVae) { setGpuDiagnosticStatus('需要 H3 扩散模型、文本编码器以及完整的视频与音频 VAE。'); return }
    if (gpuRoutingPlan.vramWarnings.length && !settings.gpuRouting.allowOvercommit) { setGpuDiagnosticStatus(`被显存校验阻止：${gpuRoutingPlan.vramWarnings.join(' ')}`); return }
    try {
      const workflow = buildMiniMaxWorkflow({ mode: 'text', prompt: 'GPU placement diagnostic. Static studio color chart, locked camera, ambient tone, no dialogue.', width: 608, height: 352, duration: 2, seed: 30905060, steps: 8, turbo: '8', sampler: 'res_multistep', scheduler: 'simple', refImageSize: 'match', loraStrength: 1, gpuRouting: gpuRoutingPlan.workflow, solAttention: settings.attentionBackend === 'sol' && solAttentionNode ? { nodeType: solAttentionNode, tau: settings.solAttnTau } : undefined, filenamePrefix: `video/GPU_Routing_Diagnostic_${Date.now()}`, referenceImages: [], referenceVideos: [], referenceAudios: [] }, inferSelections(models, '8', defaults.textEncoderPreference, settings.h3DiffusionPrecision), { images: [], videos: [], audios: [] })
      const response = await window.minimax.submitPrompt(settings.comfyUrl, workflow)
      console.info(`[GPU Routing Diagnostic] ${gpuRoutingPlan.logLine} | Strategy: ${gpuRoutingPlan.workflow.strategy}`)
      setGpuDiagnosticStatus(`诊断已排队 · 提示词 ${response.prompt_id}。请求的放置：${gpuRoutingPlan.logLine}。队列接受只验证图的兼容性；请确认 ComfyUI 进程日志中报告了这些放置，再视为运行时已验证。`)
    } catch (error) {
      setGpuDiagnosticStatus(`诊断失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }
  const exportWorkflow = async () => {
    const [width, height] = defaults.resolution.split('x').map(Number)
    const h3 = inferSelections(models, defaults.turbo, defaults.textEncoderPreference, settings.h3DiffusionPrecision)
    const ltx = inferLtx25Selections(models, choices(info, 'LatentUpscaleModelLoader', 'model_name'))
    const ace = inferAceStepSelections(models)
    const attentionBackend = selectedAttention
    const filenamePrefix = `MiniMax_Export_${Date.now()}`
    let workflow: Record<string, unknown>
    let filename: string
    if (workflowKind === 'ref2va') {
      filename = 'minimax-ref2va-api-workflow.json'
      workflow = buildMiniMaxWorkflow({ mode: 'reference', prompt: 'Describe the shot. Attach reference media in ComfyUI before queueing.', width, height, duration: defaults.duration, seed: 12345, steps: defaults.steps, turbo: defaults.turbo, sampler: defaults.sampler, scheduler: defaults.scheduler, experimentalSampling: defaults.experimentalSampling, refImageSize: defaults.refImageSize, loraStrength: defaults.loraStrength, attentionBackend: h3AttentionBackend, gpuRouting: gpuRoutingPlan.workflow, solCache: settings.attentionBackend === 'sol' && settings.solCacheEnabled && solCacheNode ? { nodeType: solCacheNode, threshold: 0.1, maxSteps: 5 } : undefined, solAttention: settings.attentionBackend === 'sol' && solAttentionNode ? { nodeType: solAttentionNode, tau: settings.solAttnTau } : undefined, filenamePrefix, referenceImages: [], referenceVideos: [], referenceAudios: [] }, h3, { images: [], videos: [], audios: [] })
    } else if (workflowKind === 'ltx') {
      filename = 'ltx-2.5-api-workflow.json'
      workflow = buildLtx25Workflow({ mode: 'text', prompt: 'Describe one continuous cinematic shot.', width, height, duration: defaults.duration, seed: 12345, preset: 'turbo', attentionBackend, gpuRouting: gpuRoutingPlan.workflow, filenamePrefix }, ltx)
    } else if (workflowKind === 'zimage') {
      filename = 'z-image-api-workflow.json'
      const zModel = models.find((model) => model.kind === 'diffusion_models' && /z[_-]?image.*turbo/i.test(model.name))?.name ?? 'z_image_turbo_bf16.safetensors'
      const zEncoder = models.find((model) => model.kind === 'text_encoders' && /qwen[_-]?3[_-]?4b/i.test(model.name))?.name ?? 'qwen_3_4b.safetensors'
      const zVae = models.find((model) => model.kind === 'vae' && /^ae\.safetensors$/i.test(model.name))?.name ?? 'ae.safetensors'
      workflow = buildZImage('Describe a single polished image.', width, height, 12345, zModel, zEncoder, zVae, 8, 1, 'turbo', '', attentionBackend, gpuRoutingPlan.workflow)
    } else if (workflowKind === 'acestep') {
      filename = 'ace-step-1.5-api-workflow.json'
      workflow = buildAceStepWorkflow({ model: ace.sft ? 'sft' : 'base', tags: 'cinematic instrumental soundtrack', lyrics: '', instrumental: true, duration: 60, bpm: 120, timeSignature: '4', language: 'en', keyScale: 'C major', seed: 12345, generateAudioCodes: true, attentionBackend, gpuRouting: gpuRoutingPlan.workflow, filenamePrefix }, ace)
    } else {
      filename = 'minimax-h3-i2v-api-workflow.json'
      workflow = buildMiniMaxWorkflow({ mode: 'text', prompt: 'Describe one continuous cinematic shot.', width, height, duration: defaults.duration, seed: 12345, steps: defaults.steps, turbo: defaults.turbo, sampler: defaults.sampler, scheduler: defaults.scheduler, experimentalSampling: defaults.experimentalSampling, refImageSize: defaults.refImageSize, loraStrength: defaults.loraStrength, attentionBackend: h3AttentionBackend, gpuRouting: gpuRoutingPlan.workflow, solCache: settings.attentionBackend === 'sol' && settings.solCacheEnabled && solCacheNode ? { nodeType: solCacheNode, threshold: 0.1, maxSteps: 5 } : undefined, solAttention: settings.attentionBackend === 'sol' && solAttentionNode ? { nodeType: solAttentionNode, tau: settings.solAttnTau } : undefined, filenamePrefix, referenceImages: [], referenceVideos: [], referenceAudios: [] }, h3, { images: [], videos: [], audios: [] })
    }
    try {
      const saved = await window.minimax.exportWorkflowJson(filename, workflow)
      setWorkflowExportStatus(saved ? `已保存 ${filename}。它包含 ${settings.attentionBackend === 'sol' && solAttentionNode && (workflowKind === 'ref2va' || workflowKind === 'h3-i2v') ? 'NVIDIA Sol-Attn' : attentionBackend ? attentionBackendLabel(attentionBackend) : 'ComfyUI 默认注意力'}。` : '已取消工作流导出。')
    } catch (error) {
      setWorkflowExportStatus(error instanceof Error ? `无法导出工作流：${error.message}` : '无法导出工作流。')
    }
  }
  const routingRows: Array<{ key: RoutingComponent; setting: 'diffusion' | 'textEncoder' | 'videoVae' | 'audioVae' | 'previewVae'; label: string }> = [{ key: 'diffusion', setting: 'diffusion', label: '扩散模型' }, { key: 'textEncoder', setting: 'textEncoder', label: '文本编码器' }, { key: 'videoVae', setting: 'videoVae', label: '视频 VAE' }, { key: 'audioVae', setting: 'audioVae', label: '音频 VAE' }, { key: 'previewVae', setting: 'previewVae', label: '预览 VAE' }]
  const preloadHelperReady = Boolean(info.OyamaH3PreloadStart && info.OyamaH3PreloadAwait)
  const preloadHasSeparateGpus = gpuRoutingPlan.placements.diffusion.resolved.startsWith('gpu:') && gpuRoutingPlan.placements.textEncoder.resolved.startsWith('gpu:') && gpuRoutingPlan.placements.diffusion.resolved !== gpuRoutingPlan.placements.textEncoder.resolved
  return <div className="standard-page settings-page"><div className="page-heading"><div><p className="eyebrow">应用</p><h1>设置</h1><p>整理本地引擎、模型、工作区缩放与输出工具。更改会自动保存；这个按钮还会重新扫描模型并刷新连接。</p></div><button className="primary-button" onClick={onSave}><Save size={17} />保存并刷新</button></div>
    <div className="settings-layout"><aside className="settings-sidebar" aria-label="设置分区"><span>设置分区</span>{settingsSections.map(([id, label]) => <button key={id} type="button" className={activeSettingsSection === id ? 'active' : ''} onClick={() => openSettingsSection(id)}>{label}</button>)}</aside><div className="settings-content">
    <section className="settings-section settings-display-section" id="settings-display"><div className="settings-heading"><div><SlidersHorizontal size={19} /><span><strong>显示与操作</strong><small>让工作区在你的屏幕分辨率与文字大小下都舒适易用。</small></span></div><output>{settings.uiScale}%</output></div><div className="ui-scale-control"><div><label htmlFor="ui-scale">界面缩放</label><small>立即改变整个应用。该选择会保存在本地设置中。</small></div><div><input id="ui-scale" type="range" min="75" max="150" step="5" value={settings.uiScale} onChange={(event) => { const uiScale = Number(event.target.value); setSettings({ ...settings, uiScale }); void window.minimax.setUiScale(uiScale / 100) }} /><div><button type="button" className="secondary-button" onClick={() => { setSettings({ ...settings, uiScale: 100 }); void window.minimax.setUiScale(1) }}>重置为 100%</button><strong>{settings.uiScale}%</strong></div></div></div><div className="connection-row"><div className="field-group grow"><strong>开发者工具</strong><small>在视频渲染期间检查渲染进程的错误与性能。</small></div><button type="button" className="secondary-button" onClick={() => { setDevToolsError(''); void window.minimax.openDevTools().catch((cause) => setDevToolsError(cause instanceof Error ? cause.message : String(cause))) }}><ExternalLink size={15} />打开开发者工具</button></div>{devToolsError && <p className="settings-warning" role="alert"><AlertCircle size={15} />{devToolsError}</p>}</section>
    <section className="settings-section" id="settings-engine"><div className="settings-heading"><div><Activity size={19} /><span><strong>ComfyUI 引擎</strong><small>桌面应用只与这个本地地址通信。</small></span></div><span className={`health-pill ${status.connected ? 'online' : ''}`}>{status.connected ? '已连接' : '离线'}</span></div><div className="connection-row"><div className="field-group grow"><label htmlFor="comfy-url">服务器地址</label><input id="comfy-url" value={settings.comfyUrl} onChange={(event) => setSettings({ ...settings, comfyUrl: event.target.value })} /></div><button className="secondary-button test-button" onClick={onCheck} disabled={checking}>{checking ? <LoaderCircle size={16} className="spin" /> : <RefreshCw size={16} />}测试连接</button></div>{status.connected && status.stats?.devices?.[0] && <div className="device-strip"><Gauge size={17} /><span><strong>{status.stats.devices[0].name ?? '计算设备'}</strong><small>{status.stats.devices[0].vram_total ? `${formatBytes(status.stats.devices[0].vram_total)} 显存 · 空闲 ${formatBytes(status.stats.devices[0].vram_free ?? 0)}` : '已检测到 ComfyUI 设备'}</small></span></div>}{outputDirectoryMismatch && <div className="settings-warning" role="alert"><AlertCircle size={15} /><span><strong>输出文件夹与正在运行的 ComfyUI 不一致</strong><small>ComfyUI 正在保存到 <code>{detectedOutputDirectory}</code>，而 Oyama 在 <code>{settings.outputDirectory}</code> 中查找，已完成的渲染可能会显示为丢失。</small></span><button type="button" className="secondary-button" onClick={() => setSettings({ ...settings, outputDirectory: detectedOutputDirectory!, clipMasterOutputDirectory: `${detectedOutputDirectory}\\video` })}>使用检测到的文件夹</button></div>}</section>
    <section className="settings-section gpu-routing-section" id="settings-routing"><div className="settings-heading"><div><Gauge size={19} /><span><strong>GPU 路由</strong><small>把完整的模型组件放到独立设备上；VAE 永远不会被拆分。</small></span></div><span className={`health-pill ${gpuRoutingPlan.warnings.length ? '' : 'online'}`}>{gpuRoutingPlan.warnings.length ? '回退已生效' : '就绪'}</span></div>
      <div className="gpu-routing-presets"><SelectField label="路由预设" value={settings.gpuRouting.preset} onChange={(preset) => updateGpuRouting({ preset: preset as AppSettings['gpuRouting']['preset'] })} options={[["automatic", '自动'], ["single", '单 GPU'], ["split", '扩散模型 GPU 0 / VAE GPU 1'], ["custom", '自定义']]} /><SelectField label="驻留策略" value={gpuRoutingPlan.workflow.strategy} onChange={(strategy) => updateGpuRouting({ strategy: strategy as AppSettings['gpuRouting']['strategy'], ...(strategy !== 'resident' ? { preloadDiffusionDuringTextEncoding: false } : {}) })} options={[["resident", '保持常驻'], ["sequential", '顺序卸载'], ["cpu-fallback", 'CPU 回退']]} /></div>
      <div className="gpu-loading-modes" aria-label="H3 模型加载选项">
        <label className={`settings-check ${settings.gpuRouting.strategy === 'resident' ? 'selected' : ''}`}><input type="checkbox" checked={settings.gpuRouting.strategy === 'resident'} onChange={(event) => updateGpuRouting({ strategy: event.target.checked ? 'resident' : 'sequential', ...(!event.target.checked ? { preloadDiffusionDuringTextEncoding: false } : {}) })} /><span><strong>保持 H3 DiT 常驻</strong><small>首次渲染时正常加载，然后在内存允许的情况下把 transformer 保留在其路由到的 GPU 上。这是稳定的快速重复渲染选项。</small></span></label>
        <label className={`settings-check ${settings.gpuRouting.preloadDiffusionDuringTextEncoding && gpuRoutingPlan.workflow.preloadDiffusion ? 'selected' : ''}`}><input type="checkbox" checked={settings.gpuRouting.preloadDiffusionDuringTextEncoding} disabled={!preloadHelperReady || routingGpuList.length < 2} onChange={(event) => updateGpuRouting({ preloadDiffusionDuringTextEncoding: event.target.checked, ...(event.target.checked ? { strategy: 'resident' } : {}) })} /><span><strong>文本编码期间预加载 H3 DiT · 实验性</strong><small>{!preloadHelperReady ? '未检测到 Oyama 预加载辅助节点。请把它安装到 ComfyUI/custom_nodes，重启 ComfyUI，然后刷新引擎。' : !preloadHasSeparateGpus ? '已检测到可用的辅助节点。请把扩散模型与文本编码器路由到不同 GPU 以启用它。' : gpuRoutingPlan.workflow.preloadDiffusion ? '已启用并受保护：预加载先行启动，文本编码在另一块 GPU 上运行，采样在硬屏障处等待。' : '已请求，但安全校验对这个配置使用正常常驻加载。'}</small></span></label>
      </div>
      <div className="gpu-inventory">{routingGpuList.length ? routingGpuList.map((device) => <article key={device.index}><span className="status-dot" /><div><strong>GPU {device.index} — {device.name}</strong><small>{formatGiB(device.totalBytes)} 总量 · {formatGiB(device.usedBytes)} 已用 · {formatGiB(device.freeBytes)} 空闲</small></div><em>{device.totalBytes ? Math.round(device.usedBytes / device.totalBytes * 100) : 0}%</em></article>) : <p className="settings-warning"><AlertCircle size={15} />没有报告任何 CUDA GPU。请刷新引擎；路由保持自动。</p>}</div>
      {routingGpuList.length > (status.stats?.devices?.filter((device) => /cuda/i.test(`${device.type ?? ''} ${device.name ?? ''}`)).length ?? 0) && <p className="settings-note">NVIDIA 遥测中还有更多 CUDA GPU。ComfyUI 的 <code>/system_stats</code> 端点目前只报告主设备；在依赖次要目标之前，请使用设备感知加载器并运行放置诊断。</p>}
      <details className="runtime-capability-panel" open><summary><span><strong>运行时能力门槛</strong><small>只通过这台 ComfyUI 服务器已声明的设备节点路由组件。</small></span><em>{routingCapabilities.filter((item) => item.node).length}/4 已检测</em></summary><div className="runtime-capability-list">{routingCapabilities.map((item) => <div key={item.label} className={item.node ? 'ready' : 'missing'}><span className="routing-status" /><div><strong>{item.label}</strong><small>{item.node ? `${item.node} 已检测 · ${item.cpu ? 'GPU 与 CPU 放置均可用' : item.label.includes('VAE') ? 'ComfyUI 核心只支持 GPU 目标' : 'GPU 放置可用'}` : '没有声明兼容的设备感知节点；保持 ComfyUI 默认。'}</small></div><em>{item.node ?? '不可用'}</em></div>)}</div><div className="runtime-launch-report"><span><strong>ComfyUI 内存策略</strong><small>{runtimeMemoryPolicy}{status.stats?.system?.pytorch_version ? ` · PyTorch ${status.stats.system.pytorch_version}` : ''}</small></span><span><strong>动态显存</strong><small>{!runtimeArgs.length ? '此服务器未报告' : hasRuntimeArg('--disable-dynamic-vram') ? '已由启动参数禁用' : '未被启动参数禁用'}</small></span><span><strong>异步卸载</strong><small>{!runtimeArgs.length ? '此服务器未报告' : hasRuntimeArg('--disable-async-offload') ? '已由启动参数禁用' : '没有报告禁用参数'}</small></span></div><p className="field-help">检测到选择器只意味着图可以请求放置，不代表渲染真的在那里成功过。更换 GPU、驱动、ComfyUI 版本或自定义节点之后，请重新运行放置诊断。核心 <code>SelectVAEDevice</code> 支持另一块 GPU，但有意不支持 CPU；CPU VAE 需要 <code>VAELoaderMultiGPU</code>。</p></details>
      <div className="gpu-routing-grid">{routingRows.map((row) => { const placement = gpuRoutingPlan.placements[row.key]; const selected = settings.gpuRouting[row.setting] ?? 'auto'; return <div className="gpu-routing-row" key={row.key}><span className={`routing-status ${placement.status}`} title={placement.note ?? placement.status} /><SelectField label={row.label} value={settings.gpuRouting.preset === 'custom' ? selected : placement.resolved} disabled={settings.gpuRouting.preset !== 'custom'} onChange={(device) => updateGpuRouting({ preset: 'custom', [row.setting]: device })} options={gpuDeviceOptions} /><small>{placement.resolved === 'auto' ? '解析为：ComfyUI 默认' : `解析为：${placement.resolved === 'cpu' ? 'CPU' : `cuda:${placement.resolved.slice(4)}`} · ${placement.route?.nodeType ?? '回退'}`}</small></div> })}</div>
      <div className="gpu-routing-summary"><strong>{gpuRoutingPlan.summary}</strong><small>{gpuRoutingPlan.workflow.strategy === 'sequential' ? '文本编码在解码前运行；兼容的 MultiGPU 加载器会在组件阶段之间卸载到 CPU。' : gpuRoutingPlan.workflow.strategy === 'cpu-fallback' ? '不支持或内存受限的自动放置会安全回退，而不是声称占用某个 GPU。' : '组件保持常驻，直到 ComfyUI 释放它们。'}</small></div>
      {gpuRoutingPlan.warnings.map((warning) => <p className="settings-warning" key={warning}><AlertCircle size={15} />{warning}</p>)}
      {gpuRoutingPlan.vramWarnings.map((warning) => <p className="settings-warning" key={warning}><AlertCircle size={15} />{warning}</p>)}
      <label className="settings-check"><input type="checkbox" checked={settings.gpuRouting.allowOvercommit} onChange={(event) => updateGpuRouting({ allowOvercommit: event.target.checked })} /><span><strong>忽略显存估算仍渲染</strong><small>当路由组件的估算超过当前空闲显存时，需要开启此项才能继续。ComfyUI 仍可能卸载或拒绝任务。</small></span></label>
      <div className="diagnostic-action"><span><strong>放置诊断</strong><small>通过每个已选加载器与完整的视频/音频 VAE 解码，排队一次两秒的 H3 渲染。</small></span><button className="secondary-button" disabled={!status.connected || !h3Report.ready} onClick={() => void testGpuRouting()}><Activity size={15} />测试 GPU 路由</button></div>{gpuDiagnosticStatus && <p className="settings-note" role="status">{gpuDiagnosticStatus}</p>}
      <p className="settings-note">可用时使用当前 ComfyUI 核心的 Select Device 节点，否则使用 <a href="https://github.com/pollockjj/ComfyUI-MultiGPU" target="_blank" rel="noreferrer">ComfyUI-MultiGPU</a> 的设备感知加载器。CPU VAE 路由需要后者，因为 ComfyUI 的原生 VAE 选择器有意拒绝 CPU。</p>
    </section>
    <section className="settings-section performance-settings" id="settings-performance"><div className="settings-heading"><div><Gauge size={19} /><span><strong>渲染性能</strong><small>全局注意力加速。所选后端会应用到每个兼容的新 H3、Ref2VA、LTX 与 ACE-Step 图。</small></span></div><span className={`health-pill ${selectedAttention ? 'online' : ''}`}>{selectedAttention ? '就绪' : '需要配置'}</span></div><fieldset className="attention-backend-picker"><legend>注意力后端</legend><label className={settings.attentionBackend === 'automatic' ? 'selected' : ''}><input type="radio" name="attention-backend" checked={settings.attentionBackend === 'automatic'} onChange={() => setSettings({ ...settings, attentionBackend: 'automatic' })} /><span><strong>自动</strong><small>{kitchenAttention ? `检测到时使用 ${kitchenAttention}，其次 SageAttention，再退回原生。` : sageAttention ? `检测到时使用 ${sageAttention}，再退回原生。` : '在检测到加速后端之前使用原生后端。'}</small></span></label><label className={settings.attentionBackend === 'kitchen' ? 'selected' : ''}><input type="radio" name="attention-backend" checked={settings.attentionBackend === 'kitchen'} onChange={() => setSettings({ ...settings, attentionBackend: 'kitchen' })} /><span><strong>Kitchen INT8</strong><small>{kitchenAttention ? `已检测：${kitchenAttention}` : '未检测到——图会安全地使用原生注意力。'}</small></span></label><label className={settings.attentionBackend === 'sage' ? 'selected' : ''}><input type="radio" name="attention-backend" checked={settings.attentionBackend === 'sage'} onChange={() => setSettings({ ...settings, attentionBackend: 'sage' })} /><span><strong>SageAttention</strong><small>{sageAttention ? `已检测：${sageAttention}` : '需要正在运行的 ComfyUI 环境启用 SageAttention。'}</small></span></label><label className={settings.attentionBackend === 'native' ? 'selected' : ''}><input type="radio" name="attention-backend" checked={settings.attentionBackend === 'native'} onChange={() => setSettings({ ...settings, attentionBackend: 'native' })} /><span><strong>原生</strong><small>{nativeAttention ? `已检测：${nativeAttention}` : '使用 ComfyUI 的标准注意力实现。'}</small></span></label></fieldset><label className="settings-check"><input type="checkbox" checked={settings.h3ParallelAttentionEnabled} disabled={!h3ParallelAttentionNode || !kitchenAttention} onChange={(event) => setSettings({ ...settings, h3ParallelAttentionEnabled: event.target.checked, attentionBackend: event.target.checked ? 'kitchen' : settings.attentionBackend })} /><span><strong>把一次 H3 Ref2VA 渲染加速到多块 GPU 上</strong><small>{h3ParallelAttentionNode && kitchenAttention ? `准备配合 Kitchen INT8 使用 ${h3ParallelAttentionNode}。该节点会验证对等访问并自动使用最多四块可见 GPU。` : '需要 H3 Parallel 自定义节点和已检测的 Kitchen INT8 注意力后端。两者都被检测到之前，使用正常的单 GPU 图。'}</small></span></label><div className="settings-note"><strong>H3 Parallel 配置</strong><br />1. 在 ComfyUI Manager 中选择 <em>Install via Git URL（通过 Git URL 安装）</em> 并输入 <code>https://github.com/AesSedai/ComfyUI-MiniMaxH3-Parallel.git</code>。<br />2. 安装或更新 <code>comfy-kitchen</code>（0.2.31+），然后用 <code>--use-ck-attention</code> 启动唯一的 ComfyUI 进程，并暴露 2–4 块 NVIDIA GPU，例如 <code>CUDA_VISIBLE_DEVICES=0,1 python main.py --use-ck-attention</code>。<br />3. 重启 ComfyUI 并测试连接。只有在 Parallel 节点与 Kitchen INT8 都显示就绪后再启用本选项。它只作用于新的 H3 Ref2VA 视频渲染；不能与 SageAttention 或 Torch Compile 组合。</div>{!attentionBackends.length && <p className="settings-warning"><AlertCircle size={15} />这台 ComfyUI 服务器还没有报告 <code>ModelAttentionBackend</code>。请更新/重启 ComfyUI Desktop，然后重新测试连接。检测到它之前不会发送加速图。</p>}</section>
    <section className="settings-section attention-benchmark-section" id="settings-benchmark"><div className="settings-heading"><div><Clock3 size={19} /><span><strong>注意力基准</strong><small>让一条标准化的文生视频 Turbo 8 片段依次经过 Kitchen INT8、SageAttention 与 Sol-Attn。</small></span></div><span className={`health-pill ${benchmarkWinner ? 'online' : ''}`}>{benchmarkWinner ? '已测量' : '未运行'}</span></div><div className="benchmark-controls"><label><span>片段时长</span><div><input type="number" min="1" max="60" step="1" disabled={benchmarkRunning} value={benchmarkConfig.duration} onChange={(event) => setBenchmarkConfig({ ...benchmarkConfig, duration: Math.max(1, Math.min(60, Math.round(Number(event.target.value) || 1))) })} /><small>秒</small></div></label><label><span>分辨率</span><select disabled={benchmarkRunning} value={benchmarkConfig.resolution} onChange={(event) => setBenchmarkConfig({ ...benchmarkConfig, resolution: event.target.value })}>{MINIMAX_VIDEO_RESOLUTIONS.map((resolution) => <option key={resolution} value={resolution}>{resolution.replace('x', ' × ')}</option>)}</select></label></div><div className="diagnostic-action"><span><strong>针对这台电脑的推荐</strong><small>{benchmarkConfig.resolution.replace('x', ' × ')} · {benchmarkConfig.duration} 秒 · 8 步 · 固定种子 · 相同的提示词与模型栈。计时包含从队列提交到完整视频输出的全过程。</small></span><button type="button" className="primary-button" disabled={benchmarkRunning || !status.connected || !h3Report.ready} onClick={onRunBenchmark}>{benchmarkRunning ? <LoaderCircle className="spin" size={15} /> : <Clock3 size={15} />}{benchmarkRunning ? '基准测试运行中…' : '运行基准测试'}</button></div>{benchmarkResults.length > 0 && <div className="benchmark-results" aria-live="polite">{benchmarkResults.map((result) => <div className="benchmark-result-row" key={result.backend}><div><strong>{result.label}</strong><small>{result.status === 'completed' ? `总耗时 ${formatBenchmarkDuration(result.elapsedMs)} · 有效渲染 ${formatBenchmarkDuration(result.renderMs)}` : result.status === 'running' ? '正在渲染…' : result.status === 'unavailable' ? '不可用' : result.status === 'failed' ? '失败' : '等待中'}</small></div><span className={`health-pill ${result.status === 'completed' ? 'online' : ''}`}>{result.status === 'completed' ? formatBenchmarkDuration(result.elapsedMs) : result.status === 'running' ? <LoaderCircle className="spin" size={13} /> : result.status}</span>{result.error && result.status !== 'unavailable' && <small className="field-help">{result.error}</small>}</div>)}</div>}{benchmarkWinner && <div className="settings-note benchmark-recommendation"><strong>{benchmarkMachine} 的推荐：</strong>在 H3 文生视频中使用 <strong>{benchmarkWinner.label}</strong>。它总共耗时 {formatBenchmarkDuration(benchmarkWinner.elapsedMs)}（其中有效渲染 {formatBenchmarkDuration(benchmarkWinner.renderMs)}），完成了 {benchmarkConfig.duration} 秒的 {benchmarkConfig.resolution.replace('x', ' × ')} 片段。更改模型、GPU 路由、ComfyUI 启动参数或驱动版本后请重新运行。</div>}</section>
    <section className="settings-section workflow-export-section" id="settings-workflows"><div className="settings-heading"><div><Save size={19} /><span><strong>ComfyUI 工作流导出</strong><small>保存一个 API 格式的工作流，可直接在 ComfyUI 中排队。它使用已索引的模型文件名和所选的注意力后端。</small></span></div></div><div className="workflow-export-controls"><label>工作流模板<select value={workflowKind} onChange={(event) => setWorkflowKind(event.target.value as typeof workflowKind)}><option value="h3-i2v">MiniMax H3 图生视频 / 文生视频</option><option value="ref2va">MiniMax H3 Ref2VA</option><option value="ltx">LTX 2.5 视频</option><option value="zimage">Z-Image 静图</option><option value="acestep">ACE-Step 1.5 音频</option></select></label><button type="button" className="secondary-button" onClick={() => void exportWorkflow()}><Save size={15} />导出工作流 JSON</button></div><p className="field-help">导出的是 ComfyUI 的 API 提示词 JSON，而不是截图或应用预设。参考媒体模板包含一条清晰的占位提示词；排队前请在 ComfyUI 中接上你自己的输入/参考节点。{selectedAttention ? `将把 ${attentionBackendLabel(selectedAttention)} 作为 ModelAttentionBackend 节点包含进去。` : '在 ComfyUI 报告兼容后端之前，不会添加任何加速节点。'}</p>{workflowExportStatus && <p className="settings-note workflow-export-status" role="status">{workflowExportStatus}</p>}</section>
    <section className="settings-section sol-engine-settings" aria-labelledby="sol-engine-title">
      <div className="settings-heading"><div><Gauge size={19} /><span><strong id="sol-engine-title">NVIDIA Sol 引擎</strong><small>通过 ComfyUI 提供 H3 专属的稀疏视频注意力。</small></span></div><span className={`health-pill ${solAttentionNode ? 'online' : ''}`}>{solAttentionNode ? '已检测' : '安装节点'}</span></div>
      <label className={`settings-check ${settings.attentionBackend === 'sol' ? 'selected' : ''}`}><input type="radio" name="attention-backend" checked={settings.attentionBackend === 'sol'} disabled={!solAttentionNode} onChange={() => setSettings({ ...settings, attentionBackend: 'sol', h3ParallelAttentionEnabled: false })} /><span><strong>对 MiniMax H3 视频使用 Sol-Attn</strong><small>{solAttentionNode ? `通过 ${solAttentionNode} 就绪。H3 与 Ref2VA 只使用 Sol；LTX、Z-Image 与 ACE-Step 使用 ${kitchenAttention ?? 'ComfyUI 默认注意力'}。` : '请安装 ComfyUI-SolAttn-H3，重启 ComfyUI，然后测试连接。'}</small></span></label>
      <fieldset className="attention-backend-picker h3-precision-picker"><legend>H3 扩散权重格式</legend><label className={settings.h3DiffusionPrecision === 'int8' ? 'selected' : ''}><input type="radio" name="h3-diffusion-precision" checked={settings.h3DiffusionPrecision === 'int8'} onChange={() => setSettings({ ...settings, h3DiffusionPrecision: 'int8' })} /><span><strong>INT8 ConvRot 权重</strong><small>推荐用于这块 RTX 3090 · 原生 CUDA 13 路径 · 当前速度/画质平衡最佳。</small></span></label><label className={settings.h3DiffusionPrecision === 'nvfp4' ? 'selected' : ''}><input type="radio" name="h3-diffusion-precision" checked={settings.h3DiffusionPrecision === 'nvfp4'} onChange={() => setSettings({ ...settings, h3DiffusionPrecision: 'nvfp4' })} /><span><strong>NVFP4 · 实验性</strong><small>{nvfp4DiffusionReady ? '已检测到 FL2VA 与 Ref2VA。新的 H3、Sol 与 Turbo 8 工作流会使用它们。' : `请安装 ${!nvfp4Fl2vaInstalled && !nvfp4Ref2vaInstalled ? '两个扩散模型文件' : !nvfp4Fl2vaInstalled ? 'FL2VA' : 'Ref2VA'}。在此之前，应用会回退到已安装的 INT8 组合。`}</small></span></label></fieldset>
      <div className="settings-note nvfp4-download-panel"><strong>NVFP4 下载</strong><p>这些扩散转换是社区文件。原生 NVFP4 扩散执行面向 Blackwell GPU；RTX 3090 只能模拟运行，可能比 INT8 ConvRot 更慢或出现更多瑕疵。</p><div><a className="secondary-button" href="https://huggingface.co/lilcheaty/MiniMax-H3-NVFP4/resolve/main/minimax_h3_fl2va_pruned_nvfp4.safetensors?download=true" target="_blank" rel="noreferrer"><Download size={14} />FL2VA NVFP4 权重 · 12.5 GB</a><a className="secondary-button" href="https://huggingface.co/lilcheaty/MiniMax-H3-NVFP4/resolve/main/minimax_h3_ref2va_pruned_nvfp4.safetensors?download=true" target="_blank" rel="noreferrer"><Download size={14} />Ref2VA NVFP4 权重 · 12.5 GB</a><a className="secondary-button" href="https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors?download=true" target="_blank" rel="noreferrer"><Download size={14} />官方文本编码器 · 15.7 GB</a></div><small>把 FL2VA 与 Ref2VA 放到 <code>ComfyUI/models/diffusion_models</code>；把 Qwen 文本编码器放到 <code>ComfyUI/models/text_encoders</code>。之后重启或重新扫描模型。</small></div>
      <div className="field-group"><label htmlFor="sol-attn-tau">路由阈值（tau）</label><input id="sol-attn-tau" type="number" min="-1000" max="10" step="0.05" value={settings.solAttnTau} disabled={!solAttentionNode} onChange={(event) => setSettings({ ...settings, solAttnTau: Math.max(-1000, Math.min(10, Number(event.target.value) || 1)) })} /><p className="field-help">1.0 是 NVIDIA 验证过的 H3 策略。更高的值会计算更少的 key/value 块，可能改变输出质量。</p></div>
      <label className="settings-check"><input type="checkbox" checked={settings.solCacheEnabled} disabled={!solCacheNode} onChange={(event) => setSettings({ ...settings, solCacheEnabled: event.target.checked })} /><span><strong>添加 NVIDIA 风格的跨步缓存</strong><small>{solCacheNode ? `已检测：${solCacheNode}。在 Sol-Attn 之前使用阈值 0.10 并最多保留五步。` : '请安装兼容的 ComfyUI-MiniMaxH3-Cache 节点。其他缓存族不会被自动替换，因为它们的钩子可能与 Sol 冲突。'}</small></span></label>
      <div className={`sol-runtime-panel ${solRuntimeDiagnostics.state}`}><div><strong>Sol 运行时诊断</strong><span>{solRuntimeLabel(solRuntimeDiagnostics)}</span></div><small>策略：tau 1.0 · diag · 20% 稠密预热 · 前 2 个稠密层 · prefix sink · 正确性校验 · KV splits 1。SageAttention 是启动层级的稠密回退；Sol 图不会添加 Sage 补丁节点。</small><div className="sol-runtime-metrics"><span>后端 {solRuntimeDiagnostics.backend ?? '等待运行时日志'}</span><span>稀疏 {solRuntimeDiagnostics.sparseCalls ?? '—'}</span><span>稠密 {solRuntimeDiagnostics.denseCalls ?? '—'}</span><span>密度 {solRuntimeDiagnostics.density ?? '—'}</span><span>序列 {solRuntimeDiagnostics.sequenceLength?.toLocaleString() ?? '—'}</span><span>校验 {solRuntimeDiagnostics.correctnessGate ?? '—'}</span></div></div>
      <div className="settings-note"><strong>需要配置 ComfyUI</strong><br />ComfyUI Desktop 使用受管理的 Python 环境。请把自定义节点与 NVIDIA kernel 都安装到那里，然后重启并测试连接。</div>
      <div className="sol-engine-actions"><button type="button" className="secondary-button sol-guide-button" onClick={() => setSolGuideOpen(true)}>如何安装 Sol-Attn</button><button type="button" className="primary-button" disabled={!status.connected || !solAttentionNode || !h3Report.ready} onClick={() => void testSolEngine()}>{!status.connected ? '连接 ComfyUI 后才能测试' : '测试 Sol 引擎'}</button></div>
      {solTestStatus && <p className={`settings-note ${solTestStatus.startsWith('Sol 测试失败') ? 'error' : ''}`} role="status">{solTestStatus}</p>}
    </section>
    <section className="settings-section h3-stack-section" id="settings-h3">
      <div className="settings-heading"><div><Gauge size={19} /><span><strong>H3 引擎栈</strong><small>把所选文件与已验证的官方 ComfyUI 栈进行对比。</small></span></div><span className={`health-pill ${h3Report.validated ? 'online' : ''}`}>{h3Report.validated ? '已验证' : h3Report.ready ? '自定义' : '未完整'}</span></div>
      <div className="h3-stack-list">{h3Report.rows.map((row) => <div key={row.label} className={row.validated ? 'validated' : row.optional && !row.selected ? 'optional' : 'custom'}><span>{row.validated ? <Check size={14} /> : row.optional && !row.selected ? <Minus size={14} /> : <AlertCircle size={14} />}</span><div><strong>{row.label}</strong><small title={row.selected || row.expected}>{row.selected || `${row.optional ? '可选' : '缺失'} · 期望 ${row.expected}`}</small></div><em>{row.validated ? '推荐' : row.selected ? '非标准' : row.optional ? '可选' : '缺失'}</em></div>)}</div>
      {!h3Report.validated && <p className="settings-warning"><AlertCircle size={15} />部分组件与已验证的 H3 栈不同。生成仍然可用，但输出质量可能有差异。</p>}
      <div className="diagnostic-action"><span><strong>固定画质对比</strong><small>按 1344 × 768、5 秒、种子 12345、无放大排队原生画质与 Turbo 8。</small></span><button className="secondary-button" disabled={!status.connected || diagnosticRunning || !h3Report.ready} onClick={onRunDiagnostics}>{diagnosticRunning ? <LoaderCircle className="spin" size={15} /> : <Activity size={15} />}{diagnosticRunning ? '正在排队测试…' : '运行 H3 画质测试'}</button></div>
    </section>
    <section className="settings-section generation-defaults-section" id="settings-defaults">
      <div className="settings-heading"><div><SlidersHorizontal size={19} /><span><strong>生成默认值</strong><small>选择主创作工作区的起始值。</small></span></div><button className="secondary-button" onClick={onApplyDefaults}>应用到创作</button></div>
      <div className="preset-row" aria-label="生成预设">
        <button type="button" onClick={() => applyPreset('quality')}><strong>原生画质</strong><small>1344 × 768 · 30 步 · 无放大</small></button>
        <button type="button" onClick={() => applyPreset('official-turbo')}><strong>Turbo 8</strong><small>原生画幅 · 官方 LoRA 1.0</small></button>
        <button type="button" onClick={() => applyPreset('preview')}><strong>预览</strong><small>864 × 480 · 官方 Turbo 8</small></button>
      </div>
      <div className="render-preset-manager" aria-labelledby="render-preset-manager-title"><div><span><Save size={15} /><span><strong id="render-preset-manager-title">已保存的 Ref2VA 意图</strong><small>意图保存分辨率、时长、Turbo 配置、步数、保真度、采样、偏移与放大设置。提示词与源媒体永远不会被包含。</small></span></span><span>{settings.renderSettingsPresets.length} 个已保存</span></div><form onSubmit={(event) => { event.preventDefault(); saveRenderPreset() }}><label><span>把当前默认值保存为一个意图</span><input value={presetName} maxLength={60} onChange={(event) => setPresetName(event.target.value)} placeholder="例如：对白特写" /></label><button className="secondary-button" type="submit" disabled={!presetName.trim()}><Plus size={14} />保存意图</button></form>{settings.renderSettingsPresets.length > 0 && <div className="render-preset-list">{settings.renderSettingsPresets.map((preset) => <article key={preset.id}><span><strong>{preset.name}</strong><small>{preset.values.resolution.replace('x', ' × ')} · {preset.values.duration} 秒 · {preset.values.turbo === 'off' ? `${preset.values.steps} 步` : `Turbo ${preset.values.turbo} · ${preset.values.turbo === '8' ? `${preset.values.steps} 步 · ${preset.values.turbo8Profile}` : '4 步'}`}</small></span><div><button type="button" className="secondary-button" onClick={() => applyRenderPreset(preset)}>加载</button><button type="button" className="icon-button" onClick={() => renameRenderPreset(preset)} aria-label={`重命名 ${preset.name}`}><Pencil size={14} /></button><button type="button" className="icon-button" onClick={() => deleteRenderPreset(preset)} aria-label={`删除 ${preset.name}`}><Trash2 size={14} /></button></div></article>)}</div>}</div>
      <div className="generation-defaults-grid">
        <SelectField label="默认分辨率" value={defaults.resolution} onChange={(resolution) => updateDefaults({ resolution })} options={['608x352', '864x480', '1056x608', '1344x768', '768x1344', '768x768'].map((value) => [value, value.replace('x', ' × ')])} />
        <NumberField label="默认时长（秒）" value={defaults.duration} min={2} max={15} step={0.5} onChange={(duration) => updateDefaults({ duration })} />
        <SelectField label="默认画质" value={defaults.turbo === '4' ? '8' : defaults.turbo} onChange={(turbo) => updateDefaults({ turbo: turbo as 'off' | '8', ...(turbo === 'off' ? { steps: 30 } : {}) })} options={[["off", '原生画质 · 30 步'], ["8", '官方 Turbo 8']]} />
        <SelectField label="Turbo 8 配置" value={defaults.turbo8Profile} onChange={(turbo8Profile) => updateDefaults({ turbo8Profile: turbo8Profile as Turbo8Profile })} options={[["stable", '稳定 · Euler + Simple'], ["balanced", '均衡 · res_multistep + Simple'], ["motion", '运动 · res_multistep + Beta'], ["euler-beta", 'Euler + Beta · 受控测试']]} />
        <SelectField label="默认文本编码器" value={defaults.textEncoderPreference} onChange={(textEncoderPreference) => updateDefaults({ textEncoderPreference: textEncoderPreference as 'fast' | 'quality' })} options={[["fast", '极速 · NVFP4-AWQ · 15.7 GB'], ["quality", '更慢 · 编码更好 · INT8 ConvRot · 27.1 GB']]} />
        <NumberField label="全画质步数" value={defaults.steps} min={16} max={30} onChange={(steps) => updateDefaults({ steps })} />
        <SelectField label="参考图保真度" value={defaults.refImageSize} onChange={(refImageSize) => updateDefaults({ refImageSize: refImageSize as 'match' | 'max' })} options={[["match", '均衡 · 更快'], ["max", '最大身份保留 · 更慢']]} />
        <SelectField label="默认精修与放大" value={defaults.upscaleMode} onChange={(upscaleMode) => updateDefaults({ upscaleMode: upscaleMode as UpscaleMode })} options={[["off", '关闭 · 最快'], ["refine", '精修 · 原分辨率'], ["h3", '精修 + 放大 · H3 2×'], ["ltx", 'LTX 2.5 潜空间 · 2×'], ["rtx", 'RTX/CUDA 帧 · 2× · 实验性']]} />
        <label className="settings-check"><input type="checkbox" checked={defaults.livePreview} onChange={(event) => updateDefaults({ livePreview: event.target.checked })} /><span><strong>默认开启实时预览</strong><small>使用 ComfyUI 的进度与预览事件。</small></span></label>
      </div>
      <details className="experimental-settings"><summary><AlertCircle size={15} /><span><strong>实验性采样</strong><small>自定义采样器、偏移、官方 Turbo LoRA 权重以及 4 步 FL2V 都可能降低输出稳定性。</small></span><ChevronDown size={15} /></summary><div className="generation-defaults-grid"><label className="settings-check"><input type="checkbox" checked={defaults.experimentalSampling} onChange={(event) => updateDefaults({ experimentalSampling: event.target.checked })} /><span><strong>启用自定义采样器</strong><small>否则强制使用 res_multistep + simple。</small></span></label><SelectField label="实验性 Turbo 覆盖" value={defaults.turbo} onChange={(turbo) => updateDefaults({ turbo: turbo as 'off' | '4' | '8' })} options={[["off", '关闭'], ["8", '官方 8 步'], ["4", '4 步预览测试', !turbo4Available]]} /><div className="turbo-lora-weight"><NumberField label="官方 Turbo LoRA 权重" value={defaults.loraStrength} min={0} max={2} step={0.05} onChange={(loraStrength) => updateDefaults({ loraStrength })} /><small>设置自动 Turbo 适配器的权重；手动添加的额外 ComfyUI LoRA 使用各自的强度。</small></div><SelectField label="采样器" value={defaults.experimentalSampling ? defaults.sampler : 'res_multistep'} disabled={!defaults.experimentalSampling} onChange={(sampler) => updateDefaults({ sampler })} options={samplerOptions.map((value) => [value, value])} /><SelectField label="调度器" value={defaults.experimentalSampling ? defaults.scheduler : 'simple'} disabled={!defaults.experimentalSampling} onChange={(scheduler) => updateDefaults({ scheduler })} options={schedulerOptions.map((value) => [value, value])} /><SelectField label="Sigma 偏移" value={defaults.sigmaShiftMode} onChange={(sigmaShiftMode) => updateDefaults({ sigmaShiftMode: sigmaShiftMode as 'model' | 'custom' })} options={[["model", '模型默认 · 12 / 3'], ["custom", '自定义 MiniMaxH3SigmaShift 节点']]} /><NumberField label="视频偏移" value={defaults.shiftVideo} min={0.01} max={100} step={0.01} disabled={defaults.sigmaShiftMode !== 'custom'} onChange={(shiftVideo) => updateDefaults({ shiftVideo })} /><NumberField label="音频偏移" value={defaults.shiftAudio} min={0.01} max={100} step={0.01} disabled={defaults.sigmaShiftMode !== 'custom'} onChange={(shiftAudio) => updateDefaults({ shiftAudio })} /></div></details>
      {warnedSampler && <p className="settings-warning"><AlertCircle size={15} />这个采样器在你提供的兼容风险清单上。在提交最终渲染之前，请先用短片段测试。</p>}
      <p className="settings-note">生产路径是 1344 × 768、30 步、res_multistep + simple、CFG 1、denoise 1、24 fps、原生 12/3 偏移，且关闭放大。自定义采样之所以被有意分开，是因为它会让画质诊断变复杂。</p>
    </section>
    <section className="settings-section character-detail-addon-section" id="settings-assistant">
      <div className="settings-heading"><div><ImageIcon size={19} /><span><strong>角色细节参考图</strong><small>为角色添加自定义命名的聚焦视觉参考的可选扩展。</small></span></div><span className={`health-pill ${settings.characterDetailReferencesEnabled ? 'online' : ''}`}>{settings.characterDetailReferencesEnabled ? '已启用' : '关闭'}</span></div>
      <label className="settings-check"><input type="checkbox" checked={settings.characterDetailReferencesEnabled} onChange={(event) => setSettings({ ...settings, characterDetailReferencesEnabled: event.target.checked })} /><span><strong>启用角色细节参考图</strong><small>角色工作室可以为任意身体部位或你命名的视觉细节保存一张上传图片与可选的渲染备注。启用后，这些参考会计入角色的 MiniMax 参考图预算；应用不会强加固定的身体部位分类。</small></span></label>
    </section>
    <section className="settings-section experimental-msr-section"><div className="settings-heading"><div><Aperture size={19} /><span><strong>实验性 · LTX 2.5 MSR 参考</strong><small>为 LTX 2.5 选择启用 Licon MSR 多参考条件控制。</small></span></div><span className={`health-pill ${settings.experimentalLtxMsrEnabled ? 'online' : ''}`}>{settings.experimentalLtxMsrEnabled ? '已启用' : '关闭'}</span></div><label className="settings-check"><input type="checkbox" checked={settings.experimentalLtxMsrEnabled} onChange={(event) => setSettings({ ...settings, experimentalLtxMsrEnabled: event.target.checked })} /><span><strong>启用 Licon MSR 参考模式</strong><small>只有检测到对应节点与兼容 LoRA 后才会启用这条实验性 LTX 参考路径。由于这是第三方扩展，它默认保持关闭。</small></span></label><div className="settings-note"><strong>ComfyUI 安装</strong><br />1. 在 <code>ComfyUI/custom_nodes</code> 中运行 <code>git clone https://github.com/liconstudio/ComfyUI-LTX2.5-MSR</code>。<br />2. 用你的 ComfyUI Python 安装它的依赖：<code>pip install -r ComfyUI-LTX2.5-MSR/requirements.txt</code>。<br />3. 从 Licon MSR V1 发布页下载 <code>LTX-2.5-Licon-MSR-V1.safetensors</code> 到 <code>ComfyUI/models/loras/ltx2.5/</code>。<br />4. 重启 ComfyUI，测试连接并重新扫描模型。应用要求 <code>ComfyUILTX25MSRICLoRALoader</code> 与 <code>ComfyUILTX25MSRMultiReferenceGuide</code>。用「Image 1」–「Image 4」表示主体/物品，「Image 5」表示背景；在提示词中用「Image 1」「Image 2」等英文 token 描述每个角色。</div></section>
    <section className="settings-section ollama-section">
      <div className="settings-heading">
        <div><Sparkles size={19} /><span><strong>本地 AI 提示词助手</strong><small>Ollama 仍是默认项；LM Studio 是可选的本地提供方。</small></span></div>
        <span className={`health-pill ${currentLlmStatus?.connected ? 'online' : ''}`}>{llmHealthLabel}</span>
      </div>
      <fieldset className="llm-provider-picker">
        <legend>提供方</legend>
        <label className={settings.llmProvider === 'ollama' ? 'selected' : ''}><input type="radio" name="llm-provider" value="ollama" checked={settings.llmProvider === 'ollama'} onChange={() => setSettings({ ...settings, llmProvider: 'ollama' })} /><span><strong>Ollama</strong><small>默认 · 原生本地 API</small></span></label>
        <label className={settings.llmProvider === 'lmstudio' ? 'selected' : ''}><input type="radio" name="llm-provider" value="lmstudio" checked={settings.llmProvider === 'lmstudio'} onChange={() => setSettings({ ...settings, llmProvider: 'lmstudio' })} /><span><strong>LM Studio</strong><small>可选 · 需显式启用</small></span></label>
      </fieldset>
      <div className="ollama-grid">
        <div className="field-group"><label htmlFor="llm-url">{llm.label} 地址</label><input id="llm-url" value={settings[activeUrlField]} onChange={(event) => setSettings({ ...settings, [activeUrlField]: event.target.value })} /></div>
        <div className="field-group"><label htmlFor="llm-model">本地模型</label><div className="select-wrap"><select id="llm-model" value={settings[activeModelField]} onChange={(event) => setSettings({ ...settings, [activeModelField]: event.target.value })} disabled={ollamaModels.length === 0}>{ollamaModels.length === 0 ? <option value="">未检测到本地模型</option> : ollamaModels.map((model) => <option value={model.name} key={model.name}>{model.name}{model.parameterSize ? ` · ${model.parameterSize}` : ''}</option>)}</select><ChevronDown size={15} /></div></div>
        <button className="secondary-button test-button" onClick={onRefreshOllama} disabled={localLlmChecking}>{localLlmChecking ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />}{localLlmChecking ? '检查中…' : '测试并刷新'}</button>
      </div>
      {currentLlmStatus?.error && <div className="llm-setup-message error"><AlertCircle size={16} /><span><strong>无法连接到 {llm.label}</strong><small>{currentLlmStatus.error}</small></span></div>}
      {currentLlmStatus?.connected && ollamaModels.length === 0 && <div className="llm-setup-message warning"><Download size={16} /><span><strong>{llm.label} 正在运行，但没有可用的本地模型</strong><small>{settings.llmProvider === 'ollama' ? <>打开终端，运行 <code>ollama pull qwen3:latest</code>，等待完成，然后选择<b>测试并刷新</b>。</> : '在 LM Studio 中安装一个文本生成模型，然后选择测试并刷新。模型不需要先加载。'}</small></span></div>}
      {settings.llmProvider === 'ollama' && !currentLlmStatus && <div className="llm-setup-message"><Sparkles size={16} /><span><strong>Ollama 配置</strong><small>1. 安装并启动 Ollama。 2. 在终端中运行 <code>ollama pull qwen3:latest</code>。 3. 除非 Ollama 使用其他端口，否则保留默认地址。 4. 选择<b>测试并刷新</b>。</small></span></div>}
      <p className="settings-note">{settings.llmProvider === 'lmstudio' ? 'LM Studio 只允许环回地址（localhost、127.0.0.1 或 ::1）。启动它的本地服务器即可检测已安装的文本模型；需要时 LM Studio 可以加载所选模型。' : '提示词与参考图会直接发送到所选的本地 Ollama 服务器。嵌入类与云服务条目会被排除。图像分析需要具备视觉能力的模型；纯文本模型仍然支持提示词打磨。'}</p>
    </section>
    <section className="settings-section" id="settings-models"><div className="settings-heading"><div><HardDrive size={19} /><span><strong>模型位置</strong><small>文件在原地被索引，永远不会被移动或复制。已连接的 ComfyUI 引擎自己的模型文件夹也会列出，因此远程引擎的文件无需本地副本即可被检测到。</small></span></div><button className="secondary-button" onClick={onScan} disabled={scanning}>{scanning ? <LoaderCircle size={16} className="spin" /> : <RefreshCw size={16} />}{scanning ? '扫描中…' : '重新扫描'}</button></div><div className="path-table">{pathRows.map((row) => { const count = models.filter((model) => model.kind === row.kind).length; return <div className="path-row" key={row.kind}><div className="path-kind"><Folder size={17} /><span><strong>{row.label}</strong><small>{row.note}</small></span></div><div className="path-input"><input value={settings.paths[row.kind]} onChange={(event) => setSettings({ ...settings, paths: { ...settings.paths, [row.kind]: event.target.value } })} /><button onClick={async () => { const path = await window.minimax.chooseDirectory(settings.paths[row.kind]); if (path) setSettings({ ...settings, paths: { ...settings.paths, [row.kind]: path } }) }} aria-label={`浏览 ${row.label} 文件夹`}><FolderOpen size={17} /></button></div><span className="file-count">{count} 个文件</span></div>})}</div></section>
    <section className="settings-section" id="settings-storage"><div className="settings-heading"><div><FolderOpen size={19} /><span><strong>输出与剪辑工具</strong><small>完成的视频、抽取的帧和剪辑器导出都保留在本地。</small></span></div></div>{detectedOutputDirectory && <p className={`settings-note ${outputDirectoryMismatch ? 'warning' : ''}`} role="status">正在运行的 ComfyUI 输出目录：<code>{detectedOutputDirectory}</code>{outputDirectoryMismatch && <button type="button" className="secondary-button" onClick={() => setSettings({ ...settings, outputDirectory: detectedOutputDirectory, clipMasterOutputDirectory: `${detectedOutputDirectory}\\video` })}>使用这个文件夹</button>}</p>}<div className="connection-row"><div className="field-group grow"><label htmlFor="output-path">ComfyUI 输出目录</label><input id="output-path" value={settings.outputDirectory} onChange={(event) => setSettings({ ...settings, outputDirectory: event.target.value })} /></div><button className="secondary-button test-button" onClick={async () => { const path = await window.minimax.chooseDirectory(settings.outputDirectory); if (path) setSettings({ ...settings, outputDirectory: path }) }}><FolderOpen size={16} />浏览</button></div><div className="connection-row"><div className="field-group grow"><label htmlFor="clip-master-output-path">片段工坊默认输出文件夹</label><input id="clip-master-output-path" value={settings.clipMasterOutputDirectory} onChange={(event) => setSettings({ ...settings, clipMasterOutputDirectory: event.target.value })} /></div><button className="secondary-button test-button" onClick={async () => { const path = await window.minimax.chooseDirectory(settings.clipMasterOutputDirectory); if (path) setSettings({ ...settings, clipMasterOutputDirectory: path }) }}><FolderOpen size={16} />浏览</button></div><p className="settings-note">默认为 ComfyUI/output/video。片段工坊会在这里创建一个独立的 ClipMaster/source-clip 文件夹存放帧，并在导出修剪后的视频时建议使用这个文件夹；保存对话框仍然可以使用其他位置。</p><div className="connection-row clip-tool-path"><div className="field-group grow"><label htmlFor="ffmpeg-path">FFmpeg 可执行文件</label><input id="ffmpeg-path" value={settings.ffmpegPath} onChange={(event) => setSettings({ ...settings, ffmpegPath: event.target.value })} /></div></div><p className="settings-note">片段编辑器使用 FFmpeg 完成抽帧、修剪点、拼接与整个项目的导出。</p><label className="settings-check"><input type="checkbox" checked={settings.blurNsfwLivePreviews} onChange={(event) => setSettings({ ...settings, blurNsfwLivePreviews: event.target.checked })} /><span><strong>模糊敏感实时预览</strong><small>启用后，如果渲染提示词包含露骨成人措辞，本地预览会模糊。悬停或用键盘聚焦预览即可查看。它永远不会阻止、更改或上传一次渲染。</small></span></label><LegacyMigrationControl status={legacyMigration} running={legacyMigrationRunning} onRun={onRunLegacyMigration} /></section>
    <section className="settings-section factory-reset-section" id="settings-reset">
      <div className="settings-heading"><div><RotateCcw size={19} /><span><strong>恢复出厂设置</strong><small>清除所有已保存的工作区、角色、素材、项目、预设与库历史。恢复默认设置。</small></span></div></div>
      <p className="settings-note">生成的媒体、导入的文件、模型与 ComfyUI 都会保留在磁盘上。应用记录无法通过撤销找回。请先完成或取消正在进行的生成，并关闭其他编辑器窗口。</p>
      {!factoryResetOpen ? <button type="button" className="danger-button" onClick={() => { setFactoryResetPhrase(''); setFactoryResetOpen(true) }}>重置整个工作区…</button> : <form className="factory-reset-confirm" onSubmit={(event) => { event.preventDefault(); if (factoryResetPhrase === 'Reset') { onFactoryReset(); setFactoryResetPhrase(''); setFactoryResetOpen(false) } }}>
        <label htmlFor="factory-reset-confirmation">输入 <strong>Reset</strong> 以确认<input id="factory-reset-confirmation" autoComplete="off" spellCheck={false} value={factoryResetPhrase} onChange={(event) => setFactoryResetPhrase(event.target.value)} /></label>
        <div><button type="button" className="secondary-button" onClick={() => { setFactoryResetOpen(false); setFactoryResetPhrase('') }}>取消</button><button type="submit" className="danger-button" disabled={factoryResetPhrase !== 'Reset'}>恢复出厂设置并重启</button></div>
      </form>}
    </section>
  </div></div>
  {solGuideOpen && <div className="tips-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSolGuideOpen(false) }}>
    <section className="tips-modal sol-guide-modal" role="dialog" aria-modal="true" aria-labelledby="sol-guide-title">
      <header><div><span className="tips-modal-icon"><Gauge size={18} /></span><span><small>NVIDIA SOL 引擎 · Windows</small><strong id="sol-guide-title">在 ComfyUI Desktop 中安装 Sol-Attn</strong><p>RTX 3090 · SM86 · Triton 后端 · 仅 MiniMax H3 视频</p></span></div><button type="button" className="icon-button" onClick={() => setSolGuideOpen(false)} aria-label="关闭 Sol 配置指南"><X size={18} /></button></header>
      <div className="tips-modal-body sol-guide-body">
        <div className="sol-guide-callout"><AlertCircle size={16} /><p><strong>使用 ComfyUI 的 Python——而不是系统 Python。</strong>你的已知环境是 <code>C:\Users\James\Documents\ComfyUI\.venv\Scripts\python.exe</code>。激活后的终端提示应当以 <code>(.venv)</code> 开头。</p></div>
        <article><span>01</span><div><strong>打开 ComfyUI Desktop 终端</strong><p>确认当前解释器与硬件：</p><pre><code>python -c "import sys; print(sys.executable)"{`\n`}python -c "import torch; print(torch.__version__); print(torch.version.cuda); print(torch.cuda.get_device_name())"</code></pre><p>这台机器上的预期结果：PyTorch 2.13.0+cu130、CUDA 13.0 与 NVIDIA GeForce RTX 3090。</p></div></article>
        <article><span>02</span><div><strong>安装 ComfyUI 自定义节点</strong><p>使用 Manager → Custom Nodes Manager → Install via Git URL 并粘贴：</p><pre><code>https://github.com/quzopl/ComfyUI-SolAttn-H3.git</code></pre><p>如果 Manager 没有克隆成功，请在已激活的终端中运行：</p><pre><code>cd C:\Users\James\Documents\ComfyUI\custom_nodes{`\n`}git clone https://github.com/quzopl/ComfyUI-SolAttn-H3.git</code></pre></div></article>
        <article><span>03</span><div><strong>克隆 NVIDIA 的 Sol Engine 分支</strong><p>稀疏 kernel 有意不随自定义节点打包：</p><pre><code>cd C:\Users\James\Documents{`\n`}git clone --branch sol-engine --depth 1 https://github.com/NVlabs/Sana.git sana-sol-engine</code></pre></div></article>
        <article><span>04</span><div><strong>把 kernel 安装进 ComfyUI 的环境</strong><pre><code>python -m pip install -e "C:\Users\James\Documents\sana-sol-engine\techniques\sparse_backends"</code></pre><p>RTX 3090 请使用文档记载的 SM86 Triton 路径。CuTe DSL 面向更新的 SM89/90/100/120 路径，这里不需要。</p></div></article>
        <article><span>05</span><div><strong>安装兼容的 H3 跨步缓存</strong><pre><code>cd C:\Users\James\Documents\ComfyUI\custom_nodes{`\n`}git clone https://github.com/lihaoyun6/ComfyUI-MiniMaxH3-Cache.git</code></pre><p>这是随 Sol-Attn 移植一起实际验证过的缓存实现。应用使用阈值 0.10 与 max_steps 5，与 NVIDIA 实用的 fullopt 缓存策略一致。不要在同一条 H3 模型路径上叠加 EasyCache、FirstBlockCache、CacheDiT、Spectrum 或其他缓存。</p></div></article>
        <article><span>06</span><div><strong>验证 Triton 并运行自检</strong><pre><code>python -c "import triton; print('Triton:', triton.__version__)"{`\n`}python "C:\Users\James\Documents\ComfyUI\custom_nodes\ComfyUI-SolAttn-H3\selftest.py"</code></pre><p>留意 RTX 3090、SM86、<code>backend=triton</code> 与 <code>correctness gate PASS</code>。如果正确性校验失败，请不要启用 Sol。</p></div></article>
        <article><span>07</span><div><strong>重启并检测整个栈</strong><p>完全退出并重新打开 ComfyUI Desktop，回到这里，然后选择<b>测试连接</b>。这个面板应当同时检测到 <code>SolAttnH3</code> 与 <code>MiniMaxH3Cache</code>。应用会在采样前串联官方 Turbo LoRA、缓存与 Sol-Attn。</p></div></article>
        <article><span>08</span><div><strong>提交之前先跑基准</strong><p>Sol 不保证在 3090 的所有工作负载上都胜过 SageAttention。请在相同模型、提示词、种子、分辨率、帧数、步数与参考图下对比原生、SageAttention、Sol 与 Sol + 缓存。官方 8 步 LoRA 要与 20–50 步的画质运行分开测试，因为步数越少，缓存复用的余地越小。</p></div></article>
        <div className="sol-guide-callout"><AlertCircle size={16} /><p><strong>Fullopt 边界：</strong>NVIDIA 的区域 torch.compile kernel 与常驻 BF16 VAE 属于它独立的 Modular Diffusers 运行时，当前 ComfyUI Sol 节点不能安全地暴露它们。Sol 节点本身也记载了 torch.compile 下的图中断。在兼容的 ComfyUI 节点报告它们之前，本应用不声明也不启用这两项优化。</p></div>
        <div className="sol-guide-callout success"><Check size={16} /><p><strong>推荐设置：</strong>tau 1.0、diag 阈值、20% 稠密预热、两个稠密层、prefix sink、开启正确性校验、关闭 strict、kv_splits 1。应用会自动提供这些设置。</p></div>
      </div>
      <footer><span><AlertCircle size={14} />Sol 只作用于新的 MiniMax H3 与 Ref2VA 视频工作流。</span><button type="button" className="primary-button" onClick={() => setSolGuideOpen(false)}>完成</button></footer>
    </section>
  </div>}
  </div>
}

