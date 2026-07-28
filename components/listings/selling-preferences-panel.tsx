"use client"

import { useState } from "react"
import Link from "next/link"
import { Label } from "@/components/ui/label"
import { NullableNumberInput } from "@/components/ui/nullable-number-input"
import {
  EBAY_HANDLING_TIME_OPTIONS,
  EBAY_SHIPPING_SERVICE_OPTIONS,
  handlingTimeLabel,
  shippingServiceLabel,
  shippingWhoPaysLabel,
} from "@/lib/seller/ebay-defaults"
import {
  defaultEbayShippingMode,
  shippingModeLabel,
  type EbayShippingMode,
} from "@/lib/marketplaces/adapters/ebay/fulfillment-shipping"
import {
  DEFAULT_EBAY_PACKAGE_TYPE,
  missingShippingPackageFields,
  type ShippingPackage,
} from "@/lib/listings/shipping-package"
import type { Listing } from "@/lib/types"
import { cn } from "@/lib/utils"

type EditKey =
  | "handling"
  | "shipping"
  | "package"
  | "returns"
  | "offers"
  | "payment"
  | "promoted"
  | null

function patchSpecifics(
  listing: Listing,
  onChange: (listing: Listing) => void,
  partial: Partial<Listing["specifics"]>,
  extras?: Record<string, string | undefined>
) {
  const nextExtras = { ...(listing.specifics.extras || {}) }
  if (extras) {
    for (const [k, v] of Object.entries(extras)) {
      if (v == null || v === "") delete nextExtras[k]
      else nextExtras[k] = v
    }
  }
  onChange({
    ...listing,
    specifics: {
      ...listing.specifics,
      ...partial,
      extras: nextExtras,
    },
    updatedAt: new Date().toISOString(),
  })
}

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

function PrefRow({
  label,
  value,
  onEdit,
  disabled,
}: {
  label: string
  value: string
  onEdit: () => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/60 py-2.5 last:border-0">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground">{value}</p>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={onEdit}
        className="shrink-0 text-xs font-medium text-accent-foreground underline-offset-2 hover:underline disabled:opacity-40"
      >
        Edit
      </button>
    </div>
  )
}

