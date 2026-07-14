"use client"

import { useState } from "react"
import { CreditCard, Loader2, RefreshCw } from "lucide-react"
import {
  openBillingPortal,
  startCheckout,
  useBillingStatus,
} from "@/components/billing/paywall"
import { Button } from "@/components/ui/button"

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

function statusLabel(status: string) {
  switch (status) {
    case "trialing":
      return "Trialing"
    case "active":
      return "Active"
    case "past_due":
      return "Past due"
    case "canceled":
      return "Canceled"
    case "unpaid":
      return "Unpaid"
    case "none":
      return "No subscription"
    default:
      return status
  }
}

export function BillingPanel() {
  const { status, loading, error, refresh } = useBillingStatus()
  const [busy, setBusy] = useState<"checkout" | "portal" | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  async function onSubscribe() {
    setActionError(null)
    setBusy("checkout")
    try {
      await startCheckout()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Checkout failed")
      setBusy(null)
    }
  }

  async function onManage() {
    setActionError(null)
    setBusy("portal")
    try {
      await openBillingPortal()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Portal failed")
      setBusy(null)
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading billing…</p>
  }

  if (error || !status) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive" role="alert">
          {error || "Could not load billing."}
        </p>
        <Button variant="outline" size="sm" onClick={() => void refresh()}>
          <RefreshCw />
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-card/70 px-4 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Status
          </p>
          <p className="mt-1 text-sm font-semibold">{statusLabel(status.status)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card/70 px-4 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Membership
          </p>
          <p className="mt-1 text-sm font-semibold">{status.priceLabel}</p>
        </div>
        <div className="rounded-xl border border-border bg-card/70 px-4 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Trial ends
          </p>
          <p className="mt-1 text-sm font-semibold">
            {formatDate(status.trialEnd)}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card/70 px-4 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Renews / period end
          </p>
          <p className="mt-1 text-sm font-semibold">
            {formatDate(status.currentPeriodEnd)}
          </p>
        </div>
      </div>

      {status.cancelAtPeriodEnd && (
        <p className="rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm">
          Cancellation scheduled — access continues until the period end date.
        </p>
      )}

      {(actionError || error) && (
        <p className="text-sm text-destructive" role="alert">
          {actionError}
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        {!status.unlocksApp && (
          <Button
            variant="accent"
            disabled={busy !== null}
            onClick={() => void onSubscribe()}
          >
            {busy === "checkout" ? (
              <Loader2 className="animate-spin" />
            ) : (
              <CreditCard />
            )}
            {status.trialEligible
              ? "Start 7-day trial"
              : "Subscribe and unlock"}
          </Button>
        )}
        <Button
          variant="outline"
          disabled={busy !== null || !status.stripeCustomerId}
          onClick={() => void onManage()}
        >
          {busy === "portal" ? (
            <Loader2 className="animate-spin" />
          ) : (
            <CreditCard />
          )}
          Manage billing / cancel
        </Button>
        <Button variant="ghost" disabled={busy !== null} onClick={() => void refresh()}>
          <RefreshCw />
          Refresh
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Stripe is the source of truth. Listings stay saved if access is locked.
        {!status.enforcement && (
          <>
            {" "}
            <span className="font-medium text-foreground">
              Billing enforcement is currently off
            </span>{" "}
            (BILLING_ENFORCEMENT=false) while test mode is verified.
          </>
        )}
      </p>
    </div>
  )
}
