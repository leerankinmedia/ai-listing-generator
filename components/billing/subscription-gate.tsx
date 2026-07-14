"use client"

import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useAuth } from "@/components/auth/auth-provider"
import { useBillingStatus } from "@/components/billing/paywall"

const BILLING_SAFE_PREFIXES = [
  "/pricing",
  "/billing",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/auth",
]

/**
 * Client-side gate that redirects locked users away from protected app pages.
 * Server middleware + API guards remain the real enforcement when enabled.
 */
export function SubscriptionGate({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading, isDemo } = useAuth()
  const { status, loading } = useBillingStatus(Boolean(user) && !isDemo)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (authLoading || loading || isDemo || !user) return
    if (!status?.enforcement) return
    if (status.allowed) return

    const safe = BILLING_SAFE_PREFIXES.some((prefix) =>
      pathname.startsWith(prefix)
    )
    if (safe) return
    if (pathname.startsWith("/dashboard/billing")) return

    router.replace("/pricing")
  }, [authLoading, loading, isDemo, user, status, pathname, router])

  return <>{children}</>
}
