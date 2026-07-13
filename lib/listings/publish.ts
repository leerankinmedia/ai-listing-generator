import type { Listing, MarketplaceId, PublishReadyListing } from "@/lib/types"
import { getMarketplace } from "@/lib/marketplaces"

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

export function listingIsReadyToPublish(listing: Listing) {
  return Boolean(
    listing.title.trim() &&
      listing.description.trim() &&
      listing.price > 0 &&
      listing.images.length > 0
  )
}
