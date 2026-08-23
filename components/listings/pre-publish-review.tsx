"use client"

import { useMemo } from "react"
import {
  ebayFreeShippingBlockMessage,
  ebayShippingPackageBlockMessage,
} from "@/lib/listings/publish"
import { defaultEbayShippingMode, shippingModeLabel } from "@/lib/marketplaces/adapters/ebay/fulfillment-shipping"
import { resolveListingSku } from "@/lib/listings/sku"
import type { Listing } from "@/lib/types"

export function PrePublishReviewCard({
  listing,
  missingAspects = [],
  aspectFilledCount,
  aspectTotalCount,
  aspectsLoaded,
}: {
  listing: Listing
  missingAspects?: string[]
  aspectFilledCount?: number
  aspectTotalCount?: number
  /** False until eBay item specifics have been hydrated (total > 0). */
  aspectsLoaded?: boolean
}) {
  const cover =
    listing.images.find((i) => i.isPrimary) ||
    [...listing.images].sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
    )[0]
  const sku = resolveListingSku(listing) || "Optional"
  const qty = Number(listing.specifics.extras?.quantity ?? 1)
  const mode = defaultEbayShippingMode(listing.specifics.shippingMode)
  const pkg = listing.specifics.shippingPackage
  const packageBlock = ebayShippingPackageBlockMessage(listing)
  const freeBlock = ebayFreeShippingBlockMessage(listing)
  const filled =
    typeof aspectFilledCount === "number" ? aspectFilledCount : undefined
  const total =
    typeof aspectTotalCount === "number" ? aspectTotalCount : undefined
  const loaded =
    aspectsLoaded === true ||
    (typeof total === "number" && total > 0)

  const missing = useMemo(() => {
    const out: string[] = []
    if (!listing.title.trim()) out.push("title")
    if (!(listing.price > 0)) out.push("price")
    if (listing.images.length === 0) out.push("photos")
    if (packageBlock) out.push("shipping package")
    if (freeBlock) out.push("free shipping confirmation")
    if (!loaded) out.push("item specifics (still loading)")
    for (const name of missingAspects) out.push(name)
    return out
  }, [listing, packageBlock, freeBlock, missingAspects, loaded])

  const specificsLabel = !loaded
    ? typeof total === "number"
      ? `${filled ?? 0}/${total} item specifics — still loading`
      : "Item specifics still loading"
    : typeof filled === "number" && typeof total === "number"
      ? `${filled}/${total} item specifics filled`
      : missingAspects.length > 0
        ? `${missingAspects.length} required specific(s) still missing`
        : "Item specifics ready"

  const ready = missing.length === 0 && loaded

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card/80 p-3 sm:p-4">
      <div>
        <h3 className="text-sm font-semibold">Pre-publish review</h3>
        <p className="text-xs text-muted-foreground">
          Final check before sending to eBay — fix anything missing here in ListWise.
        </p>
      </div>

      <div className="flex gap-3">
        {cover?.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover.url}
            alt="Cover"
            className="h-20 w-20 shrink-0 rounded-lg object-cover [image-orientation:none]"
          />
        ) : (
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-secondary text-xs text-muted-foreground">
            No cover
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-1 text-xs text-muted-foreground">
          <p className="text-sm font-medium text-foreground line-clamp-2">
            {listing.title || "Untitled"}
          </p>
          <p>
            {listing.title.length}/80 · $
            {listing.price > 0 ? listing.price.toFixed(2) : "—"} · Qty{" "}
            {Number.isFinite(qty) ? qty : 1}
          </p>
          <p>
            Offers: {listing.specifics.allowOffers ? "Yes" : "No"} · SKU: {sku}
          </p>
          <p>
            Photos: {listing.images.length} · Cover is image 1
          </p>
        </div>
      </div>

      <ul className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
        <li>Item specifics: {specificsLabel}</li>
        <li>
          Shipping: {shippingModeLabel(mode)}
          {pkg
            ? ` · ${pkg.weightPounds || 0}lb ${pkg.weightOunces || 0}oz · ${pkg.lengthInches}×${pkg.widthInches}×${pkg.heightInches}in`
            : " · package not set"}
        </li>
        <li>
          Handling:{" "}
          {typeof listing.specifics.handlingTimeDays === "number"
            ? `${listing.specifics.handlingTimeDays} day(s)`
            : "1 day (default)"}
        </li>
        <li>
          Promoted:{" "}
          {listing.specifics.promotedListings === "dynamic"
            ? "Dynamic"
            : listing.specifics.promotedListings === "custom"
              ? `Custom ${listing.specifics.promotedListingsPercent ?? "—"}%`
              : "Off"}
        </li>
      </ul>

      {ready ? (
        <p className="text-xs text-muted-foreground">Ready to publish.</p>
      ) : (
        <p className="text-sm text-amber-800 dark:text-amber-200" role="status">
          Missing before publish: {missing.join(", ") || "item specifics"}.
        </p>
      )}
    </div>
  )
}
