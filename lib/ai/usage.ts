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

export type AiUsageRecordResult = {
  id: string | null
  recorded: boolean
  error?: string
}

function looksLikeJwt(key: string) {
  return key.startsWith("eyJ") && key.split(".").length >= 3
}

function serviceRoleClaim(key: string): string | null {
  if (!looksLikeJwt(key)) return null
  try {
    const payload = JSON.parse(
      Buffer.from(key.split(".")[1]!, "base64url").toString("utf8")
    ) as { role?: string }
    return payload.role ?? null
  } catch {
    return null
  }
}

function requireServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key || url === "https://your-project.supabase.co") {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is required to record AI usage (RLS blocks user inserts)."
    )
  }
  const role = serviceRoleClaim(key)
  if (role && role !== "service_role") {
    throw new Error(
      `SUPABASE_SERVICE_ROLE_KEY has role "${role}", expected "service_role".`
    )
  }
  const client = createServiceRoleClient()
  if (!client) {
    throw new Error("Failed to create Supabase service-role client.")
  }
  return client
}

function normalizeListingId(listingId?: string | null) {
  if (!listingId) return null
  const trimmed = listingId.trim()
  if (!trimmed) return null
  // Only persist real UUIDs — client temp ids must not fail the insert
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      trimmed
    )
  ) {
    return null
  }
  return trimmed
}

/**
 * Persist an immutable AI usage row via service role.
 * Normal authenticated clients cannot insert/update these records (RLS).
 */
export async function recordAiUsage(
  input: AiUsageRecordInput
): Promise<AiUsageRecordResult> {
  try {
    if (!input.userId) {
      throw new Error("userId is required to record AI usage.")
    }

    const admin = requireServiceRoleClient()
    const usage = input.usage ?? emptyTokenUsage()
    const inputTokens = Math.max(0, Math.round(Number(usage.inputTokens) || 0))
    const outputTokens = Math.max(
      0,
      Math.round(Number(usage.outputTokens) || 0)
    )
    const totalTokens = Math.max(
      0,
      Math.round(Number(usage.totalTokens) || inputTokens + outputTokens)
    )
    const normalizedUsage = { inputTokens, outputTokens, totalTokens }
    let estimatedCostUsd = estimateOpenAiCostUsd(input.model, normalizedUsage)
    if (!Number.isFinite(estimatedCostUsd) || estimatedCostUsd < 0) {
      estimatedCostUsd = 0
    }

    const row = {
      user_id: input.userId,
      listing_id: normalizeListingId(input.listingId),
      model: input.model || "unknown",
      images_analyzed: Math.max(0, Math.round(Number(input.imagesAnalyzed) || 0)),
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: totalTokens,
      estimated_cost_usd: estimatedCostUsd,
      draft: input.draft ?? {},
      status: input.status,
      error_message: input.errorMessage ?? null,
    }

    let { data, error } = await admin
      .from("ai_generations")
      .insert(row)
      .select("id")
      .maybeSingle()

    // If draft payload causes insert failure, retry without draft
    if (error && row.draft && Object.keys(row.draft as object).length > 0) {
      console.error(
        "[ai-usage] insert with draft failed; retrying without draft",
        error.message || error
      )
      const retry = await admin
        .from("ai_generations")
        .insert({ ...row, draft: {} })
        .select("id")
        .maybeSingle()
      data = retry.data
      error = retry.error
    }

    if (error) {
      console.error("[ai-usage] service-role insert failed", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        userId: input.userId,
        model: input.model,
        status: input.status,
      })
      return {
        id: null,
        recorded: false,
        error: error.message || "ai_generations insert failed",
      }
    }

    const id = (data as { id?: string } | null)?.id ?? null
    console.info("[ai-usage] recorded", {
      id,
      userId: input.userId,
      model: input.model,
      status: input.status,
      imagesAnalyzed: row.images_analyzed,
      inputTokens,
      outputTokens,
      totalTokens,
      estimatedCostUsd,
    })
    return { id, recorded: true }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "AI usage recording failed"
    console.error("[ai-usage] recordAiUsage exception", message)
    return { id: null, recorded: false, error: message }
  }
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
