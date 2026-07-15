"use client"

import { Suspense, useEffect } from "react"
import { useRouter } from "next/navigation"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { MarketplaceConnectionsPanel } from "@/components/marketplaces/marketplace-connections-panel"
import { PaidFeatureGate } from "@/components/billing/paid-feature-gate"
import { useAuth } from "@/components/auth/auth-provider"

export default function ConnectionsPage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login")
    }
  }, [loading, user, router])

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-fade-in text-sm text-muted-foreground">
          Loading connections…
        </div>
      </div>
    )
  }

  return (
    <DashboardShell>
      <PaidFeatureGate feature="connections">
        <Suspense
          fallback={
            <div className="text-sm text-muted-foreground">Loading…</div>
          }
        >
          <MarketplaceConnectionsPanel />
        </Suspense>
      </PaidFeatureGate>
    </DashboardShell>
  )
}
