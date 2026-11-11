import { useId, useMemo, useState, type ReactNode } from 'react'
import { Plus, Search, X } from 'lucide-react'

export interface AssetLibraryItem {
  id: string
  name: string
  detail: string
  preview?: string
  placeholder: ReactNode
  searchText?: string
}

interface AssetLibraryRailProps {
  title: string
  items: AssetLibraryItem[]
  activeId: string
  onAdd(): void
  onSelect(id: string): void
}

export function AssetLibraryRail({ title, items, activeId, onAdd, onSelect }: AssetLibraryRailProps) {
  const [search, setSearch] = useState('')
  const inputId = useId()
  const query = search.trim().toLocaleLowerCase()
  const visible = useMemo(() => items.filter(item => `${item.name} ${item.detail} ${item.searchText ?? ''}`.toLocaleLowerCase().includes(query)), [items, query])

  return <aside className="character-project-list asset-library-rail" aria-label={`${title}素材库`}>
    <header><span><strong>{title}</strong><small>全局共 {items.length} 项</small></span><button type="button" onClick={onAdd}><Plus size={14} />新建</button></header>
    <label className="asset-library-search" htmlFor={inputId}><Search size={15} /><input id={inputId} type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={`搜索${title}…`} />{search && <button type="button" onClick={() => setSearch('')} aria-label="清除搜索"><X size={14} /></button>}</label>
    <p className="asset-library-count" role="status">{query ? `${items.length} 项中有 ${visible.length} 项匹配` : `共 ${items.length} 项`}</p>
    <div>{visible.length ? visible.map(item => <button type="button" key={item.id} className={item.id === activeId ? 'active' : ''} aria-current={item.id === activeId ? 'true' : undefined} onClick={() => onSelect(item.id)}>{item.preview ? <img src={item.preview} alt="" /> : <span>{item.placeholder}</span>}<span><strong>{item.name}</strong><small>{item.detail}</small></span></button>) : <div className="asset-library-empty"><strong>{query ? '没有匹配项' : `还没有${title}`}</strong><span>{query ? '试试其他名称或描述。' : `创建第一项${title}。`}</span>{query ? <button type="button" onClick={() => setSearch('')}>清除搜索</button> : <button type="button" onClick={onAdd}>新建</button>}</div>}</div>
  </aside>
}
