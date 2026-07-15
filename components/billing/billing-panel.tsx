"use client"

import { useState } from "react"
import { CreditCard, Loader2, RefreshCw, XCircle } from "lucide-react"
import { startCheckout, useBillingStatus } from "@/components/billing/paywall"
import { PlanFeaturesList } from "@/components/billing/plan-features"
import { Button } from "@/components/ui/button"
import {
  BILLING_TRIAL_DAYS,
  MONTHLY_LISTING_CREDITS,
  PLAN_NAME,
  PLAN_FEATURES,
} from "@/lib/billing/config"

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

async function updateSubscription(action: "cancel" | "reactivate") {
  const res = await fetch("/api/billing/subscription", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ action }),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error || "Could not update subscription")
  }
  return data as {
    cancelAtPeriodEnd: boolean
    cancelsOn: string | null
    status: string
  }
}

async function simulateLocalStatus(
  status: "past_due" | "canceled" | "active" | "trialing"
) {
  const res = await fetch("/api/billing/test-simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ status }),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error || "Could not simulate status")
  }
  return data as { status: string; message?: string }
}

export function BillingPanel() {
  const { status, loading, error, refresh } = useBillingStatus()
  const [busy, setBusy] = useState<
    "checkout" | "cancel" | "reactivate" | "simulate" | null
  >(null)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [simulateBusy, setSimulateBusy] = useState<string | null>(null)

  async function onSubscribe() {
    setActionError(null)
    setActionMessage(null)
    setBusy("checkout")
    try {
      await startCheckout()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Checkout failed")
      setBusy(null)
    }
  }

  async function onConfirmCancel() {
    setActionError(null)
    setActionMessage(null)
    setBusy("cancel")
    try {
      const result = await updateSubscription("cancel")
      setConfirmCancel(false)
      setActionMessage(
        `Cancellation scheduled. Access continues until ${formatDate(result.cancelsOn)}.`
      )
      await refresh()
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Could not cancel subscription"
      )
    } finally {
      setBusy(null)
    }
  }

  async function onReactivate() {
    setActionError(null)
    setActionMessage(null)
    setBusy("reactivate")
    try {
      await updateSubscription("reactivate")
      setActionMessage("Subscription reactivated. Billing will continue as scheduled.")
      await refresh()
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Could not reactivate subscription"
      )
    } finally {
      setBusy(null)
    }
  }

  async function onSimulate(
    next: "past_due" | "canceled" | "active" | "trialing"
  ) {
    setActionError(null)
    setActionMessage(null)
    setBusy("simulate")
    setSimulateBusy(next)
    try {
      const result = await simulateLocalStatus(next)
      setActionMessage(
        result.message ||
          `Local status set to ${result.status}. Stripe was not modified.`
      )
      await refresh()
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Could not simulate status"
      )
    } finally {
      setBusy(null)
      setSimulateBusy(null)
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

  const planName = status.planName || PLAN_NAME
  const trialDays = status.trialDays ?? BILLING_TRIAL_DAYS
  const creditsAllowance =
    status.listingCreditsAllowance ?? MONTHLY_LISTING_CREDITS
  const creditsUsed = status.listingCreditsUsed ?? 0
  const features = status.features?.length ? status.features : PLAN_FEATURES
  const accessContinuesUntil =
    status.cancelsOn ||
    (status.status === "trialing"
      ? status.trialEnd || status.currentPeriodEnd
      : status.currentPeriodEnd)
  const canManageSubscription =
    Boolean(status.stripeSubscriptionId) &&
    (status.status === "trialing" || status.status === "active")

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-card/70 px-4 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Plan
          </p>
          <p className="mt-1 text-sm font-semibold">{planName}</p>
        </div>
        <div className="rounded-xl border border-border bg-card/70 px-4 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Status
          </p>
          <p className="mt-1 text-sm font-semibold">{statusLabel(status.status)}</p>
          {status.cancelAtPeriodEnd && (
            <p className="mt-1 text-xs text-muted-foreground">
              Cancels on {formatDate(accessContinuesUntil)}
            </p>
          )}
        </div>
        <div className="rounded-xl border border-border bg-card/70 px-4 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Membership
          </p>
          <p className="mt-1 text-sm font-semibold">{status.priceLabel}</p>
        </div>
        <div className="rounded-xl border border-border bg-card/70 px-4 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            AI listing credits
          </p>
          <p className="mt-1 text-sm font-semibold">
            {creditsUsed} / {creditsAllowance} used
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            1 completed listing = 1 credit ·{" "}
            {status.listingCreditsEnforced
              ? "limits enforced"
              : "limits not enforced yet"}
          </p>
        </div>
        <div className="rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 sm:col-span-2">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Trial expiration
          </p>
          <p className="mt-1 font-display text-xl font-semibold">
            {status.status === "trialing" || status.trialEnd
              ? formatDate(status.trialEnd)
              : "—"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {status.status === "trialing" && status.trialEnd
              ? `Your ${trialDays}-day free trial ends on this date. A payment method is already on file.`
              : status.trialEnd
                ? "Previous trial end date on file."
                : status.trialEligible
                  ? `Start a ${trialDays}-day free trial to unlock paid tools.`
                  : "No active trial."}
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

      <div className="rounded-xl border border-border bg-card/70 px-4 py-4">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Included with {planName}
        </p>
        <div className="mt-3">
          <PlanFeaturesList features={features} />
        </div>
      </div>

      {status.cancelAtPeriodEnd && canManageSubscription && (
        <div className="rounded-xl border border-accent/30 bg-accent/10 px-4 py-4 space-y-3">
          <p className="text-sm font-semibold">
            Status: {statusLabel(status.status)}
          </p>
          <p className="text-sm text-muted-foreground">
            Cancels on {formatDate(accessContinuesUntil)}. Paid features stay
            unlocked until then. Your saved listings and data remain preserved.
          </p>
          <Button
            variant="accent"
            disabled={busy !== null}
            onClick={() => void onReactivate()}
          >
            {busy === "reactivate" ? (
              <Loader2 className="animate-spin" />
            ) : null}
            Reactivate subscription
          </Button>
        </div>
      )}

      {confirmCancel && (
        <div
          className="rounded-2xl border border-border bg-card/95 p-5 shadow-[0_24px_60px_-40px_rgba(10,15,26,0.45)] space-y-4"
          role="dialog"
          aria-labelledby="cancel-subscription-title"
        >
          <h2
            id="cancel-subscription-title"
            className="font-display text-xl font-semibold tracking-tight"
          >
            Cancel subscription?
          </h2>
          <p className="text-sm text-muted-foreground">
            Your access will continue until{" "}
            <span className="font-medium text-foreground">
              {formatDate(accessContinuesUntil)}
            </span>
            . You will not be charged again.
          </p>
          <p className="text-xs text-muted-foreground">
            This does not cancel immediately. You can reactivate anytime before
            that date. Saved listings and account data stay preserved.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="accent"
              disabled={busy !== null}
              onClick={() => void onConfirmCancel()}
            >
              {busy === "cancel" ? (
                <Loader2 className="animate-spin" />
              ) : (
                <XCircle />
              )}
              Confirm cancellation
            </Button>
            <Button
              variant="outline"
              disabled={busy !== null}
              onClick={() => setConfirmCancel(false)}
            >
              Keep subscription
            </Button>
          </div>
        </div>
      )}

      {(actionError || error) && (
        <p className="text-sm text-destructive" role="alert">
          {actionError}
        </p>
      )}
      {actionMessage && (
        <p className="text-sm text-foreground" role="status">
          {actionMessage}
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
              ? `Start ${trialDays}-day trial`
              : "Subscribe and unlock"}
          </Button>
        )}
        {canManageSubscription &&
          !status.cancelAtPeriodEnd &&
          !confirmCancel && (
            <Button
              variant="outline"
              disabled={busy !== null}
              onClick={() => {
                setActionError(null)
                setActionMessage(null)
                setConfirmCancel(true)
              }}
            >
              <XCircle />
              Cancel subscription
            </Button>
          )}
        <Button
          variant="ghost"
          disabled={busy !== null}
          onClick={() => void refresh()}
        >
          <RefreshCw />
          Refresh
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Manage cancellation inside ListWise — no redirect to Stripe. Listings
        stay saved if access is locked later. Paid tools stay unlocked while
        status is trialing or active.
      </p>

      {status.testControlsEnabled && (
        <div className="rounded-2xl border border-dashed border-amber-500/50 bg-amber-500/10 p-4 space-y-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              TEST MODE ONLY
            </p>
            <h2 className="mt-1 font-display text-lg font-semibold tracking-tight">
              Subscription status simulator
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Updates this account&apos;s local subscription row only. Does not
              change Stripe. Use to verify locks after failed payment or ended
              subscription without waiting for the trial.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                "past_due",
                "canceled",
                "active",
                "trialing",
              ] as const
            ).map((simStatus) => (
              <Button
                key={simStatus}
                variant="outline"
                size="sm"
                disabled={busy !== null}
                onClick={() => void onSimulate(simStatus)}
              >
                {simulateBusy === simStatus ? (
                  <Loader2 className="animate-spin" />
                ) : null}
                Simulate {simStatus}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Current local status:{" "}
            <span className="font-medium text-foreground">
              {statusLabel(status.status)}
            </span>
            {" · "}
            paid tools{" "}
            {status.paidToolsUnlocked ? "unlocked" : "locked"}
          </p>
        </div>
      )}
    </div>
  )
}
