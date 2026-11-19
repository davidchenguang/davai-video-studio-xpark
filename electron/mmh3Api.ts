// The mmh3 client for the main process. The renderer never talks to mmh3
// itself: mmh3 has no CORS headers, no authentication of its own, and
// the artifacts have to end up on this machine's disk. Every call here therefore
// goes through the loopback interface and comes back as plain data.

import { createWriteStream } from 'node:fs'
import { mkdir, readFile, rename, stat, unlink } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as WebReadableStream } from 'node:stream/web'

// cancelling = the engine accepted a stop and is finishing the current step;
// cancelled = a terminal state, the artifact never lands. Unknown states still
// fall back to queued, but the engine's own vocabulary comes first.
export type Mmh3JobState = 'queued' | 'running' | 'cancelling' | 'cancelled' | 'done' | 'failed'

export type Mmh3Job = {
  id: string
  state: Mmh3JobState
  queued: number
  seconds: number | null
  /** Seconds the just-finished step took (draft upscale excluded); null until the first step completes. */
  stepSeconds: number | null
  step: number | null
  steps: number | null
  error: string | null
}

export type Mmh3Weight = {
  kind: 'text_encoder' | 'video_vae' | 'image_vae' | 'audio_vae' | 'latent_upscaler' | 'dit'
  file: string
  bytes: number
  /** A 64-bit fingerprint of the layout plus sampled weights — it separates two
   * fine-tunes of the same architecture but is NOT a checksum: it says two files
   * differ, never that one of them is intact. */
  digest: string
  /** dit only, in the order the engine applies them. */
  adapters?: Array<{ file: string; bytes: number; digest: string; strength: number; mode: 'adapter' | 'merge' }>
}

export type Mmh3RecipeOption = string | number | null

export type Mmh3Recipe = {
  id: string
  summary: string
  /** The option keys are the exact multipart field names of POST /v1/generations. */
  options: Record<string, Mmh3RecipeOption>
  /** Only recipes trained on a fixed canvas carry one; shift pairs with it. */
  canvas: { width: number; height: number } | null
  available: boolean
  missing: string[]
  dit: string | null
  note: string | null
  source: string | null
  docs: string | null
}

export type Mmh3Status = {
  reachable: boolean
  generating: string | null
  /** The job the engine has accepted a stop for; null when nothing is stopping. */
  cancelling: string | null
  queued: number
  /** The models the instance holds; null while a generation runs. */
  models: string[] | null
  /** The weights the instance actually loaded; the dit entry disappears while a run holds it (busy, not broken). */
  weights: Mmh3Weight[] | null
  memory: { free: number; total: number } | null
  error?: string
}

export type Mmh3FieldValue = string | number

export type Mmh3FileField = { field: string; path: string }

/** A text field the server reads as a list: every entry is one value under the
 * same name, in order — the engine pairs the i-th frame-index with the i-th
 * keyframe, so they cannot be joined into one value. */
export type Mmh3RepeatField = { name: string; value: string }

const SUBMIT_TIMEOUT_MS = 15_000
const POLL_TIMEOUT_MS = 5_000
const DOWNLOAD_LIMIT_BYTES = 8 * 1024 * 1024 * 1024

function baseUrlOf(baseUrl: string): string {
  const trimmed = (baseUrl ?? '').trim()
  if (!trimmed) throw new Error('没有可用的 mmh3 地址。')
  let parsed: URL
  try { parsed = new URL(trimmed) } catch { throw new Error(`mmh3 地址无效：${trimmed}`) }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('mmh3 地址只支持 http 或 https。')
  return trimmed.replace(/\/+$/, '')
}

async function readError(response: Response): Promise<string> {
  const body = await response.text().catch(() => '')
  if (!body) return `mmh3 返回了 ${response.status}`
  try {
    const parsed = JSON.parse(body) as { error?: string | { message?: string } }
    const message = typeof parsed.error === 'string' ? parsed.error : parsed.error?.message
    if (message) return message
  } catch { /* Not JSON: keep the body as the message. */ }
  return body
}

