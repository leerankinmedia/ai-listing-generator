"use client"

import {
  FeatureLockPreview,
  type LockedFeatureId,
} from "@/components/billing/feature-lock-preview"
import { useAuth } from "@/components/auth/auth-provider"
import { useBillingStatus } from "@/components/billing/paywall"

/**
 * Soft-lock wrapper for paid tools.
 * Access is decided server-side (/api/billing/status + protected APIs).
 * Fail closed: only render actions when paidToolsUnlocked === true.
 * Demo mode (no Supabase) stays unlocked so local IndexedDB listing still works.
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
  const { isDemo } = useAuth()
  const { status, loading, error } = useBillingStatus(!isDemo)

  if (isDemo) {
    return <>{children}</>
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading access…</p>
  }

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
  const { isDemo } = useAuth()
  const { status, loading, error, refresh } = useBillingStatus(!isDemo)
  const unlocked = isDemo || status?.paidToolsUnlocked === true
  return {
    unlocked,
    previewMode: Boolean(status?.previewMode || (status && !unlocked)),
    status,
    loading,
    error,
    refresh,
  }
}
