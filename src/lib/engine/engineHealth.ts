// What an engine can do right now, in the words the selector shows.
//
// An engine is reachable, reachable but short of a model file, or gone. The
// selector greys out what cannot run and says why, so the user is never left
// guessing between a wrong setting and a stopped service.

import type { Mmh3Status } from '../../types'
import type { EngineConfig } from './engines'

export type EngineHealthState = 'ready' | 'busy' | 'models-missing' | 'offline'

export type EngineHealth = {
  engineId: string
  kind: EngineConfig['kind']
  state: EngineHealthState
  /** The one line the status row shows under the selector. */
  detail: string
  /** The model files the engine said it was missing. */
  missing: string[]
  /** The weights the instance actually loaded, for the "what am I really running" line. */
  weights?: Mmh3Status['weights']
  /** The weights the fast (second) instance actually loaded — the two instances hold different ones. */
  fastWeights?: Mmh3Status['weights']
  checkedAt: number
}

export const ENGINE_HEALTH_LABELS: Record<EngineHealthState, string> = {
  ready: '● 就绪',
  busy: '● 正忙',
  'models-missing': '○ 模型缺失',
  offline: '⚠ 离线',
}

/** How long a health result stays fresh enough to act on. */
export const ENGINE_HEALTH_TTL_MS = 30_000

/**
 * How often a mounted workspace quietly re-asks the engine. The refresh is
 * silent (no spinner, no disabled select) and pauses while the page is hidden;
 * 15s keeps the status line within the 30s freshness bound without polling
 * the engine anywhere near as often as a render does.
 */
export const ENGINE_HEALTH_REFRESH_MS = 15_000

export function engineHealthFresh(health: EngineHealth | undefined): boolean {
  return Boolean(health) && Date.now() - (health?.checkedAt ?? 0) < ENGINE_HEALTH_TTL_MS
}

/** The ComfyUI engine: what the existing connection check and stack report say. */
export function comfyEngineHealth(engine: EngineConfig, connected: boolean, detail?: string, checkedAt = Date.now()): EngineHealth {
  return {
    engineId: engine.id,
    kind: 'comfy',
    state: connected ? 'ready' : 'offline',
    detail: connected ? (detail ?? 'ComfyUI 已连接。') : (detail ?? `ComfyUI 离线：检查 ${engine.baseUrl || '服务器地址'} 是否可达。`),
    missing: [],
    checkedAt,
  }
}

/** One loaded weight, in the words the status row shows. The digest is a
 * fingerprint of what the instance actually runs — it separates two
 * fine-tunes of the same architecture but never vouches for a file — so the
 * fingerprint itself is shown next to the note that says it is one. */
function weightLine(status: Mmh3Status): string | null {
  if (!status.weights?.length) return null
  const dit = status.weights.find((weight) => weight.kind === 'dit')
  if (!dit) return null
  const fingerprint = (entry: { digest: string }) => entry.digest ? `（指纹 ${entry.digest}）` : ''
  const adapters = dit.adapters?.length ? ` + ${dit.adapters.map((adapter) => `${adapter.file}${fingerprint(adapter)}`).join(' + ')}` : ''
  return `实际权重：${dit.file}${fingerprint(dit)}${adapters}（实例口径指纹，非完整性校验）`
}

/** The mmh3 engine: what its own status endpoint says. */
export function mmh3EngineHealth(engine: EngineConfig, status: Mmh3Status | null, checkedAt = Date.now(), fastStatus?: Mmh3Status | null): EngineHealth {
  if (!status || !status.reachable) {
    const reason = status?.error?.trim()
    return {
      engineId: engine.id,
      kind: 'mmh3',
      state: 'offline',
      detail: reason
        ? `mmh3 离线：${reason}。请检查 mmh3.service 与 mmh3-fast.service 是否在运行。`
        : 'mmh3 离线：请检查 mmh3.service 与 mmh3-fast.service 是否在运行。',
      missing: [],
      checkedAt,
    }
  }
  // Busy is what the engine itself says it is doing. The weights array only
  // says which weights the instance currently holds: an instance with
  // --idle-unload has none while idle, so "no dit in weights" must never read
  // as busy — an idle instance that unloaded reads as ready, with a note.
  const busy = status.generating !== null || status.cancelling !== null
  const weights = weightLine(status)
  const residentNote = weights ? `${weights}。` : '当前未驻留权重（空闲已卸载）。'
  // The fast instance is a second port with its own weights; naming both tells
  // the two apart without the user guessing.
  const fastBusy = fastStatus?.reachable && (fastStatus.generating !== null || fastStatus.cancelling !== null)
  const fastWeights = fastStatus?.reachable ? weightLine(fastStatus) : null
  const fastNote = !fastStatus?.reachable
    ? ''
    : fastBusy
      ? '极速实例正在生成。'
      : fastWeights
        ? `极速实例${fastWeights}。`
        : '极速实例当前未驻留权重（空闲已卸载）。'
  return {
    engineId: engine.id,
    kind: 'mmh3',
    state: busy ? 'busy' : 'ready',
    detail: busy
      ? `mmh3 正在生成${status.cancelling ? '（已受理停止，跑完当前步即停）' : ''}（队列 ${status.queued} 个）。${fastNote}`
      : status.queued > 0
        ? `mmh3 服务可达，队列中还有 ${status.queued} 个任务。${residentNote}${fastNote}`
        : `mmh3 服务可达，${residentNote}${fastNote}`,
    missing: [],
    weights: status.weights,
    fastWeights: fastStatus?.reachable ? fastStatus.weights : undefined,
    checkedAt,
  }
}

/**
 * The mmh3 server refuses a request whose model file its models directory does
 * not hold, and says which file. That refusal is the engine reporting a
 * missing model, so the selector can show it instead of a bare failure.
 */
export function missingModelFromError(message: string): string | null {
  const match = /^(?:patch|lora|latent-upscaler)\s+(.+?):\s*none in the models directory/i.exec(message.trim())
  return match ? match[1] : null
}

/** A health result that knows one model file is missing. */
export function withMissingModel(health: EngineHealth, file: string): EngineHealth {
  const missing = health.missing.includes(file) ? health.missing : [...health.missing, file]
  return {
    ...health,
    state: 'models-missing',
    missing,
    detail: `mmh3 缺少模型文件：${missing.join('、')}。请确认 mmh3 实例的模型目录里有这些文件。`,
  }
}

/** The part of the status row a screen reader announces: the badge and the
 * detail, never the timestamp — a quiet refresh must not re-announce an
 * unchanged state just because the clock moved. */
export function engineHealthAnnouncement(health: EngineHealth | undefined): string {
  if (!health) return '尚未检查。'
  return `${ENGINE_HEALTH_LABELS[health.state]} · ${health.detail}`
}

/** When the health was checked, shown next to the announcement and kept out
 * of the live region (visual information only). */
export function engineHealthStamp(health: EngineHealth | undefined): string {
  if (!health) return ''
  return `（检查于 ${new Date(health.checkedAt).toLocaleTimeString('zh-CN', { hour12: false })}）`
}
