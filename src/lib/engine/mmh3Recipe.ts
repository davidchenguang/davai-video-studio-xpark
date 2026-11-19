// The mmh3 recipes: how a DavAi H3 tier becomes a set of mmh3 server form
// fields. mmh3 has its own native recipes and its own scheduler grid, so a
// tier here is not the ComfyUI graph with different numbers — it is a
// different engine's settings, and the UI labels it as such.
//
// The engine publishes its own recipes (GET /v1/recipes) whose option keys
// ARE the multipart field names; this local table mirrors the server's
// fasth3/turbo/turbo8/turbo8-544p/pdmd entries for when the engine is
// unreachable, and the canvas pairing lives with the tier itself.

export type Mmh3RecipeId = 'off' | 'turbo4' | 'turbo4-lora' | 'turbo8' | 'turbo8-544p' | 'fast' | 'pdmd'

export type Mmh3Target = 'main' | 'fast'

export type Mmh3FieldValue = string | number

export type Mmh3Recipe = {
  id: Mmh3RecipeId
  label: string
  /** A note that belongs to this engine only, shown next to the recipe. */
  badge?: string
  target: Mmh3Target
  fields: Record<string, Mmh3FieldValue>
}

export const MMH3_RECIPES: Mmh3RecipeId[] = ['off', 'turbo4', 'turbo4-lora', 'turbo8', 'turbo8-544p', 'fast', 'pdmd']

/** What the recipe picker holds: follow the quality preset, or one explicit recipe. */
export type Mmh3RecipeChoice = 'auto' | Mmh3RecipeId

export const MMH3_RECIPE_CHOICES: Mmh3RecipeChoice[] = ['auto', ...MMH3_RECIPES]

export const MMH3_RECIPE_LABELS: Record<Mmh3RecipeId, string> = {
  off: '标准（引擎默认步数）',
  turbo4: 'Turbo 4（FastH3 patch）',
  'turbo4-lora': 'Turbo 4（lightx2v 同权重）',
  turbo8: 'Turbo 8（768p · lightx2v）',
  'turbo8-544p': 'Turbo 8（544p · lightx2v）',
  fast: '极速 8 步（fastvideo DiT）',
  pdmd: 'PDMD 2 步（mmh3 专属）',
}

export const MMH3_FASTH3_PATCH = 'minimax_h3_fasth3_vsa_datafree_patch_rank64.safetensors'
export const MMH3_TURBO4_LORA = 'minimax_h3_fl2v_turbo_4step_v1.2_768p_comfyui_bf16.safetensors'
export const MMH3_TURBO8_LORA = 'minimax_h3_fl2v_turbo_8step_v1.0_768p_comfyui_bf16.safetensors'
export const MMH3_TURBO8_544P_LORA = 'minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors'
export const MMH3_PDMD_LORA = 'minimax_h3_pdmd_2step_lora_rank128_bf16.safetensors'

/** The canvases the turbo8 family was trained on; the shift pairs with the canvas. */
export const MMH3_TURBO8_CANVAS: Record<'turbo8' | 'turbo8-544p', { width: number; height: number }> = {
  turbo8: { width: 1344, height: 768 },
  'turbo8-544p': { width: 960, height: 544 },
}

export type Mmh3RecipeOptions = {
  steps?: number
  shiftVideo?: number
  shiftAudio?: number
  seed?: number
}

function shiftFields(options: Mmh3RecipeOptions) {
  return {
    'shift-video': String(options.shiftVideo ?? 12),
    'shift-audio': String(options.shiftAudio ?? 3),
  }
}

/**
 * The fields a tier sends to mmh3. The sampler and the schedule are left to
 * mmh3's own defaults (euler over the uniform sigma grid) for every tier, so
 * the tiers differ only where their weights differ.
 */
