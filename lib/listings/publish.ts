import type { Listing, MarketplaceId, PublishReadyListing } from "@/lib/types"
import { getMarketplace } from "@/lib/marketplaces"
import {
  formatMissingShippingPackageMessage,
  missingShippingPackageFields,
} from "@/lib/listings/shipping-package"

/**
 * Maps a saved listing into a publish-ready payload for a marketplace adapter.
 * Phase 3+ adapters will consume this shape.
 */
export function toPublishReadyListing(
  listing: Listing,
  marketplaceId: MarketplaceId
): PublishReadyListing {
  return {
    listing,
    marketplaceId,
    overrides: undefined,
  }
}

export function getPublishTargets(listing: Listing) {
  return listing.targetMarketplaces.map((id) => {
    const def = getMarketplace(id)
    const existing = listing.marketplaceListings.find((m) => m.marketplaceId === id)
    return {
      id,
      name: def?.name ?? id,
      color: def?.color ?? "#888",
      status: existing?.status ?? ("draft" as const),
      connected: false,
    }
  })
}

/** Base listing completeness (title, description, price, photos). */
export function listingHasCorePublishFields(listing: Listing) {
  return Boolean(
    listing.title.trim() &&
      listing.description.trim() &&
      listing.price > 0 &&
      listing.images.length > 0
  )
}

/**
 * eBay requires package weight/dims (error 25020). Never invent them —
 * return exact missing field labels for the UI.
 */
export function missingEbayPublishFields(listing: Listing): string[] {
  return missingShippingPackageFields(listing.specifics.shippingPackage)
}

export function ebayShippingPackageBlockMessage(listing: Listing): string | null {
  const missing = missingEbayPublishFields(listing)
  if (missing.length === 0) return null
  return formatMissingShippingPackageMessage(missing)
}

/**
 * Ready to save as "ready" / publish to non-eBay markets.
 * eBay package weight is enforced separately when eBay is selected.
 */
export function listingIsReadyToPublish(listing: Listing) {
  return listingHasCorePublishFields(listing)
}

/** True when the listing can be sent to the given marketplaces. */
export function listingCanPublishTo(
  listing: Listing,
  marketplaceIds: MarketplaceId[]
): { ok: boolean; message?: string } {
  if (!listingHasCorePublishFields(listing)) {
    return {
      ok: false,
      message:
        "Listing needs title, description, price, and at least one photo.",
    }
  }
  if (marketplaceIds.includes("ebay")) {
    const block = ebayShippingPackageBlockMessage(listing)
    if (block) return { ok: false, message: block }
  }
  return { ok: true }
}
