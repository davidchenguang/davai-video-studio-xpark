// Which engine an H3 workspace renders on, and whether that engine can render.
//
// The choice is remembered per workspace, checked when it is made, and the
// handover to mmh3 runs once per switch: ComfyUI gives its memory back
// before mmh3 takes it.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { EngineConfig } from './engines'
import { resolveEngine } from './engines'
import { type EngineHealth, comfyEngineHealth, engineHealthFresh, mmh3EngineHealth, missingModelFromError, withMissingModel } from './engineHealth'

/** The parts of the settings an engine choice needs. */
export type EngineSettingsLike = {
  engines?: EngineConfig[]
  activeEngineId?: string
  comfyUrl?: string
}

export type EngineSelectionOptions = {
  /** Whether ComfyUI is connected, which the app already knows. */
  comfyConnected?: boolean
  /** What the ComfyUI side reports, for the status line. */
  comfyDetail?: string
}

/** What a workspace needs to show the engine it renders on. */
export type EngineSelectionState = {
  engines: EngineConfig[]
  engine: EngineConfig
  engineId: string
  setEngineId(id: string): void
  health: Record<string, EngineHealth>
  engineHealth?: EngineHealth
  checking: boolean
  checkAll(): void
  checkEngine(engine: EngineConfig): Promise<EngineHealth>
  /** Throws when the render must not go ahead; returns a warning otherwise. onStage reports each step of the handover for the status line. */
  prepareSubmit(engineId?: string, onStage?: (label: string) => void): Promise<string | null>
  /** A failure told us something about the engine. */
  noteFailure(id: string, message: string): void
}

/** The stages a submit runs through, in order, for the status line. */
export const MMH3_SUBMIT_STAGES = {
  health: '正在检查 mmh3 引擎状态…',
  handover: '正在让 ComfyUI 释放显存…',
  reach: '正在确认 mmh3 服务可达…',
} as const

/**
 * The remembered choice. The id alone is enough to find the engine again, but
 * the first frame after a restart arrives before the settings do — so the kind
 * and the label travel with it, and the workspace does not flash ComfyUI while
 * it waits for the list. An older record (a bare id) still reads.
 */
type StoredChoice = { id: string; kind?: EngineConfig['kind']; label?: string }

function storedChoice(key: string): StoredChoice {
  try {
    const raw = window.localStorage.getItem(key)?.trim() ?? ''
    if (!raw) return { id: '' }
    if (raw.startsWith('{')) {
      const parsed = JSON.parse(raw) as { id?: unknown; kind?: unknown; label?: unknown }
      return {
        id: typeof parsed.id === 'string' ? parsed.id.trim() : '',
        kind: parsed.kind === 'comfy' || parsed.kind === 'mmh3' ? parsed.kind : undefined,
        label: typeof parsed.label === 'string' ? parsed.label : undefined,
      }
    }
    return { id: raw }
  } catch { return { id: '' } }
}

function storedEngineId(key: string): string {
  return storedChoice(key).id
}

