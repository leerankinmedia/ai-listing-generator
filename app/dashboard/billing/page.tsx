"use client"

import { Suspense, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { BillingPanel } from "@/components/billing/billing-panel"
import { useAuth } from "@/components/auth/auth-provider"
import { useBillingStatus } from "@/components/billing/paywall"
import {
  LIFETIME_FOUNDER_ACCESS,
  isOwnerBillingStatus,
} from "@/lib/billing/owner"

function DashboardBillingContent() {
  const { user, loading } = useAuth()
  const { status } = useBillingStatus(Boolean(user))
  const router = useRouter()
  const searchParams = useSearchParams()
  const trialExpired = searchParams.get("reason") === "trial_expired"
  const isOwner = isOwnerBillingStatus(status)

  useEffect(() => {
    if (!loading && !user) router.replace("/login")
  }, [loading, user, router])

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading billing…
      </div>
    )
  }

  return (
    <DashboardShell>
      <div className="space-y-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Billing
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isOwner
              ? LIFETIME_FOUNDER_ACCESS
              : "ListWise Pro — membership, trial, and AI listing credits."}
          </p>
        </div>
        {trialExpired && !isOwner && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm">
            Your free trial has expired. Subscribe to ListWise Pro to unlock AI
            generation, publishing, and marketplace tools.
          </div>
        )}
        <BillingPanel />
      </div>
    </DashboardShell>
  )
}

export default function DashboardBillingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
          Loading billing…
        </div>
      }
    >
      <DashboardBillingContent />
    </Suspense>
  )
}
