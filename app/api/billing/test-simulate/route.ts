import { NextResponse } from "next/server"
import { isBillingTestControlsEnabled } from "@/lib/billing/env-flags"
import {
  getSubscriptionByUserId,
  upsertSubscriptionForUser,
  type SubscriptionStatus,
} from "@/lib/billing/subscription-store"
import { getServerAuthUser } from "@/lib/supabase/index"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const SIMULATED_STATUSES = [
  "past_due",
  "canceled",
  "active",
  "trialing",
] as const

type SimulatedStatus = (typeof SIMULATED_STATUSES)[number]

function isSimulatedStatus(value: unknown): value is SimulatedStatus {
  return (
    typeof value === "string" &&
    (SIMULATED_STATUSES as readonly string[]).includes(value)
  )
}

export async function GET() {
  const user = await getServerAuthUser()
  if (!user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 })
  }

  return NextResponse.json({
    enabled: isBillingTestControlsEnabled(),
    statuses: SIMULATED_STATUSES,
  })
}

/**
 * TEST ONLY — update local subscriptions.status for the current user.
 * Does not call Stripe or change real Stripe subscriptions.
 */
export async function POST(request: Request) {
  try {
    if (!isBillingTestControlsEnabled()) {
      return NextResponse.json(
        {
          error: "Billing test controls are disabled in this environment.",
          code: "test_controls_disabled",
        },
        { status: 403 }
      )
    }

    const user = await getServerAuthUser()
    if (!user?.id) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 })
    }

    let body: { status?: unknown } = {}
    try {
      body = (await request.json()) as { status?: unknown }
    } catch {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 })
    }

    if (!isSimulatedStatus(body.status)) {
      return NextResponse.json(
        {
          error: `status must be one of: ${SIMULATED_STATUSES.join(", ")}`,
        },
        { status: 400 }
      )
    }

    const existing = await getSubscriptionByUserId(user.id)
    const now = new Date()
    const inSevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

    const patch: {
      status: SubscriptionStatus
      cancel_at_period_end: boolean
      trial_start?: string | null
      trial_end?: string | null
      current_period_end?: string | null
      has_used_trial?: boolean
      stripe_customer_id?: string | null
      stripe_subscription_id?: string | null
    } = {
      status: body.status,
      cancel_at_period_end: false,
      stripe_customer_id: existing?.stripe_customer_id ?? null,
      stripe_subscription_id: existing?.stripe_subscription_id ?? null,
    }

    if (body.status === "trialing") {
      patch.trial_start = existing?.trial_start || now.toISOString()
      patch.trial_end = inSevenDays.toISOString()
      patch.current_period_end = inSevenDays.toISOString()
      patch.has_used_trial = true
    } else if (body.status === "active") {
      patch.current_period_end = inSevenDays.toISOString()
      patch.has_used_trial =
        existing?.has_used_trial || Boolean(existing?.trial_start) || true
    } else if (body.status === "past_due") {
      patch.current_period_end = existing?.current_period_end || now.toISOString()
      patch.has_used_trial = existing?.has_used_trial ?? true
    } else {
      // canceled
      patch.current_period_end = existing?.current_period_end || now.toISOString()
      patch.has_used_trial = existing?.has_used_trial ?? true
    }

    const row = await upsertSubscriptionForUser(user.id, patch)

    console.info("[billing/test-simulate]", {
      userId: user.id,
      status: row.status,
      note: "Local subscription row only — Stripe unchanged",
    })

    return NextResponse.json({
      ok: true,
      testMode: true,
      status: row.status,
      cancelAtPeriodEnd: row.cancel_at_period_end,
      currentPeriodEnd: row.current_period_end,
      trialEnd: row.trial_end,
      message: `Simulated local status "${row.status}" for this account only. Stripe was not modified.`,
    })
  } catch (error) {
    console.error("[billing/test-simulate]", error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not simulate subscription status.",
      },
      { status: 500 }
    )
  }
}
