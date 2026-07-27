"use client"

import { Suspense, useEffect } from "react"
import { useRouter } from "next/navigation"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { InventoryPage } from "@/components/inventory/inventory-page"
import { useAuth } from "@/components/auth/auth-provider"

function InventoryPageContent() {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) router.replace("/login")
  }, [loading, user, router])

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading inventory…
      </div>
    )
  }

  return (
    <DashboardShell>
      <InventoryPage />
    </DashboardShell>
  )
}

export default function DashboardInventoryPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
          Loading inventory…
        </div>
      }
    >
      <InventoryPageContent />
    </Suspense>
  )
}
