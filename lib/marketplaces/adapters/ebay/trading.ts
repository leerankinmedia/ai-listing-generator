import "server-only"
import { ebayEnv } from "@/lib/marketplaces/adapters/ebay/oauth"
import type { EbayImportedOffer } from "@/lib/marketplaces/adapters/ebay/import-map"
import {
  classifyGetItemDetailStatus,
  parseTradingGetItemXml,
  xmlText,
  buildReviseItemClearSkuXml,
  type ParsedTradingGetItem,
} from "@/lib/marketplaces/adapters/ebay/trading-parse"

export {
  classifyGetItemDetailStatus,
  parseItemSpecifics,
  parsePictureUrls,
  parseTradingGetItemXml,
  xmlAttr,
  xmlText,
  buildReviseItemClearSkuXml,
  type ParsedTradingGetItem,
} from "@/lib/marketplaces/adapters/ebay/trading-parse"

/**
 * eBay Trading API (XML) helpers for seller ActiveList + GetItem detail.
 * Used when Sell Inventory API returns zero / incomplete listing payloads.
 */

export const EBAY_GET_ITEM_CONCURRENCY = 4
export const EBAY_GET_ITEM_MAX_ATTEMPTS = 4
export const EBAY_GET_ITEM_BASE_DELAY_MS = 250

function tradingEndpoint() {
  return ebayEnv() === "sandbox"
    ? "https://api.sandbox.ebay.com/ws/api.dll"
    : "https://api.ebay.com/ws/api.dll"
}

function siteId() {
  // EBAY_US
  return "0"
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetryableTradingError(message: string, httpStatus: number): boolean {
  if (httpStatus === 429 || httpStatus === 503 || httpStatus === 502) return true
  return /rate.?limit|call usage|exceeded|try again|internal error|timeout|temporar|busy|518|10007|21919188/i.test(
    message
  )
}

export async function reviseEbayListingClearSku(input: {
  accessToken: string
  itemId: string
}): Promise<{ ok: boolean; ack: string; error?: string }> {
  const itemId = input.itemId.trim()
  if (!itemId) return { ok: false, ack: "Failure", error: "missing itemId" }

  // Newly published listings are sometimes not revisable for a brief moment.
  await sleep(400)

  let lastError = "ReviseItem failed"
  let lastAck = ""
  try {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const response = await tradingCall({
        accessToken: input.accessToken,
        callName: "ReviseItem",
        body: buildReviseItemClearSkuXml(itemId),
      })
      lastAck = xmlText(response.xml, "Ack") || ""
      const short = xmlText(response.xml, "ShortMessage")
      const long = xmlText(response.xml, "LongMessage")
      lastError = long || short || `Trading ReviseItem HTTP ${response.status}`
      if (/success|warning/i.test(lastAck)) {
        console.info("[ebay/sku] cleared listing Custom Label", {
          itemId,
          ack: lastAck,
          attempt,
        })
        return { ok: true, ack: lastAck }
      }
      if (attempt < 3) {
        await sleep(400 * attempt)
      }
    }
  } catch (error) {
    return {
      ok: false,
      ack: lastAck || "Failure",
      error: error instanceof Error ? error.message : "ReviseItem failed",
    }
  }
  return { ok: false, ack: lastAck || "Failure", error: lastError }
}

async function tradingCall(input: {
  accessToken: string
  callName: string
  body: string
}): Promise<{ status: number; xml: string }> {
  const endpoint = tradingEndpoint()
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml",
      "X-EBAY-API-IAF-TOKEN": input.accessToken,
      "X-EBAY-API-CALL-NAME": input.callName,
      "X-EBAY-API-SITEID": siteId(),
      "X-EBAY-API-COMPATIBILITY-LEVEL": "1193",
    },
    body: input.body,
  })
  const xml = await response.text()
  return { status: response.status, xml }
}

export type TradingActiveListPage = {
  items: EbayImportedOffer[]
  totalEntries: number
  pageNumber: number
  entriesPerPage: number
  rawItemCount: number
}

export type TradingApiCallLog = {
  api: "Trading"
  call: "GetMyeBaySelling" | "GetItem"
  endpoint: string
  pageNumber?: number
  entriesPerPage?: number
  itemId?: string
  httpStatus: number
  ack: string
  rawItemCount?: number
  totalEntries?: number
  error?: string
}