export function SellingPreferencesPanel({
  listing,
  onChange,
  disabled,
  defaultsReady,
}: {
  listing: Listing
  onChange: (listing: Listing) => void
  disabled?: boolean
  defaultsReady?: boolean
}) {
  const [edit, setEdit] = useState<EditKey>(null)
  const mode = defaultEbayShippingMode(listing.specifics.shippingMode)
  const service =
    listing.specifics.shippingService ||
    listing.specifics.extras?.shippingService ||
    "USPSGroundAdvantage"
  const pkg = listing.specifics.shippingPackage
  const packageMissing = missingShippingPackageFields(pkg)
  const returnsAccepted = listing.specifics.returnsAccepted !== false
  const returnWindow = listing.specifics.returnWindowDays === 60 ? 60 : 30
  const returnPayer =
    listing.specifics.returnShippingPaidBy === "SELLER" ? "SELLER" : "BUYER"
  const allowOffers = listing.specifics.allowOffers === true
  const immediate = listing.specifics.requireImmediatePayment === true
  const promo =
    listing.specifics.promotedListings === "dynamic" ||
    listing.specifics.promotedListings === "custom"
      ? listing.specifics.promotedListings
      : "off"

  const packageSummary =
    packageMissing.length === 0 && pkg
      ? `${pkg.weightPounds ?? 0} lb ${pkg.weightOunces ?? 0} oz · ${pkg.lengthInches}×${pkg.widthInches}×${pkg.heightInches} in`
      : packageMissing.length > 0
        ? `Missing: ${packageMissing.join(", ")}`
        : "Not set"

  const shippingSummary = [
    shippingModeLabel(mode),
    shippingServiceLabel(service),
    shippingWhoPaysLabel(mode),
    mode === "flat" && listing.specifics.flatShippingAmount != null
      ? `$${listing.specifics.flatShippingAmount.toFixed(2)}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ")

  const returnsSummary = returnsAccepted
    ? `${returnWindow} days · ${returnPayer === "BUYER" ? "Buyer" : "Seller"} pays return shipping · Money back`
    : "Returns not accepted"

  const offersSummary = allowOffers
    ? [
        "On",
        listing.specifics.extras?.minOfferAmount
          ? `min $${listing.specifics.extras.minOfferAmount}`
          : null,
        listing.specifics.extras?.minOfferPercent
          ? `min ${listing.specifics.extras.minOfferPercent}%`
          : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "Off"

  const promoSummary =
    promo === "off"
      ? "Off"
      : promo === "dynamic"
        ? "Dynamic ad rate"
        : `Custom ${listing.specifics.promotedListingsPercent ?? "—"}%`

  return (
    <div className="space-y-3 rounded-xl border border-border bg-secondary/20 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Selling preferences</h3>
          <p className="text-xs text-muted-foreground">
            Applied from your defaults — edit any row for this listing only.
          </p>
        </div>
        {!defaultsReady && (
          <Link
            href="/dashboard/selling"
            className="shrink-0 text-xs font-medium underline underline-offset-2"
          >
            Set defaults
          </Link>
        )}
      </div>

      {!defaultsReady && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
          Set your selling defaults once so new listings fill these automatically.
        </p>
      )}

      <div>
        <PrefRow
          label="Handling time"
          value={handlingTimeLabel(listing.specifics.handlingTimeDays ?? 1)}
          disabled={disabled}
          onEdit={() => setEdit(edit === "handling" ? null : "handling")}
        />
        {edit === "handling" && (
          <div className="pb-3">
            <select
              disabled={disabled}
              value={listing.specifics.handlingTimeDays ?? 1}
              onChange={(e) =>
                patchSpecifics(listing, onChange, {
                  handlingTimeDays: Number(e.target.value),
                })
              }
              className="mt-1 flex h-11 w-full rounded-lg border border-input bg-card px-3.5 text-sm"
            >
              {EBAY_HANDLING_TIME_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <PrefRow
          label="Shipping service"
          value={shippingSummary}
          disabled={disabled}
          onEdit={() => setEdit(edit === "shipping" ? null : "shipping")}
        />
        {edit === "shipping" && (
          <div className="space-y-3 pb-3">
            <div className="grid gap-2 sm:grid-cols-3">
              {(["calculated", "flat", "free"] as EbayShippingMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    patchSpecifics(listing, onChange, {
                      shippingMode: m,
                      freeShippingConfirmed:
                        m === "free"
                          ? Boolean(listing.specifics.freeShippingConfirmed)
                          : false,
                    })
                  }
                  className={cn(
                    "rounded-lg border px-2 py-2 text-left text-xs",
                    mode === m
                      ? "border-accent/50 bg-accent/10"
                      : "border-border bg-card"
                  )}
                >
                  {shippingModeLabel(m)}
                </button>
              ))}
            </div>
            <select
              disabled={disabled}
              value={service}
              onChange={(e) =>
                patchSpecifics(listing, onChange, {
                  shippingService: e.target.value,
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
            {mode === "flat" && (
              <div className="space-y-2">
                <Label>Flat amount (USD)</Label>
                <NullableNumberInput
                  min={0}
                  step="0.01"
                  disabled={disabled}
                  value={listing.specifics.flatShippingAmount ?? null}
                  placeholder="e.g. 5.99"
                  onValueChange={(n) =>
                    patchSpecifics(listing, onChange, {
                      flatShippingAmount: n == null ? undefined : n,
                    })
                  }
                />
              </div>
            )}
            {mode === "free" && (
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  disabled={disabled}
                  checked={Boolean(listing.specifics.freeShippingConfirmed)}
                  onChange={(e) =>
                    patchSpecifics(listing, onChange, {
                      freeShippingConfirmed: e.target.checked,
                    })
                  }
                />
                <span>I confirm this listing should use free shipping.</span>
              </label>
            )}
          </div>
        )}

        <PrefRow
          label="Package weight and dimensions"
          value={packageSummary}
          disabled={disabled}
          onEdit={() => setEdit(edit === "package" ? null : "package")}
        />
        {edit === "package" && (
          <div className="grid gap-3 pb-3 sm:grid-cols-2">
            {(
              [
                ["weightPounds", "Pounds", true],
                ["weightOunces", "Ounces (optional)", false],
                ["lengthInches", "Length (in)", false],
                ["widthInches", "Width (in)", false],
                ["heightInches", "Height (in)", false],
              ] as const
            ).map(([key, label, integer]) => {
              const current = listing.specifics.shippingPackage || blankPackage()
              return (
                <div key={key} className="space-y-1">
                  <Label>{label}</Label>
                  <NullableNumberInput
                    integer={integer}
                    min={0}
                    step={integer ? "1" : "0.1"}
                    disabled={disabled}
                    value={current[key]}
                    placeholder=""
                    onValueChange={(n) => {
                      const next = {
                        ...(listing.specifics.shippingPackage || blankPackage()),
                        [key]: n,
                        packageType:
                          listing.specifics.shippingPackage?.packageType ||
                          DEFAULT_EBAY_PACKAGE_TYPE,
                      }
                      patchSpecifics(listing, onChange, {
                        shippingPackage: next,
                      })
                    }}
                  />
                </div>
              )
            })}
          </div>
        )}

        <PrefRow
          label="Returns"
          value={returnsSummary}
          disabled={disabled}
          onEdit={() => setEdit(edit === "returns" ? null : "returns")}
        />
        {edit === "returns" && (
          <div className="space-y-3 pb-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                disabled={disabled}
                checked={returnsAccepted}
                onChange={(e) =>
                  patchSpecifics(listing, onChange, {
                    returnsAccepted: e.target.checked,
                  })
                }
              />
              Accept domestic returns
            </label>
            {returnsAccepted && (
              <div className="grid gap-3 sm:grid-cols-2">
                <select
                  disabled={disabled}
                  value={returnWindow}
                  onChange={(e) =>
                    patchSpecifics(listing, onChange, {
                      returnWindowDays:
                        Number(e.target.value) === 60 ? 60 : 30,
                    })
                  }
                  className="flex h-11 w-full rounded-lg border border-input bg-card px-3.5 text-sm"
                >
                  <option value={30}>30 days</option>
                  <option value={60}>60 days</option>
                </select>
                <select
                  disabled={disabled}
                  value={returnPayer}
                  onChange={(e) =>
                    patchSpecifics(listing, onChange, {
                      returnShippingPaidBy:
                        e.target.value === "SELLER" ? "SELLER" : "BUYER",
                    })
                  }
                  className="flex h-11 w-full rounded-lg border border-input bg-card px-3.5 text-sm"
                >
                  <option value="BUYER">Buyer pays return shipping</option>
                  <option value="SELLER">Seller pays return shipping</option>
                </select>
              </div>
            )}
            <p className="text-xs text-muted-foreground">Refund: Money back</p>
          </div>
        )}

        <PrefRow
          label="Offers"
          value={offersSummary}
          disabled={disabled}
          onEdit={() => setEdit(edit === "offers" ? null : "offers")}
        />
        {edit === "offers" && (
          <div className="space-y-3 pb-3">
            <div className="flex gap-2">
              {([true, false] as const).map((yes) => (
                <button
                  key={yes ? "on" : "off"}
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    patchSpecifics(listing, onChange, { allowOffers: yes })
                  }
                  className={cn(
                    "h-10 flex-1 rounded-lg border text-sm font-medium",
                    allowOffers === yes
                      ? "border-accent/50 bg-accent/15"
                      : "border-border bg-card"
                  )}
                >
                  {yes ? "On" : "Off"}
                </button>
              ))}
            </div>
            {allowOffers && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Min offer ($)</Label>
                  <NullableNumberInput
                    min={0}
                    step="0.01"
                    disabled={disabled}
                    value={
                      listing.specifics.extras?.minOfferAmount
                        ? Number(listing.specifics.extras.minOfferAmount)
                        : null
                    }
                    placeholder="Optional"
                    onValueChange={(n) =>
                      patchSpecifics(listing, onChange, {}, {
                        minOfferAmount: n == null ? undefined : String(n),
                      })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Min offer (%)</Label>
                  <NullableNumberInput
                    min={0}
                    max={100}
                    disabled={disabled}
                    value={
                      listing.specifics.extras?.minOfferPercent
                        ? Number(listing.specifics.extras.minOfferPercent)
                        : null
                    }
                    placeholder="Optional"
                    onValueChange={(n) =>
                      patchSpecifics(listing, onChange, {}, {
                        minOfferPercent: n == null ? undefined : String(n),
                      })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Auto-decline ($)</Label>
                  <NullableNumberInput
                    min={0}
                    step="0.01"
                    disabled={disabled}
                    value={
                      listing.specifics.extras?.autoDeclineAmount
                        ? Number(listing.specifics.extras.autoDeclineAmount)
                        : null
                    }
                    placeholder="Optional"
                    onValueChange={(n) =>
                      patchSpecifics(listing, onChange, {}, {
                        autoDeclineAmount: n == null ? undefined : String(n),
                      })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Auto-decline (%)</Label>
                  <NullableNumberInput
                    min={0}
                    max={100}
                    disabled={disabled}
                    value={
                      listing.specifics.extras?.autoDeclinePercent
                        ? Number(listing.specifics.extras.autoDeclinePercent)
                        : null
                    }
                    placeholder="Optional"
                    onValueChange={(n) =>
                      patchSpecifics(listing, onChange, {}, {
                        autoDeclinePercent: n == null ? undefined : String(n),
                      })
                    }
                  />
                </div>
              </div>
            )}
          </div>
        )}

        <PrefRow
          label="Immediate payment"
          value={immediate ? "Required" : "Off"}
          disabled={disabled}
          onEdit={() => setEdit(edit === "payment" ? null : "payment")}
        />
        {edit === "payment" && (
          <label className="flex items-center gap-2 pb-3 text-sm">
            <input
              type="checkbox"
              disabled={disabled}
              checked={immediate}
              onChange={(e) =>
                patchSpecifics(listing, onChange, {
                  requireImmediatePayment: e.target.checked,
                })
              }
            />
            Require immediate payment
          </label>
        )}

        <PrefRow
          label="Promoted listing"
          value={promoSummary}
          disabled={disabled}
          onEdit={() => setEdit(edit === "promoted" ? null : "promoted")}
        />
        {edit === "promoted" && (
          <div className="space-y-3 pb-3">
            <div className="grid gap-2 sm:grid-cols-3">
              {(
                [
                  ["off", "Off"],
                  ["dynamic", "Dynamic"],
                  ["custom", "Custom %"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    patchSpecifics(listing, onChange, {
                      promotedListings: value,
                    })
                  }
                  className={cn(
                    "rounded-lg border px-2 py-2 text-xs font-medium",
                    promo === value
                      ? "border-accent/50 bg-accent/10"
                      : "border-border bg-card"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {promo === "custom" && (
              <div className="space-y-1">
                <Label>Ad rate % (2–100)</Label>
                <NullableNumberInput
                  min={2}
                  max={100}
                  step="0.1"
                  disabled={disabled}
                  value={listing.specifics.promotedListingsPercent ?? null}
                  placeholder="e.g. 5"
                  onValueChange={(n) =>
                    patchSpecifics(listing, onChange, {
                      promotedListingsPercent: n == null ? undefined : n,
                    })
                  }
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
