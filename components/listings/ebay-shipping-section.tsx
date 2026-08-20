"use client"

import { Label } from "@/components/ui/label"
import { NullableNumberInput } from "@/components/ui/nullable-number-input"
import {
  shippingModeDescription,
  shippingModeLabel,
  defaultEbayShippingMode,
  type EbayShippingMode,
} from "@/lib/marketplaces/adapters/ebay/fulfillment-shipping"
import {
  EBAY_HANDLING_TIME_OPTIONS,
  handlingTimeLabel,
  shippingServiceLabel,
} from "@/lib/seller/ebay-defaults"
import { listingShippingServiceCode } from "@/lib/listings/listing-shipping"
import type { Listing } from "@/lib/types"
import { cn } from "@/lib/utils"

const MODES: EbayShippingMode[] = ["calculated", "flat", "free"]

function patchSpecifics(
  listing: Listing,
  onChange: (listing: Listing) => void,
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

/** Simple shipping options — never exposes eBay business policies. */
export function EbayShippingModeFields({
  listing,
  onChange,
  disabled,
  compact,
}: {
  listing: Listing
  onChange: (listing: Listing) => void
  disabled?: boolean
  /** Hide the section heading when nested under Publish shipping. */
  compact?: boolean
}) {
  const mode = defaultEbayShippingMode(listing.specifics.shippingMode)
  const flatAmount = listing.specifics.flatShippingAmount
  const freeConfirmed = Boolean(listing.specifics.freeShippingConfirmed)

  return (
    <div className="space-y-4">
      {!compact && (
        <div>
          <h3 className="text-sm font-semibold">Shipping</h3>
          <p className="text-xs text-muted-foreground">
            Choose Calculated, Flat, or Free. ListWise applies the right eBay shipping
            settings automatically.
          </p>
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-3">
        {MODES.map((value) => {
          const active = mode === value
          return (
            <button
              key={value}
              type="button"
              disabled={disabled}
              onClick={() =>
                patchSpecifics(listing, onChange, {
                  shippingMode: value,
                  freeShippingConfirmed: value === "free" ? freeConfirmed : false,
                })
              }
              className={cn(
                "rounded-xl border px-3 py-3 text-left transition-colors",
                active
                  ? "border-accent/50 bg-accent/10"
                  : "border-border bg-card/60 hover:border-accent/30",
                disabled && "cursor-not-allowed opacity-60"
              )}
            >
              <span className="block text-sm font-medium">
                {shippingModeLabel(value)}
              </span>
              <span className="mt-1 block text-[11px] leading-snug text-muted-foreground">
                {shippingModeDescription(value)}
              </span>
            </button>
          )
        })}
      </div>

      {mode === "flat" && (
        <div className="space-y-2">
          <Label htmlFor="flat-shipping-amount">Flat shipping amount (USD)</Label>
          <NullableNumberInput
            id="flat-shipping-amount"
            min={0}
            step="0.01"
            disabled={disabled}
            value={flatAmount ?? null}
            placeholder="e.g. 5.99"
            onValueChange={(n) =>
              patchSpecifics(listing, onChange, {
                flatShippingAmount: n == null ? undefined : n,
              })
            }
          />
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="handling-time-days">Handling time</Label>
        <select
          id="handling-time-days"
          disabled={disabled}
          value={
            typeof listing.specifics.handlingTimeDays === "number" &&
            Number.isFinite(listing.specifics.handlingTimeDays)
              ? listing.specifics.handlingTimeDays
              : 1
          }
          onChange={(e) =>
            patchSpecifics(listing, onChange, {
              handlingTimeDays: Number(e.target.value),
            })
          }
          className="flex h-11 w-full rounded-lg border border-input bg-card px-3.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {EBAY_HANDLING_TIME_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {mode === "free" && (
        <div className="space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
          <p className="text-sm text-amber-900 dark:text-amber-100">
            Free shipping means you pay postage. Confirm before publishing.
          </p>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              disabled={disabled}
              checked={freeConfirmed}
              onChange={(e) =>
                patchSpecifics(listing, onChange, {
                  freeShippingConfirmed: e.target.checked,
                })
              }
            />
            <span>I confirm this listing should use free shipping.</span>
          </label>
        </div>
      )}
    </div>
  )
}

/** Compact summary — kept for non-publish surfaces; Publish uses Selling preferences only. */
export function EbayShippingPublishSummary({ listing }: { listing: Listing }) {
  const mode = defaultEbayShippingMode(listing.specifics.shippingMode)
  const pkg = listing.specifics.shippingPackage
  const handlingDays =
    typeof listing.specifics.handlingTimeDays === "number"
      ? listing.specifics.handlingTimeDays
      : 1
  const service = listingShippingServiceCode(listing)
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
        <li>
          Shipping: {shippingModeLabel(mode)}
          {mode === "flat"
            ? ` · $${(listing.specifics.flatShippingAmount ?? 5.99).toFixed(2)}`
            : ""}
        </li>
        <li>Service: {service ? shippingServiceLabel(service) : "Default"}</li>
        <li>Handling: {handlingTimeLabel(handlingDays)}</li>
        <li>Weight: {weight}</li>
        <li>Dimensions: {dims}</li>
      </ul>
    </div>
  )
}
