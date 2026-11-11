import { ImagePlus, Images, Plus, Trash2 } from 'lucide-react'
import type { MediaFile } from '../types'

interface CharacterReferenceListProps {
  files: MediaFile[]
  selectedPath: string
  selectedReferencePaths?: string[]
  onSelect(path: string): void
  onRemove(path: string): void
  onAdd(): void
}

// referenceType values are the English storage/prompt enum; labels are the Chinese display layer.
const referenceTypeLabels: Record<string, string> = {
  master: '主身份',
  face: '面部近景',
  'full-body': '全身',
  'three-quarter': '四分之三侧',
  profile: '侧面',
  back: '背面',
  detail: '身份细节',
  other: '其他角度',
}

export function CharacterReferenceList({ files, selectedPath, selectedReferencePaths, onSelect, onRemove, onAdd }: CharacterReferenceListProps) {
  return <section className="character-reference-list" aria-label="角色已确认图片">
    <header><span><strong>已确认身份图片</strong><small>{files.length} 张图片 · 选择一张查看详情</small></span><button type="button" onClick={onAdd}><Plus size={14} />添加图片</button></header>
    {files.length ? <div className="character-reference-list-items">{files.map((file, index) => {
      const included = selectedReferencePaths === undefined || selectedReferencePaths.includes(file.path)
      return <article key={file.path} className={selectedPath === file.path ? 'selected' : ''}>
        <button type="button" className="character-reference-list-select" aria-pressed={selectedPath === file.path} onClick={() => onSelect(file.path)}>
          {file.preview ? <img src={file.preview} alt="" /> : <Images size={20} />}
          <span><strong>{file.name}</strong><small>{file.referenceType ? referenceTypeLabels[file.referenceType] ?? file.referenceType : `角度 ${index + 1}`} · {included ? '已在选定组中' : '未选定'}</small></span>
        </button>
        <button type="button" className="character-reference-list-remove" aria-label={`从角色移除 ${file.name}`} title="从该角色移除；原文件保留在磁盘" onClick={() => onRemove(file.path)}><Trash2 size={15} /></button>
      </article>
    })}</div> : <p><ImagePlus size={18} />还没有已确认的图片。添加一张图片来建立参考图组。</p>}
  </section>
}
