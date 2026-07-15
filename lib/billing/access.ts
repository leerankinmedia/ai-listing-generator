import "server-only"
import {
  arePaidToolLocksActive,
  isBillingEnforcementEnabled,
  isStripeBillingConfigured,
  statusGrantsAccess,
} from "@/lib/billing/config"
import { getSubscriptionByUserId } from "@/lib/billing/subscription-store"

export interface SubscriptionAccessResult {
  allowed: boolean
  reason:
    | "locks_off"
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
 * Server-side guard for paid tool actions (generate, publish, connect, …).
 * Preview-first: dashboard pages stay reachable; this blocks mutations/APIs.
 *
 * Locks run when BILLING_PREVIEW_LOCKS=true and/or BILLING_ENFORCEMENT=true.
 * When both are false, actions are allowed (dev convenience).
 */
export async function checkSubscriptionAccess(
  userId: string | null | undefined
): Promise<SubscriptionAccessResult> {
  const subscription = userId ? await getSubscriptionByUserId(userId) : null
  const locksActive = arePaidToolLocksActive()

  if (!locksActive) {
    return {
      allowed: true,
      reason: "locks_off",
      status: subscription?.status ?? null,
      subscription,
    }
  }

  // Full enforcement without Stripe configured → fail closed.
  // Preview locks can still lock unpaid users when Stripe is configured;
  // if Stripe isn't configured, treat as no paid access.
  if (isBillingEnforcementEnabled() && !isStripeBillingConfigured()) {
    return {
      allowed: false,
      reason: "stripe_unconfigured",
      status: subscription?.status ?? null,
      subscription,
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

  if (!subscription) {
    return {
      allowed: false,
      reason: "no_subscription",
      status: "none",
      subscription: null,
    }
  }

  if (
    statusGrantsAccess(subscription.status, subscription.current_period_end)
  ) {
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

export async function assertSubscriptionAccess(
  userId: string | null | undefined
) {
  const result = await checkSubscriptionAccess(userId)
  if (!result.allowed) {
    const error = new Error(
      "Start your 7-day free trial to unlock this feature."
    )
    ;(error as Error & { status: number; code: string }).status = 402
    ;(error as Error & { status: number; code: string }).code =
      "subscription_required"
    throw error
  }
  return result
}
