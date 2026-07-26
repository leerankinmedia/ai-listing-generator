import { MARKETPLACES } from "@/lib/marketplaces"
import type { Listing, MarketplaceId } from "@/lib/types"

export interface RecentSale {
  id: string
  listingId: string
  title: string
  photoUrl: string | null
  soldPrice: number
  soldAt: string
  marketplaceId: MarketplaceId
  marketplaceName: string
}

function marketplaceName(id: MarketplaceId) {
  return MARKETPLACES.find((m) => m.id === id)?.name || id
}

function listingTouchesEbay(listing: Listing) {
  if ((listing.targetMarketplaces || []).includes("ebay")) return true
  return (listing.marketplaceListings || []).some((ref) => ref.marketplaceId === "ebay")
}

/**
 * Latest eBay sold items from the user's saved listings.
 * Prefers marketplace refs marked sold on eBay; falls back to listing.status=sold
 * when the listing is tied to eBay.
 */
export function getLatestEbaySales(listings: Listing[], limit = 3): RecentSale[] {
  const sales: RecentSale[] = []

  for (const listing of listings) {
    const ebaySoldRefs = (listing.marketplaceListings || []).filter(
      (ref) => ref.marketplaceId === "ebay" && ref.status === "sold"
    )

    if (ebaySoldRefs.length > 0) {
      for (const ref of ebaySoldRefs) {
        sales.push({
          id: `${listing.id}:ebay:${ref.externalId || "sold"}`,
          listingId: listing.id,
          title: listing.title || "Untitled",
          photoUrl: listing.images?.[0]?.url || null,
          soldPrice: Number(ref.price ?? listing.price) || 0,
          soldAt: ref.lastSyncedAt || listing.updatedAt || listing.createdAt,
          marketplaceId: "ebay",
          marketplaceName: marketplaceName("ebay"),
        })
      }
      continue
    }

    if (listing.status === "sold" && listingTouchesEbay(listing)) {
      sales.push({
        id: `${listing.id}:ebay`,
        listingId: listing.id,
        title: listing.title || "Untitled",
        photoUrl: listing.images?.[0]?.url || null,
        soldPrice: Number(listing.price) || 0,
        soldAt: listing.updatedAt || listing.createdAt,
        marketplaceId: "ebay",
        marketplaceName: marketplaceName("ebay"),
      })
    }
  }

  return sales
    .sort(
      (a, b) => new Date(b.soldAt).getTime() - new Date(a.soldAt).getTime()
    )
    .slice(0, limit)
}

export function formatSoldDate(iso: string) {
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return "—"
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}
