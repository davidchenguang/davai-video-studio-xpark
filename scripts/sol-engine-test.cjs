// Sol 引擎端到端测试：复刻 DavAi 设置页「测试 Sol 引擎」的构图逻辑，
// 直接向本机 ComfyUI 提交并跟踪结果。一次性验证脚本，非仓库正式测试。
const fs = require('node:fs')
const path = require('node:path')
const { load } = require('./test-ts-loader.cjs')

const COMFY = process.env.COMFY_URL || 'http://127.0.0.1:8188'
const MODEL_ROOT = process.env.MODEL_ROOT || '/home/dawo/comfyui/models'
const KINDS = ['diffusion_models', 'text_encoders', 'vae', 'loras', 'vae_approx', 'clip_vision']
// sol = 插入 SolAttnH3 节点；kitchen = 使用 ComfyUI 通用注意力后端（应用默认基线）
const MODE = process.env.MODE || 'sol'
// 种子参与采样器输入哈希：换一个未用过的种子即可绕过 ComfyUI 节点缓存，
// 保证采样节点真实重算（模型加载节点仍可复用缓存 = 稳态渲染条件）。
const SEED = Number(process.env.SEED || 12345)

const { buildMiniMaxWorkflow } = load('src/lib/workflow.ts')
const { inferSelections } = load('src/lib/modelSelection.ts')

function scanModels() {
  const files = []
  for (const kind of KINDS) {
    const dir = path.join(MODEL_ROOT, kind)
    if (!fs.existsSync(dir)) continue
    for (const entry of fs.readdirSync(dir)) {
      if (!/\.(safetensors|gguf|pt|pth|bin)$/i.test(entry)) continue
      files.push({ kind, name: entry, size: fs.statSync(path.join(dir, entry)).size })
    }
  }
  return files
}

async function main() {
  const models = scanModels()
  console.log(`扫描到 ${models.length} 个模型文件`)

  const info = await (await fetch(`${COMFY}/object_info`)).json()
  const solNode = Object.keys(info).find((name) => name === 'SolAttnH3') ?? Object.keys(info).find((name) => /sol.*attn.*h3/i.test(name))
  const attentionSpec = info.ModelAttentionBackend?.input?.required?.attention
  const kitchenBackend = (attentionSpec?.[1]?.options ?? (Array.isArray(attentionSpec?.[1]) ? attentionSpec[1] : [])).find((v) => /kitchen/i.test(v))
  if (MODE === 'sol' && !solNode) throw new Error('ComfyUI 未加载 SolAttnH3 节点')
  if (MODE === 'kitchen' && !kitchenBackend) throw new Error('ComfyUI 未提供 comfy kitchen attention 后端')
  console.log(`模式: ${MODE} | Sol 节点: ${solNode ?? '无'} | Kitchen 后端: ${kitchenBackend ?? '无'}`)

  const h3 = inferSelections(models, '8', 'fast', 'int8')
  console.log('H3 选择:', JSON.stringify(h3))

  const attentionOptions = MODE === 'sol'
    ? { solAttention: { nodeType: solNode, tau: 1.0 } }
    : { attentionBackend: kitchenBackend }

  const workflow = buildMiniMaxWorkflow({
    mode: 'text',
    prompt: 'A polished chrome sphere rotates slowly on a dark studio pedestal under one soft overhead light. Locked camera, clean reflections, ambient room tone, no dialogue, no text.',
    width: 864, height: 480, duration: 5, seed: SEED, steps: 8,
    turbo: '8', sampler: 'res_multistep', scheduler: 'simple', refImageSize: 'match', loraStrength: 1,
    filenamePrefix: `video/${MODE === 'sol' ? 'Sol' : 'Kitchen'}_Engine_Test_${Date.now()}`,
    referenceImages: [], referenceVideos: [], referenceAudios: [],
    ...attentionOptions,
  }, h3, { images: [], videos: [], audios: [] })

  // 与 SettingsView.testSolEngine 相同的安全检查
  const nodes = Object.values(workflow)
  if (MODE === 'sol') {
    if (!nodes.some((n) => n.class_type === solNode)) throw new Error('生成的工作流中没有 Sol-Attn 节点。')
    if (nodes.some((n) => n.class_type === 'ModelAttentionBackend')) throw new Error('安全检查未通过：H3 图中同时存在通用注意力后端。')
  }
  if (!nodes.some((n) => n.class_type === 'LoraLoaderModelOnly')) throw new Error('所选 H3 模型栈中没有官方 Turbo 8 LoRA。')
  if (workflow['14']?.inputs.steps !== 8) throw new Error('Sol 测试图未能解析出恰好 8 个采样步数。')
  console.log(`构图校验通过：${nodes.length} 个节点`)

  const response = await fetch(`${COMFY}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow, client_id: 'sol-test-client' }),
  })
  const result = await response.json()
  if (!response.ok) throw new Error(`提交失败 ${response.status}: ${JSON.stringify(result).slice(0, 500)}`)
  const promptId = result.prompt_id
  console.log(`已提交，prompt_id=${promptId}`)

  const started = Date.now()
  for (;;) {
    if (Date.now() - started > 1800000) throw new Error('超时 30 分钟')
    await new Promise((r) => setTimeout(r, 5000))
    const history = await (await fetch(`${COMFY}/history/${promptId}`)).json()
    const entry = history[promptId]
    if (entry) {
      const status = entry.status?.status_str
      console.log(`状态: ${status}`)
      const messages = entry.status?.messages ?? []
      for (const [kind, payload] of messages) {
        if (kind === 'execution_start' || kind === 'execution_success' || kind === 'execution_cached') {
          console.log(`  ${kind}: ${JSON.stringify(payload)}`)
        }
      }
      if (status === 'error') {
        console.log('ComfyUI 报告错误:', JSON.stringify(messages).slice(0, 1500))
        process.exitCode = 1
      } else {
        const outputs = Object.entries(entry.outputs ?? {}).map(([k, v]) => `${k}: ${(v.images ?? []).map((i) => i.filename).join(',') || JSON.stringify(v).slice(0, 120)}`)
        console.log('输出:', outputs.join(' | '))
        console.log(`RESULT ${MODE} wall=${Math.round((Date.now() - started) / 1000)}s`)
      }
      break
    }
    const queue = await (await fetch(`${COMFY}/queue`)).json()
    console.log(`队列: 运行 ${queue.queue_running?.length ?? 0} · 等待 ${queue.queue_pending?.length ?? 0} · 已用 ${Math.round((Date.now() - started) / 1000)}s`)
  }
}

main().catch((error) => { console.error('失败:', error.message); process.exitCode = 1 })
