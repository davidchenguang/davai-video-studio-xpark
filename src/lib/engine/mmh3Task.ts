// The mmh3 side of a render: what a request carries, and the wait for the
// artifact that comes back.
//
// mmh3 is not ComfyUI. It takes a form of options, runs its own recipes, and
// answers with a job the client polls. Nothing here touches the ComfyUI graph
// pipeline; the only thing the two share is the local output folder.

import type { Mmh3File, Mmh3Job } from '../../types'
import type { EngineConfig } from './engines'
import { mmh3ImageFields, mmh3VideoRecipe, type Mmh3Recipe, type Mmh3RecipeId } from './mmh3Recipe'
import { frameCount } from '../workflow'

/** How often the task is asked about. A second is enough for a step counter. */
export const MMH3_POLL_MS = 1_500

export type Mmh3VideoRequest = {
  engine: EngineConfig
  recipe: Mmh3RecipeId
  prompt: string
  seed?: number
  width?: number
  height?: number
  /** The length in seconds; mmh3 counts frames. */
  duration?: number
  steps?: number
  shiftVideo?: number
  shiftAudio?: number
  firstFrame?: string
  lastFrame?: string
  referenceImages?: string[]
  referenceVideos?: string[]
  referenceAudios?: string[]
}

export type Mmh3ImageRequest = {
  engine: EngineConfig
  prompt: string
  width?: number
  height?: number
  steps?: number
  seed?: number
  referenceImages?: string[]
}

export type Mmh3Request = {
  /** The instance the request goes to. */
  baseUrl: string
  recipe: Mmh3Recipe
  fields: Record<string, string | number>
  files: Mmh3File[]
}

/** The instance a recipe runs on: the fast tier has one of its own. */
export function mmh3BaseUrl(engine: EngineConfig, recipe: Pick<Mmh3Recipe, 'target'>): string {
  const base = recipe.target === 'fast' ? (engine.fastBaseUrl?.trim() || engine.baseUrl) : engine.baseUrl
  return base.replace(/\/+$/, '')
}

/** The form a video request sends. */
export function mmh3VideoRequest(request: Mmh3VideoRequest): Mmh3Request {
  const recipe = mmh3VideoRecipe(request.recipe, { steps: request.steps, shiftVideo: request.shiftVideo, shiftAudio: request.shiftAudio })
  const fields: Record<string, string | number> = { ...recipe.fields }
  if (request.prompt.trim()) fields.prompt = request.prompt.trim()
  if (request.seed !== undefined) fields.seed = Math.round(request.seed)
  if (request.width) fields.width = Math.round(request.width)
  if (request.height) fields.height = Math.round(request.height)
  if (request.duration) fields.frames = frameCount(request.duration)
  const files: Mmh3File[] = []
  if (request.firstFrame) files.push({ field: 'first-frame', path: request.firstFrame })
  if (request.lastFrame) files.push({ field: 'last-frame', path: request.lastFrame })
  for (const path of request.referenceImages ?? []) files.push({ field: 'reference', path })
  for (const path of request.referenceVideos ?? []) files.push({ field: 'reference-video', path })
  for (const path of request.referenceAudios ?? []) files.push({ field: 'reference-audio', path })
  return { baseUrl: mmh3BaseUrl(request.engine, recipe), recipe, fields, files }
}

/** The form a picture request sends. */
export function mmh3ImageRequest(request: Mmh3ImageRequest): Mmh3Request {
  const fields: Record<string, string | number> = {
    ...mmh3ImageFields({ width: request.width, height: request.height, steps: request.steps, seed: request.seed }),
  }
  if (request.prompt.trim()) fields.prompt = request.prompt.trim()
  const files: Mmh3File[] = []
  for (const path of request.referenceImages ?? []) files.push({ field: 'reference', path })
  return { baseUrl: mmh3BaseUrl(request.engine, { target: 'main' }), recipe: { id: 'off', label: '生图', target: 'main', fields: {} }, fields, files }
}

/** The name a downloaded artifact takes in the output folder. */
export function mmh3OutputName(kind: 'video' | 'image', prompt: string): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-')
  const hint = prompt.trim().replace(/\s+/g, ' ').slice(0, 24).replace(/[\\/:*?"<>|]/g, '')
  const suffix = kind === 'video' ? 'mp4' : 'png'
  return `mmh3_${hint ? `${hint}_` : ''}${stamp}.${suffix}`
}

/** How many generations are ahead of this one in the server's queue. */
export async function mmh3QueueAhead(baseUrl: string, id: string): Promise<number> {
  try {
    const list = await window.minimax.mmh3List(baseUrl)
    const index = list.findIndex((job) => job.id === id)
    if (index < 0) return 0
    // The server answers newest first and runs oldest first, so everything
    // after this job in the list is still ahead of it.
    return list.slice(index + 1).filter((job) => job.state === 'queued' || job.state === 'running').length
  } catch {
    return 0
  }
}

export type Mmh3TaskUpdate = {
  state: Mmh3Job['state']
  step: number | null
  steps: number | null
  /** The generations waiting ahead of this one. */
  ahead: number
  error: string | null
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('mmh3 任务已中断。')); return }
    const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve() }, ms)
    const onAbort = () => { clearTimeout(timer); reject(new Error('mmh3 任务已中断。')) }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Waits for a generation to end. The update carries what the card shows:
 * the state, the step, and how many generations are ahead of this one.
 */
export async function waitForMmh3Task(baseUrl: string, id: string, onUpdate: (update: Mmh3TaskUpdate) => void, signal?: AbortSignal): Promise<Mmh3Job> {
  for (;;) {
    if (signal?.aborted) throw new Error('mmh3 任务已中断。')
    const job = await window.minimax.mmh3Job(baseUrl, id)
    const ahead = job.state === 'queued' ? await mmh3QueueAhead(baseUrl, id) : 0
    onUpdate({ state: job.state, step: job.step, steps: job.steps, ahead, error: job.error })
    if (job.state === 'done' || job.state === 'failed') return job
    await delay(MMH3_POLL_MS, signal)
  }
}
