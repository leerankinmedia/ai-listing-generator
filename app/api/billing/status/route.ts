import { NextResponse } from "next/server"
import {
  getMembershipPriceLabel,
  isStripeBillingConfigured,
  statusGrantsAccess,
  paidToolsUnlocked,
  BILLING_TRIAL_DAYS,
  MONTHLY_LISTING_CREDITS,
  PLAN_NAME,
  PLAN_FEATURES,
} from "@/lib/billing/config"
import { checkSubscriptionAccess } from "@/lib/billing/access"
import {
  creditPeriodStartFromSubscription,
  getListingCreditsSummary,
} from "@/lib/billing/credits"
import { isBillingEnforcementEnabled } from "@/lib/billing/env-flags"
import { getSubscriptionByUserId } from "@/lib/billing/subscription-store"
import { getServerAuthUser } from "@/lib/supabase/index"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const user = await getServerAuthUser()
  if (!user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 })
  }

  const subscription = await getSubscriptionByUserId(user.id)
  const access = await checkSubscriptionAccess(user.id)
  const periodStart = creditPeriodStartFromSubscription(subscription)
  const credits = await getListingCreditsSummary({
    userId: user.id,
    periodStartIso: periodStart,
  })

  const subStatus = subscription?.status ?? "none"
  const periodEnd = subscription?.current_period_end ?? null
  const toolsUnlocked = paidToolsUnlocked(subStatus)

  return NextResponse.json(
    {
      enforcement: isBillingEnforcementEnabled(),
      stripeConfigured: isStripeBillingConfigured(),
      planName: PLAN_NAME,
      priceLabel: getMembershipPriceLabel(),
      trialDays: BILLING_TRIAL_DAYS,
      listingCreditsAllowance: MONTHLY_LISTING_CREDITS,
      listingCreditsUsed: credits.used,
      listingCreditsRemaining: credits.remaining,
      listingCreditsPeriodStart: credits.periodStart,
      listingCreditsEnforced: credits.enforced,
      features: PLAN_FEATURES,
      allowed: access.allowed,
      reason: access.reason,
      status: subStatus,
      hasUsedTrial: Boolean(
        subscription?.has_used_trial || subscription?.trial_start
      ),
      trialEligible: !(
        subscription?.has_used_trial || subscription?.trial_start
      ),
      trialStart: subscription?.trial_start ?? null,
      trialEnd: subscription?.trial_end ?? null,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: Boolean(subscription?.cancel_at_period_end),
      stripeCustomerId: subscription?.stripe_customer_id ?? null,
      stripeSubscriptionId: subscription?.stripe_subscription_id ?? null,
      unlocksApp: statusGrantsAccess(subStatus),
      paidToolsUnlocked: toolsUnlocked,
      previewMode: !toolsUnlocked,
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  )
}
