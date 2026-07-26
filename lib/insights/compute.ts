import type {
  InsightsSoldItem,
  SalesInsightsFilters,
  SalesInsightsSummary,
  SourcingOpportunity,
} from "@/lib/insights/types"

export function applySalesFilters(
  items: InsightsSoldItem[],
  filters: SalesInsightsFilters
): InsightsSoldItem[] {
  const keyword = filters.keyword?.trim().toLowerCase()
  const category = filters.category?.trim().toLowerCase()
  const condition = filters.condition?.trim().toLowerCase()
  const size = filters.size?.trim().toLowerCase()
  const brand = filters.brand?.trim().toLowerCase()

  return items.filter((item) => {
    if (keyword && !item.title.toLowerCase().includes(keyword)) return false
    if (category && (item.category || "").toLowerCase() !== category) return false
    if (condition && (item.condition || "").toLowerCase() !== condition) {
      return false
    }
    if (size && (item.size || "").toLowerCase() !== size) return false
    if (brand && (item.brand || "").toLowerCase() !== brand) return false
    if (
      typeof filters.minPrice === "number" &&
      Number.isFinite(filters.minPrice) &&
      item.soldPrice < filters.minPrice
    ) {
      return false
    }
    if (
      typeof filters.maxPrice === "number" &&
      Number.isFinite(filters.maxPrice) &&
      item.soldPrice > filters.maxPrice
    ) {
      return false
    }
    return true
  })
}

export function summarizeSales(
  items: InsightsSoldItem[],
  activeListingCount: number | null
): SalesInsightsSummary {
  if (items.length === 0) {
    return {
      averageSoldPrice: null,
      sellThroughRate: null,
      soldPriceMin: null,
      soldPriceMax: null,
      averageShipping: null,
      soldCount: 0,
      activeListingCount,
    }
  }

  const prices = items.map((i) => i.soldPrice)
  const ships = items
    .map((i) => i.shippingCost)
    .filter((n): n is number => typeof n === "number" && Number.isFinite(n))

  const soldCount = items.length
  const averageSoldPrice =
    prices.reduce((sum, n) => sum + n, 0) / prices.length
  const soldPriceMin = Math.min(...prices)
  const soldPriceMax = Math.max(...prices)
  const averageShipping =
    ships.length > 0
      ? ships.reduce((sum, n) => sum + n, 0) / ships.length
      : null

  let sellThroughRate: number | null = null
  if (activeListingCount != null) {
    const denom = soldCount + activeListingCount
    sellThroughRate = denom > 0 ? soldCount / denom : null
  }

  return {
    averageSoldPrice,
    sellThroughRate,
    soldPriceMin,
    soldPriceMax,
    averageShipping,
    soldCount,
    activeListingCount,
  }
}

function sourcingTip(input: {
  categoryName: string
  recentSoldCount: number
  averageSoldPrice: number
  sellThroughRate: number | null
}): string {
  const avg = `$${input.averageSoldPrice.toFixed(0)}`
  if (input.sellThroughRate != null && input.sellThroughRate >= 0.45) {
    return `Strong sell-through with ${input.recentSoldCount} sales at ~${avg} avg — source more clean used ${input.categoryName.toLowerCase()}.`
  }
  if (input.averageSoldPrice >= 40) {
    return `Healthy average sold price (${avg}) — prioritize quality used ${input.categoryName.toLowerCase()} with clear photos.`
  }
  return `${input.recentSoldCount} recent eBay sales in ${input.categoryName} — keep sourcing used pieces buyers already pay for.`
}

/**
 * Build sourcing opportunities from the seller's real sold line items.
 * Never invents category demand — only groups observed eBay sales.
 */
export function buildSourcingOpportunities(
  items: InsightsSoldItem[],
  activeListingCount: number | null,
  limit = 12
): SourcingOpportunity[] {
  const byCategory = new Map<string, InsightsSoldItem[]>()
  for (const item of items) {
    const key = item.category || "Other"
    const list = byCategory.get(key) || []
    list.push(item)
    byCategory.set(key, list)
  }

  const rows: SourcingOpportunity[] = []
  for (const [categoryName, list] of byCategory) {
    const summary = summarizeSales(list, activeListingCount)
    if (!summary.averageSoldPrice || summary.soldCount <= 0) continue
    const ships = list
      .map((i) => i.shippingCost)
      .filter((n): n is number => typeof n === "number")
    rows.push({
      id: categoryName.toLowerCase().replace(/\s+/g, "-"),
      categoryName,
      recentSoldCount: summary.soldCount,
      averageSoldPrice: summary.averageSoldPrice,
      sellThroughRate: summary.sellThroughRate,
      averageShipping:
        ships.length > 0
          ? ships.reduce((a, b) => a + b, 0) / ships.length
          : null,
      tip: sourcingTip({
        categoryName,
        recentSoldCount: summary.soldCount,
        averageSoldPrice: summary.averageSoldPrice,
        sellThroughRate: summary.sellThroughRate,
      }),
    })
  }

  return rows
    .sort((a, b) => {
      if (b.recentSoldCount !== a.recentSoldCount) {
        return b.recentSoldCount - a.recentSoldCount
      }
      return b.averageSoldPrice - a.averageSoldPrice
    })
    .slice(0, limit)
}

export function collectFilterOptions(items: InsightsSoldItem[]) {
  const categories = new Set<string>()
  const conditions = new Set<string>()
  const brands = new Set<string>()
  const sizes = new Set<string>()
  for (const item of items) {
    if (item.category) categories.add(item.category)
    if (item.condition) conditions.add(item.condition)
    if (item.brand) brands.add(item.brand)
    if (item.size) sizes.add(item.size)
  }
  const sort = (values: Set<string>) => [...values].sort((a, b) => a.localeCompare(b))
  return {
    categories: sort(categories),
    conditions: sort(conditions),
    brands: sort(brands),
    sizes: sort(sizes),
  }
}
