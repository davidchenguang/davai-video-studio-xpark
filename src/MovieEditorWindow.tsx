import { MOVIE_HANDOFF_KEY } from './lib/movieHandoff'
import { createId } from './lib/createId'
import { applyTheme, normalizeTheme, THEME_STORAGE_KEY, writeThemeMirror } from './lib/theme'
import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { MovieEditor } from './components/MovieEditor'
import { ClipMasterBeta } from './components/ClipMasterBeta'
import type { AppSettings, ClipItem, GenerationJob, MediaFile } from './types'

function readJobs(): GenerationJob[] {
  try { const jobs = JSON.parse(localStorage.getItem('minimax.jobs') ?? '[]') as GenerationJob[]; return Array.isArray(jobs) ? jobs : [] } catch { return [] }
}

export function MovieEditorWindow() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [jobs, setJobs] = useState<GenerationJob[]>(readJobs)
  const [notice, setNotice] = useState<string | null>(null)
  const [clipMasterClip, setClipMasterClip] = useState<ClipItem | null>(null)
  useEffect(() => { document.title = 'DavAi 影片剪辑'; void window.minimax.getSettings().then((loaded) => { writeThemeMirror(loaded.theme); applyTheme(document.documentElement, loaded.theme); setSettings(loaded) }) }, [])
  useEffect(() => {
    const refresh = (event: StorageEvent) => {
      if (event.key === 'minimax.jobs') setJobs(readJobs())
      if (event.key === THEME_STORAGE_KEY) applyTheme(document.documentElement, normalizeTheme(event.newValue))
    }
    window.addEventListener('storage', refresh)
    return () => { window.removeEventListener('storage', refresh) }
  }, [])
  if (!settings) return <main className="davai-movie-loading">正在打开 DavAi 影片剪辑…</main>
  return <main className="davai-movie-window">
    {notice && <div className="davai-movie-notice" role="status">{notice}<button onClick={() => setNotice(null)} aria-label="关闭通知"><X size={14} /></button></div>}
    <MovieEditor standalone settings={settings} jobs={jobs} onNotice={(_tone, message) => setNotice(message)} onOpenClipMaster={setClipMasterClip} onUseFrame={async (file: MediaFile, target, clip: ClipItem) => { if (target === 'save') { setNotice(`${file.name} 已保存到输出文件夹。`); return } const savedFile = { ...file }; delete savedFile.preview; localStorage.setItem(MOVIE_HANDOFF_KEY, JSON.stringify({ id: createId(), file: savedFile, target, sourceName: clip.name })); await window.minimax.openStudio(); setNotice(`${file.name} 已发送到 Studio。生成前请确认目标工作区。`) }} />
    {clipMasterClip && <ClipMasterBeta clip={clipMasterClip} settings={settings} onClose={() => setClipMasterClip(null)} onNotice={(_tone, message) => setNotice(message)} onExportClip={(clip) => { window.dispatchEvent(new CustomEvent('davai-movie-add-media', { detail: clip })); setNotice(`${clip.name} 已返回影片素材池。`); setClipMasterClip(null) }} />}
  </main>
}
