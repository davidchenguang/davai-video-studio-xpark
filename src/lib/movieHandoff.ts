import type { MediaFile } from '../types'

// 元组为 [存储值, 显示标签]：存储值进入续接载荷并持久化，保持英文；
// 标签只出现在「发送帧到 / 续接目标」下拉框里，属显示层，译为中文
// （H3 Ref2VA、H3 I2V、LTX 2.5 是引擎/模型名，按 keep-english 登记保留）。
export const movieFrameTargets = [
  ['h3-reference-first', 'H3 Ref2VA · 原生帧 0 锚定'],
  ['h3-i2v', 'H3 I2V · 首帧输入'],
  ['h3-first', 'H3 · 首尾帧：开场帧'],
  ['h3-last', 'H3 · 首尾帧：收尾帧'],
  ['h3-reference', 'H3 Ref2VA · 仅参考（不锁定帧）'],
  ['ltx', 'LTX 2.5 · 图生视频'],
  ['save', '仅保存帧'],
] as const
export type MovieFrameTarget = typeof movieFrameTargets[number][0]
export const MOVIE_HANDOFF_KEY = 'oyama.movie-frame-handoff'
export type MovieFrameHandoff = { id: string; file: MediaFile; target: MovieFrameTarget; sourceName: string }

export function parseMovieHandoff(raw: string | null): MovieFrameHandoff | null {
  try {
    const value = JSON.parse(raw ?? 'null')
    if (!value || typeof value.id !== 'string' || typeof value.sourceName !== 'string' || value.file?.kind !== 'image' || typeof value.file.path !== 'string' || !value.file.path || typeof value.file.name !== 'string' || !movieFrameTargets.some(([target]) => target === value.target)) return null
    return value
  } catch { return null }
}

export function movieSourceFrame(start: number, sourceIn: number, length: number, playhead: number, position: 'current' | 'first' | 'last') {
  const offset = position === 'first' ? 0 : position === 'last' ? length - 1 : playhead - start
  return sourceIn + Math.max(0, Math.min(length - 1, offset))
}
