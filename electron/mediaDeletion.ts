import { extname, isAbsolute, relative, resolve, win32 as win32Path } from 'node:path'

/**
 * Media-library deletion policy shared by the main process and its tests.
 *
 * This module deliberately has no Electron or filesystem imports: every side
 * effect is injected by the caller.  The IPC handler validates each requested
 * path against the trusted output roots before touching the disk, recycles the
 * media files, and removes the regenerable thumbnail cache.
 */

export type MediaDeletionInput = {
  files: string[]
  thumbnailPath?: string
}

export type MediaDeletionResult = {
  recycled: string[]
  missing: string[]
  failed: Array<{ path: string; reason: string }>
  thumbnailRemoved: boolean
}

export type MediaFileStat = { size: number; mtimeMs: number; isFile: boolean }

export type MediaDeletionDeps = {
  exists: (path: string) => boolean
  stat: (path: string) => Promise<MediaFileStat>
  realpath: (path: string) => Promise<string>
  trashItem: (path: string) => Promise<void>
  unlink: (path: string) => Promise<void>
}

export type MediaDeletionRoots = {
  /** Trusted ComfyUI output directories derived by the main process. */
  outputRoots: string[]
  /** Thumbnail cache directory; deletion is rejected when absent. */
  thumbnailRoot: string | null
  /** True when the ComfyUI-reported output root could not be resolved right now. */
  comfyRootUnavailable: boolean
  platform: NodeJS.Platform
}

export const MAX_MEDIA_DELETION_FILES = 8
const THUMBNAIL_EXTENSION = '.jpg'

const caseInsensitivePlatform = (platform: NodeJS.Platform) => platform === 'win32' || platform === 'darwin'

/**
 * Absolute per the platform the caller declared. The rest of the pipeline
 * (containment, dedup) intentionally resolves with the host path module, so a
 * win32 profile stays lexically comparable on any host that runs the suites.
 */
const isAbsolutePath = (value: string, platform: NodeJS.Platform) =>
  platform === 'win32' ? win32Path.isAbsolute(value) : isAbsolute(value)

const comparablePath = (value: string, platform: NodeJS.Platform) => {
  const normalized = resolve(value)
  return caseInsensitivePlatform(platform) ? normalized.toLowerCase() : normalized
}

/**
 * Lexical containment check. The root itself is rejected because the media
 * library only deletes files, never a directory.
 */
export function isPathInsideRoot(root: string, candidate: string, platform: NodeJS.Platform): boolean {
  if (!root || !candidate) return false
  const normalizedRoot = comparablePath(root, platform)
  const normalizedCandidate = comparablePath(candidate, platform)
  const child = relative(normalizedRoot, normalizedCandidate)
  if (!child || isAbsolute(child)) return false
  if (child === '..') return false
  if (child.startsWith('../') || child.startsWith('..\\')) return false
  return true
}

function validateInput(input: unknown, platform: NodeJS.Platform): MediaDeletionInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('删除请求无效。')
  const value = input as { files?: unknown; thumbnailPath?: unknown }
  if (!Array.isArray(value.files)) throw new Error('删除请求缺少文件列表。')
  if (value.files.length > MAX_MEDIA_DELETION_FILES) throw new Error(`一次最多删除 ${MAX_MEDIA_DELETION_FILES} 个文件。`)
  const files: string[] = []
  for (const file of value.files) {
    if (typeof file !== 'string' || !file.trim()) throw new Error('删除路径必须是非空字符串。')
    if (!isAbsolutePath(file, platform)) throw new Error('删除路径必须是绝对路径。')
    const absolute = resolve(file)
    if (!files.includes(absolute)) files.push(absolute)
  }
  let thumbnailPath: string | undefined
  if (value.thumbnailPath !== undefined) {
    if (typeof value.thumbnailPath !== 'string' || !value.thumbnailPath.trim()) throw new Error('缩略图缓存路径无效。')
    thumbnailPath = resolve(value.thumbnailPath)
  }
  return { files, thumbnailPath }
}

async function assertRealPathInside(
  deps: MediaDeletionDeps,
  roots: MediaDeletionRoots,
  root: string,
  candidate: string,
  invalidMessage: string,
) {
  if (!deps.exists(candidate)) return
  const real = await deps.realpath(candidate)
  if (!isPathInsideRoot(root, real, roots.platform)) throw new Error(invalidMessage)
}

/**
 * Delete media files after validating every requested path.
 *
 * Validation is all-or-nothing: if one path is outside the trusted roots, the
 * whole request is rejected before any file is touched.  Execution is
 * per-file: a single recycle failure is reported in `failed` and does not
 * interrupt the remaining files.
 */
export async function deleteMedia(
  input: unknown,
  roots: MediaDeletionRoots,
  deps: MediaDeletionDeps,
): Promise<MediaDeletionResult> {
  const normalized = validateInput(input, roots.platform)
  const outputRoots = roots.outputRoots
    .filter((root): root is string => typeof root === 'string' && Boolean(root))
    .map((root) => resolve(root))
  if (outputRoots.length === 0) throw new Error('未配置可信输出目录，无法删除媒体文件。')

  const outsideRootsMessage = roots.comfyRootUnavailable
    ? '无法确认该文件属于可信输出目录（ComfyUI 未连接），请连接后重试。'
    : '只能删除可信输出目录内的媒体文件。'

  for (const file of normalized.files) {
    if (!outputRoots.some((root) => isPathInsideRoot(root, file, roots.platform))) throw new Error(outsideRootsMessage)
    const matchedRoot = outputRoots.find((root) => isPathInsideRoot(root, file, roots.platform))!
    await assertRealPathInside(deps, roots, matchedRoot, file, outsideRootsMessage)
    if (deps.exists(file)) {
      const stat = await deps.stat(file)
      if (!stat.isFile) throw new Error('只能删除文件，不能删除目录。')
    }
  }

  let thumbnailPath: string | undefined
  if (normalized.thumbnailPath) {
    if (!roots.thumbnailRoot || !isPathInsideRoot(roots.thumbnailRoot, normalized.thumbnailPath, roots.platform) || extname(normalized.thumbnailPath).toLowerCase() !== THUMBNAIL_EXTENSION) {
      throw new Error('缩略图缓存路径无效。')
    }
    await assertRealPathInside(deps, roots, roots.thumbnailRoot, normalized.thumbnailPath, '缩略图缓存路径无效。')
    thumbnailPath = normalized.thumbnailPath
  }

  const result: MediaDeletionResult = { recycled: [], missing: [], failed: [], thumbnailRemoved: false }
  for (const file of normalized.files) {
    if (!deps.exists(file)) {
      result.missing.push(file)
      continue
    }
    try {
      await deps.trashItem(file)
      result.recycled.push(file)
    } catch (error) {
      result.failed.push({ path: file, reason: error instanceof Error ? error.message : String(error) })
    }
  }

  if (thumbnailPath && deps.exists(thumbnailPath)) {
    try {
      await deps.unlink(thumbnailPath)
      result.thumbnailRemoved = true
    } catch {
      // The thumbnail cache is regenerable; a failed cleanup must not fail the delete.
    }
  }

  return result
}