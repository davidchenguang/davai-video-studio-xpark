// What the engine says about its own recipes.
//
// The mmh3 server publishes the recipes it can run (GET /v1/recipes) and the
// option keys of a recipe ARE the multipart field names of a generation
// request. So the server decides whether a tier can run and on which canvas;
// the app keeps a local mirror only for the case where the engine cannot be
// reached at all.

import { useCallback, useEffect, useState } from 'react'
import type { Mmh3Recipe as Mmh3ServerRecipe } from '../../types'
import type { Mmh3RecipeId } from './mmh3Recipe'

/** The server's recipe ids and the app tier that mirrors each of them. */
export const MMH3_SERVER_RECIPE_MAP: Record<string, Mmh3RecipeId> = {
  fasth3: 'turbo4',
  turbo: 'turbo4-lora',
  turbo8: 'turbo8',
  'turbo8-544p': 'turbo8-544p',
  pdmd: 'pdmd',
  base: 'off',
}

export type Mmh3TierAvailability = {
  /** null = the engine did not answer, so the local table decides. */
  available: boolean | null
  /** The files the engine says this tier lacks. */
  missing: string[]
  /** The canvas the tier was trained on, when it has one. */
  canvas: { width: number; height: number } | null
  note: string | null
  summary: string | null
}

/** What the server says about one app tier. */
export function mmh3TierAvailability(recipes: Mmh3ServerRecipe[] | null, tier: Mmh3RecipeId): Mmh3TierAvailability {
  const empty: Mmh3TierAvailability = { available: null, missing: [], canvas: null, note: null, summary: null }
  if (!recipes?.length) return empty
  const server = recipes.find((recipe) => MMH3_SERVER_RECIPE_MAP[recipe.id] === tier)
  if (!server) return empty
  return {
    available: server.available,
    missing: server.missing,
    canvas: server.canvas,
    note: server.note,
    summary: server.summary,
  }
}

/** The server's recipe for one app tier, or null when the engine did not name it. */
export function mmh3ServerRecipeForTier(recipes: Mmh3ServerRecipe[] | null, tier: Mmh3RecipeId): Mmh3ServerRecipe | null {
  if (!recipes?.length) return null
  return recipes.find((recipe) => MMH3_SERVER_RECIPE_MAP[recipe.id] === tier) ?? null
}

/** The availability of every tier the picker shows, in one map. */
export function mmh3TierAvailabilityMap(recipes: Mmh3ServerRecipe[] | null, tiers: Mmh3RecipeId[]): Record<string, Mmh3TierAvailability> {
  return Object.fromEntries(tiers.map((tier) => [tier, mmh3TierAvailability(recipes, tier)]))
}

/** The one line the picker shows under a tier that cannot run. */
export function mmh3TierMissingText(availability: Mmh3TierAvailability | undefined): string {
  if (!availability || availability.available !== false) return ''
  return availability.missing.length
    ? `模型缺失：${availability.missing.join('、')}`
    : '模型缺失：引擎未列全所需文件'
}

export type Mmh3RecipesState = {
  /** Whether the engine answered the recipe query at least once. */
  connected: boolean
  recipes: Mmh3ServerRecipe[] | null
  error: string | null
  refresh(): void
}

/**
 * The engine's own recipes for one instance. The query runs when the instance
 * changes and on demand; it never runs on a timer, because an engine that goes
 * away says so when it is asked.
 */
export function useMmh3Recipes(baseUrl: string | undefined): Mmh3RecipesState {
  const [recipes, setRecipes] = useState<Mmh3ServerRecipe[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    const url = baseUrl?.trim()
    if (!url) {
      setRecipes(null)
      setError(null)
      return
    }
    let cancelled = false
    void window.minimax.mmh3Recipes(url).then((result) => {
      if (cancelled) return
      if (result.error) {
        setRecipes(null)
        setError(result.error)
        return
      }
      setError(null)
      setRecipes(result.recipes?.length ? result.recipes : null)
    }).catch((cause: unknown) => {
      if (cancelled) return
      setRecipes(null)
      setError(cause instanceof Error ? cause.message : String(cause))
    })
    return () => { cancelled = true }
  }, [baseUrl, nonce])

  const refresh = useCallback(() => setNonce((value) => value + 1), [])

  return { connected: recipes !== null, recipes, error, refresh }
}
