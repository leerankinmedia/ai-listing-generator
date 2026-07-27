import "server-only"
import { getEntitlement, type Entitlement } from "@/lib/billing/entitlement"
import type { OwnerResolveUser } from "@/lib/billing/owner-resolve"

export interface SubscriptionAccessResult {
  allowed: boolean
  reason:
    | "missing_user"
    | "no_subscription"
    | "inactive"
    | "active"
    | "admin"
    | "owner"
  status: string | null
  subscription: Entitlement["subscription"]
  displayPeriodEnd: string | null
  entitlement: Entitlement
}

/**
 * Paid-tool guard — same server-side source of truth as /api/billing/status.
 */
export async function checkSubscriptionAccess(
  userId: string | null | undefined,
  email?: string | null,
  authUser?: OwnerResolveUser | null
): Promise<SubscriptionAccessResult> {
  const entitlement = await getEntitlement(userId, { email, authUser })
  return {
    allowed: entitlement.allowed,
    reason: entitlement.reason,
    status: entitlement.status,
    subscription: entitlement.subscription,
    displayPeriodEnd: entitlement.displayPeriodEnd,
    entitlement,
  }
}

/**
 * Marketplace connect/disconnect/OAuth guard.
 * Uses the exact same getEntitlement() path as Billing so Owner bypass cannot diverge.
 */
export async function checkMarketplaceConnectionAccess(
  user: OwnerResolveUser | null
): Promise<
  | { ok: true; access: SubscriptionAccessResult }
  | {
      ok: false
      status: number
      body: { error: string; code: string }
    }
> {
  if (!user?.id) {
    return {
      ok: false,
      status: 401,
      body: {
        error: "Sign in required to connect a marketplace.",
        code: "unauthorized",
      },
    }
  }

  // Identical to Billing: getEntitlement(user.id, { email, authUser }).
  const entitlement = await getEntitlement(user.id, {
    email: user.email,
    authUser: user,
  })

  if (entitlement.ownerOverride || entitlement.status === "owner") {
    console.info("[billing/access] marketplace Owner bypass via getEntitlement", {
      userId: user.id,
      decidingField: entitlement.debug.decidingField,
      hasSessionEmail: Boolean(user.email),
    })
    return {
      ok: true,
      access: {
        allowed: true,
        reason: "owner",
        status: "owner",
        subscription: null,
        displayPeriodEnd: null,
        entitlement,
      },
    }
  }

  if (!entitlement.allowed) {
    console.info("[billing/access] marketplace access denied", {
      userId: user.id,
      hasSessionEmail: Boolean(user.email),
      status: entitlement.status,
      reason: entitlement.reason,
      decidingField: entitlement.debug.decidingField,
    })
    return {
      ok: false,
      status: 402,
      body: {
        error:
          entitlement.status === "expired"
            ? "Your free trial has expired. Subscribe on the Billing page to continue."
            : "Start your 7-day free trial to unlock this feature.",
        code:
          entitlement.status === "expired"
            ? "trial_expired"
            : "subscription_required",
      },
    }
  }

  return {
    ok: true,
    access: {
      allowed: entitlement.allowed,
      reason: entitlement.reason,
      status: entitlement.status,
      subscription: entitlement.subscription,
      displayPeriodEnd: entitlement.displayPeriodEnd,
      entitlement,
    },
  }
}

export async function assertSubscriptionAccess(
  userId: string | null | undefined,
  email?: string | null,
  authUser?: OwnerResolveUser | null
) {
  const result = await checkSubscriptionAccess(userId, email, authUser)
  if (result.entitlement.ownerOverride || result.status === "owner") {
    return result
  }
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
