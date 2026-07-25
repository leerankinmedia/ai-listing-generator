import type {
  Listing,
  MarketplaceListingRef,
  OneClickPublishResult,
} from "@/lib/types"

/**
 * Merge successful marketplace publish refs into the ListWise listing.
 * Re-publishing the same marketplace updates the existing ref (no duplicates).
 */
export function applyPublishResultsToListing(
  listing: Listing,
  results: OneClickPublishResult[],
  userId: string
): Listing {
  const publishedAt = new Date().toISOString()
  const marketplaceListings = [...(listing.marketplaceListings || [])]

  for (const result of results) {
    if (!result.ok || !result.listingRef) continue
    const incoming: MarketplaceListingRef = {
      ...result.listingRef,
      lastSyncedAt: result.listingRef.lastSyncedAt || publishedAt,
    }
    const index = marketplaceListings.findIndex(
      (row) => row.marketplaceId === incoming.marketplaceId
    )
    if (index >= 0) {
      marketplaceListings[index] = {
        ...marketplaceListings[index],
        ...incoming,
      }
    } else {
      marketplaceListings.push(incoming)
    }
  }

  const hasListed = marketplaceListings.some((row) => row.status === "listed")
  const targetMarketplaces = Array.from(
    new Set([
      ...(listing.targetMarketplaces || []),
      ...marketplaceListings.map((row) => row.marketplaceId),
    ])
  )

  return {
    ...listing,
    userId: listing.userId || userId,
    status: hasListed ? "listed" : listing.status,
    marketplaceListings,
    targetMarketplaces,
    updatedAt: publishedAt,
  }
}

export function publishResultsIncludeSuccess(
  results: OneClickPublishResult[]
): boolean {
  return results.some((result) => result.ok && Boolean(result.listingRef))
}
