import { useEffect, useState } from 'react'
import { Bookmark, ExternalLink, Film, FolderOpen, Gauge, History, ImagePlus, LoaderCircle, Music2, Play, Scissors, Sparkles, Trash2, Watch, X, ZoomIn } from 'lucide-react'
import type { AppSettings, GenerationJob, MediaFile } from '../types'
import { audioSourceLabel, generationModeLabels, imageSourceLabel, libraryPromptTitle, librarySourceGroups, shortPrompt, videoSourceLabel } from '../lib/jobPresentation'
import { collectAssetReferences } from '../lib/libraryReferences'
import { FrameBookmarkStudio, type BookmarkVideo } from './FrameBookmarkStudio'
import { MediaPreviewModal } from './MediaPreviewModal'
import { MovieMediaThumbnail } from './MovieMediaThumbnail'

export function LibraryView({ jobs, settings, onEdit, onCreate, onUseLtx, onUseLastFrameReference, onDeleteMedia, onNotice }: { jobs: GenerationJob[]; settings: AppSettings; onEdit(): void; onCreate(): void; onUseLtx(file: MediaFile): void; onUseLastFrameReference(job: GenerationJob, opening: { mode: 'match' | 'reframe' | 'arc'; cameraAngle?: string }): Promise<void>; onDeleteMedia(job: GenerationJob): Promise<void>; onNotice(tone: 'error' | 'success' | 'neutral', text: string): void }) {
  const [query, setQuery] = useState('')
  const [provider, setProvider] = useState<'all' | NonNullable<GenerationJob['provider']>>('all')
  const [mediaType, setMediaType] = useState<'all' | 'video' | 'image' | 'audio'>('all')
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest')
  const [bookmarkVideo, setBookmarkVideo] = useState<BookmarkVideo | null>(null)
  const [lightbox, setLightbox] = useState<GenerationJob | null>(null)
  const [rife, setRife] = useState<{ installed: boolean; executable?: string; error?: string } | null>(null)
  const [rifeBusyId, setRifeBusyId] = useState<string | null>(null)
  const [referenceBusyId, setReferenceBusyId] = useState<string | null>(null)
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null)
  const [referenceDialog, setReferenceDialog] = useState<{ job: GenerationJob; title: string; items: string[]; unreadable: boolean } | null>(null)
  const [openingMode, setOpeningMode] = useState<'match' | 'reframe' | 'arc'>('match')
  const [openingCameraAngle, setOpeningCameraAngle] = useState('side camera angle')
  const available = jobs.filter((job) => job.status === 'completed' && Boolean(job.outputUrl))
  // 媒体谓词必须三分支：旧的 image?…:非image 二分支在放开音频后会让「视频」筛选漏进音频。
  const mediaMatches = (job: GenerationJob) => mediaType === 'all' ? true : mediaType === 'image' ? job.mediaType === 'image' : mediaType === 'audio' ? job.mediaType === 'audio' : job.mediaType !== 'image' && job.mediaType !== 'audio'
  const filtered = available.filter((job) => (provider === 'all' || (job.provider ?? 'minimax') === provider) && mediaMatches(job) && (!query.trim() || job.prompt.toLowerCase().includes(query.trim().toLowerCase()))).sort((a, b) => sort === 'newest' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt)
  const videos: BookmarkVideo[] = available.filter(job => job.mediaType !== 'image' && job.mediaType !== 'audio').map((job) => ({ id: `job-${job.id}`, name: shortPrompt(job.prompt), source: job.outputUrl!, duration: job.duration, provider: job.provider === 'ltxripple' ? 'ltxripple' : job.provider === 'ltx25' ? 'ltx25' : 'minimax' }))
  useEffect(() => { void window.minimax.getRifeStatus().then(setRife).catch(() => setRife({ installed: false })) }, [])
  const runRife = async (job: GenerationJob, mode: 'fps-2x' | 'slow-motion') => {
    setRifeBusyId(job.id)
    try {
      let status = rife
      if (!status?.installed) { status = await window.minimax.installRife(); setRife(status) }
      if (!status?.installed) throw new Error(status?.error || 'RIFE 安装未完成。')
      const result = await window.minimax.interpolateVideo(job.outputUrl!, settings.outputDirectory, settings.ffmpegPath, mode)
      await window.minimax.showOutput(result.path)
      onNotice('success', mode === 'slow-motion' ? '已用 RIFE 生成电影感慢动作渲染，并已打开其输出文件夹。' : '已生成 48 fps RIFE 光流渲染，并已打开其输出文件夹。')
    } catch (error) { onNotice('error', error instanceof Error ? error.message : String(error)) } finally { setRifeBusyId(null) }
  }
  const revealOutput = (job: GenerationJob) => {
    if (!job.localOutputPath) return
    void window.minimax.showOutput(job.localOutputPath).catch((error) => onNotice('error', `无法在文件夹中显示：${error instanceof Error ? error.message : String(error)}`))
  }
  const addLastFrameReference = async (job: GenerationJob) => {
    setReferenceBusyId(job.id)
    try { await onUseLastFrameReference(job, openingMode === 'match' ? { mode: 'match' } : { mode: openingMode, cameraAngle: openingCameraAngle }) }
    catch (error) { onNotice('error', `无法创建尾帧参考：${error instanceof Error ? error.message : String(error)}`) }
    finally { setReferenceBusyId(null) }
  }
  const requestDelete = (job: GenerationJob) => {
    const title = libraryPromptTitle(job.prompt)
    const { references, unreadable } = collectAssetReferences(job, jobs, window.localStorage)
    if (unreadable.length || references.length) {
      setReferenceDialog({ job, title, items: unreadable.length ? unreadable : references, unreadable: unreadable.length > 0 })
      return
    }
    const remote = !job.localOutputPath
    const confirmed = window.confirm(remote
      ? `将移除「${title}」的本地记录与缓存；远端 ComfyUI 上的文件不会被删除。继续？`
      : `将把「${title}」移入系统回收站，并从媒体库移除记录；缩略图缓存与派生文件会一并清理。继续？`)
    if (!confirmed) return
    const runDelete = () => {
      setDeleteBusyId(job.id)
      void onDeleteMedia(job).finally(() => setDeleteBusyId(null))
    }
    // Close the preview before recycling: Windows cannot trash a file that a
    // playing <video>/<audio> element still holds open. The timer runs after
    // React commits the lightbox unmount, so the media handle is released first.
    if (lightbox?.id === job.id) {
      setLightbox(null)
      window.setTimeout(runDelete, 0)
    } else {
      runDelete()
    }
  }
  return <div className="standard-page library-page"><div className="page-heading"><div><p className="eyebrow">本地媒体库</p><h1>媒体库</h1><p>在不改动原始文件的前提下审阅渲染成果、收藏可复用帧或拼接片段。</p></div><button className="primary-button" onClick={onEdit}><Scissors size={16} />打开影片剪辑</button></div>
    <div className="library-toolbar"><label><span>搜索渲染</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索提示词…" /></label><label><span>提供方</span><select value={provider} onChange={(event) => setProvider(event.target.value as typeof provider)}><option value="all">全部提供方</option>{librarySourceGroups.map((group) => <optgroup key={group.label} label={group.label}>{group.sources.map((source) => <option key={source.provider} value={source.provider}>{source.label}</option>)}</optgroup>)}</select></label><label><span>媒体</span><select value={mediaType} onChange={(event) => setMediaType(event.target.value as typeof mediaType)}><option value="all">全部媒体</option><option value="video">视频</option><option value="image">图片</option><option value="audio">音频</option></select></label><label><span>排序</span><select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="newest">最新优先</option><option value="oldest">最早优先</option></select></label><div><strong>{filtered.length}</strong><span>/ 共 {available.length} 个素材</span></div></div>
    {available.length === 0 ? <div className="empty-page library-first-run"><History size={28} /><strong>完成的渲染会出现在这里</strong><span>生成一个镜头即可开始使用媒体库。完成的视频、图片与音频会自动保存在本设备上。</span><div className="library-first-run-actions"><button className="primary-button" onClick={onCreate}><Film size={15} />打开视频工作区</button><button className="secondary-button" onClick={onEdit}><Scissors size={15} />打开影片剪辑</button></div></div> : filtered.length === 0 ? <div className="empty-page compact"><Film size={25} /><strong>没有符合这些筛选条件的结果。</strong><button className="secondary-button" onClick={() => { setQuery(''); setProvider('all'); setMediaType('all') }}>清除筛选</button></div> : <div className="library-grid">{filtered.map((job) => {
      const image = job.mediaType === 'image'
      const audio = job.mediaType === 'audio'
      const video = videos.find(item => item.id === `job-${job.id}`)
      const rifeBusy = rifeBusyId === job.id
      const title = libraryPromptTitle(job.prompt)
      return <article className="library-card" key={job.id}>
        <button type="button" className="library-card-media" onClick={() => setLightbox(job)} aria-label={`预览 ${title}`}>
          {image ? <img src={job.outputUrl} alt="" /> : audio ? <Music2 size={40} /> : <MovieMediaThumbnail source={job.outputUrl!} posterUrl={job.thumbnailUrl} />}
          {/* chip 必须按媒体类型换图标：Play 只留给真会播放的视频/音频，图片用 ZoomIn 表达「查看大图」，避免播放假承诺。 */}
          <span className="library-media-play">{image ? <ZoomIn size={16} /> : <Play size={16} fill="currentColor" />}</span>
          {!image && !audio && <span className="library-media-duration">{job.duration} 秒</span>}
        </button>
        <div className="library-card-body">
          <div className="library-card-meta"><span className={`library-provider ${job.provider === 'ltx25' || job.provider === 'ltxripple' ? 'ltx' : ''}`}>{image ? imageSourceLabel(job.provider) : audio ? audioSourceLabel(job.provider) : videoSourceLabel(job.provider)}</span>{job.engineId && job.engineId !== 'comfy' && <span className="library-engine-badge">{job.engineId}</span>}<time dateTime={new Date(job.createdAt).toISOString()}>{new Date(job.createdAt).toLocaleDateString()}</time></div>
          <strong title={job.prompt}>{title}</strong>
          <small>{audio ? `${job.duration} 秒音频` : `${job.width} × ${job.height} · ${image ? '单张图片' : `${job.duration} 秒 · ${generationModeLabels[job.mode] ?? job.mode}`}`}</small>
          {audio && job.outputUrl && <audio className="library-card-audio" src={job.outputUrl} controls preload="metadata" />}
          <div className="library-card-actions">
            <button className="secondary-button" onClick={() => setLightbox(job)}><Watch size={15} />预览</button>
            {!image && !audio && video && <button className="primary-button" onClick={() => setBookmarkVideo(video)}><Bookmark size={15} />帧书签</button>}
            {/* 低频文件操作收进图标托盘：文字按钮只留给预览/帧书签，避免每张卡都堆满等宽按钮。 */}
            <div className="library-card-tools">
              <a className="library-tool-button" href={job.outputUrl} target="_blank" rel="noreferrer" title="打开文件" aria-label="打开文件"><ExternalLink size={15} /></a>
              {job.localOutputPath && <button className="library-tool-button" onClick={() => revealOutput(job)} title={job.localOutputPath} aria-label="在文件夹中显示"><FolderOpen size={15} /></button>}
              <button className="library-tool-button library-delete-button" disabled={deleteBusyId === job.id} onClick={() => requestDelete(job)} title="删除" aria-label="删除">{deleteBusyId === job.id ? <LoaderCircle className="spin" size={15} /> : <Trash2 size={15} />}</button>
            </div>
          </div>
          {!image && !audio && <details className="library-rife"><summary><Gauge size={14} />RIFE 运动工具</summary><span>{rife?.installed ? '光流衍生版本 · 原文件保持不变。' : '首次使用时会安装官方本地 RIFE 工具。'}</span><div><button className="secondary-button" disabled={Boolean(rifeBusyId)} onClick={() => void runRife(job, 'fps-2x')}>{rifeBusy ? <LoaderCircle className="spin" size={14} /> : <Gauge size={14} />}48 fps</button><button className="secondary-button" disabled={Boolean(rifeBusyId)} onClick={() => void runRife(job, 'slow-motion')}>{rifeBusy ? <LoaderCircle className="spin" size={14} /> : <Sparkles size={14} />}电影感慢动作</button></div></details>}
        </div>
      </article>
    })}</div>}
    {lightbox && <MediaPreviewModal job={lightbox} eyebrow="媒体库预览" onClose={() => setLightbox(null)} footerActions={<>{lightbox.mediaType !== 'image' && lightbox.mediaType !== 'audio' && <div className="opening-frame-builder"><div><strong>下一镜头帧约束</strong><small>提取确切的尾帧，然后选择原生帧 0 锚定或仅参考引导。</small></div><fieldset disabled={referenceBusyId === lightbox.id}><legend>约束方式</legend><label><input type="radio" name="opening-treatment" checked={openingMode === 'match'} onChange={() => setOpeningMode('match')} /><span><strong>帧 0 锚定</strong><small>在 frame_idx 0 处施加原生 Add Guide 条件控制；固定开场画面状态。</small></span></label><label><input type="radio" name="opening-treatment" checked={openingMode === 'reframe'} onChange={() => setOpeningMode('reframe')} /><span><strong>仅参考 · 重新取景</strong><small>在 H3 生成新开场机位的同时约束场景特征；帧 0 不锁定。</small></span></label><label><input type="radio" name="opening-treatment" checked={openingMode === 'arc'} onChange={() => setOpeningMode('arc')} /><span><strong>帧 0 锚定，再弧线运镜</strong><small>先施加原生 frame_idx 0 引导，再执行指定的运镜。</small></span></label></fieldset>{openingMode !== 'match' && <label className="opening-camera-angle"><span>{openingMode === 'arc' ? '目标机位角度' : '开场机位角度'}</span><select value={openingCameraAngle} onChange={(event) => setOpeningCameraAngle(event.target.value)}><option value="side camera angle">侧向机位</option><option value="three-quarter camera angle">四分之三侧机位</option><option value="front-facing camera angle">正面机位</option><option value="low camera angle">仰拍机位</option><option value="high camera angle">俯拍机位</option><option value="over-the-shoulder camera angle">过肩机位</option></select></label>}<button className="primary-button" disabled={referenceBusyId === lightbox.id} onClick={() => void addLastFrameReference(lightbox)} title="提取尾帧，用作原生帧 0 锚定或仅参考重新取景来源">{referenceBusyId === lightbox.id ? <LoaderCircle className="spin" size={15} /> : <ImagePlus size={15} />}{referenceBusyId === lightbox.id ? '正在提取尾帧…' : openingMode === 'match' ? '使用原生帧 0 锚定' : openingMode === 'reframe' ? '使用仅参考重新取景' : '使用帧 0 锚定 + 弧线运镜'}<small>实验性</small></button></div>}<button className="danger-button" disabled={deleteBusyId === lightbox.id} onClick={() => requestDelete(lightbox)}>{deleteBusyId === lightbox.id ? <LoaderCircle className="spin" size={15} /> : <Trash2 size={15} />}删除</button></>} />}
    {referenceDialog && <div className="media-lightbox-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setReferenceDialog(null) }}><section className="media-lightbox library-reference-dialog" role="dialog" aria-modal="true" aria-labelledby="library-reference-title"><header><span><small>{referenceDialog.unreadable ? '无法读取引用数据' : '资产仍被引用'}</small><strong id="library-reference-title">{referenceDialog.title}</strong></span><button className="icon-button" onClick={() => setReferenceDialog(null)} aria-label="关闭引用提示"><X size={18} /></button></header><div className="library-reference-body">{referenceDialog.unreadable ? <p>无法读取{referenceDialog.items.join('、')}，为避免误删已取消删除。</p> : <><p>该资产仍被以下位置引用，无法删除。请先在对应功能中移除引用后再试。</p><ul>{referenceDialog.items.map((item) => <li key={item}>{item}</li>)}</ul></>}</div><footer>{referenceDialog.unreadable && <button className="primary-button" onClick={() => { const job = referenceDialog.job; setReferenceDialog(null); requestDelete(job) }}>重试</button>}<button className="secondary-button" onClick={() => setReferenceDialog(null)}>关闭</button></footer></section></div>}
    {bookmarkVideo && <FrameBookmarkStudio key={bookmarkVideo.id} initialVideo={bookmarkVideo} videos={videos} settings={settings} onClose={() => setBookmarkVideo(null)} onUseLtx={onUseLtx} onNotice={onNotice} />}
  </div>
}

