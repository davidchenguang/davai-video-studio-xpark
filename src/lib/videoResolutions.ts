export const MINIMAX_VIDEO_RESOLUTION_GROUPS: Record<'landscape' | 'ultrawide' | 'portrait' | 'square', string[]> = {
  landscape: ['608x352', '736x416', '768x448', '864x480', '960x544', '1024x576', '1056x608', '1152x640', '1216x672', '1280x736', '1344x768'],
  ultrawide: ['672x288', '896x384', '1120x480', '1216x512', '1344x576'],
  portrait: ['352x608', '416x736', '448x768', '480x864', '544x960', '576x1024', '608x1056', '640x1152', '672x1216', '736x1280', '768x1344'],
  square: ['512x512', '640x640', '768x768'],
}

export const MINIMAX_VIDEO_RESOLUTIONS = Object.values(MINIMAX_VIDEO_RESOLUTION_GROUPS).flat()

// A still image can be produced at any size (H3-Image reaches 4096×4096), but the
// H3 video pipeline only accepts the fixed ladder above. Snapping a still to the
// closest legal rung keeps the framing while staying inside the video contract,
// instead of pushing an unsupported width/height into the conditioning node.
export function snapMiniMaxResolution(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return MINIMAX_VIDEO_RESOLUTIONS[0]
  const sourceRatio = width / height
  const scored = MINIMAX_VIDEO_RESOLUTIONS.map((size) => {
    const [candidateWidth, candidateHeight] = size.split('x').map(Number)
    return { size, ratioDelta: Math.abs(Math.log((candidateWidth / candidateHeight) / sourceRatio)), area: candidateWidth * candidateHeight }
  })
  const closest = Math.min(...scored.map((candidate) => candidate.ratioDelta))
  // Every rung within the framing tolerance counts as the same framing; among
  // those the largest one wins so the still keeps its detail. Comparing each
  // candidate against the running winner instead would let a small, almost
  // exact rung block the native 768p step.
  const sameFraming = scored.filter((candidate) => candidate.ratioDelta <= closest + 0.02)
  const best = sameFraming.reduce((winner, candidate) => (candidate.area > winner.area ? candidate : winner))
  return best.size
}

export function snapResolutionString(resolution: string) {
  const [width, height] = resolution.split('x').map(Number)
  return snapMiniMaxResolution(width, height)
}

// 画幅方向名只用于分辨率下拉框的显示文本（存储值仍是尺寸字符串），属显示层，译为中文；
// 口径与 App.tsx 里分辨率下拉框的 optgroup 标题（方形/横屏/竖屏/超宽）一致。
const VIDEO_RESOLUTION_ORIENTATION_LABELS: Record<string, string> = {
  square: '方形',
  landscape: '横屏',
  portrait: '竖屏',
  ultrawide: '超宽',
}

export function videoResolutionLabel(size: string) {
  const group = (Object.keys(MINIMAX_VIDEO_RESOLUTION_GROUPS) as Array<keyof typeof MINIMAX_VIDEO_RESOLUTION_GROUPS>)
    .find((orientation) => MINIMAX_VIDEO_RESOLUTION_GROUPS[orientation].includes(size))
  const [width, height] = size.split('x').map(Number)
  const orientation = group ?? (width === height ? 'square' : width > height ? 'landscape' : 'portrait')
  const name = VIDEO_RESOLUTION_ORIENTATION_LABELS[orientation] ?? orientation
  return `${name} · ${size.replace('x', ' × ')}`
}
