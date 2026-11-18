// The engine list and the active engine, in one shape.
//
// `comfyUrl` stays the truth for ComfyUI and the ComfyUI entry mirrors it, so
// a settings write can never leave the two disagreeing. The mmh3 entry keeps
// the addresses of its two instances, and the active engine always names an
// engine that exists.
//
// This module is pure on purpose: it is the testable core of the single write
// channel, and it holds no Electron dependency.

export type EngineConfig = {
  id: string
  label: string
  kind: 'comfy' | 'mmh3'
  baseUrl: string
  token?: string
  fastBaseUrl?: string
}

/** The mmh3 endpoints the app talks to. Both instances run on this machine
 *  and bind the loopback interface only, so nothing outside is exposed. */
export const DEFAULT_MMH3_BASE_URL = 'http://127.0.0.1:8888'
export const DEFAULT_MMH3_FAST_BASE_URL = 'http://127.0.0.1:8889'

export type NormalizedEngines = { engines: EngineConfig[]; activeEngineId: string }

export function normalizeEngines(comfyUrl: string, stored?: unknown, activeEngineId?: unknown): NormalizedEngines {
  const list = Array.isArray(stored) ? stored.filter((entry): entry is EngineConfig => {
    if (!entry || typeof entry !== 'object') return false
    const candidate = entry as EngineConfig
    return typeof candidate.id === 'string' && candidate.id.trim().length > 0
      && typeof candidate.baseUrl === 'string' && candidate.baseUrl.trim().length > 0
      && (candidate.kind === 'comfy' || candidate.kind === 'mmh3')
  }) : []
  const comfy = list.find((engine) => engine.id === 'comfy')
  const mmh3 = list.find((engine) => engine.id === 'mmh3')
  const extras = list.filter((engine) => engine.id !== 'comfy' && engine.id !== 'mmh3')
  const engines: EngineConfig[] = [
    { id: 'comfy', label: comfy?.label || 'ComfyUI', kind: 'comfy', baseUrl: comfyUrl, ...(comfy?.token ? { token: comfy.token } : {}) },
    { id: 'mmh3', label: mmh3?.label || 'mmh3 (本机)', kind: 'mmh3', baseUrl: mmh3?.baseUrl || DEFAULT_MMH3_BASE_URL, fastBaseUrl: mmh3?.fastBaseUrl || DEFAULT_MMH3_FAST_BASE_URL, ...(mmh3?.token ? { token: mmh3.token } : {}) },
    ...extras,
  ]
  const requested = typeof activeEngineId === 'string' ? activeEngineId.trim() : ''
  return { engines, activeEngineId: engines.some((engine) => engine.id === requested) ? requested : 'comfy' }
}
