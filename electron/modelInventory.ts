export type ModelKind = 'diffusion_models' | 'text_encoders' | 'vae' | 'loras' | 'vae_approx' | 'clip_vision'

export const MODEL_KINDS: ModelKind[] = ['diffusion_models', 'text_encoders', 'vae', 'loras', 'vae_approx', 'clip_vision']

export type ModelFile = { name: string; path: string; kind: ModelKind; bytes: number }

/**
 * Combine the files found in the configured local folders with the files the
 * ComfyUI engine reports. The engine owns the models when it runs on another
 * machine, so a local scan alone reports every component as missing. A local
 * copy keeps its path and size; a server-only file has neither.
 */
export function mergeModelInventory(local: ModelFile[], server: Array<{ name: string; kind: ModelKind }>): ModelFile[] {
  const merged = new Map<string, ModelFile>()
  local.forEach((file) => merged.set(`${file.kind}:${file.name}`, file))
  server.forEach((file) => {
    const key = `${file.kind}:${file.name}`
    if (!merged.has(key)) merged.set(key, { name: file.name, path: '', kind: file.kind, bytes: 0 })
  })
  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name))
}
