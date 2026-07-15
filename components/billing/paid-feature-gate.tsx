"use client"

import {
  FeatureLockPreview,
  type LockedFeatureId,
} from "@/components/billing/feature-lock-preview"
import { useBillingStatus } from "@/components/billing/paywall"

/**
 * Soft-lock wrapper for paid tools.
 * Fail closed: only render actions when the server explicitly returns
 * paidToolsUnlocked === true. Missing/errored status shows the lock preview.
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
  const { status, loading, error } = useBillingStatus()

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading access…</p>
  }

  // Fail closed — never default to unlocked when status is missing
  const unlocked = status?.paidToolsUnlocked === true

  if (unlocked) {
    return <>{children}</>
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="text-center text-xs text-muted-foreground" role="status">
          Could not verify access ({error}). Showing locked preview.
        </p>
      )}
      <FeatureLockPreview
        feature={feature}
        className={className}
        trialEligible={status?.trialEligible ?? true}
      />
    </div>
  )
}

export function usePaidToolsAccess() {
  const { status, loading, error, refresh } = useBillingStatus()
  const unlocked = status?.paidToolsUnlocked === true
  return {
    unlocked,
    previewMode: Boolean(status?.previewMode || (!unlocked && status)),
    status,
    loading,
    error,
    refresh,
  }
}
