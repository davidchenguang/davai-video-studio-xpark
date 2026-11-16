import { useCallback, useEffect, useRef, useState } from 'react'
import { createId } from './createId'
import { nodeStageLabel, samplerPassForNode } from './renderProgress'
import { PROGRESS_STAGE_LABELS, progressStageForNode, type ProgressStageId } from './progressStages'

export type LiveProgress = { progress?: number; label: string; currentStep?: number; totalSteps?: number; samplerPass?: 'first' | 'refine'; nodeId?: string | null; stage?: ProgressStageId }
export type LivePreview = {
  promptId: string
  url: string
  mime: string
  animated: boolean
  fps?: number
  step?: number
  totalSteps?: number
}

function previewBlob(base64: string, mime: string) {
  const binary = atob(base64.replace(/^data:[^,]*,/, '').replace(/\s/g, ''))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return new Blob([bytes], { type: mime })
}

function binaryPreviewImage(data: ArrayBuffer) {
  const bytes = new Uint8Array(data)
  const header = new DataView(data)
  // H3's motion override carries a 32-byte envelope around each JPEG frame.
  if (bytes.length > 34 && header.getUint32(4) === 1 && header.getUint32(8) === 1 && bytes[32] === 0xff && bytes[33] === 0xd8) {
    return { offset: 32, mime: 'image/jpeg', animated: true }
  }
  // ComfyUI's normal sampler frame starts after its 8-byte envelope. KJNodes'
  // LTX override adds frame and node metadata before the JPEG, so identify the
  // image itself instead of assuming one particular envelope length.
  for (let offset = 0; offset <= Math.min(64, bytes.length - 2); offset += 1) {
    if (bytes[offset] === 0xff && bytes[offset + 1] === 0xd8) return { offset, mime: 'image/jpeg', animated: false }
    if (offset <= bytes.length - 8 && bytes[offset] === 0x89 && bytes[offset + 1] === 0x50 && bytes[offset + 2] === 0x4e && bytes[offset + 3] === 0x47) return { offset, mime: 'image/png', animated: false }
    if (offset <= bytes.length - 12 && bytes[offset] === 0x52 && bytes[offset + 1] === 0x49 && bytes[offset + 2] === 0x46 && bytes[offset + 3] === 0x46 && bytes[offset + 8] === 0x57 && bytes[offset + 9] === 0x45 && bytes[offset + 10] === 0x42 && bytes[offset + 11] === 0x50) return { offset, mime: 'image/webp', animated: true }
  }
  return null
}

// ComfyUI 的 origin 校验只在 Host 是 loopback 时才比对主机名（且不比端口），
// 所以远程引擎可以直接握手；只有 loopback 引擎在 dev 下需要走同源代理：页面由
// Vite 提供在 5173，引擎在 8188，跨端口的 loopback 握手会被 origin 校验拒绝。
// 无论走哪条路径，事件流都必须落在「真正执行这条提示词的引擎」上，否则渲染进程
// 收不到任何节点/步进事件，进度条会停在提交时的初始值。
function isLoopbackHost(hostname: string) {
  const host = hostname.toLowerCase()
  return host === 'localhost' || host === '::1' || host === '[::1]' || /^127\./.test(host)
}

export function comfyEventSocketUrl(engineUrl: string, devOrigin: boolean, clientId: string) {
  const address = new URL(engineUrl)
  if (devOrigin && isLoopbackHost(address.hostname)) {
    return `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/comfy-ws?clientId=${encodeURIComponent(clientId)}`
  }
  address.protocol = address.protocol === 'https:' ? 'wss:' : 'ws:'
  address.pathname = `${address.pathname.replace(/\/$/, '')}/ws`
  address.search = `clientId=${encodeURIComponent(clientId)}`
  return address.href
}

