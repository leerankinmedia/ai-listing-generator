import { NextResponse } from "next/server"
import {
  getMembershipPriceLabel,
  isStripeBillingConfigured,
  BILLING_TRIAL_DAYS,
  MONTHLY_LISTING_CREDITS,
  PLAN_NAME,
  PLAN_FEATURES,
} from "@/lib/billing/config"
import { getEntitlement } from "@/lib/billing/entitlement"
import {
  creditPeriodStartFromSubscription,
  getListingCreditsSummary,
} from "@/lib/billing/credits"
import { isBillingEnforcementEnabled, isBillingTestControlsEnabled } from "@/lib/billing/env-flags"
import { getServerAuthUser } from "@/lib/supabase/index"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const user = await getServerAuthUser()
  if (!user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 })
  }

  const entitlement = await getEntitlement(user.id, { email: user.email })
  const subscription = entitlement.subscription
  const periodStart = creditPeriodStartFromSubscription(subscription)
  const credits = await getListingCreditsSummary({
    userId: user.id,
    periodStartIso: periodStart,
    email: user.email,
    ownerOverride: entitlement.ownerOverride,
  })

  const toolsUnlocked = entitlement.allowed
  const cancelAtPeriodEnd = Boolean(subscription?.cancel_at_period_end)
  const trialEnd = entitlement.trialEnd
  const displayPeriodEnd = entitlement.displayPeriodEnd
  const cancelsOn =
    cancelAtPeriodEnd && entitlement.status === "active"
      ? displayPeriodEnd
      : null

  return NextResponse.json(
    {
      enforcement: isBillingEnforcementEnabled(),
      testControlsEnabled: isBillingTestControlsEnabled(),
      stripeConfigured: isStripeBillingConfigured(),
      planName: PLAN_NAME,
      priceLabel: getMembershipPriceLabel(),
      trialDays: BILLING_TRIAL_DAYS,
      listingCreditsAllowance: MONTHLY_LISTING_CREDITS,
      listingCreditsUsed: credits.used,
      listingCreditsRemaining: credits.remaining,
      listingCreditsPeriodStart: credits.periodStart,
      listingCreditsEnforced:
        credits.enforced && toolsUnlocked && !entitlement.ownerOverride,
      features: PLAN_FEATURES,
      allowed: entitlement.allowed,
      reason: entitlement.reason,
      status: entitlement.status,
      statusLabel: entitlement.statusLabel,
      hasUsedTrial: Boolean(
        subscription?.has_used_trial || subscription?.trial_start
      ),
      trialEligible:
        !entitlement.allowed &&
        !entitlement.ownerOverride &&
        !(subscription?.has_used_trial || subscription?.trial_start),
      trialStart: subscription?.trial_start ?? null,
      trialEnd,
      currentPeriodEnd: displayPeriodEnd,
      cancelAtPeriodEnd,
      cancelsOn,
      stripeCustomerId: subscription?.stripe_customer_id ?? null,
      // Presence only — full ID returned for account management when entitled;
      // for debug we also need presence. Never return secrets.
      stripeSubscriptionId: entitlement.stripeSubscriptionId,
      unlocksApp: toolsUnlocked,
      paidToolsUnlocked: toolsUnlocked,
      previewMode: !toolsUnlocked,
      adminOverride: entitlement.adminOverride,
      ownerOverride: entitlement.ownerOverride,
      entitlementDebug: entitlement.debug,
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  )
}
