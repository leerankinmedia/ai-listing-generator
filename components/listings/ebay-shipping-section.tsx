"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  shippingModeDescription,
  shippingModeLabel,
  defaultEbayShippingMode,
  type EbayShippingMode,
} from "@/lib/marketplaces/adapters/ebay/fulfillment-shipping"
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
}: {
  listing: Listing
  onChange: (listing: Listing) => void
  disabled?: boolean
}) {
  const mode = defaultEbayShippingMode(listing.specifics.shippingMode)
  const flatAmount = listing.specifics.flatShippingAmount ?? 5.99
  const freeConfirmed = Boolean(listing.specifics.freeShippingConfirmed)
  const handlingDays =
    typeof listing.specifics.handlingTimeDays === "number" &&
    listing.specifics.handlingTimeDays >= 0
      ? listing.specifics.handlingTimeDays
      : 1

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Shipping</h3>
        <p className="text-xs text-muted-foreground">
          Choose Calculated, Flat, or Free. ListWise applies the right eBay shipping
          settings automatically.
        </p>
      </div>

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
          <Input
            id="flat-shipping-amount"
            type="number"
            min={0.01}
            step={0.01}
            disabled={disabled}
            value={flatAmount}
            onChange={(e) =>
              patchSpecifics(listing, onChange, {
                flatShippingAmount: Number(e.target.value) || 0,
              })
            }
          />
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="handling-time-days">Handling time (business days)</Label>
        <Input
          id="handling-time-days"
          type="number"
          min={0}
          max={30}
          step={1}
          disabled={disabled}
          value={handlingDays}
          onChange={(e) =>
            patchSpecifics(listing, onChange, {
              handlingTimeDays: Math.max(
                0,
                Math.min(30, Math.floor(Number(e.target.value) || 0))
              ),
            })
          }
        />
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

/** Compact summary above Publish — options, weight, dimensions, handling only. */
export function EbayShippingPublishSummary({ listing }: { listing: Listing }) {
  const mode = defaultEbayShippingMode(listing.specifics.shippingMode)
  const pkg = listing.specifics.shippingPackage
  const handlingDays =
    typeof listing.specifics.handlingTimeDays === "number"
      ? listing.specifics.handlingTimeDays
      : 1
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
        <li>
          Handling time:{" "}
          {handlingDays === 1 ? "1 business day" : `${handlingDays} business days`}
        </li>
        <li>Weight: {weight}</li>
        <li>Dimensions: {dims}</li>
      </ul>
    </div>
  )
}
