"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Suspense } from "react"
import { PaywallCard, useBillingStatus } from "@/components/billing/paywall"
import { PlanFeaturesList } from "@/components/billing/plan-features"
import { useAuth } from "@/components/auth/auth-provider"
import { buttonVariants } from "@/components/ui/button"
import {
  BILLING_TRIAL_DAYS,
  getMembershipPriceLabel,
  MONTHLY_LISTING_CREDITS,
  PLAN_FEATURES,
  PLAN_NAME,
} from "@/lib/billing/config"
import { cn } from "@/lib/utils"

function PricingInner() {
  const { user, loading: authLoading } = useAuth()
  const { status, loading } = useBillingStatus(Boolean(user))
  const searchParams = useSearchParams()
  const canceled = searchParams.get("checkout") === "canceled"

  if (authLoading || (user && loading)) {
    return <p className="text-sm text-muted-foreground">Loading pricing…</p>
  }

  if (!user) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-accent">
            {PLAN_NAME}
          </p>
          <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight">
            Start your {BILLING_TRIAL_DAYS}-day free trial
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {getMembershipPriceLabel()} after trial ·{" "}
            {MONTHLY_LISTING_CREDITS} AI listing credits per cycle · no fixed
            inventory limit
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card/90 p-5 sm:p-6">
          <p className="font-display text-3xl font-semibold">
            {getMembershipPriceLabel()}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {BILLING_TRIAL_DAYS}-day free trial · card required to start
          </p>
          <div className="mt-5">
            <PlanFeaturesList features={PLAN_FEATURES} />
          </div>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Link
              href="/signup"
              className={cn(buttonVariants({ variant: "accent" }), "w-full sm:w-auto")}
            >
              Create account
            </Link>
            <Link
              href="/login"
              className={cn(
                buttonVariants({ variant: "outline" }),
                "w-full sm:w-auto"
              )}
            >
              Log in
            </Link>
          </div>
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
            {status.planName || PLAN_NAME} · Status: {status.status} ·{" "}
            {status.listingCreditsUsed ?? 0} /{" "}
            {status.listingCreditsAllowance ?? MONTHLY_LISTING_CREDITS} AI
            listing credits used
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
