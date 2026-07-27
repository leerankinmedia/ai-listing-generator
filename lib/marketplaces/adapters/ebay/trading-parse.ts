/**
 * Pure Trading API XML parsers (no network / server-only).
 * Used by Trading fetch helpers and unit tests.
 */

export function xmlText(block: string, tag: string): string {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}\\b\\s*>`, "i")
  const m = block.match(re)
  if (!m?.[1]) return ""
  return decodeXmlEntities(m[1].trim())
}

export function xmlAttr(block: string, tag: string, attr: string): string {
  const re = new RegExp(`<${tag}\\b[^>]*\\b${attr}="([^"]*)"`, "i")
  return decodeXmlEntities(block.match(re)?.[1]?.trim() || "")
}

export function decodeXmlEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

export type ParsedTradingGetItem = {
  ebayListingId: string
  title: string
  description: string
  sku: string
  price: number
  currency: string
  quantity: number
  categoryId: string
  categoryName: string
  categoryPath: string
  imageUrls: string[]
  conditionId: string
  conditionDisplayName: string
  conditionDescription: string
  listingStatus: string
  listingFormat: string
  startTime: string
  endTime: string
  shippingType: string
  shippingCost: string
  shippingService: string
  itemSpecifics: Record<string, string>
}

/** Extract ordered PictureURL values from a GetItem / ActiveList Item XML block. */
export function parsePictureUrls(itemXml: string): string[] {
  const pictureDetails =
    itemXml.match(/<PictureDetails[\s\S]*?<\/PictureDetails>/i)?.[0] || itemXml
  const urls: string[] = []
  const seen = new Set<string>()
  for (const match of pictureDetails.matchAll(
    /<PictureURL[^>]*>([\s\S]*?)<\/PictureURL>/gi
  )) {
    const url = decodeXmlEntities(match[1].trim())
    if (!/^https?:\/\//i.test(url) || seen.has(url)) continue
    seen.add(url)
    urls.push(url)
  }
  if (urls.length === 0) {
    const gallery = xmlText(pictureDetails, "GalleryURL")
    if (/^https?:\/\//i.test(gallery)) urls.push(gallery)
  }
  return urls
}

/** Parse ItemSpecifics NameValueList pairs (multi-value joined with ", "). */
export function parseItemSpecifics(itemXml: string): Record<string, string> {
  const block =
    itemXml.match(/<ItemSpecifics[\s\S]*?<\/ItemSpecifics>/i)?.[0] || ""
  const specifics: Record<string, string> = {}
  for (const match of block.matchAll(
    /<NameValueList[\s\S]*?<\/NameValueList>/gi
  )) {
    const entry = match[0]
    const name = xmlText(entry, "Name")
    if (!name) continue
    const values = [...entry.matchAll(/<Value[^>]*>([\s\S]*?)<\/Value>/gi)]
      .map((m) => decodeXmlEntities(m[1].trim()))
      .filter(Boolean)
    if (values.length === 0) continue
    specifics[name] = values.join(", ")
  }
  return specifics
}

export function parseTradingGetItemXml(xml: string): ParsedTradingGetItem {
  const itemBlock = xml.match(/<Item[\s>][\s\S]*?<\/Item>/i)?.[0] || xml
  const ebayListingId = xmlText(itemBlock, "ItemID")
  const primaryCategory =
    itemBlock.match(/<PrimaryCategory[\s\S]*?<\/PrimaryCategory>/i)?.[0] || ""
  const listingDetails =
    itemBlock.match(/<ListingDetails[\s\S]*?<\/ListingDetails>/i)?.[0] || ""
  const shippingDetails =
    itemBlock.match(/<ShippingDetails[\s\S]*?<\/ShippingDetails>/i)?.[0] || ""
  const sellingStatus =
    itemBlock.match(/<SellingStatus[\s\S]*?<\/SellingStatus>/i)?.[0] || ""
  const shippingOption =
    shippingDetails.match(
      /<ShippingServiceOptions[\s\S]*?<\/ShippingServiceOptions>/i
    )?.[0] || ""

  const quantity = Number(xmlText(itemBlock, "Quantity") || "1")
  const quantitySold = Number(xmlText(sellingStatus, "QuantitySold") || "0")
  const quantityAvailable = Number(
    xmlText(itemBlock, "QuantityAvailable") ||
      String(
        Number.isFinite(quantity) && Number.isFinite(quantitySold)
          ? Math.max(0, quantity - quantitySold)
          : quantity
      )
  )

  const priceRaw =
    xmlText(sellingStatus, "CurrentPrice") ||
    xmlText(itemBlock, "StartPrice") ||
    xmlText(itemBlock, "BuyItNowPrice") ||
    "0"
  const currency =
    xmlAttr(sellingStatus, "CurrentPrice", "currencyID") ||
    xmlAttr(itemBlock, "StartPrice", "currencyID") ||
    xmlAttr(itemBlock, "BuyItNowPrice", "currencyID") ||
    "USD"

  const categoryId =
    xmlText(primaryCategory, "CategoryID") || xmlText(itemBlock, "CategoryID")
  const categoryName = xmlText(primaryCategory, "CategoryName")
  const itemSpecifics = parseItemSpecifics(itemBlock)

  return {
    ebayListingId,
    title: xmlText(itemBlock, "Title"),
    description: xmlText(itemBlock, "Description"),
    sku: xmlText(itemBlock, "SKU"),
    price: Number.parseFloat(priceRaw) || 0,
    currency,
    quantity: Number.isFinite(quantityAvailable)
      ? Math.max(0, Math.floor(quantityAvailable))
      : 1,
    categoryId,
    categoryName,
    categoryPath: categoryName,
    imageUrls: parsePictureUrls(itemBlock),
    conditionId: xmlText(itemBlock, "ConditionID"),
    conditionDisplayName: xmlText(itemBlock, "ConditionDisplayName"),
    conditionDescription: xmlText(itemBlock, "ConditionDescription"),
    listingStatus:
      xmlText(sellingStatus, "ListingStatus") ||
      xmlText(itemBlock, "ListingStatus") ||
      "Active",
    listingFormat: xmlText(itemBlock, "ListingType"),
    startTime: xmlText(listingDetails, "StartTime"),
    endTime: xmlText(listingDetails, "EndTime"),
    shippingType: xmlText(shippingDetails, "ShippingType"),
    shippingCost:
      xmlText(shippingOption, "ShippingServiceCost") ||
      xmlText(shippingDetails, "ShippingServiceCost"),
    shippingService: xmlText(shippingOption, "ShippingService"),
    itemSpecifics,
  }
}

export function classifyGetItemDetailStatus(
  detail: ParsedTradingGetItem
): "full" | "partial" {
  const hasDescription = Boolean(detail.description?.trim())
  const hasPhotos = detail.imageUrls.length > 0
  const hasSpecifics = Object.keys(detail.itemSpecifics).length > 0
  const hasCondition = Boolean(
    detail.conditionDisplayName || detail.conditionId
  )
  if (hasDescription && hasPhotos && (hasSpecifics || hasCondition)) {
    return "full"
  }
  return "partial"
}