export function useLivePreview(url: string | undefined, enabled: boolean, onProgress: (id: string, update: LiveProgress) => void) {
  const [clientId] = useState(createId)
  const [preview, setPreview] = useState<LivePreview | null>(null)
  const [connected, setConnected] = useState(false)
  const workflowNodes = useRef(new Map<string, Record<string, string>>())
  const previewDisabled = useRef(new Set<string>())
  const registerWorkflow = useCallback((promptId: string, graph: Record<string, { class_type: string }>, showPreview = true) => {
    if (workflowNodes.current.size >= 32) {
      const oldest = workflowNodes.current.keys().next().value!
      workflowNodes.current.delete(oldest)
      previewDisabled.current.delete(oldest)
    }
    workflowNodes.current.set(promptId, Object.fromEntries(Object.entries(graph).map(([id, node]) => [id, node.class_type])))
    if (showPreview) previewDisabled.current.delete(promptId)
    else previewDisabled.current.add(promptId)
  }, [])
  useEffect(() => {
    if (!url || !enabled) { setConnected(false); setPreview(null); return }
    let stopped = false, active = '', blobUrl = '', sawH3Frames = false, samplerStage = '', lastPreviewAt = 0
    let samplerPass: LiveProgress['samplerPass']
    let socket: WebSocket
    let timer: ReturnType<typeof setTimeout>
    const replacePreview = (next: LivePreview) => {
      if (blobUrl) URL.revokeObjectURL(blobUrl)
      blobUrl = next.url.startsWith('blob:') ? next.url : ''
      setPreview(next)
    }
    const connect = () => {
      socket = new WebSocket(comfyEventSocketUrl(url, import.meta.env.DEV, clientId))
      socket.binaryType = 'arraybuffer'
      socket.onopen = () => setConnected(true)
      socket.onerror = () => setConnected(false)
      socket.onclose = () => { setConnected(false); if (!stopped) timer = setTimeout(connect, 3000) }
      socket.onmessage = async (event) => {
        if (typeof event.data === 'string') {
          let msg: { type: string; data: { prompt_id?: string; node?: string | null; value?: number; max?: number; image?: string; mime?: string; fps?: number; rate?: number; step?: number; total?: number; output?: { images?: Array<{ filename: string; subfolder?: string; type?: string }> } } }
          try { msg = JSON.parse(event.data) } catch { return }
          const promptId = msg.data.prompt_id ?? active
          // ComfyUI can reconnect the event socket after a prompt has already
          // started. In that case execution_start is not replayed, so use the
          // prompt id carried by later node/progress events as the active job.
          // Without this, valid LTX preview frames are discarded until a new
          // render happens to start while the socket is connected.
          if (msg.data.prompt_id) active = msg.data.prompt_id
          if (msg.type === 'execution_start') {
            active = msg.data.prompt_id ?? ''
            sawH3Frames = false
            samplerStage = ''
            samplerPass = undefined
            if (blobUrl) URL.revokeObjectURL(blobUrl)
            blobUrl = ''
            setPreview(null)
            onProgress(active, { progress: 1, label: '正在启动工作流' })
          }
          if (msg.type === 'execution_cached') onProgress(promptId, { label: '复用缓存的模型数据' })
          if (msg.type === 'executing' && msg.data.node !== undefined) {
            const nodeId = msg.data.node
            if (nodeId) {
              const nodeType = workflowNodes.current.get(promptId)?.[nodeId]
              const pass = samplerPassForNode(nodeId, nodeType)
              if (pass) { samplerPass = pass; samplerStage = pass === 'refine' ? '精修采样轮' : '首轮采样' }
              onProgress(promptId, { label: pass ? samplerStage : nodeStageLabel(nodeType, nodeId), nodeId, stage: progressStageForNode(nodeType), ...(pass ? { samplerPass: pass } : {}) })
            } else {
              onProgress(promptId, { label: '正在收尾工作流', nodeId: null })
            }
          }
          // KJNodes announces its LTX outer-sampler stream before it begins
          // sending binary PREVIEW_IMAGE frames. Surface that separately from
          // generic socket connectivity so a missing frame stream is obvious.
          if (msg.type === 'VHS_latentpreview') onProgress(promptId, { label: `LTX 采样预览流 · ${msg.data.fps ?? msg.data.rate ?? 24} fps` })
          // legacy "progress" 事件带 node/value/max：它同时是「哪个节点在跑」和
          // 「这个节点跑到第几步」的唯一来源，因此要连 nodeId 一起上报，界面才能
          // 把步数归到正确的阶段（文本编码 / 采样）。
          if (msg.type === 'progress' && msg.data.max) {
            const currentStep = Math.max(0, msg.data.value ?? 0)
            const totalSteps = msg.data.max
            const nodeId = msg.data.node ?? undefined
            const nodeType = nodeId ? workflowNodes.current.get(promptId)?.[nodeId] : undefined
            // 拿不到节点类型时退回既有语义：按采样器处理，避免把未知节点说成别的阶段。
            const stage = nodeType ? progressStageForNode(nodeType) : 'sample'
            const stageName = stage === 'sample' ? (samplerStage || '采样中') : PROGRESS_STAGE_LABELS[stage]
            onProgress(promptId, { progress: Math.min(95, (currentStep / totalSteps) * 95), label: stageName, currentStep, totalSteps, samplerPass, nodeId, stage })
          }
          if (msg.type === 'execution_success') {
            onProgress(promptId, { progress: 98, label: '正在保存最终输出', nodeId: null })
            workflowNodes.current.delete(promptId)
            previewDisabled.current.delete(promptId)
          }
          if (msg.type === 'minimax_h3_preview_override' && msg.data.image && promptId && !previewDisabled.current.has(promptId)) {
            const now = Date.now()
            if (now - lastPreviewAt < 300) return
            lastPreviewAt = now
            const mime = msg.data.mime ?? 'image/jpeg'
            if (!/^(?:image\/(?:jpeg|png|webp)|video\/mp4)$/.test(mime)) return
            let nextUrl: string
            try { nextUrl = URL.createObjectURL(previewBlob(msg.data.image, mime)) } catch { return }
            sawH3Frames = true
            replacePreview({
              promptId,
              url: nextUrl,
              mime,
              animated: true,
              fps: msg.data.fps,
              step: msg.data.step,
              totalSteps: msg.data.total,
            })
          }
          if (msg.type === 'executed' && msg.data.output?.images?.[0] && !sawH3Frames && !previewDisabled.current.has(promptId)) {
            const file = msg.data.output.images[0]
            const query = new URLSearchParams({ filename: file.filename, subfolder: file.subfolder ?? '', type: file.type ?? 'temp' })
            const upstream = `${url.replace(/\/+$/, '')}/view?${query}`
            replacePreview({ promptId: msg.data.prompt_id ?? active, url: `minimax-media://comfy?url=${encodeURIComponent(upstream)}`, mime: 'image/jpeg', animated: false })
          }
        } else {
          const now = Date.now()
          if (now - lastPreviewAt < 300) return
          lastPreviewAt = now
          const promptId = active
          if (previewDisabled.current.has(promptId)) return
          const binary = event.data instanceof ArrayBuffer ? event.data : event.data instanceof Blob ? await event.data.arrayBuffer() : null
          if (!binary || binary.byteLength <= 8 || !promptId) return
          const header = new DataView(binary)
          if (header.getUint32(0) !== 1) return
          const image = binaryPreviewImage(binary)
          if (!image) return
          const nextUrl = URL.createObjectURL(new Blob([binary.slice(image.offset)], { type: image.mime }))
          if (image.animated) sawH3Frames = true
          replacePreview({ promptId, url: nextUrl, mime: image.mime, animated: image.animated })
        }
      }
    }
    try { connect() } catch { setConnected(false) }
    return () => { stopped = true; clearTimeout(timer); socket?.close(); if (blobUrl) URL.revokeObjectURL(blobUrl) }
  }, [url, clientId, enabled, onProgress])
  return { clientId, preview, connected, registerWorkflow }
}
