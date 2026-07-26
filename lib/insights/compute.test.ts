import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  applySalesFilters,
  buildSourcingOpportunities,
  summarizeSales,
} from "@/lib/insights/compute"
import type { InsightsSoldItem } from "@/lib/insights/types"

function item(partial: Partial<InsightsSoldItem>): InsightsSoldItem {
  return {
    id: partial.id || "1",
    title: partial.title || "Nike Hoodie",
    photoUrl: null,
    soldPrice: partial.soldPrice ?? 40,
    shippingCost: partial.shippingCost ?? 5,
    soldAt: partial.soldAt || "2026-07-01T00:00:00.000Z",
    marketplace: "eBay",
    category: partial.category ?? "Hoodies",
    condition: partial.condition ?? null,
    brand: partial.brand ?? "Nike",
    size: partial.size ?? "M",
  }
}

describe("sales insights compute", () => {
  it("summarizes real sold items only", () => {
    const summary = summarizeSales(
      [item({ soldPrice: 20, shippingCost: 4 }), item({ soldPrice: 40, shippingCost: 6 })],
      2
    )
    assert.equal(summary.soldCount, 2)
    assert.equal(summary.averageSoldPrice, 30)
    assert.equal(summary.soldPriceMin, 20)
    assert.equal(summary.soldPriceMax, 40)
    assert.equal(summary.averageShipping, 5)
    assert.equal(summary.sellThroughRate, 0.5)
  })

  it("returns null metrics when there are no sold items", () => {
    const summary = summarizeSales([], 3)
    assert.equal(summary.averageSoldPrice, null)
    assert.equal(summary.sellThroughRate, null)
    assert.equal(summary.soldCount, 0)
  })

  it("filters by brand and price without inventing rows", () => {
    const rows = applySalesFilters(
      [
        item({ id: "a", brand: "Nike", soldPrice: 25 }),
        item({ id: "b", brand: "Adidas", soldPrice: 55 }),
      ],
      {
        timeframe: "30d",
        brand: "Nike",
        maxPrice: 30,
      }
    )
    assert.equal(rows.length, 1)
    assert.equal(rows[0].id, "a")
  })

  it("builds sourcing cards from observed categories", () => {
    const sourcing = buildSourcingOpportunities(
      [
        item({ category: "Hoodies", soldPrice: 45 }),
        item({ category: "Hoodies", soldPrice: 55 }),
        item({ category: "Jeans", soldPrice: 30 }),
      ],
      1,
      3
    )
    assert.equal(sourcing[0].categoryName, "Hoodies")
    assert.equal(sourcing[0].recentSoldCount, 2)
    assert.ok(sourcing[0].tip.length > 10)
  })
})
