import { useEffect, useState } from 'react'
import { formatRuntime } from './renderActivity'

/**
 * ComfyUI 进度阶段：把引擎上报的节点 class_type 归到少数几个可展示的阶段。
 * 引擎只对「带进度条」的节点上报步数（文本编码器与采样器），其余节点只有
 * `executing` 事件，因此它们是静默阶段：用不确定态进度条 + 已用时间表达。
 */
export type ProgressStageId = 'text-encode' | 'sample' | 'decode-save' | 'model-load' | 'prepare'

export type StageStepCounter = { current: number; total: number }
export type StageStepCounters = Record<string, StageStepCounter>

export const PROGRESS_STAGE_LABELS: Record<ProgressStageId, string> = {
  'text-encode': '文本编码',
  sample: '采样',
  'decode-save': '解码与保存',
  'model-load': '加载模型',
  prepare: '准备',
}

/**
 * 阶段权重（声明值，按实测耗时标定）：文本编码 0.65、采样 0.30、解码保存 0.05。
 *
 * 解码与保存没有步数上报，它的 0.05 权重并入采样阶段：采样系数因此是
 * 0.30 + 0.05 = 0.35，采样跑满时全局进度正好到达 95% 的上限，剩下的 5%
 * 留给输出落盘与完成确认。
 */
export const PROGRESS_STAGE_WEIGHTS = { 'text-encode': 0.65, sample: 0.30, 'decode-save': 0.05 } as const

/** 全局进度上限：最后 5% 留给输出落盘与确认。 */
export const PROGRESS_CAP = 95

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

/** 节点 class_type → 阶段。 */
export function progressStageForNode(nodeType?: string): ProgressStageId {
  if (!nodeType) return 'prepare'
  if (/MiniMaxMusic3TextEncode|TextEncodeAceStepAudio1\.5/i.test(nodeType)) return 'text-encode'
  if (/KSampler|SamplerCustom/i.test(nodeType)) return 'sample'
  if (/VAEDecode|Save(?:Image|Video|Audio)|CreateVideo/i.test(nodeType)) return 'decode-save'
  if (/Loader|ModelAttentionBackend/i.test(nodeType)) return 'model-load'
  return 'prepare'
}

/** 合并一个阶段的新步数：同阶段只增不减，避免旧事件把进度拉回去。 */
export function mergeStageCounters(current: StageStepCounters | undefined, stage: ProgressStageId | undefined, currentStep?: number, totalSteps?: number): StageStepCounters {
  const counters: StageStepCounters = { ...(current ?? {}) }
  if (!stage || currentStep === undefined || totalSteps === undefined || totalSteps <= 0) return counters
  const previous = counters[stage]
  counters[stage] = {
    current: previous ? Math.max(previous.current, currentStep) : Math.max(0, currentStep),
    total: previous ? Math.max(previous.total, totalSteps) : totalSteps,
  }
  return counters
}

/**
 * 合成全局进度。
 *
 * - 只有采样器上报步数的单阶段工作流（H3/LTX）：保持既有语义
 *   `min(95, 步数比例 × 95)`，不改变既有观感。
 * - 文本编码器与采样器都上报步数的多阶段工作流（Music 3 / ACE-Step）：
 *   按声明权重合成 `95 × (0.65 × 编码比例 + 0.35 × 采样比例)`，
 *   编码 50% → 31%，编码 100% → 62%，采样 100% → 95%。
 */
export function composeStageProgress(counters: StageStepCounters | undefined, activeStage?: ProgressStageId) {
  const text = counters?.['text-encode']
  const sample = counters?.['sample']
  const textRatio = text && text.total > 0 ? clamp01(text.current / text.total) : undefined
  const sampleRatio = sample && sample.total > 0 ? clamp01(sample.current / sample.total) : undefined
  const activeCounter = activeStage ? counters?.[activeStage] : undefined
  const indeterminate = Boolean(activeStage) && !(activeCounter && activeCounter.total > 0)
  if (textRatio === undefined) {
    if (sampleRatio === undefined) return { progress: undefined, stageProgress: undefined, indeterminate }
    return { progress: Math.min(PROGRESS_CAP, sampleRatio * PROGRESS_CAP), stageProgress: sampleRatio, indeterminate }
  }
  const composed = (PROGRESS_STAGE_WEIGHTS['text-encode'] * textRatio + (PROGRESS_STAGE_WEIGHTS.sample + PROGRESS_STAGE_WEIGHTS['decode-save']) * (sampleRatio ?? 0)) * PROGRESS_CAP
  const stageProgress = activeStage === 'text-encode' ? textRatio : activeStage === 'sample' ? sampleRatio : undefined
  return { progress: Math.min(PROGRESS_CAP, composed), stageProgress, indeterminate }
}

