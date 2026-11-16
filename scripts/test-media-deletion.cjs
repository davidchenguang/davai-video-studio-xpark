const assert = require('node:assert/strict')
const path = require('node:path')
const { load } = require('./test-ts-loader.cjs')

const { MAX_MEDIA_DELETION_FILES, deleteMedia, isPathInsideRoot } = load('electron/mediaDeletion.ts')
const { collectAssetReferences, thumbnailCachePath, REFERENCE_STORAGE_KEYS } = load('src/lib/libraryReferences.ts')

const resolve = (value) => path.resolve(value)
// Modules loaded through the vm sandbox come from another realm, so
// deepStrictEqual rejects them on prototype identity even when the shapes
// match. Compare the serialized values instead.
const same = (actual, expected, message) => assert.equal(JSON.stringify(actual), JSON.stringify(expected), message)

// ---------------------------------------------------------------------------
// Path containment
// ---------------------------------------------------------------------------

const ROOT = 'C:/output'
assert.equal(isPathInsideRoot(ROOT, 'C:/output/a.png', 'win32'), true)
assert.equal(isPathInsideRoot(ROOT, 'C:/output/nested/beat/a.mp4', 'win32'), true)
assert.equal(isPathInsideRoot(ROOT, 'C:/OUTPUT/A.PNG', 'win32'), true, 'win32 containment is case-insensitive')
assert.equal(isPathInsideRoot(ROOT, ROOT, 'win32'), false, 'the root itself is a directory, not a file')
assert.equal(isPathInsideRoot(ROOT, 'C:/output2/a.png', 'win32'), false, 'a sibling with a shared prefix is outside')
assert.equal(isPathInsideRoot(ROOT, 'C:/evil.png', 'win32'), false)
assert.equal(isPathInsideRoot(ROOT, 'D:/output/a.png', 'win32'), false, 'another drive is outside')
assert.equal(isPathInsideRoot(ROOT, 'C:/output/../evil.png', 'win32'), false, 'lexical traversal cannot escape')
assert.equal(isPathInsideRoot(ROOT, 'C:/output/../output/a.png', 'win32'), true, 'traversal that lands back inside is still inside')
assert.equal(isPathInsideRoot('', 'C:/output/a.png', 'win32'), false)
assert.equal(isPathInsideRoot(ROOT, '', 'win32'), false)

// ---------------------------------------------------------------------------
// deleteMedia validation is all-or-nothing
// ---------------------------------------------------------------------------

const makeDeps = (options = {}) => {
  const calls = { trash: [], unlink: [] }
  return {
    calls,
    exists: options.exists ?? (() => true),
    stat: options.stat ?? (async () => ({ size: 1, mtimeMs: 1, isFile: true })),
    realpath: options.realpath ?? (async (value) => value),
    trashItem: options.trashItem ?? (async (value) => { calls.trash.push(value) }),
    unlink: options.unlink ?? (async (value) => { calls.unlink.push(value) }),
  }
}
const roots = (overrides = {}) => ({
  outputRoots: [ROOT],
  thumbnailRoot: 'C:/userData/video-thumbnails',
  comfyRootUnavailable: false,
  platform: 'win32',
  ...overrides,
})

assert.equal(MAX_MEDIA_DELETION_FILES, 8)

const rejected = async (label, input, rootOverrides, depOverrides, message) => {
  const deps = makeDeps(depOverrides)
  await assert.rejects(deleteMedia(input, roots(rootOverrides), deps), message)
  assert.equal(deps.calls.trash.length, 0, `${label} must not touch any file`)
}

