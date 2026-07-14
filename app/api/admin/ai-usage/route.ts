import { NextResponse } from "next/server"
import { isAiUsageAdmin } from "@/lib/ai/usage"
import { createServiceRoleClient, getServerAuthUser } from "@/lib/supabase/index"

export const runtime = "nodejs"

type UsageRow = {
  id: string
  user_id: string
  listing_id: string | null
  model: string
  images_analyzed: number
  input_tokens: number
  output_tokens: number
  total_tokens: number
  estimated_cost_usd: number | string
  status: "succeeded" | "failed"
  error_message: string | null
  created_at: string
}

function toNumber(value: number | string | null | undefined) {
  if (typeof value === "number") return value
  if (typeof value === "string") return Number(value) || 0
  return 0
}

export async function GET() {
  const user = await getServerAuthUser()
  if (!user?.email || !isAiUsageAdmin(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const admin = createServiceRoleClient()
  if (!admin) {
    return NextResponse.json(
      { error: "Service role is not configured." },
      { status: 503 }
    )
  }

  const { data, error } = await admin
    .from("ai_generations")
    .select(
      "id, user_id, listing_id, model, images_analyzed, input_tokens, output_tokens, total_tokens, estimated_cost_usd, status, error_message, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(2000)

  if (error) {
    console.error("[admin/ai-usage]", error)
    return NextResponse.json({ error: "Could not load usage." }, { status: 500 })
  }

  const rows = (data ?? []) as UsageRow[]
  const totalGenerations = rows.length
  const succeeded = rows.filter((r) => r.status === "succeeded")
  const failed = rows.filter((r) => r.status === "failed")
  const totalEstimatedCostUsd = rows.reduce(
    (sum, r) => sum + toNumber(r.estimated_cost_usd),
    0
  )
  const successfulCost = succeeded.reduce(
    (sum, r) => sum + toNumber(r.estimated_cost_usd),
    0
  )
  const averageCostPerSuccessfulListing =
    succeeded.length > 0 ? successfulCost / succeeded.length : 0

  const byUserMap = new Map<
    string,
    { userId: string; generations: number; estimatedCostUsd: number; succeeded: number }
  >()
  for (const row of rows) {
    const current = byUserMap.get(row.user_id) ?? {
      userId: row.user_id,
      generations: 0,
      estimatedCostUsd: 0,
      succeeded: 0,
    }
    current.generations += 1
    current.estimatedCostUsd += toNumber(row.estimated_cost_usd)
    if (row.status === "succeeded") current.succeeded += 1
    byUserMap.set(row.user_id, current)
  }

  const byModelMap = new Map<
    string,
    { model: string; generations: number; estimatedCostUsd: number; totalTokens: number }
  >()
  for (const row of rows) {
    const current = byModelMap.get(row.model) ?? {
      model: row.model,
      generations: 0,
      estimatedCostUsd: 0,
      totalTokens: 0,
    }
    current.generations += 1
    current.estimatedCostUsd += toNumber(row.estimated_cost_usd)
    current.totalTokens += row.total_tokens ?? 0
    byModelMap.set(row.model, current)
  }

  const recent = rows.slice(0, 50).map((row) => ({
    id: row.id,
    userId: row.user_id,
    listingId: row.listing_id,
    model: row.model,
    imagesAnalyzed: row.images_analyzed,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    totalTokens: row.total_tokens,
    estimatedCostUsd: toNumber(row.estimated_cost_usd),
    status: row.status,
    errorMessage: row.error_message,
    createdAt: row.created_at,
  }))

  return NextResponse.json({
    summary: {
      totalGenerations,
      succeeded: succeeded.length,
      failed: failed.length,
      totalEstimatedCostUsd: Number(totalEstimatedCostUsd.toFixed(6)),
      averageCostPerSuccessfulListing: Number(
        averageCostPerSuccessfulListing.toFixed(6)
      ),
    },
    byUser: [...byUserMap.values()]
      .map((row) => ({
        ...row,
        estimatedCostUsd: Number(row.estimatedCostUsd.toFixed(6)),
      }))
      .sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd),
    byModel: [...byModelMap.values()]
      .map((row) => ({
        ...row,
        estimatedCostUsd: Number(row.estimatedCostUsd.toFixed(6)),
      }))
      .sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd),
    recent,
  })
}
