"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Loader2, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NullableNumberInput } from "@/components/ui/nullable-number-input"
import {
  DEFAULT_EBAY_SELLER_DEFAULTS,
  EBAY_HANDLING_TIME_OPTIONS,
  EBAY_RETURN_WINDOW_OPTIONS,
  EBAY_SHIPPING_SERVICE_OPTIONS,
  missingEbaySellerDefaultFields,
  normalizeEbaySellerDefaults,
  type EbaySellerDefaults,
  type EbayPromotedListingsMode,
} from "@/lib/seller/ebay-defaults"
import {
  readLocalEbaySellerDefaults,
  writeLocalEbaySellerDefaults,
} from "@/lib/seller/ebay-defaults-local"
import {
  DEFAULT_EBAY_PACKAGE_TYPE,
  type ShippingPackage,
} from "@/lib/listings/shipping-package"
import { cn } from "@/lib/utils"

function blankPackage(): ShippingPackage {
  return {
    weightPounds: null,
    weightOunces: null,
    lengthInches: null,
    widthInches: null,
    heightInches: null,
    packageType: DEFAULT_EBAY_PACKAGE_TYPE,
  }
}

export function EbaySellerSettingsForm() {
  const [defaults, setDefaults] = useState<EbaySellerDefaults>({
    ...DEFAULT_EBAY_SELLER_DEFAULTS,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    void (async () => {
      try {
        const res = await fetch("/api/seller/ebay-defaults", {
          credentials: "same-origin",
        })
        if (res.ok) {
          const json = (await res.json()) as {
            defaults?: unknown
            setupCompleted?: boolean
          }
          if (mounted && json.defaults) {
            setDefaults(normalizeEbaySellerDefaults(json.defaults))
            return
          }
        }
        const local = readLocalEbaySellerDefaults()
        if (mounted && local) setDefaults(local.defaults)
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  function patch(partial: Partial<EbaySellerDefaults>) {
    setDefaults((prev) => normalizeEbaySellerDefaults({ ...prev, ...partial }))
  }

  function patchPackage(partial: Partial<ShippingPackage>) {
    const current = defaults.package || blankPackage()
    patch({
      package: {
        ...current,
        ...partial,
        packageType: current.packageType || DEFAULT_EBAY_PACKAGE_TYPE,
      },
    })
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    setMessage(null)
    const missing = missingEbaySellerDefaultFields(defaults)
    try {
      writeLocalEbaySellerDefaults(defaults, missing.length === 0)
      const res = await fetch("/api/seller/ebay-defaults", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          defaults,
          setupCompleted: missing.length === 0,
        }),
      })
      const json = (await res.json()) as {
        error?: string
        ready?: boolean
        missing?: string[]
      }
      if (!res.ok) throw new Error(json.error || "Save failed")
      if (json.ready) {
        setMessage("Defaults saved. New listings will use these automatically.")
      } else {
        setMessage(
          `Saved. Still need: ${(json.missing || missing).join(", ")}.`
        )
      }
    } catch (err) {
      // Local save still helps offline / demo.
      writeLocalEbaySellerDefaults(defaults, missing.length === 0)
      setError(
        err instanceof Error
          ? `${err.message} (saved on this device for now.)`
          : "Could not save."
      )
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground">Loading your defaults…</p>
    )
  }

  const pkg = defaults.package || blankPackage()

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Selling preferences
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Set these once. ListWise applies them to every new listing — you can still
          override per item before Publish.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Promoted listings need an eBay connection with marketing permission. If
          promotion fails after publish, reconnect eBay under Connections, then retry.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">Handling time</h2>
        <select
          value={defaults.handlingTimeDays}
          onChange={(e) =>
            patch({ handlingTimeDays: Number(e.target.value) as EbaySellerDefaults["handlingTimeDays"] })
          }
          className="flex h-11 w-full rounded-lg border border-input bg-card px-3.5 text-sm"
        >
          {EBAY_HANDLING_TIME_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">Shipping</h2>
        <div className="grid gap-2 sm:grid-cols-3">
          {(["calculated", "flat", "free"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => patch({ shippingMode: mode })}
              className={cn(
                "rounded-xl border px-3 py-3 text-left text-sm",
                defaults.shippingMode === mode
                  ? "border-accent/50 bg-accent/10"
                  : "border-border bg-card/60"
              )}
            >
              {mode === "calculated"
                ? "Calculated"
                : mode === "flat"
                  ? "Flat"
                  : "Free"}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          <Label htmlFor="ship-service">Default carrier / service</Label>
          <select
            id="ship-service"
            value={defaults.shippingService}
            onChange={(e) =>
              patch({
                shippingService:
                  e.target.value as EbaySellerDefaults["shippingService"],
              })
            }
            className="flex h-11 w-full rounded-lg border border-input bg-card px-3.5 text-sm"
          >
            {EBAY_SHIPPING_SERVICE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        {defaults.shippingMode === "flat" && (
          <div className="space-y-2">
            <Label htmlFor="flat-amt">Flat shipping amount (USD)</Label>
            <NullableNumberInput
              id="flat-amt"
              min={0}
              step="0.01"
              value={defaults.flatShippingAmount}
              placeholder="e.g. 5.99"
              onValueChange={(n) => patch({ flatShippingAmount: n })}
            />
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="wt-lb">Weight pounds</Label>
            <NullableNumberInput
              id="wt-lb"
              integer
              min={0}
              value={pkg.weightPounds}
              placeholder="e.g. 1"
              onValueChange={(n) => patchPackage({ weightPounds: n })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wt-oz">Weight ounces (optional)</Label>
            <NullableNumberInput
              id="wt-oz"
              min={0}
              step="0.1"
              value={pkg.weightOunces}
              placeholder="0 if blank"
              onValueChange={(n) => patchPackage({ weightOunces: n })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="len">Length (in)</Label>
            <NullableNumberInput
              id="len"
              min={0}
              step="0.1"
              value={pkg.lengthInches}
              placeholder="e.g. 12"
              onValueChange={(n) => patchPackage({ lengthInches: n })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wid">Width (in)</Label>
            <NullableNumberInput
              id="wid"
              min={0}
              step="0.1"
              value={pkg.widthInches}
              placeholder="e.g. 9"
              onValueChange={(n) => patchPackage({ widthInches: n })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="hei">Height (in)</Label>
            <NullableNumberInput
              id="hei"
              min={0}
              step="0.1"
              value={pkg.heightInches}
              placeholder="e.g. 1"
              onValueChange={(n) => patchPackage({ heightInches: n })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="zip">Item location ZIP</Label>
            <Input
              id="zip"
              inputMode="numeric"
              value={defaults.itemLocationZip}
              placeholder="e.g. 43604"
              onChange={(e) =>
                patch({
                  itemLocationZip: e.target.value.replace(/\D/g, "").slice(0, 10),
                })
              }
            />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">Returns</h2>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={defaults.returnsAccepted}
            onChange={(e) => patch({ returnsAccepted: e.target.checked })}
          />
          Accept domestic returns
        </label>
        {defaults.returnsAccepted && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Return window</Label>
              <select
                value={defaults.returnWindowDays}
                onChange={(e) =>
                  patch({
                    returnWindowDays: Number(e.target.value) === 60 ? 60 : 30,
                  })
                }
                className="flex h-11 w-full rounded-lg border border-input bg-card px-3.5 text-sm"
              >
                {EBAY_RETURN_WINDOW_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Return shipping paid by</Label>
              <select
                value={defaults.returnShippingPaidBy}
                onChange={(e) =>
                  patch({
                    returnShippingPaidBy:
                      e.target.value === "SELLER" ? "SELLER" : "BUYER",
                  })
                }
                className="flex h-11 w-full rounded-lg border border-input bg-card px-3.5 text-sm"
              >
                <option value="BUYER">Buyer</option>
                <option value="SELLER">Seller</option>
              </select>
            </div>
          </div>
        )}
        <p className="text-xs text-muted-foreground">Refund method: Money back</p>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">Payment</h2>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={defaults.requireImmediatePayment}
            onChange={(e) =>
              patch({ requireImmediatePayment: e.target.checked })
            }
          />
          Require immediate payment
        </label>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">Offers</h2>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={defaults.allowOffers}
            onChange={(e) => patch({ allowOffers: e.target.checked })}
          />
          Allow offers
        </label>
        {defaults.allowOffers && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Minimum offer ($)</Label>
              <NullableNumberInput
                min={0}
                step="0.01"
                value={defaults.minOfferAmount}
                placeholder="Optional"
                onValueChange={(n) => patch({ minOfferAmount: n })}
              />
            </div>
            <div className="space-y-2">
              <Label>Minimum offer (%)</Label>
              <NullableNumberInput
                min={0}
                max={100}
                step="1"
                value={defaults.minOfferPercent}
                placeholder="Optional"
                onValueChange={(n) => patch({ minOfferPercent: n })}
              />
            </div>
            <div className="space-y-2">
              <Label>Auto-decline ($)</Label>
              <NullableNumberInput
                min={0}
                step="0.01"
                value={defaults.autoDeclineAmount}
                placeholder="Optional"
                onValueChange={(n) => patch({ autoDeclineAmount: n })}
              />
            </div>
            <div className="space-y-2">
              <Label>Auto-decline (%)</Label>
              <NullableNumberInput
                min={0}
                max={100}
                step="1"
                value={defaults.autoDeclinePercent}
                placeholder="Optional"
                onValueChange={(n) => patch({ autoDeclinePercent: n })}
              />
            </div>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">Promoted listings</h2>
        <div className="grid gap-2 sm:grid-cols-3">
          {(
            [
              ["off", "Off"],
              ["dynamic", "Dynamic ad rate"],
              ["custom", "Custom %"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() =>
                patch({ promotedListings: value as EbayPromotedListingsMode })
              }
              className={cn(
                "rounded-xl border px-3 py-3 text-left text-sm",
                defaults.promotedListings === value
                  ? "border-accent/50 bg-accent/10"
                  : "border-border bg-card/60"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {defaults.promotedListings === "custom" && (
          <div className="space-y-2">
            <Label>Ad rate percentage (2–100)</Label>
            <NullableNumberInput
              min={2}
              max={100}
              step="0.1"
              value={defaults.promotedListingsPercent}
              placeholder="e.g. 5"
              onValueChange={(n) => patch({ promotedListingsPercent: n })}
            />
          </div>
        )}
      </section>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="text-sm text-muted-foreground" role="status">
          {message}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <Button variant="accent" disabled={saving} onClick={() => void handleSave()}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />}
          Save defaults
        </Button>
        <Link
          href="/dashboard/listings/new"
          className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm font-medium"
        >
          Create a listing
        </Link>
      </div>
    </div>
  )
}