export function parseJob(value: unknown): Mmh3Job {
  const job = (value ?? {}) as Partial<Mmh3Job>
  const state: Mmh3JobState =
    job.state === 'running' || job.state === 'done' || job.state === 'failed' || job.state === 'cancelling' || job.state === 'cancelled'
      ? job.state
      : 'queued'
  return {
    id: typeof job.id === 'string' ? job.id : '',
    state,
    queued: Number(job.queued) || 0,
    seconds: typeof job.seconds === 'number' ? job.seconds : null,
    stepSeconds: typeof (job as { step_seconds?: unknown }).step_seconds === 'number' ? (job as { step_seconds: number }).step_seconds : null,
    step: typeof job.step === 'number' ? job.step : null,
    steps: typeof job.steps === 'number' ? job.steps : null,
    error: typeof job.error === 'string' && job.error ? job.error : null,
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

export function parseWeights(value: unknown): Mmh3Weight[] | null {
  if (!Array.isArray(value)) return null
  const weights: Mmh3Weight[] = []
  for (const entry of value) {
    if (!isRecord(entry)) continue
    if (typeof entry.kind !== 'string' || typeof entry.file !== 'string') continue
    const adapters: Mmh3Weight['adapters'] = Array.isArray(entry.adapters)
      ? entry.adapters.filter(isRecord).map((adapter) => ({
          file: typeof adapter.file === 'string' ? adapter.file : '',
          bytes: Number(adapter.bytes) || 0,
          digest: typeof adapter.digest === 'string' ? adapter.digest : '',
          strength: Number(adapter.strength) || 0,
          mode: adapter.mode === 'merge' ? ('merge' as const) : ('adapter' as const),
        })).filter((adapter) => adapter.file)
      : undefined
    weights.push({
      kind: entry.kind as Mmh3Weight['kind'],
      file: entry.file,
      bytes: Number(entry.bytes) || 0,
      digest: typeof entry.digest === 'string' ? entry.digest : '',
      ...(adapters && adapters.length ? { adapters } : {}),
    })
  }
  return weights
}

export async function mmh3Status(baseUrl: string): Promise<Mmh3Status> {
  try {
    const response = await fetch(`${baseUrlOf(baseUrl)}/v1/status`, { signal: AbortSignal.timeout(POLL_TIMEOUT_MS) })
    if (!response.ok) return { reachable: false, generating: null, cancelling: null, queued: 0, models: null, weights: null, memory: null, error: await readError(response) }
    const value = await response.json() as {
      generating?: unknown
      cancelling?: unknown
      queued?: unknown
      models?: unknown
      weights?: unknown
      memory?: { free?: number; total?: number }
    }
    const models = Array.isArray(value.models) ? value.models.filter((name): name is string => typeof name === 'string') : null
    return {
      reachable: true,
      generating: typeof value.generating === 'string' ? value.generating : null,
      cancelling: typeof value.cancelling === 'string' ? value.cancelling : null,
      queued: Number(value.queued) || 0,
      models,
      weights: parseWeights(value.weights),
      memory: value.memory ? { free: Number(value.memory.free) || 0, total: Number(value.memory.total) || 0 } : null,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { reachable: false, generating: null, cancelling: null, queued: 0, models: null, weights: null, memory: null, error: message }
  }
}

/** Asks the engine to stop a queued or running generation; the engine finishes the step in flight first. */
export async function mmh3Interrupt(baseUrl: string, id: string): Promise<{ interrupted: boolean; job: Mmh3Job | null; error?: string }> {
  try {
    const response = await fetch(`${baseUrlOf(baseUrl)}/v1/generations/${encodeURIComponent(id)}/interrupt`, {
      method: 'POST',
      signal: AbortSignal.timeout(POLL_TIMEOUT_MS),
    })
    // 409 = the job already reached a terminal state; that is not an error, just
    // a race the caller resolves from the job it already tracks.
    if (response.status === 409) return { interrupted: false, job: null }
    if (!response.ok) return { interrupted: false, job: null, error: await readError(response) }
    return { interrupted: true, job: parseJob(await response.json()) }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { interrupted: false, job: null, error: message }
  }
}

export async function mmh3Recipes(baseUrl: string): Promise<{ recipes: Mmh3Recipe[]; error?: string }> {
  try {
    const response = await fetch(`${baseUrlOf(baseUrl)}/v1/recipes`, { signal: AbortSignal.timeout(POLL_TIMEOUT_MS) })
    if (!response.ok) return { recipes: [], error: await readError(response) }
    const value = await response.json() as { recipes?: unknown }
    const recipes: Mmh3Recipe[] = Array.isArray(value.recipes)
      ? value.recipes.filter(isRecord).map((entry) => ({
          id: typeof entry.id === 'string' ? entry.id : '',
          summary: typeof entry.summary === 'string' ? entry.summary : '',
          options: isRecord(entry.options)
            ? Object.fromEntries(Object.entries(entry.options).map(([key, option]) => [key, option as Mmh3RecipeOption]))
            : {},
          canvas: isRecord(entry.canvas) && typeof entry.canvas.width === 'number' && typeof entry.canvas.height === 'number'
            ? { width: entry.canvas.width, height: entry.canvas.height }
            : null,
          available: entry.available === true,
          missing: Array.isArray(entry.missing) ? entry.missing.filter((name): name is string => typeof name === 'string') : [],
          dit: typeof entry.dit === 'string' ? entry.dit : null,
          note: typeof entry.note === 'string' ? entry.note : null,
          source: typeof entry.source === 'string' ? entry.source : null,
          docs: typeof entry.docs === 'string' ? entry.docs : null,
        })).filter((recipe) => recipe.id)
      : []
    return { recipes }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { recipes: [], error: message }
  }
}

/** Wraps raw transport failures (timeout, connection reset) in a guide the UI can show as-is. */
function submissionError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error)
  if (error instanceof Error && error.name === 'TimeoutError') {
    return new Error('mmh3 提交超时：引擎可能正在换载权重，请稍后重试；若持续失败请检查 mmh3 服务状态。')
  }
  if (/fetch failed|ECONNREFUSED|ECONNRESET|ENOTFOUND|socket hang up/i.test(message)) {
    return new Error(`mmh3 提交失败：无法连接引擎（${message}）。请确认 mmh3 服务正在运行、地址正确，然后重试。`)
  }
  return error instanceof Error ? error : new Error(message)
}

async function submit(baseUrl: string, path: string, fields: Record<string, Mmh3FieldValue>, files: Mmh3FileField[], repeats: Mmh3RepeatField[] = []): Promise<Mmh3Job> {
  const form = new FormData()
  for (const [name, value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === '') continue
    form.append(name, String(value))
  }
  for (const repeat of repeats) form.append(repeat.name, String(repeat.value))
  for (const file of files) {
    const details = await stat(file.path).catch(() => null)
    if (!details?.isFile()) throw new Error(`mmh3 上传的参考文件不存在：${file.path}`)
    const body = await readFile(file.path)
    form.append(file.field, new Blob([body], { type: 'application/octet-stream' }), basename(file.path))
  }
  let response: Response
  try {
    response = await fetch(`${baseUrlOf(baseUrl)}${path}`, { method: 'POST', body: form, signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS) })
  } catch (error) {
    throw submissionError(error)
  }
  if (!response.ok) throw new Error(await readError(response))
  return parseJob(await response.json())
}

