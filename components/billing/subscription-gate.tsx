"use client"

/**
 * Preview-first access: dashboard stays reachable without a trial.
 * Paid tool APIs + PaidFeatureGate enforce locks when BILLING_ENFORCEMENT=true.
 * Kept as a pass-through wrapper for layout compatibility.
 */
export function SubscriptionGate({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
