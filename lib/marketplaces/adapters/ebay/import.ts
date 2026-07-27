import "server-only"
import { ebayFetch, ebayFetchResult } from "@/lib/marketplaces/adapters/ebay/client"
import { ebayEnv } from "@/lib/marketplaces/adapters/ebay/oauth"
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
import { fetchTradingActiveListPage } from "@/lib/marketplaces/adapters/ebay/trading"

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

export type EbayImportApiCallLog = {
  api: "SellInventory" | "Trading"
  step: string
  pathOrCall: string
  httpStatus?: number
  resultCount: number
  total?: number | null
  note?: string
}

function marketplaceId() {
  return process.env.EBAY_MARKETPLACE_ID?.trim() || "EBAY_US"
}

function logImportApiCall(log: EbayImportApiCallLog) {
  console.info("[ebay/import] API call", log)
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
 * Fallback when unfiltered getOffers fails or returns empty: page inventory items.
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
      reason: /25707|invalid sku/i.test(message)
        ? "invalid_sku"
        : "inventory_item_error",
    })
    return null
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
 * When getOffers list is empty/unavailable, import from inventory item pages.
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
  /** Active listings found by the winning API for this page/total. */
  activeListingsFound: number
  imported: EbayImportedOffer[]
  skipped: HydrateImportedOffersResult["skipped"]
  warnings: string[]
  errors: string[]
  source:
    | "sell_inventory_offers"
    | "sell_inventory_items"
    | "trading_active_list"
  apiCalls: EbayImportApiCallLog[]
  sample: Array<{ ebayListingId: string; title: string }>
}

