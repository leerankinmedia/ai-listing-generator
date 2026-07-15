import { NextResponse } from "next/server"
import {
  BILLING_TRIAL_DAYS,
  getBillingAppOrigin,
  getStripePriceId,
  isStripeBillingConfigured,
  MONTHLY_LISTING_CREDITS,
  PLAN_NAME,
  statusGrantsAccess,
} from "@/lib/billing/config"
import { getStripe } from "@/lib/billing/stripe"
import {
  getSubscriptionByUserId,
  upsertSubscriptionForUser,
} from "@/lib/billing/subscription-store"
import { getServerAuthUser } from "@/lib/supabase/index"

export const runtime = "nodejs"

/**
 * Create an Embedded Checkout Session (ui_mode: embedded).
 * Returns clientSecret for Stripe.js — no redirect to checkout.stripe.com.
 */
export async function POST() {
  try {
    const user = await getServerAuthUser()
    if (!user?.id || !user.email) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 })
    }

    if (!isStripeBillingConfigured()) {
      return NextResponse.json(
        { error: "Stripe billing is not configured yet." },
        { status: 503 }
      )
    }

    const priceId = getStripePriceId()
    const stripe = getStripe()
    const origin = getBillingAppOrigin()
    const existing = await getSubscriptionByUserId(user.id)

    // Block users who already have a trial or active subscription
    if (statusGrantsAccess(existing?.status)) {
      return NextResponse.json(
        {
          error:
            "You already have an active ListWise Pro trial or subscription.",
          code: "already_subscribed",
          status: existing?.status,
        },
        { status: 409 }
      )
    }

    // Never grant a second trial to the same user
    const allowTrial = !existing?.has_used_trial && !existing?.trial_start

    let customerId = existing?.stripe_customer_id ?? null
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name:
          (user.user_metadata?.full_name as string | undefined) ||
          user.email.split("@")[0],
        metadata: { supabase_user_id: user.id },
      })
      customerId = customer.id
      await upsertSubscriptionForUser(user.id, {
        stripe_customer_id: customerId,
        status: existing?.status ?? "none",
        has_used_trial: existing?.has_used_trial ?? false,
      })
    } else {
      await stripe.customers.update(customerId, {
        metadata: { supabase_user_id: user.id },
      })
    }

    const session = await stripe.checkout.sessions.create({
      ui_mode: "embedded",
      mode: "subscription",
      customer: customerId,
      client_reference_id: user.id,
      allow_promotion_codes: true,
      // Card required before the 7-day trial begins
      payment_method_collection: "always",
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        metadata: {
          supabase_user_id: user.id,
          plan_name: PLAN_NAME,
          listing_credits: String(MONTHLY_LISTING_CREDITS),
        },
        ...(allowTrial ? { trial_period_days: BILLING_TRIAL_DAYS } : {}),
      },
      metadata: {
        supabase_user_id: user.id,
        plan_name: PLAN_NAME,
        listing_credits: String(MONTHLY_LISTING_CREDITS),
      },
      return_url: `${origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
    })

    if (!session.client_secret) {
      return NextResponse.json(
        { error: "Could not create Embedded Checkout session." },
        { status: 500 }
      )
    }

    return NextResponse.json({
      clientSecret: session.client_secret,
      sessionId: session.id,
      trialEligible: allowTrial,
      trialDays: allowTrial ? BILLING_TRIAL_DAYS : 0,
    })
  } catch (error) {
    console.error("[billing/checkout]", error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Checkout session failed. Try again.",
      },
      { status: 500 }
    )
  }
}
