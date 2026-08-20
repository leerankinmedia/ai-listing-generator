/**
 * Listing extras hold both eBay item specifics and operational listing data
 * (ZIP, offer floors, shipping service). Only item-specific keys may be sent
 * as Inventory API product.aspects.
 */

const OPERATIONAL_EXTRA_KEYS = new Set([
  "sku",
  "quantity",
  "ebaysku",
  "ebayoriginalsku",
  "ebayquantity",
  "ebaylistingid",
  "ebayofferid",
  "ebayconditionenum",
  "source",
  "allowoffers",
  "itemlocationzip",
  "minofferamount",
  "minofferpercent",
  "autodeclineamount",
  "autodeclinepercent",
  "shippingservice",
  "listingformat",
  "internationalshipping",
  "irregularpackage",
  "fulfillmentpolicyid",
  "paymentpolicyid",
  "returnpolicyid",
])

export function isOperationalListingExtraKey(key: string): boolean {
  const lower = key.trim().toLowerCase()
  if (!lower) return true
  if (OPERATIONAL_EXTRA_KEYS.has(lower)) return true
  if (lower.startsWith("ebay")) return true
  return false
}

export function isEbayItemSpecificExtraKey(key: string): boolean {
  return !isOperationalListingExtraKey(key)
}
