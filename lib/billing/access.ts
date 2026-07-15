import "server-only"
import { statusGrantsAccess } from "@/lib/billing/config"
import { getSubscriptionByUserId } from "@/lib/billing/subscription-store"

export interface SubscriptionAccessResult {
  allowed: boolean
  reason: "missing_user" | "no_subscription" | "inactive" | "active"
  status: string | null
  subscription: Awaited<ReturnType<typeof getSubscriptionByUserId>>
}

/**
 * Server-side guard for paid tool actions (generate, publish, connect, …).
 *
 * Always enforced — independent of BILLING_ENFORCEMENT / BILLING_PREVIEW_LOCKS:
 * - trialing or active → allowed
 * - every other status, including no subscription row → denied
 *
 * BILLING_ENFORCEMENT only affects optional account-wide redirects elsewhere.
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
