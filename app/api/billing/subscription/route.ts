import { NextResponse } from "next/server"
import { isStripeBillingConfigured, statusGrantsAccess } from "@/lib/billing/config"
import { getStripe } from "@/lib/billing/stripe"
import {
  getSubscriptionByUserId,
  syncSubscriptionFromStripe,
} from "@/lib/billing/subscription-store"
import { getServerAuthUser } from "@/lib/supabase/index"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type SubscriptionActionBody = {
  action?: "cancel" | "reactivate"
}

/**
 * Native ListWise subscription management (no hosted Stripe portal).
 * cancel → cancel_at_period_end: true (access continues until period/trial end)
 * reactivate → cancel_at_period_end: false
 */
export async function POST(request: Request) {
  try {
    const user = await getServerAuthUser()
    if (!user?.id) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 })
    }

    if (!isStripeBillingConfigured()) {
      return NextResponse.json(
        { error: "Stripe billing is not configured yet." },
        { status: 503 }
      )
    }

    let body: SubscriptionActionBody = {}
    try {
      body = (await request.json()) as SubscriptionActionBody
    } catch {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 })
    }

    const action = body.action
    if (action !== "cancel" && action !== "reactivate") {
      return NextResponse.json(
        { error: 'action must be "cancel" or "reactivate".' },
        { status: 400 }
      )
    }

    const row = await getSubscriptionByUserId(user.id)
    if (!row?.stripe_subscription_id) {
      return NextResponse.json(
        { error: "No active Stripe subscription found." },
        { status: 400 }
      )
    }

    if (!statusGrantsAccess(row.status)) {
      return NextResponse.json(
        {
          error:
            "Subscription is not trialing or active. Start a new trial or subscribe to continue.",
          code: "inactive_subscription",
          status: row.status,
        },
        { status: 409 }
      )
    }

    const cancelAtPeriodEnd = action === "cancel"
    if (Boolean(row.cancel_at_period_end) === cancelAtPeriodEnd) {
      return NextResponse.json({
        ok: true,
        unchanged: true,
        cancelAtPeriodEnd,
        status: row.status,
        currentPeriodEnd: row.current_period_end,
        trialEnd: row.trial_end,
      })
    }

    const stripe = getStripe()
    const updated = await stripe.subscriptions.update(row.stripe_subscription_id, {
      cancel_at_period_end: cancelAtPeriodEnd,
    })

    const synced = await syncSubscriptionFromStripe(updated, user.id)

    return NextResponse.json({
      ok: true,
      action,
      cancelAtPeriodEnd: synced.cancel_at_period_end,
      status: synced.status,
      currentPeriodEnd: synced.current_period_end,
      trialEnd: synced.trial_end,
      cancelsOn:
        synced.cancel_at_period_end
          ? synced.status === "trialing"
            ? synced.trial_end || synced.current_period_end
            : synced.current_period_end
          : null,
    })
  } catch (error) {
    console.error("[billing/subscription]", error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not update subscription.",
      },
      { status: 500 }
    )
  }
}
