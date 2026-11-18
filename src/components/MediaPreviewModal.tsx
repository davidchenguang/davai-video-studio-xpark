import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import type { GenerationJob } from '../types'
import { imageSourceLabel, shortPrompt } from '../lib/jobPresentation'
import { VideoPlayer } from './VideoPlayer'

// 队列与媒体库共用的预览灯箱外壳：媒体 stage 按类型分派，调用方通过
// footerActions 追加各自特有的操作（媒体库的视频帧约束、删除）。
export function MediaPreviewModal({ job, eyebrow = '媒体预览', onClose, footerActions }: {
  job: GenerationJob
  eyebrow?: string
  onClose(): void
  footerActions?: ReactNode
}) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])
  const audio = job.mediaType === 'audio'
  const image = job.mediaType === 'image'
  return <div className="media-lightbox-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="media-lightbox" role="dialog" aria-modal="true" aria-labelledby="media-preview-title">
      <header>
        <span><small>{eyebrow}</small><strong id="media-preview-title">{shortPrompt(job.prompt)}</strong></span>
        <button className="icon-button" onClick={onClose} aria-label="关闭预览"><X size={18} /></button>
      </header>
      <div className="media-lightbox-stage">{image ? <img src={job.outputUrl} alt={imageSourceLabel(job.provider)} /> : audio ? <audio className="lightbox-audio" src={job.outputUrl!} controls autoPlay={false} /> : <VideoPlayer src={job.outputUrl!} />}</div>
      <footer>
        <span>{audio ? `${job.duration} 秒音频` : `${job.width} × ${job.height} · ${image ? '静态图片' : `${job.duration} 秒视频`}`}{job.engineId && job.engineId !== 'comfy' ? <em className="library-engine-badge">{job.engineId}</em> : null}</span>
        <div className="media-lightbox-actions">{footerActions}<button className="secondary-button" onClick={onClose}>关闭</button></div>
      </footer>
    </section>
  </div>
}