export type StageProgressJob = {
  status?: string
  progress?: number
  progressLabel?: string
  progressStage?: ProgressStageId
  currentStep?: number
  totalSteps?: number
  stageStep?: number
  stageTotalSteps?: number
  stageIndeterminate?: boolean
  startedAt?: number
}

export type JobProgressSummary = {
  stageLabel: string
  stepsText: string
  elapsedText: string
  elapsedMs: number
  percent: number
  indeterminate: boolean
  running: boolean
}

/** 把任务当前的阶段信息整理成展示用的文案与数值。 */
export function describeJobProgress(job: StageProgressJob | undefined, now: number): JobProgressSummary {
  const stage = job?.progressStage
  const elapsedMs = job?.startedAt ? Math.max(0, now - job.startedAt) : 0
  // 阶段已知但没有步数上报时（加载模型、解码保存）不显示步数：那是上一阶段的步数。
  const step = job?.stageStep ?? (stage ? undefined : job?.currentStep)
  const totalSteps = job?.stageTotalSteps ?? (stage ? undefined : job?.totalSteps)
  const stepsText = step !== undefined && totalSteps ? `第 ${step} 步，共 ${totalSteps} 步` : ''
  return {
    stageLabel: stage ? PROGRESS_STAGE_LABELS[stage] : '',
    stepsText,
    elapsedText: elapsedMs > 0 ? `已用 ${formatRuntime(elapsedMs)}` : '',
    elapsedMs,
    percent: Math.round(job?.progress ?? 0),
    indeterminate: Boolean(job?.stageIndeterminate),
    running: job?.status === 'running' || job?.status === 'queued',
  }
}

/** 阶段名 + 阶段内步数 + 已用时间，拼成一行可读的状态。 */
export function stageSummaryText(summary: JobProgressSummary) {
  return [summary.stageLabel, summary.stepsText, summary.elapsedText].filter(Boolean).join(' · ')
}

/** 阶段内步数 + 已用时间（阶段名已经单独展示时用这个）。 */
export function stageDetailText(summary: JobProgressSummary) {
  return [summary.stepsText, summary.elapsedText].filter(Boolean).join(' · ')
}

/**
 * 状态行：引擎给出的阶段文案 + 阶段内真实步数 + 已用时间。
 * 引擎文案里已经带步数时不重复追加。
 */
export function jobProgressLine(job: StageProgressJob | undefined, summary: JobProgressSummary, fallbackLabel?: string) {
  const label = job?.progressLabel?.trim() ?? ''
  const head = label || summary.stageLabel || fallbackLabel || ''
  const steps = head && summary.stepsText && !head.includes(summary.stepsText) ? summary.stepsText : ''
  return [head, steps, summary.elapsedText].filter(Boolean).join(' · ')
}

/**
 * 进度条填充样式。静默阶段（没有步数上报）用不确定态：一段来回移动的高亮，
 * 而不是停住不动的百分比。
 */
export function progressBarStyle(summary: JobProgressSummary) {
  return summary.indeterminate
    ? { width: '38%', animation: 'progress-sheen 1.8s ease-in-out infinite' }
    : { width: `${Math.max(2, summary.percent)}%` }
}

/** 运行期间每秒触发一次重渲染，让「已用时间」持续走动。 */
export function useElapsedTick(active: boolean) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!active) return
    const timer = window.setInterval(() => setTick(value => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [active])
}

/** 任务进度摘要：阶段名、阶段内真实步数、已用时间与全局百分比。 */
export function useJobProgressSummary(job: StageProgressJob | undefined): JobProgressSummary {
  useElapsedTick(Boolean(job && (job.status === 'running' || job.status === 'queued')))
  return describeJobProgress(job, Date.now())
}
