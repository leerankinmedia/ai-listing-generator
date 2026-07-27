import { createHash } from "node:crypto"
import type {
  ItemCondition,
  Listing,
  ListingImage,
  ListingSpecifics,
  ListingStatus,
} from "@/lib/types"

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

export type EbayImportDetailStatus =
  | "full"
  | "partial"
  | "summary_only"
  | "error"

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
  categoryName?: string
  categoryPath?: string
  imageUrls: string[]
  brand?: string
  condition?: string
  conditionId?: string
  conditionDescription?: string
  listingStatus: string
  offerStatus: string
  listingFormat?: string
  startTime?: string
  endTime?: string
  shippingType?: string
  shippingCost?: string
  shippingService?: string
  /** Raw eBay item specifics (Name → Value). */
  itemSpecifics?: Record<string, string>
  detailStatus?: EbayImportDetailStatus
  detailError?: string
}

export const EBAY_IMPORT_PAGE_SIZE = 20

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
  // Seller SKU may be blank/invalid for Inventory API — still import via listing/offer ids.
  if (!listingId || !offer.offerId?.trim()) return false
  if (offerStatus === "PUBLISHED") return true
  return listingStatus === "ACTIVE"
}

/**
 * eBay Inventory API SKUs must be 1–50 alphanumeric characters only.
 * Spaces, hyphens, underscores, and other punctuation yield error 25707.
 */
export function isEbayInventoryApiSku(sku: string | null | undefined): boolean {
  if (typeof sku !== "string") return false
  const trimmed = sku.trim()
  return /^[A-Za-z0-9]{1,50}$/.test(trimmed)
}

/** Internal ListWise key when the seller eBay SKU cannot be used with Inventory APIs. */
export function listWiseImportKey(
  ebayListingId: string,
  offerId: string
): string {
  const raw = `LW${ebayListingId || offerId || ""}`.replace(/[^A-Za-z0-9]/g, "")
  const key = raw.slice(0, 50)
  return key || `LW${Date.now()}`.slice(0, 50)
}

/**
 * Build the getOffers LIST url for import. Must never include sku= —
 * eBay returns errorId 25707 when an invalid seller SKU is passed as sku.
 */
export function buildImportGetOffersPath(
  offset: number,
  limit: number,
  marketplaceId = process.env.EBAY_MARKETPLACE_ID?.trim() || "EBAY_US"
): string {
  const safeLimit = Math.min(50, Math.max(1, Math.floor(limit)))
  const safeOffset = Math.max(0, Math.floor(offset))
  const path =
    `/sell/inventory/v1/offer` +
    `?limit=${encodeURIComponent(String(safeLimit))}` +
    `&offset=${encodeURIComponent(String(safeOffset))}` +
    `&marketplace_ids=${encodeURIComponent(marketplaceId)}`
  if (/[?&]sku=/i.test(path)) {
    throw new Error("BUG: import getOffers path must not include sku=")
  }
  return path
}

function specificValue(
  specifics: Record<string, string> | undefined,
  ...names: string[]
): string | undefined {
  if (!specifics) return undefined
  for (const name of names) {
    const direct = specifics[name]?.trim()
    if (direct) return direct
  }
  const lowerNames = names.map((n) => n.toLowerCase())
  for (const [key, value] of Object.entries(specifics)) {
    if (lowerNames.includes(key.toLowerCase()) && value.trim()) {
      return value.trim()
    }
  }
  return undefined
}

/** Map eBay condition display / inventory enums onto ListWise condition labels. */
export function mapEbayConditionToListWise(
  condition?: string,
  conditionId?: string
): ItemCondition | string | undefined {
  const raw = (condition || "").trim()
  const id = (conditionId || "").trim()
  const lower = raw.toLowerCase()

  if (
    id === "1000" ||
    /\bnew with tags\b/i.test(raw) ||
    /^new$/i.test(raw)
  ) {
    return "New with tags"
  }
  if (
    id === "1500" ||
    id === "1750" ||
    /new without tags|new \(other\)|new other|new with defects/i.test(lower)
  ) {
    return "New without tags"
  }
  if (
    id === "2000" ||
    id === "2500" ||
    id === "2750" ||
    /like new|excellent|refurbished/i.test(lower)
  ) {
    return "Excellent"
  }
  if (id === "3000" || id === "4000" || /very good|\bgood\b/i.test(lower)) {
    return "Good"
  }
  if (id === "5000" || id === "6000" || /acceptable|\bfair\b/i.test(lower)) {
    return "Fair"
  }
  if (/poor|for parts/i.test(lower)) {
    return "Poor"
  }
  if (raw) return raw
  if (id) return `eBay condition ${id}`
  return undefined
}

