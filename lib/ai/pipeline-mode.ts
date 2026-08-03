/**
 * Listing AI pipeline modes — founder A/B comparison + production hybrid.
 * Server resolves which OpenAI model(s) to use; never trust the client alone.
 */

export type ListingPipelineMode = "mini" | "strong" | "hybrid"

export const LISTING_PIPELINE_MODES: ListingPipelineMode[] = [
  "mini",
  "strong",
  "hybrid",
]

export const PIPELINE_MODE_LABELS: Record<ListingPipelineMode, string> = {
  mini: "Current mini (gpt-4.1-mini)",
  strong: "Stronger identification (gpt-4o)",
  hybrid: "Two-stage hybrid (gpt-4o → gpt-4.1-mini)",
}

/** Stronger vision model for Stage 1 product identification. */
export const IDENTITY_MODEL_DEFAULT = "gpt-4o"
/** Fast copy/comps model for Stage 2 listing generation. */
export const COPY_MODEL_DEFAULT = "gpt-4.1-mini"

export function isListingPipelineMode(value: unknown): value is ListingPipelineMode {
  return (
    typeof value === "string" &&
    (LISTING_PIPELINE_MODES as string[]).includes(value)
  )
}

export function resolvePipelineMode(
  requested: unknown,
  options: { isOwner: boolean; envDefault?: string }
): ListingPipelineMode {
  if (options.isOwner && isListingPipelineMode(requested)) {
    return requested
  }
  const fromEnv = options.envDefault?.trim()
  if (isListingPipelineMode(fromEnv)) return fromEnv
  // Production default: two-stage hybrid for accuracy + speed.
  return "hybrid"
}

export function modelsForPipeline(mode: ListingPipelineMode): {
  identityModel: string
  copyModel: string
  label: string
} {
  const identityEnv = process.env.OPENAI_IDENTITY_MODEL?.trim()
  const copyEnv = process.env.OPENAI_COPY_MODEL?.trim()
  const listingEnv = process.env.OPENAI_LISTING_MODEL?.trim()

  switch (mode) {
    case "mini":
      return {
        identityModel: listingEnv || COPY_MODEL_DEFAULT,
        copyModel: listingEnv || COPY_MODEL_DEFAULT,
        label: PIPELINE_MODE_LABELS.mini,
      }
    case "strong":
      return {
        identityModel: listingEnv || IDENTITY_MODEL_DEFAULT,
        copyModel: listingEnv || IDENTITY_MODEL_DEFAULT,
        label: PIPELINE_MODE_LABELS.strong,
      }
    case "hybrid":
    default:
      return {
        identityModel: identityEnv || IDENTITY_MODEL_DEFAULT,
        copyModel: copyEnv || COPY_MODEL_DEFAULT,
        label: PIPELINE_MODE_LABELS.hybrid,
      }
  }
}

export type AnalysisTimings = {
  /** Client-reported analyze-copy upload time (ms) */
  uploadMs?: number
  /** Stage 1 identity vision (ms) */
  identityMs: number
  /** Stage 2 copy + comps (ms) */
  listingMs: number
  /** Optional eBay taxonomy prefetch during Stage 2 (ms) */
  ebayMetadataMs: number
  /** End-to-end server generate (ms) */
  totalMs: number
}
