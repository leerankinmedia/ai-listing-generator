"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { DashboardOverview } from "@/components/dashboard/dashboard-overview"
import { useAuth } from "@/components/auth/auth-provider"

export default function DashboardPage() {
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
          Loading workspace…
        </div>
      </div>
    )
  }

  return (
    <DashboardShell>
      <DashboardOverview />
    </DashboardShell>
  )
}
