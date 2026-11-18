// What an engine can do right now, in the words the selector shows.
//
// An engine is reachable, reachable but short of a model file, or gone. The
// selector greys out what cannot run and says why, so the user is never left
// guessing between a wrong setting and a stopped service.

import type { Mmh3Status } from '../../types'
import type { EngineConfig } from './engines'

export type EngineHealthState = 'ready' | 'models-missing' | 'offline'

export type EngineHealth = {
  engineId: string
  kind: EngineConfig['kind']
  state: EngineHealthState
  /** The one line the status row shows under the selector. */
  detail: string
  /** The model files the engine said it was missing. */
  missing: string[]
  checkedAt: number
}

export const ENGINE_HEALTH_LABELS: Record<EngineHealthState, string> = {
  ready: '● 就绪',
  'models-missing': '○ 模型缺失',
  offline: '⚠ 离线',
}

/** How long a health result stays fresh enough to act on. */
export const ENGINE_HEALTH_TTL_MS = 30_000

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

/** The mmh3 engine: what its own status endpoint says. */
export function mmh3EngineHealth(engine: EngineConfig, status: Mmh3Status | null, checkedAt = Date.now()): EngineHealth {
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
  const busy = status.generating !== null
  return {
    engineId: engine.id,
    kind: 'mmh3',
    state: 'ready',
    detail: busy
      ? `mmh3 正在生成（队列 ${status.queued} 个）。`
      : status.queued > 0
        ? `mmh3 服务可达，队列中还有 ${status.queued} 个任务。`
        : 'mmh3 服务可达。',
    missing: [],
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

/** The line the status row shows: the badge, the detail, and when it was checked. */
export function engineHealthLine(health: EngineHealth | undefined): string {
  if (!health) return '尚未检查。'
  const time = new Date(health.checkedAt).toLocaleTimeString('zh-CN', { hour12: false })
  return `${ENGINE_HEALTH_LABELS[health.state]} · ${health.detail}（检查于 ${time}）`
}
