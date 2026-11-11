import type { ModelFile, ModelKind } from '../types'
import { choices, type ObjectInfo } from './comfyInfo'

// The engine that renders the video owns the model files. When ComfyUI runs on
// another machine a local folder scan cannot see them, so every component
// would report as missing. The engine's own node combinations name the files
// it has installed.
const ENGINE_MODEL_FOLDERS: Array<{ node: string; field: string; kind: ModelKind }> = [
  { node: 'UNETLoader', field: 'unet_name', kind: 'diffusion_models' },
  { node: 'CLIPLoader', field: 'clip_name', kind: 'text_encoders' },
  { node: 'VAELoader', field: 'vae_name', kind: 'vae' },
  { node: 'LoraLoaderModelOnly', field: 'lora_name', kind: 'loras' },
]

// ComfyUI offers a built-in pixel-space VAE that is not a file on disk.
const BUILT_IN_MODEL_NAMES = new Set(['pixel_space'])

/** The model files the connected engine reports through its node combinations. */
export function engineModelFiles(info: ObjectInfo, previewNode?: string): ModelFile[] {
  const files: ModelFile[] = []
  const add = (kind: ModelKind, names: string[]) => names.forEach((name) => {
    if (BUILT_IN_MODEL_NAMES.has(name)) return
    files.push({ name, path: '', kind, bytes: 0 })
  })
  ENGINE_MODEL_FOLDERS.forEach((folder) => add(folder.kind, choices(info, folder.node, folder.field)))
  // The tiny H3 preview decoder lives in its own folder that no core node lists.
  // Only the preview override node offers it, so read it from there.
  if (previewNode) add('vae_approx', choices(info, previewNode, 'vae_name'))
  return files
}

/**
 * Combine the files found in the configured local folders with the files the
 * engine reports. A local copy keeps its path and size; a file that only
 * exists on the engine has neither.
 */
export function mergeModelFiles(local: ModelFile[], engine: ModelFile[]): ModelFile[] {
  const merged = new Map<string, ModelFile>()
  local.forEach((file) => merged.set(`${file.kind}:${file.name}`, file))
  engine.forEach((file) => {
    const key = `${file.kind}:${file.name}`
    if (!merged.has(key)) merged.set(key, file)
  })
  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name))
}
