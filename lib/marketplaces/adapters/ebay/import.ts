import "server-only"
import { ebayFetch, ebayFetchResult } from "@/lib/marketplaces/adapters/ebay/client"
import { ebayEnv } from "@/lib/marketplaces/adapters/ebay/oauth"
import { MarketplaceError } from "@/lib/marketplaces/adapters/types"
import {
  EBAY_IMPORT_PAGE_SIZE,
  buildImportGetOffersPath,
  firstAspect,
  isActivePublishedOffer,
  isEbayInventoryApiSku,
  listWiseImportKey,
  mapEbayImportToListing,
  type EbayImportedOffer,
  type EbayInventoryItemRaw,
  type EbayOfferRaw,
} from "@/lib/marketplaces/adapters/ebay/import-map"

export {
  EBAY_IMPORT_PAGE_SIZE,
  buildImportGetOffersPath,
  ebayItemBrowseUrl,
  isActivePublishedOffer,
  isEbayInventoryApiSku,
  listWiseImportKey,
  listingIdForEbayImport,
  mapEbayImportToListing,
  type EbayImportedOffer,
  type EbayInventoryItemRaw,
  type EbayOfferRaw,
} from "@/lib/marketplaces/adapters/ebay/import-map"

export type EbayOfferPage = {
  offers?: EbayOfferRaw[]
  total?: number
  size?: number
  href?: string
  next?: string
  limit?: number
  offset?: number
}

type EbayInventoryItemPage = {
  inventoryItems?: EbayInventoryItemRaw[]
  total?: number
  limit?: number
  offset?: number
  size?: number
}

function marketplaceId() {
  return process.env.EBAY_MARKETPLACE_ID?.trim() || "EBAY_US"
}

function isInvalidSkuError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /25707|invalid sku/i.test(message)
}

export async function fetchEbayOfferPage(
  accessToken: string,
  offset: number,
  limit: number = EBAY_IMPORT_PAGE_SIZE
): Promise<EbayOfferPage> {
  const path = buildImportGetOffersPath(offset, limit, marketplaceId())
  return (await ebayFetch(path, accessToken, {
    step: "importGetOffers",
  })) as EbayOfferPage
}

/**
 * Fallback when unfiltered getOffers fails: page inventory items (no sku filter).
 * Never calls getOffers?sku=.
 */
export async function fetchEbayInventoryItemPage(
  accessToken: string,
  offset: number,
  limit: number = EBAY_IMPORT_PAGE_SIZE
): Promise<EbayInventoryItemPage> {
  const safeLimit = Math.min(50, Math.max(1, Math.floor(limit)))
  const safeOffset = Math.max(0, Math.floor(offset))
  const path =
    `/sell/inventory/v1/inventory_item` +
    `?limit=${encodeURIComponent(String(safeLimit))}` +
    `&offset=${encodeURIComponent(String(safeOffset))}`
  if (/[?&]sku=/i.test(path)) {
    throw new Error("BUG: import inventory_item list path must not include sku=")
  }
  return (await ebayFetch(path, accessToken, {
    step: "importGetInventoryItems",
  })) as EbayInventoryItemPage
}

/**
 * Enrichment only — never used as a getOffers?sku= filter.
 * Invalid SKUs return null without calling eBay.
 */
export async function fetchEbayInventoryItem(
  accessToken: string,
  sku: string
): Promise<EbayInventoryItemRaw | null> {
  if (!isEbayInventoryApiSku(sku)) {
    return null
  }
  try {
    return (await ebayFetch(
      `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku.trim())}`,
      accessToken,
      { step: "importGetInventoryItem" }
    )) as EbayInventoryItemRaw
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown"
    console.warn("[ebay/import] inventory item fetch skipped", {
      sku: sku.trim(),
      message,
      reason: isInvalidSkuError(error) ? "invalid_sku" : "inventory_item_error",
    })
    return null
  }
}

/**
 * Intentionally NOT used by import. Kept as a guarded helper so any future
 * call site cannot pass an invalid seller SKU into getOffers?sku=.
 */
export async function fetchEbayOffersBySkuSafe(
  accessToken: string,
  sku: string
): Promise<EbayOfferRaw[]> {
  if (!isEbayInventoryApiSku(sku)) {
    console.warn("[ebay/import] refused getOffers?sku= for invalid SKU", {
      sku: sku?.slice?.(0, 60),
    })
    return []
  }
  try {
    const path = `/sell/inventory/v1/offer?sku=${encodeURIComponent(sku.trim())}`
    const data = (await ebayFetch(path, accessToken, {
      step: "importGetOffersBySkuSafe",
    })) as EbayOfferPage
    return data.offers || []
  } catch (error) {
    console.warn("[ebay/import] getOffers?sku= skipped", {
      sku: sku.trim(),
      message: error instanceof Error ? error.message : "unknown",
    })
    return []
  }
}

