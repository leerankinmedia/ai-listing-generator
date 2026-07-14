import "server-only"
import { createServiceRoleClient } from "@/lib/supabase/index"
import {
  estimateOpenAiCostUsd,
  type TokenUsage,
  emptyTokenUsage,
} from "@/lib/ai/pricing"

export type AiUsageStatus = "succeeded" | "failed"

export type AiUsageRecordInput = {
  userId: string
  listingId?: string | null
  model: string
  imagesAnalyzed: number
  usage: TokenUsage
  status: AiUsageStatus
  errorMessage?: string | null
  draft?: unknown
}

/**
 * Persist an immutable AI usage row via service role.
 * Normal authenticated clients cannot insert/update these records.
 */
export async function recordAiUsage(input: AiUsageRecordInput) {
  const admin = createServiceRoleClient()
  if (!admin) {
    console.warn("[ai-usage] service role unavailable; skipping persistence")
    return null
  }

  const usage = input.usage ?? emptyTokenUsage()
  const inputTokens = Math.max(0, Math.round(Number(usage.inputTokens) || 0))
  const outputTokens = Math.max(0, Math.round(Number(usage.outputTokens) || 0))
  const totalTokens = Math.max(
    0,
    Math.round(Number(usage.totalTokens) || inputTokens + outputTokens)
  )
  const normalizedUsage = { inputTokens, outputTokens, totalTokens }
  const estimatedCostUsd = estimateOpenAiCostUsd(input.model, normalizedUsage)

  if (
    input.status === "succeeded" &&
    inputTokens === 0 &&
    outputTokens === 0
  ) {
    console.warn(
      "[ai-usage] succeeded generation recorded 0 tokens; check provider usage mapping",
      { model: input.model, imagesAnalyzed: input.imagesAnalyzed }
    )
  }

  const { data, error } = await admin
    .from("ai_generations")
    .insert({
      user_id: input.userId,
      listing_id: input.listingId || null,
      model: input.model,
      images_analyzed: input.imagesAnalyzed,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: totalTokens,
      estimated_cost_usd: estimatedCostUsd,
      draft: input.draft ?? {},
      status: input.status,
      error_message: input.errorMessage ?? null,
    })
    .select("id")
    .single()

  if (error) {
    console.error("[ai-usage] failed to persist", error)
    return null
  }
  return data
}

export function isAiUsageAdmin(email: string | null | undefined) {
  if (!email) return false
  const raw = process.env.AI_USAGE_ADMIN_EMAILS || ""
  const allowed = raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  if (allowed.length === 0) return false
  return allowed.includes(email.trim().toLowerCase())
}
