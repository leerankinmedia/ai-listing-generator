import type {
  Listing,
  MarketplaceId,
  OneClickPublishRequest,
  OneClickPublishResult,
  PublishReadyListing,
} from "@/lib/types"
import { getMarketplace } from "@/lib/marketplaces"
import { listingIsReadyToPublish } from "@/lib/listings/publish"

/**
 * One-click publish orchestration.
 * Marketplace adapters plug into this service; until connected, jobs are queued.
 */
export async function publishListingOneClick(
  listing: Listing,
  request: Omit<OneClickPublishRequest, "listingId">
): Promise<OneClickPublishResult[]> {
  if (!listingIsReadyToPublish(listing)) {
    return request.marketplaceIds.map((marketplaceId) => ({
      marketplaceId,
      ok: false,
      status: "error" as const,
      message: "Listing needs title, description, price, and at least one photo.",
    }))
  }

  const results: OneClickPublishResult[] = []

  for (const marketplaceId of request.marketplaceIds) {
    const payload = toPublishPayload(listing, marketplaceId)
    const def = getMarketplace(marketplaceId)

    // Adapter hook — replace with real OAuth + API publish in Phase 4+
    results.push({
      marketplaceId,
      ok: true,
      status: "queued",
      message: `${def?.name ?? marketplaceId} publish queued. Connect the ${marketplaceId} adapter to go live.`,
      listingRef: {
        marketplaceId,
        status: "draft",
        price: payload.overrides?.price ?? listing.price,
      },
    })
  }

  return results
}

export function toPublishPayload(
  listing: Listing,
  marketplaceId: MarketplaceId
): PublishReadyListing {
  return {
    listing,
    marketplaceId,
    overrides: undefined,
  }
}

export function buildPublishJob(listing: Listing, marketplaceIds: MarketplaceId[]) {
  return {
    listingId: listing.id,
    createdAt: new Date().toISOString(),
    targets: marketplaceIds.map((marketplaceId) =>
      toPublishPayload(listing, marketplaceId)
    ),
  }
}
