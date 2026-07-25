import "server-only"
import { deriveSubscriptionAccess } from "@/lib/billing/subscription-access"
import {
  getSubscriptionByUserId,
  upsertSubscriptionForUser,
} from "@/lib/billing/subscription-store"

export interface SubscriptionAccessResult {
  allowed: boolean
  reason: "missing_user" | "no_subscription" | "inactive" | "active"
  status: string | null
  subscription: Awaited<ReturnType<typeof getSubscriptionByUserId>>
  /** Period end safe for UI — null when no real paid Stripe subscription. */
  displayPeriodEnd: string | null
}

/**
 * Server-side guard for paid tool actions (generate, publish, connect, …).
 *
 * Access is derived from real trial/paid state:
 * - valid trial (now < trial_end) → allowed (trialing)
 * - active Stripe subscription id + open period → allowed (active)
 * - expired trial / fake active without Stripe → locked (expired)
 */
export async function checkSubscriptionAccess(
  userId: string | null | undefined
): Promise<SubscriptionAccessResult> {
  if (!userId) {
    return {
      allowed: false,
      reason: "missing_user",
      status: null,
      subscription: null,
      displayPeriodEnd: null,
    }
  }

  const subscription = await getSubscriptionByUserId(userId)

  if (!subscription) {
    return {
      allowed: false,
      reason: "no_subscription",
      status: "none",
      subscription: null,
      displayPeriodEnd: null,
    }
  }

  const derived = deriveSubscriptionAccess(subscription)

  if (derived.shouldPersistExpired) {
    try {
      await upsertSubscriptionForUser(userId, {
        status: "canceled",
        // Drop fabricated renewal dates when there is no real Stripe subscription.
        current_period_end: subscription.stripe_subscription_id
          ? subscription.current_period_end
          : null,
        cancel_at_period_end: false,
      })
    } catch (error) {
      console.error("[billing] failed to persist expired subscription state", error)
    }
  }

  return {
    allowed: derived.allowed,
    reason: derived.reason,
    status: derived.effectiveStatus,
    subscription,
    displayPeriodEnd: derived.displayPeriodEnd,
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
