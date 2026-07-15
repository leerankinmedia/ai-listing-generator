"use client"

import { FeatureLockPreview, type LockedFeatureId } from "@/components/billing/feature-lock-preview"
import { useBillingStatus } from "@/components/billing/paywall"
import { paidToolsUnlocked } from "@/lib/billing/config"

/**
 * Soft-lock wrapper: when enforcement is on and the user is not trialing/active
 * (or past_due within grace), show a feature preview instead of paid actions.
 * When BILLING_ENFORCEMENT=false, children always render.
 */
export function PaidFeatureGate({
  feature,
  children,
  className,
}: {
  feature: LockedFeatureId
  children: React.ReactNode
  className?: string
}) {
  const { status, loading } = useBillingStatus()

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground">Loading access…</p>
    )
  }

  const unlocked = paidToolsUnlocked({
    enforcement: Boolean(status?.enforcement),
    status: status?.status,
    currentPeriodEnd: status?.currentPeriodEnd,
  })

  if (unlocked) {
    return <>{children}</>
  }

  return (
    <FeatureLockPreview
      feature={feature}
      className={className}
      trialEligible={status?.trialEligible ?? true}
    />
  )
}

export function usePaidToolsAccess() {
  const { status, loading, error, refresh } = useBillingStatus()
  const unlocked = paidToolsUnlocked({
    enforcement: Boolean(status?.enforcement),
    status: status?.status,
    currentPeriodEnd: status?.currentPeriodEnd,
  })
  return {
    unlocked,
    previewMode: Boolean(status?.enforcement && !unlocked),
    status,
    loading,
    error,
    refresh,
  }
}
