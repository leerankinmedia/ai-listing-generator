"use client"

import { useState } from "react"
import Link from "next/link"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NullableNumberInput } from "@/components/ui/nullable-number-input"
import {
  EBAY_HANDLING_TIME_OPTIONS,
  EBAY_SHIPPING_SERVICE_OPTIONS,
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

type EditKey = "returns" | "offers" | "payment" | "promoted" | null

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
  editing,
}: {
  label: string
  value: string
  onEdit: () => void
  disabled?: boolean
  editing?: boolean
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
        aria-expanded={editing}
        onClick={onEdit}
        className="shrink-0 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground hover:bg-secondary disabled:opacity-40"
      >
        {editing ? "Done" : "Edit"}
      </button>
    </div>
  )
}

/**
 * Single shipping + selling preferences block for Publish.
 * Package fields stay visible and editable — never require leaving this page.
 */
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
  const pkg = listing.specifics.shippingPackage || blankPackage()
  const packageMissing = missingShippingPackageFields(
    listing.specifics.shippingPackage
  )
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

  function patchPackage(partial: Partial<ShippingPackage>) {
    const current = listing.specifics.shippingPackage || blankPackage()
    patchSpecifics(listing, onChange, {
      shippingPackage: {
        ...current,
        ...partial,
        packageType: current.packageType || DEFAULT_EBAY_PACKAGE_TYPE,
      },
    })
  }

  return (
    <div className="space-y-4">
      {!defaultsReady && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
          Set your selling defaults once so these fields fill automatically.{" "}
          <Link href="/dashboard/selling" className="underline underline-offset-2">
            Open Selling Preferences
          </Link>
        </p>
      )}

      <section className="space-y-3 rounded-xl border border-border bg-secondary/20 p-3">
        <div>
          <h3 className="text-sm font-semibold">Shipping package</h3>
          <p className="text-xs text-muted-foreground">
            Auto-filled from your defaults — edit here for this listing only.
            {packageMissing.length > 0
              ? ` Missing: ${packageMissing.join(", ")}.`
              : ""}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="pref-handling">Handling time</Label>
            <select
              id="pref-handling"
              disabled={disabled}
              value={listing.specifics.handlingTimeDays ?? 1}
              onChange={(e) =>
                patchSpecifics(listing, onChange, {
                  handlingTimeDays: Number(e.target.value),
                })
              }
              className="flex h-11 w-full rounded-lg border border-input bg-card px-3.5 text-sm"
            >
              {EBAY_HANDLING_TIME_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pref-service">Shipping service</Label>
            <select
              id="pref-service"
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
          </div>
        </div>

        <div className="space-y-2">
          <Label>Shipping type</Label>
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
                <span className="font-medium">{shippingModeLabel(m)}</span>
                <span className="mt-0.5 block text-[10px] text-muted-foreground">
                  {shippingWhoPaysLabel(m)}
                </span>
              </button>
            ))}
          </div>
        </div>

        {mode === "flat" && (
          <div className="space-y-1.5">
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

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="pref-lb">Weight pounds</Label>
            <NullableNumberInput
              id="pref-lb"
              integer
              min={0}
              disabled={disabled}
              value={pkg.weightPounds}
              placeholder="e.g. 1"
              onValueChange={(n) => patchPackage({ weightPounds: n })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pref-oz">Weight ounces</Label>
            <NullableNumberInput
              id="pref-oz"
              min={0}
              step="0.1"
              disabled={disabled}
              value={pkg.weightOunces}
              placeholder="e.g. 0"
              onValueChange={(n) => patchPackage({ weightOunces: n })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pref-len">Length (in)</Label>
            <NullableNumberInput
              id="pref-len"
              min={0}
              step="0.1"
              disabled={disabled}
              value={pkg.lengthInches}
              placeholder="e.g. 12"
              onValueChange={(n) => patchPackage({ lengthInches: n })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pref-wid">Width (in)</Label>
            <NullableNumberInput
              id="pref-wid"
              min={0}
              step="0.1"
              disabled={disabled}
              value={pkg.widthInches}
              placeholder="e.g. 9"
              onValueChange={(n) => patchPackage({ widthInches: n })}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2 sm:max-w-[50%]">
            <Label htmlFor="pref-hei">Height (in)</Label>
            <NullableNumberInput
              id="pref-hei"
              min={0}
              step="0.1"
              disabled={disabled}
              value={pkg.heightInches}
              placeholder="e.g. 1"
              onValueChange={(n) => patchPackage({ heightInches: n })}
            />
          </div>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            disabled={disabled}
            checked={Boolean(pkg.irregularPackage)}
            onChange={(e) => patchPackage({ irregularPackage: e.target.checked })}
          />
          <span>Irregular package</span>
        </label>
        <div className="space-y-1.5">
          <Label htmlFor="pref-zip">Item location ZIP</Label>
          <Input
            id="pref-zip"
            inputMode="numeric"
            disabled={disabled}
            value={
              listing.specifics.itemLocationZip ||
              listing.specifics.extras?.itemLocationZip ||
              ""
            }
            placeholder="e.g. 43604"
            onChange={(e) => {
              const zip = e.target.value.replace(/\D/g, "").slice(0, 10)
              patchSpecifics(
                listing,
                onChange,
                { itemLocationZip: zip || undefined },
                { itemLocationZip: zip || undefined }
              )
            }}
            className="h-11 max-w-[12rem]"
          />
        </div>
      </section>

      <section className="space-y-1 rounded-xl border border-border bg-secondary/20 p-3">
        <div className="mb-1">
          <h3 className="text-sm font-semibold">Selling preferences</h3>
          <p className="text-xs text-muted-foreground">
            Tap Edit to change Returns, Offers, Immediate payment, or Promoted
            listing for this item only — stays on this page.
          </p>
        </div>

        <PrefRow
          label="Returns"
          value={returnsSummary}
          disabled={disabled}
          editing={edit === "returns"}
          onEdit={() => setEdit(edit === "returns" ? null : "returns")}
        />
        {edit === "returns" && (
          <div className="mb-2 space-y-3 rounded-lg border border-border bg-card p-3">
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
          editing={edit === "offers"}
          onEdit={() => setEdit(edit === "offers" ? null : "offers")}
        />
        {edit === "offers" && (
          <div className="mb-2 space-y-3 rounded-lg border border-border bg-card p-3">
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
          editing={edit === "payment"}
          onEdit={() => setEdit(edit === "payment" ? null : "payment")}
        />
        {edit === "payment" && (
          <div className="mb-2 rounded-lg border border-border bg-card p-3">
            <label className="flex items-center gap-2 text-sm">
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
          </div>
        )}

        <PrefRow
          label="Promoted listing"
          value={promoSummary}
          disabled={disabled}
          editing={edit === "promoted"}
          onEdit={() => setEdit(edit === "promoted" ? null : "promoted")}
        />
        {edit === "promoted" && (
          <div className="mb-2 space-y-3 rounded-lg border border-border bg-card p-3">
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
            {promo !== "off" && (
              <p className="text-xs text-muted-foreground">
                Promotion uses eBay Marketing separately from listing creation. If
                permission is missing, the listing still publishes — reconnect eBay
                with marketing from{" "}
                <Link
                  href="/dashboard/connections?marketing=1"
                  className="underline underline-offset-2"
                >
                  Connections
                </Link>
                .
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