/** Fetch one page and hydrate. Falls back Inventory → Trading when empty. */
export async function importEbayOffersPage(
  accessToken: string,
  offset: number,
  limit: number = EBAY_IMPORT_PAGE_SIZE
): Promise<EbayImportPageResult> {
  const pageSize = Math.min(50, Math.max(1, Math.floor(limit)))
  const safeOffset = Math.max(0, Math.floor(offset))
  const apiCalls: EbayImportApiCallLog[] = []
  const warnings: string[] = []

  // ——— 1) Sell Inventory API: GET /sell/inventory/v1/offer (no sku=) ———
  try {
    const path = buildImportGetOffersPath(safeOffset, pageSize, marketplaceId())
    const result = await ebayFetchResult(path, accessToken, {
      step: "importGetOffers",
    })
    const page = result.data as EbayOfferPage
    let offers = page.offers || []
    let totalOffers = typeof page.total === "number" ? page.total : null

    apiCalls.push({
      api: "SellInventory",
      step: "importGetOffers",
      pathOrCall: path.split("?")[0],
      httpStatus: result.status,
      resultCount: offers.length,
      total: totalOffers,
      note: "Sell Inventory getOffers (marketplace_ids filter)",
    })
    logImportApiCall(apiCalls[apiCalls.length - 1])

    // Retry once without marketplace_ids when filtered list is empty.
    if (offers.length === 0 && safeOffset === 0) {
      const broadPath =
        `/sell/inventory/v1/offer` +
        `?limit=${encodeURIComponent(String(pageSize))}` +
        `&offset=0`
      try {
        const broad = await ebayFetchResult(broadPath, accessToken, {
          step: "importGetOffersBroad",
        })
        const broadPage = broad.data as EbayOfferPage
        const broadOffers = broadPage.offers || []
        apiCalls.push({
          api: "SellInventory",
          step: "importGetOffersBroad",
          pathOrCall: "/sell/inventory/v1/offer",
          httpStatus: broad.status,
          resultCount: broadOffers.length,
          total:
            typeof broadPage.total === "number" ? broadPage.total : null,
          note: "Sell Inventory getOffers (no marketplace_ids)",
        })
        logImportApiCall(apiCalls[apiCalls.length - 1])
        if (broadOffers.length > 0) {
          offers = broadOffers
          totalOffers =
            typeof broadPage.total === "number" ? broadPage.total : null
          warnings.push(
            "getOffers with marketplace_ids returned 0; used unfiltered getOffers."
          )
        }
      } catch (broadErr) {
        apiCalls.push({
          api: "SellInventory",
          step: "importGetOffersBroad",
          pathOrCall: "/sell/inventory/v1/offer",
          resultCount: 0,
          note: `broad getOffers failed: ${
            broadErr instanceof Error ? broadErr.message : "unknown"
          }`,
        })
        logImportApiCall(apiCalls[apiCalls.length - 1])
      }
    }

    if (offers.length > 0) {
      const active = offers.filter(isActivePublishedOffer)
      const hydrated = await hydrateImportedOffers(accessToken, offers)
      const nextOffset = safeOffset + offers.length
      const done =
        totalOffers !== null
          ? nextOffset >= totalOffers
          : offers.length < pageSize

      return {
        offset: safeOffset,
        nextOffset,
        done,
        pageSize,
        scanned: offers.length,
        activeOnPage: active.length,
        totalOffers,
        activeListingsFound: totalOffers ?? active.length,
        imported: hydrated.imported,
        skipped: hydrated.skipped,
        warnings: [...warnings, ...hydrated.errors],
        errors: hydrated.errors,
        source: "sell_inventory_offers",
        apiCalls,
        sample: hydrated.imported.slice(0, 5).map((row) => ({
          ebayListingId: row.ebayListingId,
          title: row.title,
        })),
      }
    }

    warnings.push(
      "Sell Inventory getOffers returned 0 offers — listings may be Trading/Seller Hub only."
    )
  } catch (error) {
    apiCalls.push({
      api: "SellInventory",
      step: "importGetOffers",
      pathOrCall: "/sell/inventory/v1/offer",
      resultCount: 0,
      note: error instanceof Error ? error.message : "getOffers failed",
    })
    logImportApiCall(apiCalls[apiCalls.length - 1])
    warnings.push(
      `getOffers error: ${error instanceof Error ? error.message : "unknown"}`
    )
  }

  // ——— 2) Sell Inventory API: GET /sell/inventory/v1/inventory_item ———
  try {
    const inv = await fetchEbayInventoryItemPage(
      accessToken,
      safeOffset,
      pageSize
    )
    const items = inv.inventoryItems || []
    const invTotal = typeof inv.total === "number" ? inv.total : null
    apiCalls.push({
      api: "SellInventory",
      step: "importGetInventoryItems",
      pathOrCall: "/sell/inventory/v1/inventory_item",
      resultCount: items.length,
      total: invTotal,
      note: "Sell Inventory getInventoryItems",
    })
    logImportApiCall(apiCalls[apiCalls.length - 1])

    if (items.length > 0) {
      const hydrated = await hydrateImportedInventoryItems(items)
      const nextOffset = safeOffset + items.length
      const done =
        invTotal !== null ? nextOffset >= invTotal : items.length < pageSize
      return {
        offset: safeOffset,
        nextOffset,
        done,
        pageSize,
        scanned: items.length,
        activeOnPage: hydrated.imported.length,
        totalOffers: invTotal,
        activeListingsFound: invTotal ?? hydrated.imported.length,
        imported: hydrated.imported,
        skipped: hydrated.skipped,
        warnings: [
          ...warnings,
          "Imported from Sell Inventory inventory_item list (getOffers was empty).",
          ...hydrated.errors,
        ],
        errors: hydrated.errors,
        source: "sell_inventory_items",
        apiCalls,
        sample: hydrated.imported.slice(0, 5).map((row) => ({
          ebayListingId: row.ebayListingId,
          title: row.title,
        })),
      }
    }

    warnings.push("Sell Inventory inventory_item list returned 0 items.")
  } catch (invErr) {
    apiCalls.push({
      api: "SellInventory",
      step: "importGetInventoryItems",
      pathOrCall: "/sell/inventory/v1/inventory_item",
      resultCount: 0,
      note: invErr instanceof Error ? invErr.message : "inventory_item failed",
    })
    logImportApiCall(apiCalls[apiCalls.length - 1])
    warnings.push(
      `inventory_item list error: ${
        invErr instanceof Error ? invErr.message : "unknown"
      }`
    )
  }

  // ——— 3) Trading API: GetMyeBaySelling ActiveList (classic seller listings) ———
  // Not Browse API. Inventory empty ≠ no active listings (Seller Hub / Trading).
  const pageNumber = Math.floor(safeOffset / pageSize) + 1
  try {
    const { page: tradingPage, log: tradingLog } =
      await fetchTradingActiveListPage(accessToken, pageNumber, pageSize)

    apiCalls.push({
      api: "Trading",
      step: "importGetMyeBaySellingActiveList",
      pathOrCall: "GetMyeBaySelling/ActiveList",
      httpStatus: tradingLog.httpStatus,
      resultCount: tradingPage.rawItemCount,
      total: tradingPage.totalEntries,
      note: `Trading ActiveList ack=${tradingLog.ack}`,
    })
    logImportApiCall(apiCalls[apiCalls.length - 1])

    const imported = tradingPage.items
    const nextOffset = safeOffset + imported.length
    const done =
      imported.length === 0 ||
      nextOffset >= tradingPage.totalEntries ||
      imported.length < pageSize

    return {
      offset: safeOffset,
      nextOffset,
      done,
      pageSize,
      scanned: tradingPage.rawItemCount,
      activeOnPage: imported.length,
      totalOffers: tradingPage.totalEntries,
      activeListingsFound: tradingPage.totalEntries,
      imported,
      skipped: [],
      warnings: [
        ...warnings,
        "Sell Inventory returned 0; imported via Trading API GetMyeBaySelling ActiveList.",
      ],
      errors: [],
      source: "trading_active_list",
      apiCalls,
      sample: imported.slice(0, 5).map((row) => ({
        ebayListingId: row.ebayListingId,
        title: row.title,
      })),
    }
  } catch (tradingErr) {
    const message =
      tradingErr instanceof Error ? tradingErr.message : "Trading API failed"
    apiCalls.push({
      api: "Trading",
      step: "importGetMyeBaySellingActiveList",
      pathOrCall: "GetMyeBaySelling/ActiveList",
      resultCount: 0,
      note: message,
    })
    logImportApiCall(apiCalls[apiCalls.length - 1])
    console.error("[ebay/import] Trading fallback failed after Inventory=0", {
      apiCalls,
      message,
    })
    throw new Error(
      `Sell Inventory returned 0 offers/items and Trading ActiveList failed: ${message}`
    )
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
