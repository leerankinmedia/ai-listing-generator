import "server-only"
import { ebayFetch } from "@/lib/marketplaces/adapters/ebay/client"
import type { InsightsSoldItem, InsightsTimeframe } from "@/lib/insights/types"

type EbayMoney = { value?: string; currency?: string }

type EbayLineItem = {
  lineItemId?: string
  title?: string
  sku?: string
  quantity?: number
  lineItemCost?: EbayMoney
  deliveryCost?: { shippingCost?: EbayMoney }
  soldFormat?: string
  listingMarketplaceId?: string
  itemLocation?: { countryCode?: string }
  properties?: {
    buyerProtection?: boolean
    soldViaAdCampaign?: boolean
  }
  /** Aspects / variation when present */
  variationAspects?: Array<{ name?: string; value?: string }>
  legacyItemId?: string
  lineItemFulfillmentInstructions?: {
    minEstimatedDeliveryDate?: string
    maxEstimatedDeliveryDate?: string
  }
}

type EbayOrder = {
  orderId?: string
  creationDate?: string
  lastModifiedDate?: string
  orderFulfillmentStatus?: string
  pricingSummary?: {
    priceSubtotal?: EbayMoney
    deliveryCost?: EbayMoney
    total?: EbayMoney
  }
  lineItems?: EbayLineItem[]
  fulfillmentStartInstructions?: Array<{
    shippingStep?: {
      shipTo?: { fullName?: string }
    }
  }>
}

type EbayOrdersResponse = {
  orders?: EbayOrder[]
  href?: string
  next?: string
  limit?: number
  offset?: number
  total?: number
}

function moneyValue(money?: EbayMoney): number | null {
  if (!money?.value) return null
  const n = Number(money.value)
  return Number.isFinite(n) ? n : null
}

function timeframeStartIso(timeframe: InsightsTimeframe, now = new Date()) {
  const days = timeframe === "7d" ? 7 : timeframe === "30d" ? 30 : 90
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
  return start.toISOString()
}

function aspectMap(line: EbayLineItem): Record<string, string> {
  const out: Record<string, string> = {}
  for (const row of line.variationAspects || []) {
    const name = row.name?.trim()
    const value = row.value?.trim()
    if (name && value) out[name.toLowerCase()] = value
  }
  return out
}

function inferCategory(title: string): string | null {
  const t = title.toLowerCase()
  if (/\b(jean|denim)\b/.test(t)) return "Jeans"
  if (/\b(sneaker|shoe|boot)\b/.test(t)) return "Shoes"
  if (/\b(hoodie|sweatshirt)\b/.test(t)) return "Hoodies"
  if (/\b(jacket|coat)\b/.test(t)) return "Jackets"
  if (/\b(dress)\b/.test(t)) return "Dresses"
  if (/\b(tee|t-shirt|shirt)\b/.test(t)) return "Tops"
  if (/\b(bag|purse|handbag)\b/.test(t)) return "Bags"
  if (/\b(hat|cap)\b/.test(t)) return "Hats"
  return "Apparel"
}

/**
 * Fetch sold line items from the seller's eBay Fulfillment orders.
 * Returns only data present on the eBay response — never invents stats.
 */
export async function fetchEbaySoldLineItems(
  accessToken: string,
  timeframe: InsightsTimeframe
): Promise<InsightsSoldItem[]> {
  const createdFrom = timeframeStartIso(timeframe)
  const createdTo = new Date().toISOString()
  const filter = encodeURIComponent(
    `creationdate:[${createdFrom}..${createdTo}]`
  )

  const items: InsightsSoldItem[] = []
  let offset = 0
  const limit = 50
  let guard = 0

  while (guard < 6) {
    guard += 1
    const path = `/sell/fulfillment/v1/order?filter=${filter}&limit=${limit}&offset=${offset}`
    const data = (await ebayFetch(path, accessToken, {
      step: "getOrders",
    })) as EbayOrdersResponse

    const orders = data.orders || []
    for (const order of orders) {
      const soldAt = order.creationDate || order.lastModifiedDate
      if (!soldAt) continue
      const orderShipping = moneyValue(order.pricingSummary?.deliveryCost)
      const lineItems = order.lineItems || []
      const perLineShipping =
        orderShipping != null && lineItems.length > 0
          ? orderShipping / lineItems.length
          : null

      for (const line of lineItems) {
        const qty = Math.max(1, Number(line.quantity) || 1)
        const unit = moneyValue(line.lineItemCost)
        if (unit == null) continue
        const lineShip =
          moneyValue(line.deliveryCost?.shippingCost) ?? perLineShipping
        const aspects = aspectMap(line)
        const title = (line.title || "Sold item").trim()

        for (let i = 0; i < qty; i += 1) {
          items.push({
            id: `${order.orderId || "order"}:${line.lineItemId || "line"}:${i}`,
            title,
            photoUrl: null,
            soldPrice: unit,
            shippingCost: lineShip,
            soldAt,
            marketplace: "eBay",
            category: inferCategory(title),
            condition: aspects.condition || null,
            brand: aspects.brand || null,
            size: aspects.size || aspects["size type"] || null,
          })
        }
      }
    }

    const total = typeof data.total === "number" ? data.total : orders.length
    offset += limit
    if (orders.length < limit || offset >= total) break
  }

  return items.sort(
    (a, b) => new Date(b.soldAt).getTime() - new Date(a.soldAt).getTime()
  )
}

/** Count currently published eBay offers for sell-through denominator. */
export async function fetchEbayActiveOfferCount(
  accessToken: string
): Promise<number | null> {
  try {
    const data = (await ebayFetch(
      `/sell/inventory/v1/offer?limit=200&offset=0`,
      accessToken,
      { step: "getOffers" }
    )) as { offers?: Array<{ status?: string }>; total?: number }

    const offers = data.offers || []
    const published = offers.filter(
      (o) => (o.status || "").toUpperCase() === "PUBLISHED"
    ).length
    if (typeof data.total === "number" && data.total > offers.length) {
      // Incomplete page — still return counted published on this page only
      // rather than inventing a total.
      return published
    }
    return published
  } catch (error) {
    console.error("[insights] active offer count failed", error)
    return null
  }
}