export type HydrateImportedOffersResult = {
  imported: EbayImportedOffer[]
  skipped: Array<{ ebayListingId?: string; offerId?: string; reason: string }>
  errors: string[]
}

function offerToImported(
  offer: EbayOfferRaw,
  item: EbayInventoryItemRaw | null,
  errors: string[]
): EbayImportedOffer | null {
  if (!isActivePublishedOffer(offer)) return null

  const ebayListingId = offer.listing!.listingId!.trim()
  const offerId = offer.offerId!.trim()
  const sellerSku = (offer.sku || "").trim()
  const apiSkuOk = isEbayInventoryApiSku(sellerSku)

  if (sellerSku && !apiSkuOk) {
    errors.push(
      `Listing ${ebayListingId}: seller SKU "${sellerSku.slice(0, 60)}" is not valid for Inventory API (25707); imported via listing/offer id without getOffers?sku=.`
    )
  }

  const priceValue = Number(offer.pricingSummary?.price?.value)
  const quantity =
    item?.availability?.shipToLocationAvailability?.quantity ??
    offer.availableQuantity ??
    1

  const title =
    item?.product?.title?.trim() || `eBay listing ${ebayListingId}`

  if (apiSkuOk && item && !item.product?.title) {
    errors.push(
      `SKU ${sellerSku}: inventory item details missing; imported with listing id fallback title.`
    )
  }

  return {
    offerId,
    // Preserve original seller SKU (may be invalid). ListWise key is derived in map.
    sku: sellerSku || listWiseImportKey(ebayListingId, offerId),
    ebayListingId,
    title,
    description: item?.product?.description?.trim() || "",
    price: Number.isFinite(priceValue) ? priceValue : 0,
    currency: offer.pricingSummary?.price?.currency || "USD",
    quantity: Number.isFinite(quantity) ? Math.max(0, quantity) : 1,
    categoryId: offer.categoryId?.trim() || "",
    imageUrls: item?.product?.imageUrls || [],
    brand: firstAspect(item?.product?.aspects, "Brand"),
    condition: item?.condition,
    listingStatus: offer.listing?.listingStatus || "ACTIVE",
    offerStatus: offer.status || "PUBLISHED",
  }
}

export async function hydrateImportedOffers(
  accessToken: string,
  offers: EbayOfferRaw[]
): Promise<HydrateImportedOffersResult> {
  const imported: EbayImportedOffer[] = []
  const skipped: HydrateImportedOffersResult["skipped"] = []
  const errors: string[] = []

  for (const offer of offers) {
    try {
      if (!isActivePublishedOffer(offer)) {
        skipped.push({
          ebayListingId: offer.listing?.listingId,
          offerId: offer.offerId,
          reason: "not_active_published",
        })
        continue
      }

      const sellerSku = (offer.sku || "").trim()
      // Enrichment only — never getOffers?sku=.
      const item = isEbayInventoryApiSku(sellerSku)
        ? await fetchEbayInventoryItem(accessToken, sellerSku)
        : null

      const row = offerToImported(offer, item, errors)
      if (row) imported.push(row)
    } catch (error) {
      const ebayListingId = offer.listing?.listingId?.trim()
      const offerId = offer.offerId?.trim()
      const message =
        error instanceof Error ? error.message : "Failed to hydrate offer"
      errors.push(
        `Listing ${ebayListingId || offerId || "unknown"}: ${message}`
      )
      skipped.push({
        ebayListingId,
        offerId,
        reason: "hydrate_error",
      })
      continue
    }
  }

  return { imported, skipped, errors }
}

/**
 * When getOffers list is unavailable, import from inventory item pages.
 * Does not call getOffers?sku= for any seller SKU.
 */
