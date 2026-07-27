import { createHash } from "node:crypto"
import type { Listing, ListingImage, ListingStatus } from "@/lib/types"

export type EbayOfferRaw = {
  offerId?: string
  sku?: string
  marketplaceId?: string
  format?: string
  status?: string
  categoryId?: string
  availableQuantity?: number
  listing?: {
    listingId?: string
    listingStatus?: string
    soldQuantity?: number
  }
  pricingSummary?: {
    price?: {
      value?: string
      currency?: string
    }
  }
}

export type EbayInventoryItemRaw = {
  sku?: string
  condition?: string
  availability?: {
    shipToLocationAvailability?: {
      quantity?: number
    }
  }
  product?: {
    title?: string
    description?: string
    imageUrls?: string[]
    aspects?: Record<string, string[]>
  }
}

export type EbayImportedOffer = {
  offerId: string
  sku: string
  ebayListingId: string
  title: string
  description: string
  price: number
  currency: string
  quantity: number
  categoryId: string
  imageUrls: string[]
  brand?: string
  condition?: string
  listingStatus: string
  offerStatus: string
}

export const EBAY_IMPORT_PAGE_SIZE = 25

/** Deterministic ListWise listing id for an eBay listing (stable re-imports). */
export function listingIdForEbayImport(
  userId: string,
  ebayListingId: string
): string {
  const hex = createHash("sha256")
    .update(`ebay-import:${userId}:${ebayListingId}`)
    .digest("hex")
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `a${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-")
}

export function ebayItemBrowseUrl(
  ebayListingId: string,
  env: "sandbox" | "production" = "production"
): string {
  const site =
    env === "sandbox" ? "https://sandbox.ebay.com" : "https://www.ebay.com"
  return `${site}/itm/${ebayListingId}`
}

export function firstAspect(
  aspects: Record<string, string[]> | undefined,
  key: string
): string | undefined {
  if (!aspects) return undefined
  const direct = aspects[key]?.[0]?.trim()
  if (direct) return direct
  const match = Object.entries(aspects).find(
    ([k]) => k.toLowerCase() === key.toLowerCase()
  )
  return match?.[1]?.[0]?.trim() || undefined
}

export function isActivePublishedOffer(offer: EbayOfferRaw): boolean {
  const offerStatus = (offer.status || "").toUpperCase()
  const listingStatus = (offer.listing?.listingStatus || "").toUpperCase()
  const listingId = offer.listing?.listingId?.trim()
  if (!listingId || !offer.sku?.trim() || !offer.offerId?.trim()) return false
  if (offerStatus === "PUBLISHED") return true
  return listingStatus === "ACTIVE"
}

export function mapEbayImportToListing(input: {
  userId: string
  imported: EbayImportedOffer
  nowIso?: string
  ebayEnv?: "sandbox" | "production"
}): Listing {
  const now = input.nowIso || new Date().toISOString()
  const { imported, userId } = input
  const images: ListingImage[] = (imported.imageUrls || [])
    .filter((url) => typeof url === "string" && /^https?:\/\//i.test(url))
    .slice(0, 24)
    .map((url, index) => ({
      id: `${imported.ebayListingId}-img-${index}`,
      url,
      sortOrder: index,
      isPrimary: index === 0,
    }))

  const status: ListingStatus =
    imported.listingStatus.toUpperCase() === "ACTIVE" ||
    imported.offerStatus.toUpperCase() === "PUBLISHED"
      ? "listed"
      : "ready"

  return {
    id: listingIdForEbayImport(userId, imported.ebayListingId),
    userId,
    title: (imported.title || `eBay listing ${imported.ebayListingId}`).slice(
      0,
      80
    ),
    description: imported.description || "",
    price: Number.isFinite(imported.price) ? imported.price : 0,
    currency: imported.currency || "USD",
    keywords: [],
    specifics: {
      brand: imported.brand,
      condition: imported.condition,
      category: imported.categoryId
        ? `eBay category ${imported.categoryId}`
        : undefined,
      extras: {
        sku: imported.sku,
        quantity: String(Math.max(0, imported.quantity)),
        ebaySku: imported.sku,
        ebayQuantity: String(Math.max(0, imported.quantity)),
        ebayListingId: imported.ebayListingId,
        ebayOfferId: imported.offerId,
        ebayCategoryId: imported.categoryId,
        source: "ebay_import",
      },
    },
    fieldConfidence: {},
    images,
    status,
    marketplaceListings: [
      {
        marketplaceId: "ebay",
        externalId: imported.ebayListingId,
        url: ebayItemBrowseUrl(imported.ebayListingId, input.ebayEnv),
        status,
        price: Number.isFinite(imported.price) ? imported.price : undefined,
        lastSyncedAt: now,
      },
    ],
    targetMarketplaces: ["ebay"],
    aiGenerated: false,
    analysisMeta: {
      imagesAnalyzed: images.length,
      model: "ebay_import",
      analyzedAt: now,
    },
    createdAt: now,
    updatedAt: now,
  }
}
