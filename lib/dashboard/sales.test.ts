import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { getLatestEbaySales } from "@/lib/dashboard/sales"
import type { Listing } from "@/lib/types"

function listing(partial: Partial<Listing>): Listing {
  return {
    id: partial.id || "1",
    userId: "u1",
    title: partial.title || "Tee",
    description: "",
    price: partial.price ?? 24,
    currency: "USD",
    keywords: [],
    specifics: {},
    fieldConfidence: {},
    images: partial.images || [{ id: "img", url: "https://example.com/a.jpg", sortOrder: 0 }],
    status: partial.status || "draft",
    marketplaceListings: partial.marketplaceListings || [],
    targetMarketplaces: partial.targetMarketplaces || [],
    aiGenerated: true,
    createdAt: partial.createdAt || "2026-07-01T00:00:00.000Z",
    updatedAt: partial.updatedAt || "2026-07-02T00:00:00.000Z",
  }
}

describe("latest ebay sales", () => {
  it("returns ebay sold marketplace refs newest first", () => {
    const rows = [
      listing({
        id: "a",
        title: "Older",
        marketplaceListings: [
          {
            marketplaceId: "ebay",
            status: "sold",
            price: 18,
            lastSyncedAt: "2026-07-01T12:00:00.000Z",
          },
        ],
      }),
      listing({
        id: "b",
        title: "Newer",
        marketplaceListings: [
          {
            marketplaceId: "ebay",
            status: "sold",
            price: 40,
            lastSyncedAt: "2026-07-10T12:00:00.000Z",
          },
        ],
      }),
      listing({
        id: "c",
        status: "listed",
        marketplaceListings: [{ marketplaceId: "ebay", status: "listed" }],
      }),
    ]
    const sales = getLatestEbaySales(rows, 3)
    assert.equal(sales.length, 2)
    assert.equal(sales[0].title, "Newer")
    assert.equal(sales[0].soldPrice, 40)
    assert.equal(sales[0].marketplaceName, "eBay")
  })

  it("includes status=sold listings tied to ebay", () => {
    const sales = getLatestEbaySales(
      [
        listing({
          id: "s1",
          status: "sold",
          price: 33,
          targetMarketplaces: ["ebay"],
          updatedAt: "2026-07-11T00:00:00.000Z",
        }),
      ],
      3
    )
    assert.equal(sales.length, 1)
    assert.equal(sales[0].soldPrice, 33)
  })
})
