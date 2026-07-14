"use client"

import { DashboardShell } from "@/components/layout/dashboard-shell"
import { BillingPanel } from "@/components/billing/billing-panel"
import { useAuth } from "@/components/auth/auth-provider"
import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function DashboardBillingPage() {
  const { user, loading } = useAuth()
  const router = useRouter()

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
            Manage your ListWise membership and trial.
          </p>
        </div>
        <BillingPanel />
      </div>
    </DashboardShell>
  )
}
