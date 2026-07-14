"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Suspense } from "react"
import { PaywallCard, useBillingStatus } from "@/components/billing/paywall"
import { useAuth } from "@/components/auth/auth-provider"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

function PricingInner() {
  const { user, loading: authLoading } = useAuth()
  const { status, loading } = useBillingStatus()
  const searchParams = useSearchParams()
  const canceled = searchParams.get("checkout") === "canceled"

  if (authLoading || (user && loading)) {
    return <p className="text-sm text-muted-foreground">Loading pricing…</p>
  }

  if (!user) {
    return (
      <div className="space-y-4 text-center">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Start your 7-day ListWise trial
        </h1>
        <p className="text-sm text-muted-foreground">
          Create an account first, then complete Stripe Checkout to unlock the
          app.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link
            href="/signup"
            className={cn(buttonVariants({ variant: "accent" }))}
          >
            Create account
          </Link>
          <Link
            href="/login"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Log in
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {canceled && (
        <p className="rounded-xl border border-border bg-secondary/50 px-4 py-3 text-sm">
          Checkout canceled — you can restart anytime. Your account and data stay
          saved.
        </p>
      )}
      {status?.unlocksApp ? (
        <div className="space-y-4 text-center">
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            You&apos;re unlocked
          </h1>
          <p className="text-sm text-muted-foreground">
            Status: {status.status}. Head to your workspace or manage billing.
          </p>
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
              Billing
            </Link>
          </div>
        </div>
      ) : (
        <PaywallCard status={status} />
      )}
    </div>
  )
}

export function PricingPageClient() {
  return (
    <Suspense
      fallback={<p className="text-sm text-muted-foreground">Loading pricing…</p>}
    >
      <PricingInner />
    </Suspense>
  )
}
