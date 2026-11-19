// The notice a submit shows when the canvas re-aims the tier the user picked.
//
// mmh3's turbo8 family is trained on two canvases, so the tier that reaches
// the request can differ from the one chosen: on 960×544 it pairs to the 544p
// variant (the intended mapping, not a fallback), and on any other canvas it
// falls back to the standard recipe. The notice says which one actually
// happened — it lives here, outside the component, so the wording is a pure
// function the gates can pin.

import type { Mmh3RecipeId } from './mmh3Recipe'

/**
 * The pairing notice for one submit, or null when the chosen tier reached the
 * request unchanged. `wantedTier` is what the user picked, `tier` what
 * `mmh3TierForCanvas` resolved for the submitted canvas.
 */
export function mmh3TierNotice(wantedTier: Mmh3RecipeId, tier: Mmh3RecipeId, width: number, height: number): string | null {
  if (tier === wantedTier) return null
  if (tier === 'turbo8-544p') {
    // Landing on turbo8-544p is the intended canvas pairing, not a fallback;
    // the step count names what will actually run.
    return `当前画布 ${width}×${height}：Turbo 8 已配对到 544p 变体（turbo8-544p，8 步）。`
  }
  // Any other re-aim means the canvas is not one turbo8 was trained on, so the
  // render falls back to the standard recipe at the engine's default steps.
  return `当前画布 ${width}×${height} 不提供 turbo8（只支持 1344×768 与 960×544），已回退到标准配方（引擎默认步数）。`
}
