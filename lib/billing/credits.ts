import "server-only"
import { createServiceRoleClient, isSupabaseConfigured } from "@/lib/supabase/index"
import {
  MONTHLY_LISTING_CREDITS,
  isBillingEnforcementEnabled,
} from "@/lib/billing/config"

/**
 * Customer billing credits vs internal OpenAI usage:
 * - One completed AI-generated listing (succeeded generate) = 1 customer credit
 * - Multiple internal OpenAI calls inside that generation do not multiply credits
 * - Token/cost rows in ai_generations remain for admin cost tracking only
 *
 * Credit limits are NOT enforced while BILLING_ENFORCEMENT=false.
 */

export type ListingCreditsSummary = {
  allowance: number
  used: number
  remaining: number
  /** Always false until enforcement is turned on. */
  enforced: boolean
  /** True when used >= allowance; only blocks if enforced. */
  exhausted: boolean
  periodStart: string | null
}

/** Best-effort billing-cycle start for credit display (no Stripe period_start column yet). */
export function creditPeriodStartFromSubscription(
  sub: {
    status: string
    trial_start: string | null
    current_period_end: string | null
  } | null
): string | null {
  if (!sub) return null
  if (sub.status === "trialing" && sub.trial_start) return sub.trial_start
  if (sub.current_period_end) {
    const endMs = new Date(sub.current_period_end).getTime()
    if (!Number.isFinite(endMs)) return sub.trial_start
    const start = new Date(endMs)
    start.setUTCMonth(start.getUTCMonth() - 1)
    if (sub.trial_start) {
      const trialMs = new Date(sub.trial_start).getTime()
      if (Number.isFinite(trialMs) && trialMs > start.getTime()) {
        return sub.trial_start
      }
    }
    return start.toISOString()
  }
  return sub.trial_start
}

/**
 * Count customer credits used in the current billing window.
 * Each succeeded ai_generations row = one completed listing = one credit.
 */
export async function getListingCreditsUsed(
  userId: string,
  sinceIso: string | null
): Promise<number> {
  if (!userId || !isSupabaseConfigured()) return 0

  const admin = createServiceRoleClient()
  if (!admin) return 0

  let query = admin
    .from("ai_generations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "succeeded")

  if (sinceIso) {
    query = query.gte("created_at", sinceIso)
  }

  const { count, error } = await query
  if (error) {
    console.error("[credits] failed to count listing credits", error.message)
    return 0
  }
  return Math.max(0, count ?? 0)
}

/**
 * Period start for credit window:
 * trial_start → current period start approx via trial_end / current_period_end math
 * Prefer trial_start when trialing; otherwise use period start derived from
 * current_period_end minus ~30 days is fragile — use trial_start or
 * current_period_end window start from subscription if available.
 *
 * For display we use: trial_start if set and still in trial window, else
 * the later of (created_at-ish) — callers pass periodStartIso explicitly.
 */
export async function getListingCreditsSummary(input: {
  userId: string
  periodStartIso: string | null
  allowance?: number
}): Promise<ListingCreditsSummary> {
  const allowance = input.allowance ?? MONTHLY_LISTING_CREDITS
  const used = await getListingCreditsUsed(input.userId, input.periodStartIso)
  const remaining = Math.max(0, allowance - used)
  const exhausted = used >= allowance
  return {
    allowance,
    used,
    remaining,
    enforced: isBillingEnforcementEnabled(),
    exhausted,
    periodStart: input.periodStartIso,
  }
}

/**
 * Guard for future enforcement. Always allows while BILLING_ENFORCEMENT=false.
 * Does not lock or reject current test users.
 */
export async function assertListingCreditAvailable(input: {
  userId: string
  periodStartIso: string | null
}): Promise<{ ok: true } | { ok: false; summary: ListingCreditsSummary }> {
  const summary = await getListingCreditsSummary(input)
  if (!summary.enforced) {
    return { ok: true }
  }
  if (summary.exhausted) {
    return { ok: false, summary }
  }
  return { ok: true }
}
