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

export type Mmh3JobState = 'queued' | 'running' | 'done' | 'failed'

export type Mmh3Job = {
  id: string
  state: Mmh3JobState
  queued: number
  seconds: number | null
  step: number | null
  steps: number | null
  error: string | null
}

export type Mmh3Status = {
  reachable: boolean
  generating: string | null
  queued: number
  /** The models the instance holds; null while a generation runs. */
  models: string[] | null
  memory: { free: number; total: number } | null
  error?: string
}

export type Mmh3FieldValue = string | number

export type Mmh3FileField = { field: string; path: string }

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

function parseJob(value: unknown): Mmh3Job {
  const job = (value ?? {}) as Partial<Mmh3Job>
  const state: Mmh3JobState = job.state === 'running' || job.state === 'done' || job.state === 'failed' ? job.state : 'queued'
  return {
    id: typeof job.id === 'string' ? job.id : '',
    state,
    queued: Number(job.queued) || 0,
    seconds: typeof job.seconds === 'number' ? job.seconds : null,
    step: typeof job.step === 'number' ? job.step : null,
    steps: typeof job.steps === 'number' ? job.steps : null,
    error: typeof job.error === 'string' && job.error ? job.error : null,
  }
}

export async function mmh3Status(baseUrl: string): Promise<Mmh3Status> {
  try {
    const response = await fetch(`${baseUrlOf(baseUrl)}/v1/status`, { signal: AbortSignal.timeout(POLL_TIMEOUT_MS) })
    if (!response.ok) return { reachable: false, generating: null, queued: 0, models: null, memory: null, error: await readError(response) }
    const value = await response.json() as { generating?: unknown; queued?: unknown; models?: unknown; memory?: { free?: number; total?: number } }
    const models = Array.isArray(value.models) ? value.models.filter((name): name is string => typeof name === 'string') : null
    return {
      reachable: true,
      generating: typeof value.generating === 'string' ? value.generating : null,
      queued: Number(value.queued) || 0,
      models,
      memory: value.memory ? { free: Number(value.memory.free) || 0, total: Number(value.memory.total) || 0 } : null,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { reachable: false, generating: null, queued: 0, models: null, memory: null, error: message }
  }
}

async function submit(baseUrl: string, path: string, fields: Record<string, Mmh3FieldValue>, files: Mmh3FileField[]): Promise<Mmh3Job> {
  const form = new FormData()
  for (const [name, value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === '') continue
    form.append(name, String(value))
  }
  for (const file of files) {
    const details = await stat(file.path).catch(() => null)
    if (!details?.isFile()) throw new Error(`mmh3 上传的参考文件不存在：${file.path}`)
    const body = await readFile(file.path)
    form.append(file.field, new Blob([body], { type: 'application/octet-stream' }), basename(file.path))
  }
  const response = await fetch(`${baseUrlOf(baseUrl)}${path}`, { method: 'POST', body: form, signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS) })
  if (!response.ok) throw new Error(await readError(response))
  return parseJob(await response.json())
}

export async function mmh3Submit(baseUrl: string, fields: Record<string, Mmh3FieldValue>, files: Mmh3FileField[] = []): Promise<Mmh3Job> {
  return submit(baseUrl, '/v1/generations', fields, files)
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
