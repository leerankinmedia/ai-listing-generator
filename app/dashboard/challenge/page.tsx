"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { ChallengePage } from "@/components/dashboard/challenge-page"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { useAuth } from "@/components/auth/auth-provider"

export default function DashboardChallengePage() {
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
      <ChallengePage />
    </DashboardShell>
  )
}
