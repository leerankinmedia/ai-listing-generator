import "server-only"
import { ebayFetch } from "@/lib/marketplaces/adapters/ebay/client"
import { ebayEnv } from "@/lib/marketplaces/adapters/ebay/oauth"
import {
  EBAY_IMPORT_PAGE_SIZE,
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

export async function fetchEbayOfferPage(
  accessToken: string,
  offset: number,
  limit: number = EBAY_IMPORT_PAGE_SIZE
): Promise<EbayOfferPage> {
  // Always list offers without a sku= filter. Filtering by seller SKU via
  // getOffers?sku= throws 25707 for blank/spaced/hyphenated/underscored SKUs.
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(Math.max(0, offset)),
  })
  return (await ebayFetch(
    `/sell/inventory/v1/offer?${params.toString()}`,
    accessToken,
    { step: "importGetOffers" }
  )) as EbayOfferPage
}

/**
 * Fetch inventory item details only when the SKU is valid for the Inventory API.
 * Never call getOffers?sku= or inventory_item/{sku} with an invalid SKU.
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

      const ebayListingId = offer.listing!.listingId!.trim()
      const offerId = offer.offerId!.trim()
      const sellerSku = (offer.sku || "").trim()
      const apiSkuOk = isEbayInventoryApiSku(sellerSku)

      // Only hit inventory_item/{sku} when SKU is strictly alphanumeric ≤50.
      // Otherwise import from offer/listing fields already on the offer payload.
      let item: EbayInventoryItemRaw | null = null
      if (apiSkuOk) {
        item = await fetchEbayInventoryItem(accessToken, sellerSku)
      } else if (sellerSku) {
        errors.push(
          `Listing ${ebayListingId}: seller SKU "${sellerSku.slice(0, 60)}" is not valid for Inventory API (25707); imported via listing/offer id.`
        )
      }

      const priceValue = Number(offer.pricingSummary?.price?.value)
      const quantity =
        item?.availability?.shipToLocationAvailability?.quantity ??
        offer.availableQuantity ??
        1

      const title =
        item?.product?.title?.trim() || `eBay listing ${ebayListingId}`

      if (apiSkuOk && !item?.product?.title) {
        errors.push(
          `SKU ${sellerSku}: inventory item details missing; imported with listing id fallback title.`
        )
      }

      // Preserve original seller SKU string (may be blank/invalid). ListWise
      // inventory key is derived later in mapEbayImportToListing.
      const skuForRecord =
        sellerSku || listWiseImportKey(ebayListingId, offerId)

      imported.push({
        offerId,
        sku: skuForRecord,
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
      })
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
      // One bad item must not stop the page import.
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
}

/** Fetch one page of offers and hydrate active published ones. */
export async function importEbayOffersPage(
  accessToken: string,
  offset: number,
  limit: number = EBAY_IMPORT_PAGE_SIZE
): Promise<EbayImportPageResult> {
  const page = await fetchEbayOfferPage(accessToken, offset, limit)
  const offers = page.offers || []
  const active = offers.filter(isActivePublishedOffer)
  const { imported, skipped, errors } = await hydrateImportedOffers(
    accessToken,
    offers
  )
  const nextOffset = offset + offers.length
  const totalOffers = typeof page.total === "number" ? page.total : null
  const done =
    offers.length === 0 ||
    (totalOffers !== null ? nextOffset >= totalOffers : offers.length < limit)

  return {
    offset,
    nextOffset,
    done,
    pageSize: limit,
    scanned: offers.length,
    activeOnPage: active.length,
    totalOffers,
    imported,
    skipped,
    warnings: errors,
    errors,
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
