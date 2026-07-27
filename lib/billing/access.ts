import "server-only"
import { getEntitlement, type Entitlement } from "@/lib/billing/entitlement"
import {
  isListWiseOwnerEmail,
  ownerBypassesMarketplaceSubscription,
} from "@/lib/billing/owner"

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

function ownerAccessResult(): SubscriptionAccessResult {
  return {
    allowed: true,
    reason: "owner",
    status: "owner",
    subscription: null,
    displayPeriodEnd: null,
    entitlement: {
      allowed: true,
      status: "owner",
      statusLabel: "Founder • Owner",
      displayPeriodEnd: null,
      trialEnd: null,
      reason: "owner",
      adminOverride: true,
      ownerOverride: true,
      stripeSubscriptionId: null,
      subscription: null,
      debug: {
        rawDatabaseStatus: null,
        trialEnd: null,
        stripeSubscriptionIdPresent: false,
        stripeVerifiedStatus: null,
        finalEntitlement: "owner",
        decidingField: "owner_email",
        summary:
          "Permanent Owner account — bypasses subscription before trial enforcement.",
      },
    },
  }
}

/**
 * Paid-tool guard — delegates entirely to getEntitlement().
 * Pass the authenticated user's email so the permanent Owner account
 * can be recognized without an extra Auth Admin lookup when possible.
 */
export async function checkSubscriptionAccess(
  userId: string | null | undefined,
  email?: string | null
): Promise<SubscriptionAccessResult> {
  // Owner email short-circuit — before any Stripe / subscription / trial IO.
  if (isListWiseOwnerEmail(email)) {
    return ownerAccessResult()
  }

  const entitlement = await getEntitlement(userId, { email })
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
 * Owner (JWT session email) bypasses subscription/trial before any enforcement.
 */
export async function checkMarketplaceConnectionAccess(user: {
  id?: string | null
  email?: string | null
} | null): Promise<
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

  // Owner first — never run trial/subscription enforcement for this account.
  if (ownerBypassesMarketplaceSubscription(user)) {
    return { ok: true, access: ownerAccessResult() }
  }

  const access = await checkSubscriptionAccess(user.id, user.email)
  if (!access.allowed) {
    return {
      ok: false,
      status: 402,
      body: {
        error:
          access.status === "expired"
            ? "Your free trial has expired. Subscribe on the Billing page to continue."
            : "Start your 7-day free trial to unlock this feature.",
        code:
          access.status === "expired"
            ? "trial_expired"
            : "subscription_required",
      },
    }
  }

  return { ok: true, access }
}

export async function assertSubscriptionAccess(
  userId: string | null | undefined,
  email?: string | null
) {
  const result = await checkSubscriptionAccess(userId, email)
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