export async function mmh3Submit(baseUrl: string, fields: Record<string, Mmh3FieldValue>, files: Mmh3FileField[] = [], repeats: Mmh3RepeatField[] = []): Promise<Mmh3Job> {
  return submit(baseUrl, '/v1/generations', fields, files, repeats)
}

export async function mmh3SubmitImage(baseUrl: string, fields: Record<string, Mmh3FieldValue>, files: Mmh3FileField[] = []): Promise<Mmh3Job> {
  return submit(baseUrl, '/v1/images', fields, files)
}

export async function mmh3Job(baseUrl: string, id: string): Promise<Mmh3Job> {
  const response = await fetch(`${baseUrlOf(baseUrl)}/v1/generations/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(POLL_TIMEOUT_MS) })
  if (!response.ok) throw new Error(await readError(response))
  return parseJob(await response.json())
}

export async function mmh3List(baseUrl: string): Promise<Mmh3Job[]> {
  const response = await fetch(`${baseUrlOf(baseUrl)}/v1/generations`, { signal: AbortSignal.timeout(POLL_TIMEOUT_MS) })
  if (!response.ok) throw new Error(await readError(response))
  const value = await response.json() as { generations?: unknown }
  // The server answers with the generations under a key, most recent first.
  const entries = Array.isArray(value?.generations) ? value.generations : []
  return entries.map(parseJob).filter((job) => job.id)
}

/** Removes a finished generation and everything it wrote. A running one stays. */
export async function mmh3Delete(baseUrl: string, id: string): Promise<{ removed: boolean }> {
  const response = await fetch(`${baseUrlOf(baseUrl)}/v1/generations/${encodeURIComponent(id)}`, { method: 'DELETE', signal: AbortSignal.timeout(POLL_TIMEOUT_MS) })
  if (!response.ok) return { removed: false }
  return { removed: true }
}

/**
 * Downloads a finished artifact into the output directory. The bytes land in a
 * staged file first, so a half-written video never shows up as a library item.
 */
export async function mmh3Download(baseUrl: string, id: string, kind: 'video' | 'image', outputDirectory: string, fileName: string): Promise<{ path: string; name: string }> {
  const target = resolve(outputDirectory)
  await mkdir(target, { recursive: true })
  const safeName = fileName.replace(/[\\/:*?"<>|]/g, '_').trim() || `mmh3-${id}.${kind === 'video' ? 'mp4' : 'png'}`
  const destination = join(target, safeName)
  const staged = `${destination}.part`
  // A download has no timeout: a long video may take minutes to arrive, and
  // the size cap is what keeps a runaway response from filling the disk.
  const response = await fetch(`${baseUrlOf(baseUrl)}/v1/generations/${encodeURIComponent(id)}/${kind}`)
  if (!response.ok) throw new Error(await readError(response))
  const declared = Number(response.headers.get('content-length') ?? 0)
  if (declared > DOWNLOAD_LIMIT_BYTES) throw new Error('mmh3 产物超过了下载上限。')
  if (!response.body) throw new Error('mmh3 没有返回产物内容。')
  let written = 0
  const counter = new Transform({
    transform(chunk, _encoding, callback) {
      written += chunk.length
      if (written > DOWNLOAD_LIMIT_BYTES) { callback(new Error('mmh3 产物超过了下载上限。')); return }
      callback(null, chunk)
    },
  })
  try {
    const source = Readable.fromWeb(response.body as unknown as WebReadableStream<Uint8Array>)
    await pipeline(source, counter, createWriteStream(staged))
    await rename(staged, destination)
  } catch (error) {
    await unlink(staged).catch(() => undefined)
    throw error
  }
  return { path: destination, name: safeName }
}

/**
 * Hands the GPU memory back to ComfyUI before mmh3 takes it. The queue check
 * comes first: unloading the models of a running job would break it.
 */
export async function releaseComfyMemory(comfyUrl: string): Promise<{ released: boolean; busy: boolean; error?: string }> {
  const base = (comfyUrl ?? '').trim().replace(/\/+$/, '')
  if (!base) return { released: false, busy: false, error: '没有可用的 ComfyUI 地址。' }
  try {
    const queue = await fetch(`${base}/queue`, { signal: AbortSignal.timeout(10_000) })
    if (queue.ok) {
      const value = await queue.json() as { queue_running?: unknown[]; queue_pending?: unknown[] }
      const running = Array.isArray(value.queue_running) ? value.queue_running.length : 0
      const pending = Array.isArray(value.queue_pending) ? value.queue_pending.length : 0
      if (running + pending > 0) return { released: false, busy: true }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { released: false, busy: false, error: message }
  }
  try {
    const response = await fetch(`${base}/free`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ unload_models: true, free_memory: true }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) return { released: false, busy: false, error: await readError(response) }
    return { released: true, busy: false }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { released: false, busy: false, error: message }
  }
}