/**
 * Fetch one page of the seller's ActiveList via Trading API GetMyeBaySelling.
 * OAuth user token is sent as X-EBAY-API-IAF-TOKEN (no token in XML body).
 */
export async function fetchTradingActiveListPage(
  accessToken: string,
  pageNumber: number,
  entriesPerPage: number
): Promise<{ page: TradingActiveListPage; log: TradingApiCallLog }> {
  const safePage = Math.max(1, Math.floor(pageNumber))
  const safeSize = Math.min(200, Math.max(1, Math.floor(entriesPerPage)))
  const endpoint = tradingEndpoint()

  const body = `<?xml version="1.0" encoding="utf-8"?>
<GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <ActiveList>
    <Include>true</Include>
    <Pagination>
      <EntriesPerPage>${safeSize}</EntriesPerPage>
      <PageNumber>${safePage}</PageNumber>
    </Pagination>
  </ActiveList>
  <DetailLevel>ReturnAll</DetailLevel>
</GetMyeBaySellingRequest>`

  const response = await tradingCall({
    accessToken,
    callName: "GetMyeBaySelling",
    body,
  })
  const xml = response.xml
  const ack = xmlText(xml, "Ack") || xmlText(xml, "ack") || ""
  const errorMessage =
    xmlText(xml, "LongMessage") ||
    xmlText(xml, "ShortMessage") ||
    xmlText(xml, "Errors") ||
    ""

  const activeListBlock =
    xml.match(/<ActiveList[\s\S]*?<\/ActiveList>/i)?.[0] || ""
  const paginationBlock =
    activeListBlock.match(
      /<PaginationResult[\s\S]*?<\/PaginationResult>/i
    )?.[0] || ""
  const totalEntries = Number(
    xmlText(paginationBlock, "TotalNumberOfEntries") || "0"
  )

  const itemBlocks = [
    ...activeListBlock.matchAll(/<Item>([\s\S]*?)<\/Item>/gi),
  ].map((m) => m[1])

  const items: EbayImportedOffer[] = []
  for (const block of itemBlocks) {
    const ebayListingId = xmlText(block, "ItemID")
    if (!ebayListingId) continue
    const title = xmlText(block, "Title") || `eBay listing ${ebayListingId}`
    const sellerSku = xmlText(block, "SKU")
    const quantityAvailable = Number(
      xmlText(block, "QuantityAvailable") || xmlText(block, "Quantity") || "1"
    )
    const priceRaw =
      xmlText(block, "CurrentPrice") ||
      xmlText(block, "StartPrice") ||
      xmlText(block, "BuyItNowPrice") ||
      "0"
    const currency =
      xmlAttrFromBlock(block, "CurrentPrice", "currencyID") ||
      xmlAttrFromBlock(block, "StartPrice", "currencyID") ||
      "USD"
    const categoryId = xmlText(block, "CategoryID")
    const picture =
      xmlText(block, "GalleryURL") ||
      xmlText(block, "PictureURL") ||
      ""
    const listingStatus = xmlText(block, "ListingStatus") || "Active"

    items.push({
      offerId: `trading-${ebayListingId}`,
      sku: sellerSku || `LW${ebayListingId}`.slice(0, 50),
      ebayListingId,
      title,
      description: "",
      price: Number.parseFloat(priceRaw) || 0,
      currency,
      quantity: Number.isFinite(quantityAvailable)
        ? Math.max(0, Math.floor(quantityAvailable))
        : 1,
      categoryId,
      imageUrls: picture && /^https?:\/\//i.test(picture) ? [picture] : [],
      brand: undefined,
      condition: undefined,
      listingStatus:
        listingStatus.toUpperCase() === "ACTIVE" ? "ACTIVE" : listingStatus,
      offerStatus: "PUBLISHED",
      detailStatus: "summary_only",
    })
  }

  const log: TradingApiCallLog = {
    api: "Trading",
    call: "GetMyeBaySelling",
    endpoint,
    pageNumber: safePage,
    entriesPerPage: safeSize,
    httpStatus: response.status,
    ack,
    rawItemCount: itemBlocks.length,
    totalEntries: Number.isFinite(totalEntries) ? totalEntries : items.length,
    error:
      response.status >= 400 || /^failure$/i.test(ack)
        ? errorMessage || `Trading API HTTP ${response.status}`
        : undefined,
  }

  console.info("[ebay/import] API call", {
    ...log,
    sampleTitles: items.slice(0, 3).map((i) => i.title.slice(0, 60)),
  })

  if (log.error) {
    throw new Error(
      `Trading GetMyeBaySelling failed: ${log.error} (ack=${ack || "none"})`
    )
  }

  return {
    page: {
      items,
      totalEntries: log.totalEntries ?? items.length,
      pageNumber: safePage,
      entriesPerPage: safeSize,
      rawItemCount: itemBlocks.length,
    },
    log,
  }
}

