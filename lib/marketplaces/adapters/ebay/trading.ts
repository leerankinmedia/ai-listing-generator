import "server-only"
import { ebayEnv } from "@/lib/marketplaces/adapters/ebay/oauth"
import type { EbayImportedOffer } from "@/lib/marketplaces/adapters/ebay/import-map"

/**
 * eBay Trading API (XML) helpers for seller ActiveList.
 * Used when Sell Inventory API (/sell/inventory/v1/offer) returns zero
 * because listings were created outside Inventory API (Seller Hub / Trading).
 */

function tradingEndpoint() {
  return ebayEnv() === "sandbox"
    ? "https://api.sandbox.ebay.com/ws/api.dll"
    : "https://api.ebay.com/ws/api.dll"
}

function siteId() {
  // EBAY_US
  return "0"
}

function xmlText(block: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i")
  const m = block.match(re)
  if (!m?.[1]) return ""
  return m[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim()
}

function xmlAttr(block: string, tag: string, attr: string): string {
  const re = new RegExp(`<${tag}\\b[^>]*\\b${attr}="([^"]*)"`, "i")
  return block.match(re)?.[1]?.trim() || ""
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
  call: "GetMyeBaySelling"
  endpoint: string
  pageNumber: number
  entriesPerPage: number
  httpStatus: number
  ack: string
  rawItemCount: number
  totalEntries: number
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

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml",
      "X-EBAY-API-IAF-TOKEN": accessToken,
      "X-EBAY-API-CALL-NAME": "GetMyeBaySelling",
      "X-EBAY-API-SITEID": siteId(),
      "X-EBAY-API-COMPATIBILITY-LEVEL": "1193",
    },
    body,
  })

  const xml = await response.text()
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
      xmlAttr(block, "CurrentPrice", "currencyID") ||
      xmlAttr(block, "StartPrice", "currencyID") ||
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
      !response.ok || /^failure$/i.test(ack)
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
      totalEntries: log.totalEntries,
      pageNumber: safePage,
      entriesPerPage: safeSize,
      rawItemCount: itemBlocks.length,
    },
    log,
  }
}
