"use client"

import { useCallback, useEffect, useState } from "react"
import { CreditCard, Loader2, Lock, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PlanFeaturesList } from "@/components/billing/plan-features"
import {
  getMembershipPriceLabel,
  BILLING_TRIAL_DAYS,
  MONTHLY_LISTING_CREDITS,
  PLAN_NAME,
  PLAN_FEATURES,
  type PlanFeature,
} from "@/lib/billing/config"
import { cn } from "@/lib/utils"

export interface BillingStatusPayload {
  enforcement: boolean
  stripeConfigured: boolean
  planName: string
  priceLabel: string
  trialDays: number
  listingCreditsAllowance: number
  listingCreditsUsed: number
  listingCreditsRemaining: number
  listingCreditsPeriodStart: string | null
  listingCreditsEnforced: boolean
  features: PlanFeature[]
  allowed: boolean
  reason: string
  status: string
  hasUsedTrial: boolean
  trialEligible: boolean
  trialStart: string | null
  trialEnd: string | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  unlocksApp: boolean
  paidToolsUnlocked: boolean
  previewMode: boolean
}

export function useBillingStatus(enabled = true) {
  const [status, setStatus] = useState<BillingStatusPayload | null>(null)
  const [loading, setLoading] = useState(Boolean(enabled))
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!enabled) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/billing/status", {
        method: "GET",
        cache: "no-store",
        headers: { "Cache-Control": "no-store" },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Could not load billing status")
      setStatus(data as BillingStatusPayload)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Billing status failed")
      setStatus(null)
    } finally {
      setLoading(false)
    }
  }, [enabled])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { status, loading, error, refresh }
}

export async function startCheckout() {
  // In-app Embedded Checkout — no redirect to checkout.stripe.com
  window.location.href = "/checkout"
}

export async function openBillingPortal() {
  const res = await fetch("/api/billing/portal", { method: "POST" })
  const data = await res.json()
  if (!res.ok || !data.url) {
    throw new Error(data.error || "Could not open billing portal")
  }
  window.location.href = data.url as string
}

/** Polished mobile paywall for expired/inactive subscriptions. */
export function PaywallCard({
  status,
  className,
}: {
  status?: BillingStatusPayload | null
  className?: string
}) {
  const [busy, setBusy] = useState<"checkout" | "portal" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const planName = status?.planName || PLAN_NAME
  const priceLabel = status?.priceLabel || getMembershipPriceLabel()
  const trialDays = status?.trialDays ?? BILLING_TRIAL_DAYS
  const credits =
    status?.listingCreditsAllowance ?? MONTHLY_LISTING_CREDITS
  const features = status?.features?.length ? status.features : PLAN_FEATURES
  const trialEligible = status?.trialEligible ?? true
  const inactive =
    status &&
    !status.unlocksApp &&
    status.status !== "none" &&
    status.hasUsedTrial

  async function onSubscribe() {
    setError(null)
    setBusy("checkout")
    try {
      await startCheckout()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed")
      setBusy(null)
    }
  }

  async function onManage() {
    setError(null)
    setBusy("portal")
    try {
      await openBillingPortal()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Portal failed")
      setBusy(null)
    }
  }

  return (
    <div
      className={cn(
        "mx-auto w-full max-w-md rounded-2xl border border-border bg-card/95 p-6 shadow-[0_24px_60px_-40px_rgba(10,15,26,0.45)] backdrop-blur-sm sm:p-8",
        className
      )}
    >
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-accent/15 text-accent">
        <Lock className="h-5 w-5" />
      </div>
      <h1 className="font-display text-2xl font-semibold tracking-tight">
        {inactive
          ? "Trial expired or subscription inactive"
          : `Start your ${planName} trial`}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {inactive
          ? "Your listings and account data are saved. Renew to unlock every feature again."
          : `Full access for ${trialDays} days. A card is required to start — then ${priceLabel} after the trial unless you cancel.`}
      </p>

      <div className="mt-6 rounded-xl border border-border bg-secondary/40 px-4 py-3">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
          {planName}
        </p>
        <p className="mt-1 font-display text-2xl font-semibold">{priceLabel}</p>
        {trialEligible && (
          <p className="mt-1 text-xs text-muted-foreground">
            Includes a {trialDays}-day full-access trial
          </p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          {credits} AI listing credits per billing cycle · 1 completed listing = 1
          credit
        </p>
      </div>

      <div className="mt-5">
        <PlanFeaturesList features={features} />
      </div>

      {error && (
        <p className="mt-4 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="mt-6 space-y-3">
        <Button
          variant="accent"
          className="w-full"
          size="lg"
          disabled={busy !== null}
          onClick={() => void onSubscribe()}
        >
          {busy === "checkout" ? (
            <Loader2 className="animate-spin" />
          ) : (
            <Sparkles />
          )}
          {trialEligible
            ? `Start ${trialDays}-day trial`
            : `Subscribe to ${planName}`}
        </Button>
        {(status?.stripeCustomerId || status?.hasUsedTrial) && (
          <Button
            variant="outline"
            className="w-full"
            disabled={busy !== null}
            onClick={() => void onManage()}
          >
            {busy === "portal" ? (
              <Loader2 className="animate-spin" />
            ) : (
              <CreditCard />
            )}
            Manage billing
          </Button>
        )}
      </div>

      <p className="mt-5 text-center text-xs text-muted-foreground">
        Existing data will remain saved while access is locked.
      </p>
    </div>
  )
}