function xmlAttrFromBlock(block: string, tag: string, attr: string): string {
  const re = new RegExp(`<${tag}\\b[^>]*\\b${attr}="([^"]*)"`, "i")
  return block.match(re)?.[1]?.trim() || ""
}

export function mergeGetItemOntoOffer(
  base: EbayImportedOffer,
  detail: ParsedTradingGetItem
): EbayImportedOffer {
  const brand =
    detail.itemSpecifics.Brand ||
    detail.itemSpecifics.brand ||
    base.brand
  const condition =
    detail.conditionDisplayName ||
    detail.conditionId ||
    base.condition

  return {
    ...base,
    title: detail.title || base.title,
    description: detail.description || base.description,
    sku: detail.sku || base.sku,
    price: detail.price > 0 ? detail.price : base.price,
    currency: detail.currency || base.currency,
    quantity: detail.quantity >= 0 ? detail.quantity : base.quantity,
    categoryId: detail.categoryId || base.categoryId,
    categoryName: detail.categoryName || base.categoryName,
    categoryPath: detail.categoryPath || base.categoryPath,
    imageUrls:
      detail.imageUrls.length > 0 ? detail.imageUrls : base.imageUrls,
    brand,
    condition,
    conditionId: detail.conditionId || base.conditionId,
    conditionDescription:
      detail.conditionDescription || base.conditionDescription,
    listingStatus:
      detail.listingStatus.toUpperCase() === "ACTIVE"
        ? "ACTIVE"
        : detail.listingStatus || base.listingStatus,
    listingFormat: detail.listingFormat || base.listingFormat,
    startTime: detail.startTime || base.startTime,
    endTime: detail.endTime || base.endTime,
    shippingType: detail.shippingType || base.shippingType,
    shippingCost: detail.shippingCost || base.shippingCost,
    shippingService: detail.shippingService || base.shippingService,
    itemSpecifics:
      Object.keys(detail.itemSpecifics).length > 0
        ? detail.itemSpecifics
        : base.itemSpecifics,
    detailStatus: classifyGetItemDetailStatus(detail),
    detailError: undefined,
  }
}

/**
 * Fetch full listing details via Trading GetItem (with retry / rate-limit backoff).
 */
