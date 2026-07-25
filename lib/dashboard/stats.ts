import { MARKETPLACES } from "@/lib/marketplaces"
import type { Listing, MarketplaceId } from "@/lib/types"

export const DASHBOARD_MARKETPLACE_TOTAL = MARKETPLACES.length

/** Listings that are live / listed on a marketplace (not drafts). */
export function countActiveListings(listings: Listing[]): number {
  return listings.filter((listing) => {
    if (listing.status === "listed") return true
    return (listing.marketplaceListings || []).some(
      (ref) => ref.status === "listed"
    )
  }).length
}

export function countConnectedShops(
  connectedMarketplaceIds: Iterable<MarketplaceId | string>
): number {
  const set = new Set(
    [...connectedMarketplaceIds].map((id) => String(id).toLowerCase())
  )
  return MARKETPLACES.filter((m) => set.has(m.id)).length
}

export function formatConnectedShopsLabel(connectedCount: number): string {
  return `${connectedCount} / ${DASHBOARD_MARKETPLACE_TOTAL}`
}
