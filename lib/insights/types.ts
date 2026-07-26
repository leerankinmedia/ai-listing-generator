export type InsightsTimeframe = "7d" | "30d" | "90d"

export interface SalesInsightsFilters {
  timeframe: InsightsTimeframe
  keyword?: string
  category?: string
  condition?: string
  size?: string
  brand?: string
  minPrice?: number
  maxPrice?: number
}

export interface InsightsSoldItem {
  id: string
  title: string
  photoUrl: string | null
  soldPrice: number
  shippingCost: number | null
  soldAt: string
  marketplace: "eBay"
  category: string | null
  condition: string | null
  brand: string | null
  size: string | null
}

export interface SalesInsightsSummary {
  averageSoldPrice: number | null
  sellThroughRate: number | null
  soldPriceMin: number | null
  soldPriceMax: number | null
  averageShipping: number | null
  soldCount: number
  activeListingCount: number | null
}

export interface SourcingOpportunity {
  id: string
  categoryName: string
  recentSoldCount: number
  averageSoldPrice: number
  sellThroughRate: number | null
  averageShipping: number | null
  tip: string
}

export interface SalesInsightsPayload {
  available: boolean
  loading?: boolean
  reason: string | null
  source: "ebay_fulfillment" | null
  filters: SalesInsightsFilters
  summary: SalesInsightsSummary | null
  recentSales: InsightsSoldItem[]
  sourcing: SourcingOpportunity[]
  filterOptions: {
    categories: string[]
    conditions: string[]
    brands: string[]
    sizes: string[]
  }
}
