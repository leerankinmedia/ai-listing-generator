"use client"

import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useBillingStatus } from "@/components/billing/paywall"

/**
 * Redirects expired / locked accounts to Billing while allowing billing,
 * checkout, pricing, and sign-out flows to remain reachable.
 * Authorization is still enforced server-side via getEntitlement().
 */
const ALLOWED_WHEN_LOCKED = [
  "/dashboard/billing",
  "/checkout",
  "/pricing",
  "/billing",
]

export function SubscriptionGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { status, loading } = useBillingStatus(true)

  useEffect(() => {
    if (loading || !status) return
    if (status.paidToolsUnlocked) return
    if (status.adminOverride) return

    const allowedHere = ALLOWED_WHEN_LOCKED.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    )
    if (allowedHere) return

    // Force expired trial accounts to Billing (not brand-new "none" explorers).
    if (status.status === "expired") {
      router.replace("/dashboard/billing?reason=trial_expired")
    }
  }, [loading, status, pathname, router])

  return <>{children}</>
}
