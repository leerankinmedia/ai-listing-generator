/**
 * Client + server generate-flow stage names.
 * Values are milliseconds. Safe to log — no tokens, URLs, or photo bytes.
 */

export const GENERATE_STAGES = [
  "photo_analysis_preparation",
  "analysis_image_upload",
  "analysis_image_fetch",
  "openai_request",
  "openai_parse",
  "ebay_category_lookup",
  "ebay_condition_lookup",
  "ebay_item_specifics_lookup",
  "draft_mapping",
  "database_save",
  "redirect_to_review",
  "total",
] as const

export type GenerateStage = (typeof GENERATE_STAGES)[number]

export type GenerateTimings = {
  flow: "generate"
  totalMs: number
  stages: Partial<Record<string, number>>
}

export function emptyGenerateStages(): Record<string, number> {
  return Object.fromEntries(GENERATE_STAGES.map((name) => [name, 0]))
}

export function mergeGenerateStages(
  ...parts: Array<Record<string, number> | undefined>
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const part of parts) {
    if (!part) continue
    for (const [name, ms] of Object.entries(part)) {
      if (!Number.isFinite(ms)) continue
      out[name] = (out[name] || 0) + Math.max(0, Math.round(ms))
    }
  }
  return out
}

export function logGenerateTimings(
  stages: Record<string, number>,
  extra?: Record<string, unknown>
) {
  const totalMs = stages.total || 0
  const rows = GENERATE_STAGES.filter((name) => name !== "total").map((name) => ({
    stage: name,
    ms: stages[name] || 0,
  }))
  console.info("[timing] generate breakdown", {
    flow: "generate",
    totalMs,
    stages: Object.fromEntries(rows.map((row) => [row.stage, row.ms])),
    ...extra,
  })
}
