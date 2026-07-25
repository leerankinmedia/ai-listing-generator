/**
 * Pure subscription access derivation (safe for unit tests).
 * Does not treat test/simulated rows without a real Stripe subscription as paid.
 */

export type SubscriptionAccessInput = {
  status: string | null | undefined
  trial_end?: string | null
  current_period_end?: string | null
  stripe_subscription_id?: string | null
}

export type DerivedSubscriptionAccess = {
  allowed: boolean
  /** Display/API status after applying trial expiry + paid-sub rules. */
  effectiveStatus: string
  /** Period end shown in UI — null when there is no real paid Stripe subscription. */
  displayPeriodEnd: string | null
  reason: "missing_user" | "no_subscription" | "inactive" | "active"
  /** True when DB status should be corrected to reflect expiry. */
  shouldPersistExpired: boolean
}

function parseTime(value: string | null | undefined): number | null {
  if (!value) return null
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : null
}

export function hasRealStripeSubscription(
  stripeSubscriptionId: string | null | undefined
): boolean {
  return Boolean(stripeSubscriptionId?.trim())
}

/**
 * Derive access from actual subscription fields:
 * - Active paid Stripe subscription = active
 * - Valid trial (now < trial_end) = trialing
 * - Expired trial with no paid subscription = expired / locked
 */
export function deriveSubscriptionAccess(
  subscription: SubscriptionAccessInput | null | undefined,
  nowMs: number = Date.now()
): DerivedSubscriptionAccess {
  if (!subscription || !subscription.status || subscription.status === "none") {
    return {
      allowed: false,
      effectiveStatus: "none",
      displayPeriodEnd: null,
      reason: "no_subscription",
      shouldPersistExpired: false,
    }
  }

  const status = subscription.status
  const trialEndMs = parseTime(subscription.trial_end)
  const periodEndMs = parseTime(subscription.current_period_end)
  const realStripe = hasRealStripeSubscription(
    subscription.stripe_subscription_id
  )
  const trialValid = trialEndMs !== null && trialEndMs > nowMs
  const periodStillOpen = periodEndMs === null || periodEndMs > nowMs

  if (status === "trialing") {
    if (trialValid) {
      return {
        allowed: true,
        effectiveStatus: "trialing",
        displayPeriodEnd: null,
        reason: "active",
        shouldPersistExpired: false,
      }
    }
    return {
      allowed: false,
      effectiveStatus: "expired",
      displayPeriodEnd: null,
      reason: "inactive",
      shouldPersistExpired: true,
    }
  }

  if (status === "active") {
    // Test/simulated "active" without a Stripe subscription id is not paid membership.
    if (!realStripe) {
      if (trialValid) {
        return {
          allowed: true,
          effectiveStatus: "trialing",
          displayPeriodEnd: null,
          reason: "active",
          shouldPersistExpired: false,
        }
      }
      return {
        allowed: false,
        effectiveStatus: "expired",
        displayPeriodEnd: null,
        reason: "inactive",
        shouldPersistExpired: true,
      }
    }
    if (!periodStillOpen) {
      return {
        allowed: false,
        effectiveStatus: "expired",
        displayPeriodEnd: subscription.current_period_end ?? null,
        reason: "inactive",
        shouldPersistExpired: true,
      }
    }
    return {
      allowed: true,
      effectiveStatus: "active",
      displayPeriodEnd: subscription.current_period_end ?? null,
      reason: "active",
      shouldPersistExpired: false,
    }
  }

  // After an expired trial is persisted as canceled (no paid Stripe sub),
  // keep showing Expired — not a paid cancellation with a renewal date.
  if (
    (status === "canceled" || status === "incomplete_expired") &&
    !realStripe &&
    trialEndMs !== null &&
    trialEndMs <= nowMs
  ) {
    return {
      allowed: false,
      effectiveStatus: "expired",
      displayPeriodEnd: null,
      reason: "inactive",
      shouldPersistExpired: false,
    }
  }

  return {
    allowed: false,
    effectiveStatus: status,
    displayPeriodEnd: realStripe ? subscription.current_period_end ?? null : null,
    reason: "inactive",
    shouldPersistExpired: false,
  }
}