;(async () => {
  await rejected('null input', null, {}, {}, /删除请求无效/)
  await rejected('array input', [], {}, {}, /删除请求无效/)
  await rejected('missing files', {}, {}, {}, /缺少文件列表/)
  await rejected('relative path', { files: ['a.mp4'] }, {}, {}, /绝对路径/)
  await rejected('non-string path', { files: [42] }, {}, {}, /非空字符串/)
  await rejected('too many files', { files: Array.from({ length: MAX_MEDIA_DELETION_FILES + 1 }, (_, i) => `C:/output/${i}.mp4`) }, {}, {}, /最多删除 8 个文件/)
  await rejected('no trusted roots', { files: [`${ROOT}/a.mp4`] }, { outputRoots: [] }, {}, /未配置可信输出目录/)
  await rejected('outside root', { files: [`${ROOT}/a.mp4`, 'C:/evil/b.mp4'] }, {}, {}, /只能删除可信输出目录内的媒体文件/)
  await rejected('root itself', { files: [ROOT] }, {}, {}, /只能删除可信输出目录内的媒体文件/)
  await rejected('directory', { files: [`${ROOT}/folder`] }, {}, { stat: async () => ({ size: 0, mtimeMs: 1, isFile: false }) }, /只能删除文件/)
  await rejected('realpath escape', { files: [`${ROOT}/link.mp4`] }, {}, { realpath: async () => 'C:/evil/link.mp4' }, /只能删除可信输出目录内的媒体文件/)
  await rejected('thumbnail outside root', { files: [], thumbnailPath: 'C:/evil/thumb.jpg' }, {}, {}, /缩略图缓存路径无效/)
  await rejected('thumbnail wrong extension', { files: [], thumbnailPath: 'C:/userData/video-thumbnails/thumb.png' }, {}, {}, /缩略图缓存路径无效/)
  await rejected('thumbnail root unavailable', { files: [], thumbnailPath: 'C:/userData/video-thumbnails/thumb.jpg' }, { thumbnailRoot: null }, {}, /缩略图缓存路径无效/)
  await rejected('thumbnail realpath escape', { files: [], thumbnailPath: 'C:/userData/video-thumbnails/thumb.jpg' }, {}, { realpath: async (value) => value.endsWith('thumb.jpg') ? 'C:/evil/thumb.jpg' : value }, /缩略图缓存路径无效/)

  // Portable ComfyUI: a second trusted root reported by /system_stats is accepted.
  const portableDeps = makeDeps()
  const portableResult = await deleteMedia({ files: ['D:/ComfyUI_windows_portable/ComfyUI/output/a.mp4'] }, roots({ outputRoots: [ROOT, 'D:/ComfyUI_windows_portable/ComfyUI/output'] }), portableDeps)
  same(portableResult.recycled, [resolve('D:/ComfyUI_windows_portable/ComfyUI/output/a.mp4')])

  // The ComfyUI-unreachable message must tell the user how to recover.
  await rejected('unverified comfy root', { files: ['C:/D/ComfyUI/output/a.mp4'], outputRoots: [ROOT] }, { comfyRootUnavailable: true }, {}, /ComfyUI 未连接/)

  // Remote assets legitimately send an empty file list.
  const empty = await deleteMedia({ files: [] }, roots(), makeDeps())
  same(empty, { recycled: [], missing: [], failed: [], thumbnailRemoved: false })

  // Deduplicated absolute paths are trashed once.
  const duplicate = makeDeps()
  const duplicateResult = await deleteMedia({ files: [`${ROOT}/a.mp4`, resolve(`${ROOT}/a.mp4`)] }, roots(), duplicate)
  same(duplicateResult.recycled, [resolve(`${ROOT}/a.mp4`)])
  assert.equal(duplicate.calls.trash.length, 1)

  // A missing file is reported, not trashed, and does not stop the batch.
  const missingDeps = makeDeps({ exists: (value) => value.endsWith('a.mp4') ? false : true })
  const missingResult = await deleteMedia({ files: [`${ROOT}/a.mp4`, `${ROOT}/b.mp4`] }, roots(), missingDeps)
  same(missingResult.missing, [resolve(`${ROOT}/a.mp4`)])
  same(missingResult.recycled, [resolve(`${ROOT}/b.mp4`)])

  // A per-file trash failure is reported and the remaining files still run.
  const partialDeps = makeDeps({ trashItem: async (value) => { if (value.endsWith('a.mp4')) throw new Error('denied') } })
  const partialResult = await deleteMedia({ files: [`${ROOT}/a.mp4`, `${ROOT}/b.mp4`] }, roots(), partialDeps)
  same(partialResult.failed.map((entry) => entry.path), [resolve(`${ROOT}/a.mp4`)])
  // The thrown Error comes from the host realm, so the sandboxed module's
  // `instanceof Error` is false and it falls back to String(error).
  assert.match(partialResult.failed[0].reason, /denied$/)
  same(partialResult.recycled, [resolve(`${ROOT}/b.mp4`)])
  same(partialResult.missing, [])

  // Thumbnail cleanup is best-effort and reports whether the cache file went away.
  const thumbDeps = makeDeps({ exists: (value) => value.endsWith('.jpg') })
  const thumbResult = await deleteMedia({ files: [], thumbnailPath: 'C:/userData/video-thumbnails/abc.jpg' }, roots(), thumbDeps)
  assert.equal(thumbResult.thumbnailRemoved, true)
  same(thumbDeps.calls.unlink, [resolve('C:/userData/video-thumbnails/abc.jpg')])
  const thumbFailure = await deleteMedia({ files: [], thumbnailPath: 'C:/userData/video-thumbnails/abc.jpg' }, roots(), makeDeps({
    exists: (value) => value.endsWith('.jpg'),
    unlink: async () => { throw new Error('locked') },
  }))
  assert.equal(thumbFailure.thumbnailRemoved, false)
  const thumbGone = await deleteMedia({ files: [], thumbnailPath: 'C:/userData/video-thumbnails/abc.jpg' }, roots(), makeDeps({ exists: () => false }))
  assert.equal(thumbGone.thumbnailRemoved, false)

  // -------------------------------------------------------------------------
  // Reference detection
  // -------------------------------------------------------------------------

  const RAW_URL = 'http://127.0.0.1:8188/view?filename=a.mp4&type=output'
  const PLAYABLE_URL = () => `minimax-media://comfy?url=${encodeURIComponent(RAW_URL)}`
  const LOCAL_PATH = resolve('C:/output/a.mp4')

  const makeStorage = (entries) => ({
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(entries, key) ? entries[key] : null
    },
  })

  const baseJob = () => ({
    id: 'beat-1',
    mode: 'text',
    prompt: 'clip',
    createdAt: 1,
    status: 'completed',
    progress: 100,
    width: 1280,
    height: 720,
    duration: 5,
    outputUrl: PLAYABLE_URL(),
    localOutputPath: LOCAL_PATH,
  })

  const refsFor = (entries, job = baseJob(), jobs = [job]) => collectAssetReferences(job, jobs, makeStorage(entries))

  // Missing keys: the feature was never used, so there is nothing to protect and nothing to retry.
  same(refsFor({}), { references: [], unreadable: [] })

  // Movie clips match by assetId and by raw ComfyUI URL (normalized before comparing).
  const movieEntries = JSON.stringify([{ name: 'Cut', clips: [{ assetId: 'job-beat-1' }] }])
  same(refsFor({ [REFERENCE_STORAGE_KEYS.movies]: movieEntries }).references, ['影片项目「Cut」'])
  const movieSource = JSON.stringify([{ name: 'Cut', clips: [{ source: RAW_URL }] }])
  same(refsFor({ [REFERENCE_STORAGE_KEYS.movies]: movieSource }).references, ['影片项目「Cut」'])

  // Bookmark projects match by id or by a minimax-media path that resolves to localOutputPath.
  same(refsFor({ [REFERENCE_STORAGE_KEYS.bookmarks]: JSON.stringify([{ id: 'job-beat-1', name: 'Beat' }]) }).references, ['帧书签「Beat」'])
  const bookmarkPath = JSON.stringify([{ name: 'Beat', source: `minimax-media://local?path=${encodeURIComponent(LOCAL_PATH)}` }])
  same(refsFor({ [REFERENCE_STORAGE_KEYS.bookmarks]: bookmarkPath }).references, ['帧书签「Beat」'])

  // Continuation: the stored script's first segment.
  const scriptFirst = JSON.stringify({ id: 's1', videoName: 'Line', sourceJobId: 'beat-1' })
  same(refsFor({ [REFERENCE_STORAGE_KEYS.continuation]: scriptFirst }).references, ['续接脚本「Line」'])

  // Continuation tail beat: the deleted job itself belongs to the stored script and has no child job.
  const scriptChain = JSON.stringify({ id: 's1', videoName: 'Line', sourceJobId: 'job-parent' })
  const tailJob = { ...baseJob(), id: 'beat-3', continuation: { scriptId: 's1', beatId: 'b3', beatSignature: 'sig' } }
  same(refsFor({ [REFERENCE_STORAGE_KEYS.continuation]: scriptChain }, tailJob).references, ['续接脚本「Line」的节拍'])

  // Continuation chain parent: a child job points at the deleted job even when the script store is empty.
  const chainJob = baseJob()
  const childJob = { ...baseJob(), id: 'beat-2', continuation: { scriptId: 's1', beatId: 'b2', sourceJobId: 'beat-1', beatSignature: 'sig' } }
  same(refsFor({}, chainJob, [chainJob, childJob]).references, ['续接节拍（子节点 job）'])
  same(refsFor({ [REFERENCE_STORAGE_KEYS.continuation]: scriptChain }, chainJob, [chainJob, childJob]).references, ['续接脚本「Line」的节拍'])

  // Character and location walkthrough videos match by stored path.
  same(refsFor({ [REFERENCE_STORAGE_KEYS.characters]: JSON.stringify([{ name: 'Ada', turntableVideo: { path: LOCAL_PATH } }]) }).references, ['角色「Ada」漫游视频'])
  same(refsFor({ [REFERENCE_STORAGE_KEYS.locations]: JSON.stringify([{ name: 'Alley', walkthroughVideo: { path: RAW_URL } }]) }).references, ['地点「Alley」漫游视频'])

  // Unrelated entries are not references.
  same(refsFor({
    [REFERENCE_STORAGE_KEYS.movies]: JSON.stringify([{ name: 'Other', clips: [{ assetId: 'job-9', source: 'minimax-media://local?path=C%3A%5Coutput%5Cother.mp4' }] }]),
    [REFERENCE_STORAGE_KEYS.bookmarks]: JSON.stringify([{ id: 'job-9', name: 'Other' }]),
  }), { references: [], unreadable: [] })

  // Unreadable stores fail closed with a retryable label.
  for (const [key, label, wrongShape] of [
    [REFERENCE_STORAGE_KEYS.movies, '影片项目数据', '{}'],
    [REFERENCE_STORAGE_KEYS.continuation, '续接脚本数据', '[]'],
    [REFERENCE_STORAGE_KEYS.bookmarks, '帧书签数据', '{}'],
    [REFERENCE_STORAGE_KEYS.characters, '角色库数据', '{}'],
    [REFERENCE_STORAGE_KEYS.locations, '地点库数据', '{}'],
  ]) {
    same(refsFor({ [key]: '{broken' }).unreadable, [label], `${key} must fail closed on invalid JSON`)
    same(refsFor({ [key]: wrongShape }).unreadable, [label], `${key} must fail closed on a wrong top-level shape`)
  }

  // Malformed elements are skipped instead of poisoning the whole store.
  same(refsFor({
    [REFERENCE_STORAGE_KEYS.movies]: JSON.stringify([null, 42, { name: 'No clips' }, { clips: [{ assetId: 'job-9' }] }]),
    [REFERENCE_STORAGE_KEYS.characters]: JSON.stringify([{ name: 'Bad', turntableVideo: { path: 42 } }]),
  }), { references: [], unreadable: [] })

  // Thumbnail cache path extraction.
  assert.equal(thumbnailCachePath(`minimax-media://thumbnail?path=${encodeURIComponent('C:/userData/video-thumbnails/abc.jpg')}`), 'C:/userData/video-thumbnails/abc.jpg')
  assert.equal(thumbnailCachePath(`minimax-media://local?path=${encodeURIComponent('C:/userData/video-thumbnails/abc.jpg')}`), undefined)
  assert.equal(thumbnailCachePath('not a url'), undefined)
  assert.equal(thumbnailCachePath(undefined), undefined)

  console.log('PASS: media deletion path policy, per-file results, thumbnail cleanup, and media-library reference detection')
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})