export function useEngineSelection(storageKey: string, settings: EngineSettingsLike | null, options: EngineSelectionOptions = {}): EngineSelectionState & {
  /** Throws when the render must not go ahead; returns a warning otherwise. onStage reports each step of the handover for the status line. */
  prepareSubmit(engineId?: string, onStage?: (label: string) => void): Promise<string | null>
  /** A failure told us something about the engine. */
  noteFailure(id: string, message: string): void
} {
  const engines = useMemo(() => settings?.engines ?? [], [settings?.engines])
  const [engineId, setEngineIdState] = useState('')
  const [health, setHealth] = useState<Record<string, EngineHealth>>({})
  const [checking, setChecking] = useState(false)
  // The handover belongs to a switch, not to a submit: it runs once after the
  // engine changes, not before every request.
  const handedOff = useRef('')

  const remember = useCallback((id: string) => {
    try {
      const engine = engines.find((item) => item.id === id)
      window.localStorage.setItem(storageKey, JSON.stringify({ id, kind: engine?.kind, label: engine?.label }))
    } catch { /* A browser that refuses storage still renders. */ }
  }, [engines, storageKey])

  const resolvedId = useMemo(() => {
    const known = (id: string) => engines.some((engine) => engine.id === id)
    const stored = storedEngineId(storageKey)
    if (known(stored)) return stored
    // Settings have not arrived yet: hold the stored choice as a pending value
    // instead of snapping to comfy, which the old first-frame flash came from.
    // Once engines load, the effect below either confirms it or falls back.
    if (!engines.length && stored) return stored
    const active = settings?.activeEngineId?.trim() ?? ''
    if (known(active)) return active
    return engines.some((engine) => engine.kind === 'comfy') ? 'comfy' : (engines[0]?.id ?? 'comfy')
  }, [engines, settings?.activeEngineId, storageKey])

  useEffect(() => {
    setEngineIdState((current) => current && engines.some((engine) => engine.id === current) ? current : resolvedId)
  }, [engines, resolvedId])

  const checkEngine = useCallback(async (engine: EngineConfig): Promise<EngineHealth> => {
    if (engine.kind === 'comfy') return comfyEngineHealth(engine, options.comfyConnected === true, options.comfyDetail)
    const status = await window.minimax.mmh3Status(engine.baseUrl).catch((error: unknown) => ({
      reachable: false,
      generating: null,
      cancelling: null,
      queued: 0,
      models: null,
      weights: null,
      memory: null,
      error: error instanceof Error ? error.message : String(error),
    }))
    // The fast tier runs on a second instance with its own weights; asking it
    // too is what tells the two apart in the status line.
    const fastBaseUrl = engine.fastBaseUrl?.trim()
    const fastStatus = fastBaseUrl
      ? await window.minimax.mmh3Status(fastBaseUrl).catch(() => null)
      : null
    return mmh3EngineHealth(engine, status, Date.now(), fastStatus)
  }, [options.comfyConnected, options.comfyDetail])

  const checkAll = useCallback(async () => {
    if (!engines.length) return
    setChecking(true)
    try {
      const results = await Promise.all(engines.map(async (engine) => [engine.id, await checkEngine(engine)] as const))
      setHealth((current) => ({ ...current, ...Object.fromEntries(results) }))
    } finally {
      setChecking(false)
    }
  }, [checkEngine, engines])

  // The check runs when the workspace opens and when the engine list changes,
  // and never on a timer: an engine that goes away says so when it is asked.
  useEffect(() => { void checkAll() }, [checkAll])

  const setEngineId = useCallback((id: string) => {
    setEngineIdState(id)
    remember(id)
    if (handedOff.current !== id) handedOff.current = ''
  }, [remember])

  const engine = useMemo(() => {
    const wanted = engineId || resolvedId
    const found = engines.find((item) => item.id === wanted)
    if (found) return found
    if (!engines.length) {
      // The settings have not arrived yet: the remembered choice still names
      // the engine, so the first frame does not show ComfyUI.
      const remembered = storedChoice(storageKey)
      return { id: wanted, label: remembered.label ?? wanted, kind: remembered.kind ?? 'comfy', baseUrl: '' }
    }
    return resolveEngine(engines, wanted)
  }, [engineId, engines, resolvedId, storageKey])
  const engineHealth = health[engine.id]

  /**
   * What a submit has to know before it may go ahead. The health is brought up
   * to date, the handover to mmh3 runs once per switch, and a warning comes
   * back when something did not work out but should not stop the render.
   * The engine id names the target when a caller submits somewhere other than
   * the workspace's current choice, which the comparison run needs.
   */
  const prepareSubmit = useCallback(async (engineOverrideId?: string, onStage?: (label: string) => void): Promise<string | null> => {
    const target = resolveEngine(engines, engineOverrideId?.trim() || engineId || resolvedId)
    if (target.kind !== 'mmh3') return null
    if (!engineHealthFresh(health[target.id])) {
      onStage?.(MMH3_SUBMIT_STAGES.health)
      const fresh = await checkEngine(target)
      setHealth((current) => ({ ...current, [target.id]: fresh }))
      if (fresh.state === 'offline') throw new Error(fresh.detail)
    }
    if (handedOff.current === target.id) return null
    onStage?.(MMH3_SUBMIT_STAGES.handover)
    handedOff.current = target.id
    const release = await window.minimax.mmh3ReleaseComfy(settings?.comfyUrl ?? '')
    if (release.busy) {
      handedOff.current = ''
      throw new Error('等待 ComfyUI 队列清空后重试。ComfyUI 仍在生成，mmh3 需要先拿到显存。')
    }
    onStage?.(MMH3_SUBMIT_STAGES.reach)
    const status = await window.minimax.mmh3Status(target.baseUrl).catch(() => null)
    if (!status?.reachable) {
      handedOff.current = ''
      throw new Error(`mmh3 不可达：${status?.error?.trim() || '请检查 mmh3.service 与 mmh3-fast.service 是否在运行。'}`)
    }
    if (!release.released) {
      return `ComfyUI 显存未释放${release.error ? `（${release.error}）` : ''}，mmh3 可能加载失败。若失败，请等待 ComfyUI 释放显存后重试。`
    }
    return null
  }, [checkEngine, engineId, engines, health, resolvedId, settings?.comfyUrl])

  /** A failure told us something about the engine: a missing model file, or a service that is gone. */
  const noteFailure = useCallback((id: string, message: string) => {
    const missing = missingModelFromError(message)
    setHealth((entries) => {
      const previous = entries[id]
      if (!previous) return entries
      if (missing) return { ...entries, [id]: withMissingModel(previous, missing) }
      // The health of an engine that just failed is worth nothing until it is asked again.
      const rest = { ...entries }
      delete rest[id]
      return rest
    })
  }, [])

  return {
    engines,
    engine,
    engineId: engine.id,
    setEngineId,
    health,
    engineHealth,
    checking,
    checkAll,
    checkEngine,
    prepareSubmit,
    noteFailure,
  }
}