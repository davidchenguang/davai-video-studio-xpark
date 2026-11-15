import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    watch: { ignored: ['**/release/**', '**/dist-electron/**', '**/output/**'] },
    proxy: {
      // ComfyUI 0.45 rejects a WebSocket whose Host and Origin ports differ
      // (origin-only middleware → 403 before onopen). The dev page is served
      // from 5173 while the engine listens on 8188, so the renderer's event
      // socket dials this same-origin route and Vite forwards it verbatim
      // (changeOrigin stays off so Host and Origin remain 127.0.0.1:5173).
      '/comfy-ws': {
        target: process.env.DAVAI_DEV_COMFY_TARGET ?? 'http://127.0.0.1:8188',
        ws: true,
        rewrite: path => path.replace(/^\/comfy-ws/, '/ws'),
      },
    },
  },
  build: {
    outDir: 'dist',
  },
})
