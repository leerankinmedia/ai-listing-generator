"use client"

/**
 * Soft access shell for the dashboard.
 * Expired trials are NOT redirected away from Overview / Listings / Billing.
 * Paid actions stay locked by PaidFeatureGate + server getEntitlement().
 */
export function SubscriptionGate({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
