import { useId } from 'react'
import { ChevronDown, LoaderCircle } from 'lucide-react'
import type { EngineConfig } from '../lib/engine/engines'
import { ENGINE_HEALTH_LABELS, type EngineHealth, engineHealthLine } from '../lib/engine/engineHealth'

/**
 * The engine a workspace renders on. An engine that cannot run is greyed out
 * and says why, so the choice is never a guess.
 */
export function EngineSelector({ engines, engineId, health, checking, onChange, disabled }: {
  engines: EngineConfig[]
  engineId: string
  health: Record<string, EngineHealth>
  checking?: boolean
  onChange(id: string): void
  disabled?: boolean
}) {
  const id = useId()
  const current = health[engineId]
  return <div className="engine-selector">
    <div className="engine-selector-head">
      <label htmlFor={id}>渲染引擎</label>
      <span className={`engine-health engine-health-${current?.state ?? 'unknown'}`}>{current ? ENGINE_HEALTH_LABELS[current.state] : '尚未检查'}</span>
    </div>
    <div className="engine-selector-control">
      <div className="select-wrap">
        <select id={id} value={engineId} disabled={disabled || checking} onChange={(event) => onChange(event.target.value)}>
          {engines.map((engine) => {
            const entry = health[engine.id]
            const unavailable = entry?.state === 'offline' || entry?.state === 'models-missing'
            const suffix = entry?.state === 'offline' ? ' · 离线' : entry?.state === 'models-missing' ? ' · 模型缺失' : ''
            return <option key={engine.id} value={engine.id} disabled={unavailable && engine.id !== engineId}>{engine.label}{suffix}</option>
          })}
        </select>
        <ChevronDown size={15} />
      </div>
      {checking && <LoaderCircle size={14} className="spin" aria-hidden="true" />}
    </div>
    <p className="engine-status" role="status" aria-live="polite">{engineHealthLine(current)}</p>
  </div>
}
