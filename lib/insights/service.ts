import "server-only"
import {
  applySalesFilters,
  buildSourcingOpportunities,
  collectFilterOptions,
  summarizeSales,
} from "@/lib/insights/compute"
import { ensureEbayUserAccessToken } from "@/lib/insights/ebay-auth"
import {
  fetchEbayActiveOfferCount,
  fetchEbaySoldLineItems,
} from "@/lib/insights/ebay-fulfillment"
import type {
  SalesInsightsFilters,
  SalesInsightsPayload,
} from "@/lib/insights/types"
import { isEbayConfigured } from "@/lib/marketplaces/adapters/ebay/oauth"
import { MarketplaceError } from "@/lib/marketplaces/adapters/types"

const EMPTY_SUMMARY = {
  averageSoldPrice: null,
  sellThroughRate: null,
  soldPriceMin: null,
  soldPriceMax: null,
  averageShipping: null,
  soldCount: 0,
  activeListingCount: null,
}

export async function getSalesInsights(
  filters: SalesInsightsFilters
): Promise<SalesInsightsPayload> {
  const base: SalesInsightsPayload = {
    available: false,
    reason: null,
    source: null,
    filters,
    summary: null,
    recentSales: [],
    sourcing: [],
    filterOptions: {
      categories: [],
      conditions: [],
      brands: [],
      sizes: [],
    },
  }

  if (!isEbayConfigured()) {
    return {
      ...base,
      reason: "eBay app credentials are not configured on the server.",
    }
  }

  const auth = await ensureEbayUserAccessToken()
  if (!auth.ok) {
    return { ...base, reason: auth.reason }
  }

  try {
    const [soldItems, activeListingCount] = await Promise.all([
      fetchEbaySoldLineItems(auth.accessToken, filters.timeframe),
      fetchEbayActiveOfferCount(auth.accessToken),
    ])

    const filtered = applySalesFilters(soldItems, filters)
    const summary = summarizeSales(filtered, activeListingCount)
    const sourcing = buildSourcingOpportunities(filtered, activeListingCount, 12)
    const filterOptions = collectFilterOptions(soldItems)

    return {
      available: true,
      reason:
        filtered.length === 0
          ? "No eBay sold orders matched these filters in the selected timeframe."
          : null,
      source: "ebay_fulfillment",
      filters,
      summary: filtered.length === 0 ? { ...EMPTY_SUMMARY, activeListingCount } : summary,
      recentSales: filtered.slice(0, 3),
      sourcing,
      filterOptions,
    }
  } catch (error) {
    const message =
      error instanceof MarketplaceError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Could not load eBay sales data."
    console.error("[insights/sales]", error)
    return {
      ...base,
      reason: message,
    }
  }
}

export function parseInsightsFilters(
  searchParams: URLSearchParams
): SalesInsightsFilters {
  const timeframeRaw = searchParams.get("timeframe")
  const timeframe =
    timeframeRaw === "7d" || timeframeRaw === "90d" || timeframeRaw === "30d"
      ? timeframeRaw
      : "30d"

  const minPriceRaw = searchParams.get("minPrice")
  const maxPriceRaw = searchParams.get("maxPrice")
  const minPrice = minPriceRaw != null ? Number(minPriceRaw) : undefined
  const maxPrice = maxPriceRaw != null ? Number(maxPriceRaw) : undefined

  return {
    timeframe,
    keyword: searchParams.get("keyword") || undefined,
    category: searchParams.get("category") || undefined,
    condition: searchParams.get("condition") || undefined,
    size: searchParams.get("size") || undefined,
    brand: searchParams.get("brand") || undefined,
    minPrice: Number.isFinite(minPrice) ? minPrice : undefined,
    maxPrice: Number.isFinite(maxPrice) ? maxPrice : undefined,
  }
}
