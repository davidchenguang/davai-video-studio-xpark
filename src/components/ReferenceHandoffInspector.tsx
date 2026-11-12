import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, Images } from 'lucide-react'
import { drawPreparedImage, resolveImageBackground } from '../lib/imageCrop'
import type { MediaFile } from '../types'

type Inspection = { width: number; height: number; warnings: string[]; error?: string }

// referenceType / referenceRole values are the English storage enum that flows into
// prompt binding labels; the maps below are their Chinese display layers.
const referenceTypeLabels: Record<string, string> = {
  master: '主参考',
  face: '面部特写',
  'full-body': '全身',
  'three-quarter': '四分之三侧',
  profile: '侧面',
  back: '背面',
  detail: '特征细节',
  other: '其他角度',
}
const referenceRoleLabels: Record<string, string> = {
  subject: '主体',
  wardrobe: '服装',
  prop: '道具',
  location: '地点',
  composition: '构图',
  'lighting-style': '光线风格',
}

function roleName(file: MediaFile, fallback: string) {
  if (file.referenceType) return referenceTypeLabels[file.referenceType] ?? file.referenceType
  if (file.referenceRole) return referenceRoleLabels[file.referenceRole] ?? file.referenceRole
  return fallback
}

function ReferenceHandoffCard({ file, label, index, width, height, onInspection }: { file: MediaFile; label: string; index: number; width: number; height: number; onInspection(index: number, value: Inspection): void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [inspection, setInspection] = useState<Inspection>({ width: 0, height: 0, warnings: [] })
  useEffect(() => {
    let alive = true
    const inspect = async () => {
      try {
        const preview = file.preview || await window.minimax.fileDataUrl(file.path)
        const source = new Image()
        source.src = preview
        await source.decode()
        const prepared = document.createElement('canvas')
        await drawPreparedImage(prepared, file, width, height)
        if (!alive || !canvas.current) return
        canvas.current.width = width
        canvas.current.height = height
        canvas.current.getContext('2d')!.drawImage(prepared, 0, 0)
        const sourceRatio = source.naturalWidth / source.naturalHeight
        const targetRatio = width / height
        const ratioDifference = Math.max(sourceRatio, targetRatio) / Math.min(sourceRatio, targetRatio)
        const warnings = [
          Math.min(source.naturalWidth, source.naturalHeight) < 512 ? '源图分辨率偏低，可能削弱细节表现。' : '',
          ratioDifference > 1.65 && (file.crop?.fit ?? 'crop') === 'crop' ? '画面比例裁切幅度较大——请检查重要主体是否仍然可见。' : '',
          file.referenceType === 'face' && source.naturalWidth < 640 ? '面部锚点偏小；更紧凑、更清晰的源图通常能更好地保持身份特征。' : '',
        ].filter(Boolean)
        const next = { width: source.naturalWidth, height: source.naturalHeight, warnings }
        setInspection(next); onInspection(index, next)
      } catch (error) {
        if (!alive) return
        const next = { width: 0, height: 0, warnings: [], error: error instanceof Error ? error.message : String(error) }
        setInspection(next); onInspection(index, next)
      }
    }
    void inspect()
    return () => { alive = false }
  }, [file, height, index, onInspection, width])
  const fit = file.crop?.fit ?? 'crop'
  const treatment = fit === 'crop' ? '边缘裁切' : resolveImageBackground(file) === 'neutral' ? '中性底板' : '场景延展'
  return <article className={`reference-handoff-card ${inspection.error ? 'error' : inspection.warnings.length ? 'warning' : 'ready'}`}>
    <div className="reference-handoff-preview"><canvas ref={canvas} aria-label={`图片 ${index + 1} 的交接准备预览`} />{inspection.error && <span>预览不可用</span>}</div>
    <div className="reference-handoff-card-body"><header><code>{`<Picture ${index + 1}>`}</code>{inspection.error || inspection.warnings.length ? <AlertTriangle size={13} /> : <Check size={13} />}</header><strong title={label}>{label}</strong><small>{roleName(file, '参考图')} · {file.referenceRetention === 'preserve' ? '必须保留' : '引导'} · {treatment}</small><small>{inspection.width ? `${inspection.width} × ${inspection.height} 源图 → ${width} × ${height}` : `${width} × ${height} 目标`}</small>{inspection.warnings.map((warning) => <p key={warning}>{warning}</p>)}{inspection.error && <p>{inspection.error}</p>}</div>
  </article>
}

export function ReferenceHandoffInspector({ files, labels, resolution }: { files: MediaFile[]; labels: string[]; resolution: string }) {
  const [inspections, setInspections] = useState<Record<number, Inspection>>({})
  const [width, height] = resolution.split('x').map(Number)
  const duplicates = useMemo(() => files.filter((file, index) => files.findIndex((item) => item.path === file.path) !== index).length, [files])
  const warnings = files.reduce((total, _file, index) => total + (inspections[index]?.warnings.length ?? 0) + Number(Boolean(inspections[index]?.error)), 0) + duplicates
  const updateInspection = useCallback((index: number, value: Inspection) => setInspections((current) => ({ ...current, [index]: value })), [])
  if (!files.length) return <div className="reference-handoff-empty"><Images size={17} /><span><strong>还没有准备好的图片</strong><small>选择一张媒体库素材，或添加一张独立图片来查看交接详情。</small></span></div>
  return <div className="reference-handoff-inspector">
    <div className={`reference-handoff-status ${warnings ? 'warning' : 'ready'}`}>{warnings ? <AlertTriangle size={15} /> : <Check size={15} />}<span><strong>{warnings ? `${warnings} 项交接警告` : '参考图交接就绪'}</strong><small>这里是即将上传的画面比例准备与槽位分配的最终形态。</small></span></div>
    <div className="reference-handoff-grid">{files.map((file, index) => <ReferenceHandoffCard key={`${file.path}-${index}`} file={file} label={labels[index] ?? file.name} index={index} width={width} height={height} onInspection={updateInspection} />)}</div>
    {duplicates > 0 && <p className="reference-handoff-duplicate"><AlertTriangle size={13} />检测到 {duplicates} 个重复图片槽位。重复项会占用九张图片的配额，却不增加任何覆盖面。</p>}
  </div>
}
