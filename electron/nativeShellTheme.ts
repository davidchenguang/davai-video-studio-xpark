type ShellTheme = 'green' | 'blue' | 'comfy' | 'light'

export type NativeShell = {
  backgroundColor: string
  titleBarOverlay: { color: string; symbolColor: string; height: 48 }
}

/** Per-theme native chrome (D17). Green deliberately replaces the legacy blue
 *  title bar — that visible change is on the D12 exception list. */
export const NATIVE_SHELL: Record<ShellTheme, NativeShell> = {
  green: { backgroundColor: '#0c100e', titleBarOverlay: { color: '#171d19', symbolColor: '#f0f5ef', height: 48 } },
  blue: { backgroundColor: '#071524', titleBarOverlay: { color: '#243c53', symbolColor: '#d8ebff', height: 48 } },
  comfy: { backgroundColor: '#211927', titleBarOverlay: { color: '#2a2138', symbolColor: '#f5f0fa', height: 48 } },
  light: { backgroundColor: '#f3f4f0', titleBarOverlay: { color: '#ffffff', symbolColor: '#2a3a1c', height: 48 } },
}

/** The preview monitor is a color-judging surface (D7): dark chrome in every theme. */
export const PREVIEW_MONITOR_SHELL: NativeShell = {
  backgroundColor: '#07100b',
  titleBarOverlay: { color: '#07100b', symbolColor: '#cfd8dc', height: 48 },
}

export function shellFor(theme: unknown, previewMonitor = false): NativeShell {
  if (previewMonitor) return PREVIEW_MONITOR_SHELL
  const key: ShellTheme = theme === 'blue' || theme === 'comfy' || theme === 'light' ? theme : 'green'
  return NATIVE_SHELL[key]
}
