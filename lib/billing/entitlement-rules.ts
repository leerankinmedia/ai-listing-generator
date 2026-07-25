/**
 * Pure entitlement rules (unit-testable).
 * Async Stripe retrieve / DB IO live in entitlement.ts.
 */

export type EntitlementSignals = {
  rawDatabaseStatus: string | null
  trialEnd: string | null
  stripeSubscriptionIdPresent: boolean
  /** Live Stripe status when verified; null if unavailable / not called */
  stripeVerifiedStatus: string | null
  stripeTrialEnd?: string | null
  stripeCurrentPeriodEnd?: string | null
  stripeRetrieveError?: string | null
  isAdmin?: boolean
}

export type EntitlementDecision = {
  allowed: boolean
  status: string
  displayPeriodEnd: string | null
  decidingField: string
  summary: string
  shouldPersistExpired: boolean
}

function parseTime(value: string | null | undefined): number | null {
  if (!value) return null
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : null
}

export function decideEntitlement(
  signals: EntitlementSignals,
  nowMs: number = Date.now()
): EntitlementDecision {
  if (signals.isAdmin) {
    return {
      allowed: true,
      status: "admin",
      displayPeriodEnd: null,
      decidingField: "admin_override",
      summary: "Access granted via admin user id allow-list.",
      shouldPersistExpired: false,
    }
  }

  const trialEndMs = parseTime(signals.trialEnd)
  const raw = signals.rawDatabaseStatus

  if (signals.stripeSubscriptionIdPresent) {
    const verified = signals.stripeVerifiedStatus

    if (verified === "active") {
      return {
        allowed: true,
        status: "active",
        displayPeriodEnd: signals.stripeCurrentPeriodEnd ?? null,
        decidingField: "stripe_verified_active",
        summary: "Stripe reports subscription status=active.",
        shouldPersistExpired: false,
      }
    }

    if (verified === "trialing") {
      const stripeTrialEndMs =
        parseTime(signals.stripeTrialEnd) ?? trialEndMs
      if (stripeTrialEndMs !== null && stripeTrialEndMs > nowMs) {
        return {
          allowed: true,
          status: "trialing",
          displayPeriodEnd: null,
          decidingField: "stripe_verified_trialing",
          summary: "Stripe reports trialing with trial_end in the future.",
          shouldPersistExpired: false,
        }
      }
      return {
        allowed: false,
        status: "expired",
        displayPeriodEnd: null,
        decidingField: "stripe_trial_end_past",
        summary: "Stripe trial_end is in the past.",
        shouldPersistExpired: true,
      }
    }

    const expiredByTrial = trialEndMs !== null && trialEndMs <= nowMs
    return {
      allowed: false,
      status: expiredByTrial ? "expired" : verified || "expired",
      displayPeriodEnd: null,
      decidingField: signals.stripeRetrieveError
        ? `stripe_verify_failed:${signals.stripeRetrieveError}`
        : `stripe_verified_${verified || "unknown"}`,
      summary: signals.stripeRetrieveError
        ? `Stripe verification failed (${signals.stripeRetrieveError}). DB status="${raw}" ignored.`
        : `Stripe status="${verified}" does not grant access. DB status="${raw}" / period end ignored.`,
      shouldPersistExpired:
        expiredByTrial || raw === "active" || raw === "trialing",
    }
  }

  // No Stripe ID — never trust DB active / simulated rows.
  if (raw === "active") {
    return {
      allowed: false,
      status: "expired",
      displayPeriodEnd: null,
      decidingField: "db_active_without_stripe_id",
      summary:
        'subscriptions.status="active" without stripe_subscription_id does not grant access.',
      shouldPersistExpired: true,
    }
  }

  if (raw === "trialing") {
    return {
      allowed: false,
      status: "expired",
      displayPeriodEnd: null,
      decidingField:
        trialEndMs !== null && trialEndMs > nowMs
          ? "simulated_trialing_without_stripe"
          : "trial_end_past",
      summary:
        trialEndMs !== null && trialEndMs > nowMs
          ? "Local trialing without Stripe id is simulated and locked."
          : "trial_end is in the past with no Stripe subscription id.",
      shouldPersistExpired: !(trialEndMs !== null && trialEndMs > nowMs),
    }
  }

  if (trialEndMs !== null && trialEndMs <= nowMs) {
    return {
      allowed: false,
      status: "expired",
      displayPeriodEnd: null,
      decidingField: "trial_end_past",
      summary:
        "trial_end is in the past with no verified paid Stripe subscription.",
      shouldPersistExpired: false,
    }
  }

  return {
    allowed: false,
    status: raw || "none",
    displayPeriodEnd: null,
    decidingField: "db_status_not_entitled",
    summary: `DB status="${raw}" does not entitle paid access.`,
    shouldPersistExpired: false,
  }
}