export function mmh3VideoRecipe(id: Mmh3RecipeId, options: Mmh3RecipeOptions = {}): Mmh3Recipe {
  const steps = Math.max(1, Math.round(Number(options.steps) || 30))
  const shift = shiftFields(options)
  switch (id) {
    case 'turbo4':
      // The server's fasth3 recipe: the VSA gate rides on the patch itself, no
      // explicit attention field; precision comes along per the server table.
      return {
        id,
        label: MMH3_RECIPE_LABELS[id],
        target: 'main',
        fields: {
          patch: MMH3_FASTH3_PATCH,
          steps: 4,
          'attention-precision': 'int8-fp8',
          ...shift,
        },
      }
    case 'turbo4-lora':
      // The server's turbo recipe: the 768p 4-step LoRA was trained at video
      // shift 6 / audio shift 3 on the 1344x768 canvas, sol attention.
      return {
        id,
        label: MMH3_RECIPE_LABELS[id],
        badge: '对照',
        target: 'main',
        fields: {
          lora: MMH3_TURBO4_LORA,
          steps: 4,
          attention: 'sol',
          'attention-precision': 'int8-fp8',
          'sparse-start': 0,
          'shift-video': String(options.shiftVideo ?? 6),
          'shift-audio': String(options.shiftAudio ?? 3),
        },
      }
    case 'turbo8':
      // The server's turbo8 recipe: the 768p 8-step LoRA pairs shift 6/3 with
      // the 1344x768 canvas it was trained on — never the 544p file here.
      return {
        id,
        label: MMH3_RECIPE_LABELS[id],
        target: 'main',
        fields: {
          lora: MMH3_TURBO8_LORA,
          steps: 8,
          attention: 'sol',
          'attention-precision': 'int8-fp8',
          'sparse-start': 0,
          'shift-video': String(options.shiftVideo ?? 6),
          'shift-audio': String(options.shiftAudio ?? 3),
        },
      }
    case 'turbo8-544p':
      // The server's turbo8-544p recipe: the 544p mixed-aspect variant keeps
      // its own training shift 12/3 on the 960x544 canvas.
      return {
        id,
        label: MMH3_RECIPE_LABELS[id],
        target: 'main',
        fields: {
          lora: MMH3_TURBO8_544P_LORA,
          steps: 8,
          attention: 'sol',
          'attention-precision': 'int8-fp8',
          'sparse-start': 0,
          ...shift,
        },
      }
    case 'fast':
      // The whole DiT is pinned on the second mmh3 instance, which is why this
      // tier is a different target and not just another set of fields.
      return {
        id,
        label: MMH3_RECIPE_LABELS[id],
        badge: '第二实例',
        target: 'fast',
        fields: { steps: 8, attention: 'dense', 'attention-precision': 'int8-fp8', ...shift },
      }
    case 'pdmd':
      // The server's pdmd recipe; the DavAi table used to omit
      // attention-precision, which the server recipe now settles for good.
      return {
        id,
        label: MMH3_RECIPE_LABELS[id],
        badge: 'mmh3 专属',
        target: 'main',
        fields: {
          lora: MMH3_PDMD_LORA,
          steps: 2,
          attention: 'sol',
          'attention-precision': 'int8-fp8',
          'sparse-start': 0,
          ...shift,
        },
      }
    case 'off':
    default:
      return {
        id: 'off',
        label: MMH3_RECIPE_LABELS.off,
        target: 'main',
        fields: { sampler: 'euler', schedule: 'uniform', steps, ...shift },
      }
  }
}

/** Which turbo8 tier a canvas gets, or null where the tier is not offered. */
export function turbo8RecipeForCanvas(width: number, height: number): 'turbo8' | 'turbo8-544p' | null {
  const canvas = MMH3_TURBO8_CANVAS
  if (width === canvas.turbo8.width && height === canvas.turbo8.height) return 'turbo8'
  if (width === canvas['turbo8-544p'].width && height === canvas['turbo8-544p'].height) return 'turbo8-544p'
  return null
}

/**
 * The tier a canvas gets. turbo8 exists only on the two canvases it was
 * trained on — 1344×768 and 960×544 — and every other canvas falls back to
 * the standard recipe instead of running the wrong weights.
 */
export function mmh3TierForCanvas(tier: Mmh3RecipeId, width: number, height: number): Mmh3RecipeId {
  if (tier !== 'turbo8') return tier
  return turbo8RecipeForCanvas(width, height) ?? 'off'
}

/** The canvas a tier was trained on, when the tier has one. */
export function mmh3TierCanvas(tier: Mmh3RecipeId): { width: number; height: number } | null {
  if (tier === 'turbo8' || tier === 'turbo8-544p') return MMH3_TURBO8_CANVAS[tier]
  return null
}

/** The fields an image request sends to mmh3. */
export function mmh3ImageFields(options: { width?: number; height?: number; steps?: number; seed?: number }) {
  const fields: Record<string, Mmh3FieldValue> = {}
  if (options.width) fields.width = Math.round(options.width)
  if (options.height) fields.height = Math.round(options.height)
  fields.steps = Math.max(1, Math.round(Number(options.steps) || 6))
  if (options.seed !== undefined) fields.seed = Math.round(options.seed)
  return fields
}

/** The recipe a DavAi turbo tier maps to, for the tiers the two engines share. */
export function recipeForTurbo(turbo: string): Mmh3RecipeId {
  if (turbo === '4') return 'turbo4'
  if (turbo === '8') return 'turbo8'
  if (turbo === 'fast') return 'fast'
  return 'off'
}
