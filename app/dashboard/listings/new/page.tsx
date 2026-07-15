"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { ListingGenerator } from "@/components/listings/listing-generator"
import { PaidFeatureGate } from "@/components/billing/paid-feature-gate"
import { useAuth } from "@/components/auth/auth-provider"

export default function NewListingPage() {
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
      <PaidFeatureGate feature="ai_generator">
        <ListingGenerator />
      </PaidFeatureGate>
    </DashboardShell>
  )
}
