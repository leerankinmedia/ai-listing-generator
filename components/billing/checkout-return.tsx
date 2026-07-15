"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { CheckCircle2, Loader2 } from "lucide-react"
import { Logo } from "@/components/brand/logo"
import { ThemeToggle } from "@/components/theme-toggle"
import { useAuth } from "@/components/auth/auth-provider"
import { useBillingStatus } from "@/components/billing/paywall"
import { buttonVariants } from "@/components/ui/button"
import { PLAN_NAME } from "@/lib/billing/config"
import { cn } from "@/lib/utils"

type SessionPayload = {
  complete: boolean
  status: string
  paymentStatus: string
  subscriptionId: string | null
}

export function CheckoutReturnPage() {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get("session_id")
  const { user, loading: authLoading } = useAuth()
  const { status, loading: billingLoading, refresh } = useBillingStatus(
    Boolean(user)
  )
  const [session, setSession] = useState<SessionPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [polls, setPolls] = useState(0)

  const loadSession = useCallback(async () => {
    if (!sessionId) {
      setError("Missing checkout session.")
      return
    }
    try {
      const res = await fetch(
        `/api/billing/checkout/session?session_id=${encodeURIComponent(sessionId)}`
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Could not verify checkout")
      setSession(data as SessionPayload)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed")
    }
  }, [sessionId])

  useEffect(() => {
    if (authLoading || !user) return
    void loadSession()
  }, [authLoading, user, loadSession])

  // Refresh subscription status after success (webhook may lag slightly)
  useEffect(() => {
    if (!session?.complete || !user) return
    if (status?.unlocksApp) return
    if (polls >= 8) return

    const t = window.setTimeout(() => {
      void refresh().then(() => setPolls((n) => n + 1))
    }, polls === 0 ? 800 : 1500)

    return () => window.clearTimeout(t)
  }, [session?.complete, user, status?.unlocksApp, polls, refresh])

  const verifying =
    authLoading ||
    (!error && !session) ||
    (session?.complete && billingLoading && polls === 0)

  return (
    <div className="relative flex min-h-screen flex-col">
      <div className="flex items-center justify-between px-4 py-4 sm:px-6">
        <Logo />
        <ThemeToggle />
      </div>
      <div className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md space-y-5 rounded-2xl border border-border bg-card/95 p-6 text-center shadow-[0_24px_60px_-40px_rgba(10,15,26,0.45)] sm:p-8">
          {verifying ? (
            <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Confirming your ListWise membership…
            </p>
          ) : error ? (
            <>
              <h1 className="font-display text-2xl font-semibold tracking-tight">
                Could not confirm checkout
              </h1>
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
              <Link
                href="/checkout"
                className={cn(buttonVariants({ variant: "accent" }))}
              >
                Try checkout again
              </Link>
            </>
          ) : (
            <>
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-accent/15 text-accent">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h1 className="font-display text-2xl font-semibold tracking-tight">
                Welcome to {PLAN_NAME}
              </h1>
              <p className="text-sm text-muted-foreground">
                Your checkout completed successfully
                {status?.unlocksApp
                  ? ` — status is now ${status.status}.`
                  : ". Syncing your subscription status…"}
              </p>
              {status && (
                <p className="text-xs text-muted-foreground">
                  Plan: {status.planName || PLAN_NAME} ·{" "}
                  {status.listingCreditsAllowance} AI listing credits / cycle
                </p>
              )}
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
                <Link
                  href="/dashboard"
                  className={cn(buttonVariants({ variant: "accent" }))}
                >
                  Go to dashboard
                </Link>
                <Link
                  href="/billing"
                  className={cn(buttonVariants({ variant: "outline" }))}
                >
                  View billing
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
