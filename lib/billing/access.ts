import "server-only"
import {
  isBillingEnforcementEnabled,
  isStripeBillingConfigured,
  statusGrantsAccess,
} from "@/lib/billing/config"
import { getSubscriptionByUserId } from "@/lib/billing/subscription-store"

export interface SubscriptionAccessResult {
  allowed: boolean
  reason:
    | "enforcement_off"
    | "stripe_unconfigured"
    | "missing_user"
    | "no_subscription"
    | "inactive"
    | "active"
  status: string | null
  subscription: Awaited<ReturnType<typeof getSubscriptionByUserId>>
}

/**
 * Reusable server-side subscription access guard.
 * Full access only when Stripe status is trialing or active
 * (unless BILLING_ENFORCEMENT=false).
 */
export async function checkSubscriptionAccess(
  userId: string | null | undefined
): Promise<SubscriptionAccessResult> {
  if (!isBillingEnforcementEnabled()) {
    return {
      allowed: true,
      reason: "enforcement_off",
      status: null,
      subscription: null,
    }
  }

  if (!isStripeBillingConfigured()) {
    // Fail closed when enforcement is on but Stripe isn't configured
    return {
      allowed: false,
      reason: "stripe_unconfigured",
      status: null,
      subscription: null,
    }
  }

  if (!userId) {
    return {
      allowed: false,
      reason: "missing_user",
      status: null,
      subscription: null,
    }
  }

  const subscription = await getSubscriptionByUserId(userId)
  if (!subscription) {
    return {
      allowed: false,
      reason: "no_subscription",
      status: "none",
      subscription: null,
    }
  }

  if (statusGrantsAccess(subscription.status)) {
    return {
      allowed: true,
      reason: "active",
      status: subscription.status,
      subscription,
    }
  }

  return {
    allowed: false,
    reason: "inactive",
    status: subscription.status,
    subscription,
  }
}

export async function assertSubscriptionAccess(userId: string | null | undefined) {
  const result = await checkSubscriptionAccess(userId)
  if (!result.allowed) {
    const error = new Error(
      "Subscription required. Start your trial or renew to unlock ListWise."
    )
    ;(error as Error & { status: number; code: string }).status = 402
    ;(error as Error & { status: number; code: string }).code =
      "subscription_required"
    throw error
  }
  return result
}
