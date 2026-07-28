"use client"

import { useEffect, useMemo, useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  formatHandlingTime,
  shippingModeLabel,
  defaultEbayShippingMode,
  type EbayFulfillmentShippingSummary,
  type EbayShippingMode,
} from "@/lib/marketplaces/adapters/ebay/fulfillment-shipping"
import type { Listing } from "@/lib/types"
import { cn } from "@/lib/utils"

const MODES: Array<{ value: EbayShippingMode; help: string }> = [
  {
    value: "calculated",
    help: "eBay calculates postage from your package weight and size. Buyer pays.",
  },
  {
    value: "flat",
    help: "Buyer pays a fixed shipping amount you set.",
  },
  {
    value: "free",
    help: "You pay shipping. Requires explicit confirmation before publish.",
  },
]

export function EbayShippingModeFields({
  listing,
  onChange,
  disabled,
  policies,
  policiesLoading,
  policiesError,
}: {
  listing: Listing
  onChange: (listing: Listing) => void
  disabled?: boolean
  policies?: EbayFulfillmentShippingSummary[]
  policiesLoading?: boolean
  policiesError?: string | null
}) {
  const mode = defaultEbayShippingMode(listing.specifics.shippingMode)
  const flatAmount = listing.specifics.flatShippingAmount ?? 5.99
  const freeConfirmed = Boolean(listing.specifics.freeShippingConfirmed)

  const matchingPolicies = useMemo(
    () => (policies || []).filter((p) => p.mode === mode),
    [policies, mode]
  )

  const selectedPolicy = useMemo(() => {
    const preferredId = listing.specifics.fulfillmentPolicyId
    if (preferredId) {
      const hit = matchingPolicies.find((p) => p.fulfillmentPolicyId === preferredId)
      if (hit) return hit
    }
    return (
      matchingPolicies.find((p) => p.name.toLowerCase().includes("listwise")) ||
      matchingPolicies[0] ||
      null
    )
  }, [matchingPolicies, listing.specifics.fulfillmentPolicyId])

  function patchSpecifics(
    partial: Partial<Listing["specifics"]>
  ) {
    onChange({
      ...listing,
      specifics: {
        ...listing.specifics,
        ...partial,
      },
      updatedAt: new Date().toISOString(),
    })
  }

  function setMode(next: EbayShippingMode) {
    patchSpecifics({
      shippingMode: next,
      freeShippingConfirmed: next === "free" ? freeConfirmed : false,
      fulfillmentPolicyId: undefined,
    })
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Who pays for shipping?</h3>
        <p className="text-xs text-muted-foreground">
          Default is Buyer pays calculated shipping. ListWise will not silently apply a free
          shipping eBay business policy.
        </p>
      </div>

      <div className="space-y-2">
        {MODES.map((m) => {
          const active = mode === m.value
          return (
            <label
              key={m.value}
              className={cn(
                "flex cursor-pointer gap-3 rounded-xl border px-3 py-3 transition-colors",
                active
                  ? "border-accent/50 bg-accent/10"
                  : "border-border bg-card/60 hover:border-accent/30",
                disabled && "cursor-not-allowed opacity-60"
              )}
            >
              <input
                type="radio"
                className="mt-1"
                name="ebay-shipping-mode"
                disabled={disabled}
                checked={active}
                onChange={() => setMode(m.value)}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">
                  {shippingModeLabel(m.value)}
                </span>
                <span className="block text-xs text-muted-foreground">{m.help}</span>
              </span>
            </label>
          )
        })}
      </div>

      {mode === "flat" && (
        <div className="space-y-2">
          <Label htmlFor="flat-shipping-amount">Flat shipping amount (USD)</Label>
          <Input
            id="flat-shipping-amount"
            type="number"
            min={0.01}
            step={0.01}
            disabled={disabled}
            value={flatAmount}
            onChange={(e) =>
              patchSpecifics({
                flatShippingAmount: Number(e.target.value) || 0,
              })
            }
          />
        </div>
      )}

      {mode === "free" && (
        <div className="space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
          <p className="text-sm text-amber-900 dark:text-amber-100">
            Warning: Free shipping means you pay postage. Confirm this before publishing —
            ListWise will not apply free shipping unless you check the box below.
          </p>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              disabled={disabled}
              checked={freeConfirmed}
              onChange={(e) =>
                patchSpecifics({ freeShippingConfirmed: e.target.checked })
              }
            />
            <span>I confirm this listing should use free shipping (seller pays).</span>
          </label>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="fulfillment-policy">eBay fulfillment policy</Label>
        {policiesLoading ? (
          <p className="text-xs text-muted-foreground">Loading your eBay shipping policies…</p>
        ) : policiesError ? (
          <p className="text-xs text-destructive">{policiesError}</p>
        ) : matchingPolicies.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No matching {shippingModeLabel(mode).toLowerCase()} policy found yet. ListWise will
            create one on publish.
          </p>
        ) : (
          <select
            id="fulfillment-policy"
            disabled={disabled}
            value={selectedPolicy?.fulfillmentPolicyId || ""}
            onChange={(e) =>
              patchSpecifics({
                fulfillmentPolicyId: e.target.value || undefined,
                freeShippingConfirmed:
                  matchingPolicies.find((p) => p.fulfillmentPolicyId === e.target.value)
                    ?.isFreeShipping
                    ? freeConfirmed
                    : listing.specifics.freeShippingConfirmed,
              })
            }
            className="flex h-11 w-full rounded-lg border border-input bg-card px-3.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {matchingPolicies.map((p) => (
              <option key={p.fulfillmentPolicyId} value={p.fulfillmentPolicyId}>
                {p.name} — {p.costSummary}
              </option>
            ))}
          </select>
        )}
      </div>

      {selectedPolicy && (
        <div
          className={cn(
            "rounded-xl border px-3 py-3 text-sm",
            selectedPolicy.isFreeShipping
              ? "border-amber-500/40 bg-amber-500/10"
              : "border-border bg-secondary/40"
          )}
        >
          <p className="font-medium">Selected policy shipping settings</p>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            <li>Policy: {selectedPolicy.name}</li>
            <li>Cost type: {selectedPolicy.costType}</li>
            <li>{selectedPolicy.costSummary}</li>
            <li>Service: {selectedPolicy.serviceLabel}</li>
            <li>Who pays: {selectedPolicy.whoPays === "buyer" ? "Buyer" : "Seller (free shipping)"}</li>
            <li>
              Handling time:{" "}
              {formatHandlingTime(
                selectedPolicy.handlingDays,
                selectedPolicy.handlingUnit
              )}
            </li>
          </ul>
          {selectedPolicy.isFreeShipping && mode !== "free" && (
            <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">
              This policy is free shipping. Switch to Free shipping and confirm, or choose a
              buyer-pays policy.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/** Compact summary shown directly above the Publish button. */
export function EbayShippingPublishSummary({
  listing,
  policy,
}: {
  listing: Listing
  policy?: EbayFulfillmentShippingSummary | null
}) {
  const mode = defaultEbayShippingMode(listing.specifics.shippingMode)
  const pkg = listing.specifics.shippingPackage
  const weight =
    pkg != null
      ? `${pkg.weightPounds || 0} lb ${pkg.weightOunces || 0} oz`
      : "Not set"
  const dims =
    pkg != null
      ? `${pkg.lengthInches || 0} × ${pkg.widthInches || 0} × ${pkg.heightInches || 0} in`
      : "Not set"

  return (
    <div className="rounded-xl border border-border bg-secondary/30 px-3 py-3 text-sm">
      <p className="font-semibold">Shipping summary</p>
      <ul className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
        <li>Who pays: {shippingModeLabel(mode)}</li>
        <li>Service: {policy?.serviceLabel || "USPS Priority Mail (default)"}</li>
        <li>Weight: {weight}</li>
        <li>Dimensions: {dims}</li>
        <li>
          Handling time:{" "}
          {policy
            ? formatHandlingTime(policy.handlingDays, policy.handlingUnit)
            : "1 business day (default)"}
        </li>
        <li>Policy: {policy?.name || "Will create/match on publish"}</li>
        {mode === "flat" && (
          <li>
            Flat amount: $
            {(listing.specifics.flatShippingAmount ?? 5.99).toFixed(2)}
          </li>
        )}
        {policy && <li className="sm:col-span-2">{policy.costSummary}</li>}
      </ul>
    </div>
  )
}

export function useEbayFulfillmentPolicies(enabled: boolean) {
  const [policies, setPolicies] = useState<EbayFulfillmentShippingSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    setLoading(true)
    setError(null)
    void fetch("/api/marketplaces/ebay/fulfillment-policies")
      .then(async (res) => {
        const json = (await res.json()) as {
          policies?: EbayFulfillmentShippingSummary[]
          error?: string
        }
        if (cancelled) return
        if (!res.ok) {
          setPolicies([])
          setError(json.error || "Could not load eBay shipping policies.")
          return
        }
        setPolicies(json.policies || [])
      })
      .catch(() => {
        if (!cancelled) {
          setPolicies([])
          setError("Could not load eBay shipping policies.")
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [enabled])

  return { policies, loading, error }
}
