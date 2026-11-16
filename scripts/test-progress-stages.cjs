const assert = require('node:assert/strict')
const { load } = require('./test-ts-loader.cjs')

const {
  PROGRESS_CAP,
  PROGRESS_STAGE_LABELS,
  PROGRESS_STAGE_WEIGHTS,
  progressStageForNode,
  mergeStageCounters,
  composeStageProgress,
  describeJobProgress,
  jobProgressLine,
  progressBarStyle,
} = load('src/lib/progressStages.ts')

const close = (actual, expected, tolerance = 0.001) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${actual} to be within ${tolerance} of ${expected}`)
}

// The loader runs modules in a separate realm, so plain objects come back with
// a different prototype: compare the fields instead of the object identity.
const counter = value => ({ current: value.current, total: value.total })

// ---------------------------------------------------------------------------
// 阶段分类：节点 class_type → 阶段
// ---------------------------------------------------------------------------
assert.equal(progressStageForNode('MiniMaxMusic3TextEncode'), 'text-encode')
assert.equal(progressStageForNode('TextEncodeAceStepAudio1.5'), 'text-encode')
assert.equal(progressStageForNode('KSampler'), 'sample')
assert.equal(progressStageForNode('SamplerCustomAdvanced'), 'sample')
assert.equal(progressStageForNode('UNETLoader'), 'model-load')
assert.equal(progressStageForNode('CLIPLoader'), 'model-load')
assert.equal(progressStageForNode('DualCLIPLoader'), 'model-load')
assert.equal(progressStageForNode('VAEDecodeAudioTiled'), 'decode-save')
assert.equal(progressStageForNode('VAEDecode'), 'decode-save')
assert.equal(progressStageForNode('SaveAudioAdvanced'), 'decode-save')
assert.equal(progressStageForNode('SaveVideo'), 'decode-save')
assert.equal(progressStageForNode('CLIPTextEncode'), 'prepare')
assert.equal(progressStageForNode('ConditioningZeroOut'), 'prepare')
assert.equal(progressStageForNode(undefined), 'prepare')

// ---------------------------------------------------------------------------
// 权重表：声明值（文本编码 0.65 / 采样 0.30 / 解码保存 0.05）
// ---------------------------------------------------------------------------
assert.equal(PROGRESS_STAGE_WEIGHTS['text-encode'], 0.65)
assert.equal(PROGRESS_STAGE_WEIGHTS.sample, 0.30)
assert.equal(PROGRESS_STAGE_WEIGHTS['decode-save'], 0.05)
assert.equal(PROGRESS_STAGE_LABELS['text-encode'], '文本编码')
assert.equal(PROGRESS_STAGE_LABELS.sample, '采样')
assert.equal(PROGRESS_STAGE_LABELS['model-load'], '加载模型')
assert.equal(PROGRESS_CAP, 95)

// ---------------------------------------------------------------------------
// 步数合并：同一阶段只增不减，旧事件不能把进度拉回去
// ---------------------------------------------------------------------------
const encoded = mergeStageCounters(undefined, 'text-encode', 125, 250)
assert.deepEqual(counter(encoded['text-encode']), { current: 125, total: 250 })
assert.deepEqual(counter(mergeStageCounters(encoded, 'text-encode', 100, 250)['text-encode']), { current: 125, total: 250 })
assert.deepEqual(counter(mergeStageCounters(encoded, 'text-encode', 250, 250)['text-encode']), { current: 250, total: 250 })
assert.deepEqual(counter(mergeStageCounters(encoded, 'sample', 3, 30)['sample']), { current: 3, total: 30 })
// 没有步数上报的阶段不写入计数器
assert.deepEqual(counter(mergeStageCounters(encoded, 'model-load', undefined, undefined)['text-encode']), { current: 125, total: 250 })
assert.equal(mergeStageCounters(encoded, 'model-load', undefined, undefined)['model-load'], undefined)

// ---------------------------------------------------------------------------
// 多阶段合成（Music 3：文本编码 250 步、采样 30 步）
// ---------------------------------------------------------------------------
let music3 = mergeStageCounters(undefined, 'text-encode', 125, 250)
close(composeStageProgress(music3, 'text-encode').progress, 0.65 * 0.5 * 95)
assert.equal(Math.round(composeStageProgress(music3, 'text-encode').progress), 31)

music3 = mergeStageCounters(music3, 'text-encode', 250, 250)
close(composeStageProgress(music3, 'text-encode').progress, 0.65 * 95)
assert.equal(Math.round(composeStageProgress(music3, 'text-encode').progress), 62)

music3 = mergeStageCounters(music3, 'sample', 0, 30)
close(composeStageProgress(music3, 'sample').progress, 0.65 * 95)
assert.equal(Math.round(composeStageProgress(music3, 'sample').progress), 62)

music3 = mergeStageCounters(music3, 'sample', 15, 30)
const midway = composeStageProgress(music3, 'sample').progress
assert.ok(midway > 0.65 * 95 && midway < PROGRESS_CAP)

music3 = mergeStageCounters(music3, 'sample', 30, 30)
close(composeStageProgress(music3, 'sample').progress, PROGRESS_CAP)
assert.equal(Math.round(composeStageProgress(music3, 'sample').progress), 95)

// 采样跑满后不再回退到编码阶段的旧值
const afterSampling = composeStageProgress(music3, 'sample').progress
assert.ok(afterSampling >= composeStageProgress(mergeStageCounters(music3, 'sample', 1, 30), 'sample').progress)

// ---------------------------------------------------------------------------
// 单阶段不回归：只有采样器上报步进的工作流（H3/LTX）
// ---------------------------------------------------------------------------
const single = mergeStageCounters(undefined, 'sample', 15, 30)
close(composeStageProgress(single, 'sample').progress, Math.min(95, (15 / 30) * 95))
const singleFull = mergeStageCounters(undefined, 'sample', 30, 30)
close(composeStageProgress(singleFull, 'sample').progress, 95)
// 单阶段工作流不受多阶段权重影响
const singleAfterText = mergeStageCounters(mergeStageCounters(undefined, 'text-encode', 250, 250), 'sample', 15, 30)
close(composeStageProgress(singleAfterText, 'sample').progress, 95 * (0.65 + 0.35 * 0.5))

// ---------------------------------------------------------------------------
// 静默阶段：没有步数上报 → 不确定态
// ---------------------------------------------------------------------------
assert.equal(composeStageProgress(music3, 'model-load').indeterminate, true)
assert.equal(composeStageProgress(music3, 'sample').indeterminate, false)
assert.equal(composeStageProgress(undefined, 'model-load').indeterminate, true)

// ---------------------------------------------------------------------------
// 展示文案：阶段名、阶段内步数、已用时间
// ---------------------------------------------------------------------------
const summary = describeJobProgress({
  status: 'running',
  progress: 61.75,
  progressLabel: '文本编码',
  progressStage: 'text-encode',
  stageStep: 250,
  stageTotalSteps: 250,
  startedAt: 1000,
}, 61000)
assert.equal(summary.stageLabel, '文本编码')
assert.equal(summary.stepsText, '第 250 步，共 250 步')
assert.equal(summary.elapsedText, '已用 01:00')
assert.equal(summary.percent, 62)
assert.equal(summary.running, true)
assert.equal(jobProgressLine({ progressLabel: '文本编码' }, summary), '文本编码 · 第 250 步，共 250 步 · 已用 01:00')
assert.equal(jobProgressLine({}, summary, '正在准备'), '文本编码 · 第 250 步，共 250 步 · 已用 01:00')
assert.equal(jobProgressLine({}, { ...summary, stageLabel: '' }, '正在准备'), '正在准备 · 第 250 步，共 250 步 · 已用 01:00')
assert.equal(progressBarStyle(summary).width, '62%')
assert.equal(progressBarStyle({ ...summary, indeterminate: true }).animation, 'progress-sheen 1.8s ease-in-out infinite')

// 没有阶段信息时回退到任务自身的步数
const legacy = describeJobProgress({ status: 'running', progress: 50, currentStep: 5, totalSteps: 30 }, 1000)
assert.equal(legacy.stepsText, '第 5 步，共 30 步')
assert.equal(legacy.stageLabel, '')
assert.equal(legacy.elapsedText, '')

// 阶段已知但没有步数上报时，不显示上一阶段的步数
const silent = describeJobProgress({
  status: 'running', progress: 95, progressStage: 'decode-save', currentStep: 30, totalSteps: 30, stageIndeterminate: true, startedAt: 1000,
}, 6000)
assert.equal(silent.stepsText, '')
assert.equal(silent.stageLabel, '解码与保存')
assert.equal(silent.elapsedText, '已用 00:05')
assert.equal(silent.indeterminate, true)

console.log('PASS: stage classification, weight selection, progress composition and elapsed formatting')
