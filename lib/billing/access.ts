import "server-only"
import { getEntitlement, type Entitlement } from "@/lib/billing/entitlement"
import { authUserHasOwnerEmail, isOwnerUserId } from "@/lib/billing/owner"
import {
  resolveIsPermanentOwner,
  type OwnerResolveUser,
} from "@/lib/billing/owner-resolve"

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
 * Paid-tool guard.
 * Owner is resolved before any Stripe / subscription / trial IO.
 */
export async function checkSubscriptionAccess(
  userId: string | null | undefined,
  email?: string | null,
  authUser?: OwnerResolveUser | null
): Promise<SubscriptionAccessResult> {
  if (userId && isOwnerUserId(userId)) {
    return ownerAccessResult()
  }
  if (authUserHasOwnerEmail(authUser ?? { id: userId || "", email })) {
    return ownerAccessResult()
  }
  if (userId && (await resolveIsPermanentOwner(authUser ?? { id: userId, email }))) {
    return ownerAccessResult()
  }

  const entitlement = await getEntitlement(userId, { email, authUser })
  // Belt-and-suspenders: never surface trial_expired for an Owner entitlement.
  if (entitlement.ownerOverride || entitlement.status === "owner") {
    return ownerAccessResult()
  }

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
 * Owner bypass is fully resolved before any subscription/trial enforcement.
 * This is the only gate marketplace OAuth start routes should use.
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

  // Owner first — never run trial/subscription enforcement for this account.
  if (await resolveIsPermanentOwner(user)) {
    console.info("[billing/access] marketplace Owner bypass", {
      userId: user.id,
      owner: true,
      hasSessionEmail: Boolean(user.email),
    })
    return { ok: true, access: ownerAccessResult() }
  }

  const access = await checkSubscriptionAccess(user.id, user.email, user)

  // Final Owner guard — never return subscription_required / trial_expired to Owner.
  if (
    access.entitlement.ownerOverride ||
    access.status === "owner" ||
    access.reason === "owner"
  ) {
    return { ok: true, access: ownerAccessResult() }
  }

  if (!access.allowed) {
    console.info("[billing/access] marketplace access denied", {
      userId: user.id,
      hasSessionEmail: Boolean(user.email),
      status: access.status,
      reason: access.reason,
      decidingField: access.entitlement.debug.decidingField,
    })
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
  email?: string | null,
  authUser?: OwnerResolveUser | null
) {
  const result = await checkSubscriptionAccess(userId, email, authUser)
  if (
    result.entitlement.ownerOverride ||
    result.status === "owner" ||
    result.reason === "owner"
  ) {
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
