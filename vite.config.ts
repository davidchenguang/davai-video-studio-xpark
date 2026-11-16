import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// ComfyUI 的 origin 校验只在 Host 是 loopback 时才比对主机名（且不比端口），
// 所以远程引擎可以直接握手；只有 loopback 引擎在 dev 下需要走同源代理：页面由
// Vite 提供在 5173，引擎在 8188，跨端口的 loopback 握手会被 origin 校验拒绝。
// 代理目标必须与应用实际使用的引擎一致，否则渲染进程订阅的是另一台引擎的
// 事件流，节点与步进事件一条也收不到。
const comfyProxyTarget = process.env.DAVAI_DEV_COMFY_TARGET ?? 'http://127.0.0.1:8188'

function comfyProxyTargetNotice(target: string): Plugin {
  return {
    name: 'davai-comfy-proxy-target',
    configureServer(server) {
      server.config.logger.info(`[comfy-ws] 事件流代理目标：${target}`)
    },
  }
}

export default defineConfig({
  plugins: [react(), comfyProxyTargetNotice(comfyProxyTarget)],
  base: './',
  server: {
    watch: { ignored: ['**/release/**', '**/dist-electron/**', '**/output/**', '**/.worktrees/**'] },
    proxy: {
      // 同源路由 → 引擎的 /ws（ws 直通，changeOrigin 关闭，Host/Origin 保持页面来源）。
      '/comfy-ws': {
        target: comfyProxyTarget,
        ws: true,
        rewrite: path => path.replace(/^\/comfy-ws/, '/ws'),
      },
    },
  },
  build: {
    outDir: 'dist',
  },
})