const TOP_LEVEL_SPECIFIC_KEYS = new Set([
  "brand",
  "size",
  "color",
  "colour",
  "material",
  "style",
  "pattern",
  "gender",
])

function extrasKey(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
  return cleaned || "aspect"
}

/** Map imported eBay payload (including GetItem specifics) into ListWise specifics. */
export function mapEbayImportSpecifics(
  imported: EbayImportedOffer
): ListingSpecifics {
  const itemSpecifics = imported.itemSpecifics || {}
  const brand =
    imported.brand ||
    specificValue(itemSpecifics, "Brand", "Manufacturer", "Make")
  const size = specificValue(
    itemSpecifics,
    "Size",
    "Size Type",
    "Waist Size",
    "Shoe Size"
  )
  const color = specificValue(itemSpecifics, "Color", "Colour", "Main Color")
  const material = specificValue(
    itemSpecifics,
    "Material",
    "Fabric Type",
    "Fabric"
  )
  const style = specificValue(itemSpecifics, "Style", "Dress Style")
  const pattern = specificValue(itemSpecifics, "Pattern", "Print")
  const gender = specificValue(itemSpecifics, "Gender")

  const categoryLabel =
    imported.categoryPath?.trim() ||
    imported.categoryName?.trim() ||
    (imported.categoryId ? `eBay category ${imported.categoryId}` : undefined)

  const condition = mapEbayConditionToListWise(
    imported.condition,
    imported.conditionId
  )
  const flaws = imported.conditionDescription?.trim() || undefined

  const extras: Record<string, string> = {
    // ListWise inventory key (always Inventory-API-safe when generated).
    sku: isEbayInventoryApiSku(imported.sku)
      ? imported.sku.trim()
      : listWiseImportKey(imported.ebayListingId, imported.offerId),
    quantity: String(Math.max(0, imported.quantity)),
    // Preserve the seller's original eBay SKU even when it is API-invalid.
    ebaySku: imported.sku,
    ebayOriginalSku: imported.sku,
    ebayQuantity: String(Math.max(0, imported.quantity)),
    ebayListingId: imported.ebayListingId,
    ebayOfferId: imported.offerId,
    ebayCategoryId: imported.categoryId || "",
    source: "ebay_import",
  }

  if (imported.categoryName) extras.ebayCategoryName = imported.categoryName
  if (imported.categoryPath) extras.ebayCategoryPath = imported.categoryPath
  if (imported.conditionId) extras.ebayConditionId = imported.conditionId
  if (imported.condition) extras.ebayConditionDisplay = imported.condition
  if (imported.conditionDescription) {
    extras.ebayConditionDescription = imported.conditionDescription
  }
  if (imported.listingFormat) extras.ebayListingFormat = imported.listingFormat
  if (imported.startTime) extras.ebayStartTime = imported.startTime
  if (imported.endTime) extras.ebayEndTime = imported.endTime
  if (imported.shippingType) extras.ebayShippingType = imported.shippingType
  if (imported.shippingCost) extras.ebayShippingCost = imported.shippingCost
  if (imported.shippingService) {
    extras.ebayShippingService = imported.shippingService
  }
  if (imported.detailStatus) extras.ebayImportDetailStatus = imported.detailStatus

  for (const [name, value] of Object.entries(itemSpecifics)) {
    const trimmed = value.trim()
    if (!trimmed) continue
    if (TOP_LEVEL_SPECIFIC_KEYS.has(name.toLowerCase())) continue
    const key = extrasKey(name)
    if (!extras[key]) extras[key] = trimmed
    // Preserve original eBay aspect name for round-trip clarity.
    extras[`ebayAspect_${extrasKey(name)}`] = trimmed
  }

  // Common apparel extras explicitly requested.
  const department = specificValue(itemSpecifics, "Department")
  const type = specificValue(itemSpecifics, "Type", "Item Type")
  if (department) extras.department = department
  if (type) extras.type = type

  return {
    brand: brand || undefined,
    size: size || undefined,
    color: color || undefined,
    material: material || undefined,
    style: style || undefined,
    pattern: pattern || undefined,
    gender: gender || undefined,
    condition,
    category: categoryLabel,
    flaws,
    extras,
  }
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

  const specifics = mapEbayImportSpecifics(imported)

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
    specifics,
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
      model:
        imported.detailStatus === "full" || imported.detailStatus === "partial"
          ? "ebay_import_getitem"
          : "ebay_import",
      analyzedAt: now,
    },
    createdAt: now,
    updatedAt: now,
  }
}
