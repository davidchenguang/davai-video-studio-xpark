import type { GenerationJob } from '../types'
import { playableOutputUrl } from './jobPersistence'

/**
 * Reference detection for media-library deletion.
 *
 * Deletion is blocked while another feature still points at the asset.  The
 * stored data is the only source of truth, so an unreadable store fails
 * closed: we refuse the delete instead of risking a silent broken reference.
 * A missing key means the feature was never used and is not a reference.
 */

export const REFERENCE_STORAGE_KEYS = {
  movies: 'minimax.movie-editor-projects',
  continuation: 'oyama.continue.script.v1',
  bookmarks: 'minimax.frame-bookmarks',
  characters: 'minimax.character-projects',
  locations: 'minimax.location-projects',
} as const

export type StorageReader = { getItem(key: string): string | null }

export type AssetReferences = { references: string[]; unreadable: string[] }

type ReadState = { status: 'missing' } | { status: 'ok'; value: unknown } | { status: 'unreadable' }

function readStore(storage: StorageReader, key: string): ReadState {
  const raw = storage.getItem(key)
  if (raw === null) return { status: 'missing' }
  try {
    return { status: 'ok', value: JSON.parse(raw) }
  } catch {
    return { status: 'unreadable' }
  }
}

function mediaPathFromSource(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'minimax-media:') return null
    return url.searchParams.get('path')
  } catch {
    return null
  }
}

function sourceMatchesJob(source: unknown, job: GenerationJob): boolean {
  if (typeof source !== 'string' || !source) return false
  const playable = playableOutputUrl(source)
  if (job.outputUrl && (source === job.outputUrl || playable === job.outputUrl)) return true
  if (!job.localOutputPath) return false
  if (source === job.localOutputPath) return true
  const directPath = mediaPathFromSource(source)
  if (directPath && directPath === job.localOutputPath) return true
  const playablePath = mediaPathFromSource(playable)
  return Boolean(playablePath && playablePath === job.localOutputPath)
}

function entryLabel(value: unknown, fallback: string): string {
  if (!value || typeof value !== 'object') return fallback
  const name = (value as { name?: unknown }).name
  return typeof name === 'string' && name.trim() ? name.trim() : fallback
}

function videoPath(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  const path = (value as { path?: unknown }).path
  return typeof path === 'string' && path ? path : null
}

function pathMatchesJob(path: string | null, job: GenerationJob): boolean {
  return Boolean(path && sourceMatchesJob(path, job))
}

export function collectAssetReferences(job: GenerationJob, jobs: GenerationJob[], storage: StorageReader): AssetReferences {
  const references: string[] = []
  const unreadable: string[] = []
  const add = (label: string) => { if (!references.includes(label)) references.push(label) }

  const movies = readStore(storage, REFERENCE_STORAGE_KEYS.movies)
  if (movies.status === 'unreadable') unreadable.push('影片项目数据')
  else if (movies.status === 'ok') {
    if (!Array.isArray(movies.value)) unreadable.push('影片项目数据')
    else {
      for (const project of movies.value) {
        if (!project || typeof project !== 'object') continue
        const clips = (project as { clips?: unknown }).clips
        if (!Array.isArray(clips)) continue
        if (clips.some((clip) => {
          if (!clip || typeof clip !== 'object') return false
          const entry = clip as { assetId?: unknown; source?: unknown }
          return entry.assetId === `job-${job.id}` || sourceMatchesJob(entry.source, job)
        })) add(`影片项目「${entryLabel(project, '未命名')}」`)
      }
    }
  }

  const scriptState = readStore(storage, REFERENCE_STORAGE_KEYS.continuation)
  let scriptId: string | null = null
  let scriptLabel = '续接脚本'
  if (scriptState.status === 'unreadable') unreadable.push('续接脚本数据')
  else if (scriptState.status === 'ok') {
    const script = scriptState.value
    if (!script || typeof script !== 'object' || Array.isArray(script)) unreadable.push('续接脚本数据')
    else {
      const entry = script as { id?: unknown; videoName?: unknown; sourceJobId?: unknown }
      scriptId = typeof entry.id === 'string' && entry.id ? entry.id : null
      const name = typeof entry.videoName === 'string' && entry.videoName.trim() ? entry.videoName.trim() : '未命名'
      scriptLabel = `续接脚本「${name}」`
      if (entry.sourceJobId === job.id) add(scriptLabel)
      if (scriptId && job.continuation?.scriptId === scriptId) add(`${scriptLabel}的节拍`)
    }
  }

  // A beat job points at its parent job regardless of whether the script is
  // still stored, so the chain check must not depend on the continuation key.
  const childJob = jobs.find((other) => other.id !== job.id && other.continuation?.sourceJobId === job.id)
  if (childJob) {
    const childScriptId = childJob.continuation?.scriptId
    add(childScriptId && childScriptId === scriptId ? `${scriptLabel}的节拍` : '续接节拍（子节点 job）')
  }

  const bookmarks = readStore(storage, REFERENCE_STORAGE_KEYS.bookmarks)
  if (bookmarks.status === 'unreadable') unreadable.push('帧书签数据')
  else if (bookmarks.status === 'ok') {
    if (!Array.isArray(bookmarks.value)) unreadable.push('帧书签数据')
    else {
      for (const project of bookmarks.value) {
        if (!project || typeof project !== 'object') continue
        const entry = project as { id?: unknown; source?: unknown }
        if (entry.id === `job-${job.id}` || sourceMatchesJob(entry.source, job)) add(`帧书签「${entryLabel(project, '未命名')}」`)
      }
    }
  }

  const characters = readStore(storage, REFERENCE_STORAGE_KEYS.characters)
  if (characters.status === 'unreadable') unreadable.push('角色库数据')
  else if (characters.status === 'ok') {
    if (!Array.isArray(characters.value)) unreadable.push('角色库数据')
    else {
      for (const project of characters.value) {
        if (!project || typeof project !== 'object') continue
        const turntable = videoPath((project as { turntableVideo?: unknown }).turntableVideo)
        if (pathMatchesJob(turntable, job)) add(`角色「${entryLabel(project, '未命名')}」漫游视频`)
      }
    }
  }

  const locations = readStore(storage, REFERENCE_STORAGE_KEYS.locations)
  if (locations.status === 'unreadable') unreadable.push('地点库数据')
  else if (locations.status === 'ok') {
    if (!Array.isArray(locations.value)) unreadable.push('地点库数据')
    else {
      for (const project of locations.value) {
        if (!project || typeof project !== 'object') continue
        const walkthrough = videoPath((project as { walkthroughVideo?: unknown }).walkthroughVideo)
        if (pathMatchesJob(walkthrough, job)) add(`地点「${entryLabel(project, '未命名')}」漫游视频`)
      }
    }
  }

  return { references, unreadable }
}

/** Extract the thumbnail cache path from the job's `minimax-media://thumbnail` URL. */
export function thumbnailCachePath(thumbnailUrl?: string): string | undefined {
  if (!thumbnailUrl) return undefined
  try {
    const url = new URL(thumbnailUrl)
    if (url.protocol !== 'minimax-media:' || url.hostname !== 'thumbnail') return undefined
    return url.searchParams.get('path') ?? undefined
  } catch {
    return undefined
  }
}