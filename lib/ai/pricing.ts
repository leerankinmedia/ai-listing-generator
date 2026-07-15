/**
 * Centralized OpenAI model pricing (USD per 1M tokens).
 * Update these rates when OpenAI changes official list prices.
 * Source: https://developers.openai.com/api/docs/pricing (standard tier)
 *
 * Server-only — never import from client components.
 */

export type ModelPricing = {
  /** Display / API model id */
  model: string
  /** USD per 1,000,000 input tokens */
  inputPerMillionUsd: number
  /** USD per 1,000,000 output tokens */
  outputPerMillionUsd: number
  /** Optional cached-input rate (not used in estimates unless provided) */
  cachedInputPerMillionUsd?: number
  notes?: string
  /** ISO date this row was last verified against OpenAI pricing */
  verifiedAt: string
}

/**
 * Official standard API rates. Add new models here when the engine changes.
 */
export const OPENAI_MODEL_PRICING: Record<string, ModelPricing> = {
  "gpt-4o": {
    model: "gpt-4o",
    inputPerMillionUsd: 2.5,
    outputPerMillionUsd: 10.0,
    cachedInputPerMillionUsd: 1.25,
    notes: "Standard tier list price",
    verifiedAt: "2026-07-14",
  },
  "gpt-4o-mini": {
    model: "gpt-4o-mini",
    inputPerMillionUsd: 0.15,
    outputPerMillionUsd: 0.6,
    cachedInputPerMillionUsd: 0.075,
    notes: "Standard tier list price",
    verifiedAt: "2026-07-14",
  },
  "gpt-4.1": {
    model: "gpt-4.1",
    inputPerMillionUsd: 2.0,
    outputPerMillionUsd: 8.0,
    notes: "Standard tier list price",
    verifiedAt: "2026-07-14",
  },
  "gpt-4.1-mini": {
    model: "gpt-4.1-mini",
    inputPerMillionUsd: 0.4,
    outputPerMillionUsd: 1.6,
    notes: "Standard tier list price",
    verifiedAt: "2026-07-15",
  },
}

export const DEFAULT_LISTING_MODEL = "gpt-4o"

/** Active listing-engine model — override with OPENAI_LISTING_MODEL. */
export function getListingModel() {
  const configured = process.env.OPENAI_LISTING_MODEL?.trim()
  return configured || DEFAULT_LISTING_MODEL
}

export function getModelPricing(model: string): ModelPricing | null {
  if (OPENAI_MODEL_PRICING[model]) return OPENAI_MODEL_PRICING[model]
  // Prefer longest prefix match (gpt-4.1-mini before gpt-4.1)
  const base = Object.keys(OPENAI_MODEL_PRICING)
    .sort((a, b) => b.length - a.length)
    .find((key) => model === key || model.startsWith(`${key}-`))
  return base ? OPENAI_MODEL_PRICING[base] : null
}

export type TokenUsage = {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

export function emptyTokenUsage(): TokenUsage {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
}

export function addTokenUsage(a: TokenUsage, b: Partial<TokenUsage>): TokenUsage {
  const inputTokens =
    (Number(a.inputTokens) || 0) + (Number(b.inputTokens) || 0)
  const outputTokens =
    (Number(a.outputTokens) || 0) + (Number(b.outputTokens) || 0)
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
  }
}

/** Estimate USD cost from token counts using centralized list prices. */
export function estimateOpenAiCostUsd(
  model: string,
  usage: TokenUsage
): number {
  const pricing = getModelPricing(model)
  if (!pricing) {
    // Unknown model — return 0 rather than inventing a rate
    return 0
  }
  const inputCost =
    (usage.inputTokens / 1_000_000) * pricing.inputPerMillionUsd
  const outputCost =
    (usage.outputTokens / 1_000_000) * pricing.outputPerMillionUsd
  return Number((inputCost + outputCost).toFixed(6))
}
