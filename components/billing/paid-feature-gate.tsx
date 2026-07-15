"use client"

import { FeatureLockPreview, type LockedFeatureId } from "@/components/billing/feature-lock-preview"
import { useBillingStatus } from "@/components/billing/paywall"

/**
 * Soft-lock wrapper: when BILLING_PREVIEW_LOCKS and/or BILLING_ENFORCEMENT is on
 * and the user is not trialing/active, show a feature preview instead of actions.
 * Relies on /api/billing/status (server-side flag evaluation) — not client env.
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

  // Prefer server-computed flag; default unlocked only when status missing
  const unlocked = status?.paidToolsUnlocked ?? true

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
  const unlocked = status?.paidToolsUnlocked ?? true
  return {
    unlocked,
    previewMode: Boolean(status?.previewMode ?? (!unlocked && status?.locksActive)),
    status,
    loading,
    error,
    refresh,
  }
}