export async function fetchTradingGetItem(
  accessToken: string,
  itemId: string
): Promise<{ detail: ParsedTradingGetItem; log: TradingApiCallLog }> {
  const safeId = itemId.trim()
  if (!/^\d{6,20}$/.test(safeId)) {
    throw new Error(`Invalid eBay ItemID for GetItem: ${itemId}`)
  }

  const body = `<?xml version="1.0" encoding="utf-8"?>
<GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <ItemID>${safeId}</ItemID>
  <DetailLevel>ReturnAll</DetailLevel>
  <IncludeItemSpecifics>true</IncludeItemSpecifics>
</GetItemRequest>`

  let lastError = "GetItem failed"
  let lastStatus = 0
  let lastAck = ""

  for (let attempt = 1; attempt <= EBAY_GET_ITEM_MAX_ATTEMPTS; attempt++) {
    const response = await tradingCall({
      accessToken,
      callName: "GetItem",
      body,
    })
    lastStatus = response.status
    const ack = xmlText(response.xml, "Ack") || xmlText(response.xml, "ack")
    lastAck = ack
    const errorMessage =
      xmlText(response.xml, "LongMessage") ||
      xmlText(response.xml, "ShortMessage") ||
      ""

    const failure =
      response.status >= 400 ||
      /^failure$/i.test(ack) ||
      (!xmlText(response.xml, "ItemID") && /^partialfailure$/i.test(ack))

    if (!failure) {
      const detail = parseTradingGetItemXml(response.xml)
      if (!detail.ebayListingId) {
        throw new Error(`GetItem returned no ItemID for ${safeId}`)
      }
      const log: TradingApiCallLog = {
        api: "Trading",
        call: "GetItem",
        endpoint: tradingEndpoint(),
        itemId: safeId,
        httpStatus: response.status,
        ack,
      }
      console.info("[ebay/import] API call", {
        ...log,
        resultCount: 1,
        photos: detail.imageUrls.length,
        specifics: Object.keys(detail.itemSpecifics).length,
        hasDescription: Boolean(detail.description),
        attempt,
      })
      return { detail, log }
    }

    lastError = errorMessage || `Trading GetItem HTTP ${response.status}`
    if (
      attempt < EBAY_GET_ITEM_MAX_ATTEMPTS &&
      isRetryableTradingError(lastError, response.status)
    ) {
      const delay =
        EBAY_GET_ITEM_BASE_DELAY_MS * 2 ** (attempt - 1) +
        Math.floor(Math.random() * 100)
      console.warn("[ebay/import] GetItem retry", {
        itemId: safeId,
        attempt,
        delay,
        error: lastError,
      })
      await sleep(delay)
      continue
    }
    break
  }

  const log: TradingApiCallLog = {
    api: "Trading",
    call: "GetItem",
    endpoint: tradingEndpoint(),
    itemId: safeId,
    httpStatus: lastStatus,
    ack: lastAck,
    error: lastError,
  }
  console.info("[ebay/import] API call", log)
  throw new Error(
    `Trading GetItem failed for ${safeId}: ${lastError} (ack=${lastAck || "none"})`
  )
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const runners = Array.from(
    { length: Math.min(concurrency, Math.max(1, items.length)) },
    async () => {
      while (next < items.length) {
        const index = next
        next += 1
        results[index] = await worker(items[index], index)
      }
    }
  )
  await Promise.all(runners)
  return results
}

export type EnrichImportedOffersResult = {
  imported: EbayImportedOffer[]
  detailFull: number
  detailPartial: number
  detailError: number
  apiCalls: TradingApiCallLog[]
}

/**
 * Enrich summary imports with Trading GetItem in controlled concurrent batches.
 * Keeps summary data when GetItem fails (counts as detailError).
 */
export async function enrichImportedOffersWithGetItem(
  accessToken: string,
  offers: EbayImportedOffer[],
  concurrency: number = EBAY_GET_ITEM_CONCURRENCY
): Promise<EnrichImportedOffersResult> {
  const apiCalls: TradingApiCallLog[] = []

  const imported = await mapPool(
    offers,
    Math.max(1, Math.min(8, concurrency)),
    async (offer) => {
      if (!/^\d{6,20}$/.test(offer.ebayListingId.trim())) {
        return {
          ...offer,
          detailStatus: "partial" as const,
          detailError: "No numeric eBay listing ID for GetItem",
        }
      }
      try {
        const { detail, log } = await fetchTradingGetItem(
          accessToken,
          offer.ebayListingId
        )
        apiCalls.push(log)
        const merged = mergeGetItemOntoOffer(offer, detail)
        // Gentle pacing between successes in each worker.
        await sleep(EBAY_GET_ITEM_BASE_DELAY_MS)
        return merged
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "GetItem failed"
        apiCalls.push({
          api: "Trading",
          call: "GetItem",
          endpoint: tradingEndpoint(),
          itemId: offer.ebayListingId,
          httpStatus: 0,
          ack: "Failure",
          error: message,
        })
        return {
          ...offer,
          detailStatus: "error" as const,
          detailError: message,
        }
      }
    }
  )

  let detailFull = 0
  let detailPartial = 0
  let detailError = 0
  for (const row of imported) {
    if (row.detailStatus === "full") detailFull += 1
    else if (row.detailStatus === "error") detailError += 1
    else detailPartial += 1
  }

  console.info("[ebay/import] GetItem enrich summary", {
    count: offers.length,
    detailFull,
    detailPartial,
    detailError,
  })

  return { imported, detailFull, detailPartial, detailError, apiCalls }
}
