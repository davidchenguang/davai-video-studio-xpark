// One-off live check: submit the app's real H3 graph with the preview override
// node attached and record every `minimax_h3_preview_override` event. Run by
// hand against a live engine; not part of pnpm test.
//   node scripts/check-h3-live-preview.cjs
const fs = require('node:fs')
const { load } = require('./test-ts-loader.cjs')
const { buildMiniMaxWorkflow } = load('src/lib/workflow.ts')

const base = 'http://127.0.0.1:8188'
async function api(path, body) {
  const res = await fetch(base + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

const MODEL = 'minimax_h3_fl2va_int8_convrot.safetensors'
const LORA = 'minimax_h3_fl2v_turbo_4step_v1.2_768p_comfyui_bf16.safetensors'

async function main() {
  const graph = buildMiniMaxWorkflow(
    {
      mode: 'text', prompt: 'A red ceramic teapot rotating slowly on a wooden table, soft daylight',
      width: 640, height: 352, duration: 5, seed: 12345, steps: 4, turbo: '4',
      sampler: 'res_multistep', scheduler: 'simple', filenamePrefix: 'MiniMax_tests/live_preview_check',
      referenceImages: [], referenceVideos: [], referenceAudios: [],
      livePreview: true,
      previewOverride: { frames: 61, fps: 12, nodeType: 'MiniMaxH3PreviewOverride', vaeName: 'taeh3_decoder.safetensors', jpegQuality: 85 },
      loraStrength: 1,
    },
    {
      fl2va: MODEL, ref2va: MODEL, fastH3: MODEL, textEncoder: 'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors',
      videoVae: 'minimax_h3_video_vae_fp16.safetensors', audioVae: 'minimax_h3_audio_vae_fp32.safetensors',
      fl2vLora: LORA, ref2vLora: '', previewVae: 'taeh3_decoder.safetensors',
    },
    { images: [], videos: [], audios: [] },
  )
  const previewNode = graph['7']
  console.log('preview node in graph:', previewNode ? previewNode.class_type : 'MISSING')
  console.log('preview inputs:', JSON.stringify(previewNode?.inputs))

  const client = `h3-preview-check-${Date.now()}`
  const events = { override: 0, progress: 0, executing: 0, binary: 0 }
  const samples = []
  const ws = new WebSocket(`ws://127.0.0.1:8188/ws?clientId=${client}`)
  ws.onmessage = ({ data }) => {
    if (typeof data !== 'string') { events.binary++; return }
    const message = JSON.parse(data)
    if (message.type === 'progress') events.progress++
    if (message.type === 'executing') events.executing++
    if (message.type === 'minimax_h3_preview_override') {
      events.override++
      const d = message.data ?? {}
      samples.push({
        step: d.step, total: d.total, mime: d.mime, fps: d.fps, w: d.w, h: d.h,
        imageBytes: typeof d.image === 'string' ? Math.round(d.image.length * 0.75) : 0,
        node: d.node_id,
      })
      if (typeof d.image === 'string' && d.image.length > 1000) {
        fs.writeFileSync('.playwright-mcp/preview_last_frame.bin', Buffer.from(d.image, 'base64'))
      }
    }
  }
  const { prompt_id: id } = await api('/prompt', { prompt: graph, client_id: client })
  console.log('submitted', id)
  try {
    for (let i = 0; i < 450; i++) {
      const entry = (await api(`/history/${id}`))[id]
      if (entry?.status.status_str === 'error') throw new Error(JSON.stringify(entry.status.messages))
      if (entry?.status.completed) {
        console.log('completed after ~' + (i * 2) + 's')
        console.log('events:', events)
        console.log('first 3 override samples:', JSON.stringify(samples.slice(0, 3)))
        console.log('last override sample:', JSON.stringify(samples.at(-1)))
        const out = Object.values(entry.outputs ?? {}).flatMap(o => o.images ?? o.gifs ?? o.videos ?? [])
        console.log('outputs:', JSON.stringify(out))
        return
      }
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
    throw new Error(`Timed out; job remains on server: ${id}`)
  } finally { ws.close() }
}
main().catch((e) => { console.error(e); process.exit(1) })
