import { Images } from 'lucide-react'

export type CharacterDetailTab = 'identity' | 'hair' | 'wardrobe' | 'accessories' | 'voice' | 'references'

interface CharacterReadinessProps {
  primaryReady: boolean
  referenceCount: number
  hairName: string
  wardrobeCount: number
  accessoryCount: number
  onOpen(tab: CharacterDetailTab): void
  onAddPrimary(): void
}

export function CharacterReadiness({ primaryReady, referenceCount, hairName, wardrobeCount, accessoryCount, onOpen, onAddPrimary }: CharacterReadinessProps) {
  const items: Array<{ label: string; value: string; tab: CharacterDetailTab; ready: boolean }> = [
    { label: '主图', value: primaryReady ? '就绪' : '添加图片', tab: 'identity', ready: primaryReady },
    { label: '辅助视角', value: `${referenceCount}`, tab: 'references', ready: referenceCount > 0 },
    { label: '发型', value: hairName || '选择发型', tab: 'hair', ready: Boolean(hairName) },
    { label: '服装', value: wardrobeCount ? `${wardrobeCount} 套已挂载` : '选择穿搭', tab: 'wardrobe', ready: wardrobeCount > 0 },
    { label: '配饰', value: accessoryCount ? `${accessoryCount} 件已挂载` : '可选', tab: 'accessories', ready: true },
  ]
  return <section className="character-canvas-context" aria-label="角色连贯性总览">
    <div className="character-canvas-context-heading"><Images size={15} /><strong>连贯性一览</strong><small>点击行即可编辑</small></div>
    <div className="character-readiness-list">{items.map(item => <button type="button" key={item.label} onClick={() => item.tab === 'identity' && !primaryReady ? onAddPrimary() : onOpen(item.tab)}><span>{item.label}</span><strong className={item.ready ? 'ready' : ''}>{item.value}</strong></button>)}</div>
  </section>
}
