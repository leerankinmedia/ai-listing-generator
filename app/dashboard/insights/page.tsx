"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { SalesInsightsPage } from "@/components/dashboard/sales-insights-page"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { useAuth } from "@/components/auth/auth-provider"

export default function DashboardInsightsRoute() {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) router.replace("/login")
  }, [loading, user, router])

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    )
  }

  return (
    <DashboardShell>
      <SalesInsightsPage />
    </DashboardShell>
  )
}
