import { NextResponse } from "next/server"
import {
  getMembershipPriceLabel,
  isBillingEnforcementEnabled,
  isStripeBillingConfigured,
  statusGrantsAccess,
  BILLING_TRIAL_DAYS,
} from "@/lib/billing/config"
import { checkSubscriptionAccess } from "@/lib/billing/access"
import { getSubscriptionByUserId } from "@/lib/billing/subscription-store"
import { getServerAuthUser } from "@/lib/supabase/index"

export const runtime = "nodejs"

export async function GET() {
  const user = await getServerAuthUser()
  if (!user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 })
  }

  const subscription = await getSubscriptionByUserId(user.id)
  const access = await checkSubscriptionAccess(user.id)

  return NextResponse.json({
    enforcement: isBillingEnforcementEnabled(),
    stripeConfigured: isStripeBillingConfigured(),
    priceLabel: getMembershipPriceLabel(),
    trialDays: BILLING_TRIAL_DAYS,
    allowed: access.allowed,
    reason: access.reason,
    status: subscription?.status ?? "none",
    hasUsedTrial: Boolean(subscription?.has_used_trial || subscription?.trial_start),
    trialEligible: !(subscription?.has_used_trial || subscription?.trial_start),
    trialStart: subscription?.trial_start ?? null,
    trialEnd: subscription?.trial_end ?? null,
    currentPeriodEnd: subscription?.current_period_end ?? null,
    cancelAtPeriodEnd: Boolean(subscription?.cancel_at_period_end),
    stripeCustomerId: subscription?.stripe_customer_id ?? null,
    stripeSubscriptionId: subscription?.stripe_subscription_id ?? null,
    unlocksApp: statusGrantsAccess(subscription?.status),
  })
}
