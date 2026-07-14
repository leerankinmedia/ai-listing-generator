"use client"

import { useCallback, useEffect, useState } from "react"
import { CreditCard, Loader2, Lock, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getMembershipPriceLabel, BILLING_TRIAL_DAYS } from "@/lib/billing/config"
import { cn } from "@/lib/utils"

export interface BillingStatusPayload {
  enforcement: boolean
  stripeConfigured: boolean
  priceLabel: string
  trialDays: number
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
}

function formatDate(value: string | null) {
  if (!value) return "—"
  try {
    return new Date(value).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  } catch {
    return "—"
  }
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
      const res = await fetch("/api/billing/status")
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
  const res = await fetch("/api/billing/checkout", { method: "POST" })
  const data = await res.json()
  if (!res.ok || !data.url) {
    throw new Error(data.error || "Could not start Checkout")
  }
  window.location.href = data.url as string
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
  const priceLabel = status?.priceLabel || getMembershipPriceLabel()
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
        {inactive ? "Trial expired or subscription inactive" : "Start your ListWise trial"}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {inactive
          ? "Your listings and account data are saved. Renew to unlock every feature again."
          : `Full access for ${BILLING_TRIAL_DAYS} days. A card is required to start — then ${priceLabel} after the trial unless you cancel.`}
      </p>

      <div className="mt-6 rounded-xl border border-border bg-secondary/40 px-4 py-3">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Monthly membership
        </p>
        <p className="mt-1 font-display text-2xl font-semibold">{priceLabel}</p>
        {trialEligible && (
          <p className="mt-1 text-xs text-muted-foreground">
            Includes a {BILLING_TRIAL_DAYS}-day full-access trial
          </p>
        )}
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
            ? "Start 7-day trial"
            : "Subscribe and unlock ListWise"}
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
