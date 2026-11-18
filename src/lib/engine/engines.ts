// The render engines the app can drive. ComfyUI stays the default and keeps
// `settings.comfyUrl` as its single source of truth; mmh3 is a second engine
// that serves MiniMax H3 over HTTP. This module owns the pure model of both:
// which engines exist, which one is active, and how a settings write keeps the
// ComfyUI entry mirroring `comfyUrl`.

export type EngineKind = 'comfy' | 'mmh3'

export interface EngineConfig {
  id: string
  label: string
  kind: EngineKind
  baseUrl: string
  token?: string
  /** The second mmh3 instance, whose whole DiT is pinned to the fast 8-step weights. */
  fastBaseUrl?: string
}

export const COMFY_ENGINE_ID = 'comfy'
export const MMH3_ENGINE_ID = 'mmh3'
export const DEFAULT_MMH3_BASE_URL = 'http://127.0.0.1:8888'
export const DEFAULT_MMH3_FAST_BASE_URL = 'http://127.0.0.1:8889'

export type EngineSettingsInput = {
  comfyUrl?: string
  engines?: EngineConfig[]
  activeEngineId?: string
}

export type NormalizedEngineSettings = {
  comfyUrl: string
  engines: EngineConfig[]
  activeEngineId: string
}

function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function isEngineKind(value: unknown): value is EngineKind {
  return value === 'comfy' || value === 'mmh3'
}

/** Keeps only the entries that can be driven: an id, a label, a kind and a base URL. */
export function sanitizeEngines(value: unknown): EngineConfig[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const engines: EngineConfig[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue
    const candidate = entry as Partial<EngineConfig>
    const id = trimmed(candidate.id)
    const baseUrl = trimmed(candidate.baseUrl)
    if (!id || !baseUrl || seen.has(id) || !isEngineKind(candidate.kind)) continue
    seen.add(id)
    const engine: EngineConfig = { id, label: trimmed(candidate.label) || id, kind: candidate.kind, baseUrl }
    const token = trimmed(candidate.token)
    if (token) engine.token = token
    const fastBaseUrl = trimmed(candidate.fastBaseUrl)
    if (fastBaseUrl) engine.fastBaseUrl = fastBaseUrl
    engines.push(engine)
  }
  return engines
}

/** The two engines a fresh install starts with. */
export function presetEngines(comfyUrl: string): EngineConfig[] {
  return [
    { id: COMFY_ENGINE_ID, label: 'ComfyUI', kind: 'comfy', baseUrl: comfyUrl },
    { id: MMH3_ENGINE_ID, label: 'mmh3 (本机)', kind: 'mmh3', baseUrl: DEFAULT_MMH3_BASE_URL, fastBaseUrl: DEFAULT_MMH3_FAST_BASE_URL },
  ]
}

/**
 * The one write channel of the engine settings. `comfyUrl` stays the truth for
 * ComfyUI, so the ComfyUI entry is derived from it rather than stored beside
 * it; the mmh3 entry and any extra entries are kept as the user left them.
 */
export function normalizeEngineSettings(input: EngineSettingsInput): NormalizedEngineSettings {
  const stored = sanitizeEngines(input.engines)
  const comfyUrl = trimmed(input.comfyUrl) || trimmed(stored.find((engine) => engine.id === COMFY_ENGINE_ID)?.baseUrl)
  const storedComfy = stored.find((engine) => engine.id === COMFY_ENGINE_ID)
  const storedMmh3 = stored.find((engine) => engine.id === MMH3_ENGINE_ID)
  const extras = stored.filter((engine) => engine.id !== COMFY_ENGINE_ID && engine.id !== MMH3_ENGINE_ID)

  const engines: EngineConfig[] = [
    {
      id: COMFY_ENGINE_ID,
      label: storedComfy?.label || 'ComfyUI',
      kind: 'comfy',
      baseUrl: comfyUrl,
      ...(storedComfy?.token ? { token: storedComfy.token } : {}),
    },
    {
      id: MMH3_ENGINE_ID,
      label: storedMmh3?.label || 'mmh3 (本机)',
      kind: 'mmh3',
      baseUrl: storedMmh3?.baseUrl || DEFAULT_MMH3_BASE_URL,
      fastBaseUrl: storedMmh3?.fastBaseUrl || DEFAULT_MMH3_FAST_BASE_URL,
      ...(storedMmh3?.token ? { token: storedMmh3.token } : {}),
    },
    ...extras,
  ]

  const requested = trimmed(input.activeEngineId)
  const activeEngineId = engines.some((engine) => engine.id === requested) ? requested : COMFY_ENGINE_ID
  return { comfyUrl, engines, activeEngineId }
}

/** The engine a task runs on. An unknown or missing id means ComfyUI. */
export function resolveEngine(engines: EngineConfig[], engineId: string | undefined): EngineConfig {
  const wanted = trimmed(engineId)
  return engines.find((engine) => engine.id === wanted) ?? engines.find((engine) => engine.kind === 'comfy') ?? {
    id: COMFY_ENGINE_ID,
    label: 'ComfyUI',
    kind: 'comfy',
    baseUrl: '',
  }
}

export function findEngine(engines: EngineConfig[], engineId: string | undefined): EngineConfig | undefined {
  const wanted = trimmed(engineId)
  return engines.find((engine) => engine.id === wanted)
}

/** The URL an engine request goes to. */
export function engineBaseUrl(engine: EngineConfig): string {
  return engine.baseUrl.replace(/\/+$/, '')
}
