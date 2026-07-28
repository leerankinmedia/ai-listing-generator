"use client"

import { useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { EbaySellerSettingsForm } from "@/components/seller/ebay-seller-settings-form"
import { useAuth } from "@/components/auth/auth-provider"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export default function SellingPreferencesPage() {
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
      <div className="space-y-4 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/dashboard"
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "inline-flex"
            )}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Overview
          </Link>
          <Link
            href="/dashboard/listings/new"
            className="text-sm text-muted-foreground underline-offset-2 hover:underline"
          >
            New listing
          </Link>
        </div>
        <EbaySellerSettingsForm />
      </div>
    </DashboardShell>
  )
}
