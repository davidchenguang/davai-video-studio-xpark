export type Theme = 'green' | 'blue' | 'comfy' | 'light'

export const THEMES: readonly Theme[] = ['green', 'blue', 'comfy', 'light']

export const THEME_STORAGE_KEY = 'minimax.theme'

/** Settings dropdown labels (D8); the order matches THEMES. */
export const THEME_LABELS: ReadonlyArray<readonly [Theme, string]> = [
  ['green', '墨绿（默认）'],
  ['blue', '蓝色（经典）'],
  ['comfy', 'Comfy 黄'],
  ['light', '亮色'],
]

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value)
}

/** Any stored theme value that is not one of the four ids falls back to green. */
export function normalizeTheme(value: unknown): Theme {
  return isTheme(value) ? value : 'green'
}

/** Writes data-theme on the target document element; green is written explicitly
 *  because themes.css keeps no [data-theme="green"] block — the base cascade is green. */
export function applyTheme(target: { dataset: { theme?: string } }, theme: Theme): void {
  target.dataset.theme = theme
}

/** The localStorage mirror is a first-paint cache only; settings JSON stays authoritative. */
export function readThemeMirror(storage: { getItem(key: string): string | null } = window.localStorage): Theme {
  return normalizeTheme(storage.getItem(THEME_STORAGE_KEY))
}

export function writeThemeMirror(theme: Theme, storage: { setItem(key: string, value: string): void } = window.localStorage): void {
  storage.setItem(THEME_STORAGE_KEY, theme)
}
