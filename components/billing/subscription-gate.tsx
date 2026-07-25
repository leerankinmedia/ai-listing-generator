"use client"

/**
 * @deprecated Dashboard no longer wraps routes in a subscription redirect gate.
 * Kept as a pass-through for any residual imports. Expired users may open
 * Overview, Listings (read-only), and Billing; paid actions use PaidFeatureGate.
 */
export function SubscriptionGate({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
