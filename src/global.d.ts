import type { DesktopApi } from './types'

declare global {
  interface Window {
    minimax: DesktopApi
  }

  // Vite injects import.meta.env in the dev/build pipelines; the tsconfig does
  // not pull in vite/client, so declare the only field the renderer reads.
  interface ImportMeta {
    readonly env: { readonly DEV: boolean }
  }
}

export {}
