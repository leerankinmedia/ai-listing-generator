"use client"

/**
 * Preview-first access: dashboard stays reachable without a trial.
 * Paid tool APIs + PaidFeatureGate always require trialing/active.
 * BILLING_ENFORCEMENT only controls optional account-wide redirects (unused).
 */
export function SubscriptionGate({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
