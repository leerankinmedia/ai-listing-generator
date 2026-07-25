import "server-only"
import { getEntitlement, type Entitlement } from "@/lib/billing/entitlement"

export interface SubscriptionAccessResult {
  allowed: boolean
  reason: "missing_user" | "no_subscription" | "inactive" | "active" | "admin"
  status: string | null
  subscription: Entitlement["subscription"]
  displayPeriodEnd: string | null
  entitlement: Entitlement
}

/**
 * Paid-tool guard — delegates entirely to getEntitlement().
 */
export async function checkSubscriptionAccess(
  userId: string | null | undefined
): Promise<SubscriptionAccessResult> {
  const entitlement = await getEntitlement(userId)
  return {
    allowed: entitlement.allowed,
    reason: entitlement.reason,
    status: entitlement.status,
    subscription: entitlement.subscription,
    displayPeriodEnd: entitlement.displayPeriodEnd,
    entitlement,
  }
}

export async function assertSubscriptionAccess(
  userId: string | null | undefined
) {
  const result = await checkSubscriptionAccess(userId)
  if (!result.allowed) {
    const error = new Error(
      result.status === "expired"
        ? "Your free trial has expired. Subscribe on the Billing page to continue."
        : "Start your 7-day free trial to unlock this feature."
    )
    ;(error as Error & { status: number; code: string }).status = 402
    ;(error as Error & { status: number; code: string }).code =
      result.status === "expired" ? "trial_expired" : "subscription_required"
    throw error
  }
  return result
}