export async function hydrateImportedInventoryItems(
  items: EbayInventoryItemRaw[]
): Promise<HydrateImportedOffersResult> {
  const imported: EbayImportedOffer[] = []
  const skipped: HydrateImportedOffersResult["skipped"] = []
  const errors: string[] = []

  for (const item of items) {
    try {
      const sellerSku = (item.sku || "").trim()
      const internalKey = listWiseImportKey(
        sellerSku || "item",
        sellerSku || "offer"
      )
      const title =
        item.product?.title?.trim() ||
        (sellerSku ? `eBay item ${sellerSku}` : `eBay item ${internalKey}`)

      if (!title) {
        skipped.push({ reason: "missing_title" })
        continue
      }

      if (sellerSku && !isEbayInventoryApiSku(sellerSku)) {
        errors.push(
          `Inventory SKU "${sellerSku.slice(0, 60)}" is not valid for getOffers?sku= (25707); imported from inventory item payload only.`
        )
      }

      const quantity =
        item.availability?.shipToLocationAvailability?.quantity ?? 1

      imported.push({
        offerId: internalKey,
        sku: sellerSku || internalKey,
        // Stable synthetic listing id — original seller SKU preserved in sku field.
        ebayListingId: internalKey,
        title,
        description: item.product?.description?.trim() || "",
        price: 0,
        currency: "USD",
        quantity: Number.isFinite(quantity) ? Math.max(0, quantity) : 1,
        categoryId: "",
        imageUrls: item.product?.imageUrls || [],
        brand: firstAspect(item.product?.aspects, "Brand"),
        condition: item.condition,
        listingStatus: "ACTIVE",
        offerStatus: "PUBLISHED",
      })
    } catch (error) {
      errors.push(
        error instanceof Error
          ? error.message
          : "Failed to hydrate inventory item"
      )
      skipped.push({
        reason: "hydrate_inventory_error",
      })
      continue
    }
  }

  return { imported, skipped, errors }
}

export type EbayImportPageResult = {
  offset: number
  nextOffset: number
  done: boolean
  pageSize: number
  scanned: number
  activeOnPage: number
  totalOffers: number | null
  imported: EbayImportedOffer[]
  skipped: HydrateImportedOffersResult["skipped"]
  warnings: string[]
  errors: string[]
  source: "offers" | "inventory_items_fallback"
}

/** Fetch one page and hydrate. Never aborts the page on a single bad SKU. */
export async function importEbayOffersPage(
  accessToken: string,
  offset: number,
  limit: number = EBAY_IMPORT_PAGE_SIZE
): Promise<EbayImportPageResult> {
  const pageSize = Math.min(50, Math.max(1, Math.floor(limit)))
  const safeOffset = Math.max(0, Math.floor(offset))

  // 1) Preferred: list offers with NO sku= filter.
  try {
    const path = buildImportGetOffersPath(safeOffset, pageSize, marketplaceId())
    // Soft fetch so we can fall back on 25707 instead of failing the route.
    const result = await ebayFetchResult(path, accessToken, {
      step: "importGetOffers",
    })
    const page = result.data as EbayOfferPage
    const offers = page.offers || []
    const active = offers.filter(isActivePublishedOffer)
    const { imported, skipped, errors } = await hydrateImportedOffers(
      accessToken,
      offers
    )
    const nextOffset = safeOffset + offers.length
    const totalOffers = typeof page.total === "number" ? page.total : null
    const done =
      offers.length === 0 ||
      (totalOffers !== null
        ? nextOffset >= totalOffers
        : offers.length < pageSize)

    return {
      offset: safeOffset,
      nextOffset,
      done,
      pageSize,
      scanned: offers.length,
      activeOnPage: active.length,
      totalOffers,
      imported,
      skipped,
      warnings: errors,
      errors,
      source: "offers",
    }
  } catch (error) {
    if (!(error instanceof MarketplaceError) || !isInvalidSkuError(error)) {
      throw error
    }
    console.warn(
      "[ebay/import] importGetOffers failed with invalid-SKU error; falling back to inventory_item list (no sku= filter)",
      { message: error.message }
    )
  }

  // 2) Fallback: inventory item list — still never uses getOffers?sku=.
  const inv = await fetchEbayInventoryItemPage(
    accessToken,
    safeOffset,
    pageSize
  )
  const items = inv.inventoryItems || []
  const { imported, skipped, errors } = await hydrateImportedInventoryItems(
    items
  )
  const nextOffset = safeOffset + items.length
  const totalOffers = typeof inv.total === "number" ? inv.total : null
  const done =
    items.length === 0 ||
    (totalOffers !== null ? nextOffset >= totalOffers : items.length < pageSize)

  errors.unshift(
    "getOffers list returned 25707; imported this page from inventory items without getOffers?sku=."
  )

  return {
    offset: safeOffset,
    nextOffset,
    done,
    pageSize,
    scanned: items.length,
    activeOnPage: imported.length,
    totalOffers,
    imported,
    skipped,
    warnings: errors,
    errors,
    source: "inventory_items_fallback",
  }
}

/** Map helper that stamps current eBay env onto browse URLs. */
export function mapEbayImportToListingForEnv(
  input: Parameters<typeof mapEbayImportToListing>[0]
) {
  return mapEbayImportToListing({
    ...input,
    ebayEnv: ebayEnv(),
  })
}
