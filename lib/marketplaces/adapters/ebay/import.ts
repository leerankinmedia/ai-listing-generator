import "server-only"
import { ebayFetch } from "@/lib/marketplaces/adapters/ebay/client"
import { ebayEnv } from "@/lib/marketplaces/adapters/ebay/oauth"
import {
  EBAY_IMPORT_PAGE_SIZE,
  firstAspect,
  isActivePublishedOffer,
  mapEbayImportToListing,
  type EbayImportedOffer,
  type EbayInventoryItemRaw,
  type EbayOfferRaw,
} from "@/lib/marketplaces/adapters/ebay/import-map"

export {
  EBAY_IMPORT_PAGE_SIZE,
  ebayItemBrowseUrl,
  isActivePublishedOffer,
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

export async function fetchEbayInventoryItem(
  accessToken: string,
  sku: string
): Promise<EbayInventoryItemRaw | null> {
  try {
    return (await ebayFetch(
      `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`,
      accessToken,
      { step: "importGetInventoryItem" }
    )) as EbayInventoryItemRaw
  } catch (error) {
    console.error("[ebay/import] inventory item fetch failed", {
      sku,
      message: error instanceof Error ? error.message : "unknown",
    })
    return null
  }
}

export async function hydrateImportedOffers(
  accessToken: string,
  offers: EbayOfferRaw[]
): Promise<{ imported: EbayImportedOffer[]; errors: string[] }> {
  const imported: EbayImportedOffer[] = []
  const errors: string[] = []

  for (const offer of offers) {
    if (!isActivePublishedOffer(offer)) continue
    const sku = offer.sku!.trim()
    const ebayListingId = offer.listing!.listingId!.trim()
    const offerId = offer.offerId!.trim()

    const item = await fetchEbayInventoryItem(accessToken, sku)
    const priceValue = Number(offer.pricingSummary?.price?.value)
    const quantity =
      item?.availability?.shipToLocationAvailability?.quantity ??
      offer.availableQuantity ??
      1

    const title =
      item?.product?.title?.trim() || `eBay listing ${ebayListingId}`

    if (!item?.product?.title) {
      errors.push(
        `SKU ${sku}: inventory item details missing; imported with listing id fallback title.`
      )
    }

    imported.push({
      offerId,
      sku,
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
  }

  return { imported, errors }
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
  warnings: string[]
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
  const { imported, errors } = await hydrateImportedOffers(accessToken, active)
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
    warnings: errors,
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
