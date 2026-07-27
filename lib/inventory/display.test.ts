import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  filterInventoryRows,
  listingToInventoryRow,
  listingsToInventoryRows,
} from "@/lib/inventory/display"
import type { Listing } from "@/lib/types"

function listing(partial: Partial<Listing>): Listing {
  return {
    id: partial.id || "11111111-1111-4111-a111-111111111111",
    userId: "u1",
    title: partial.title || "Tee",
    description: "",
    price: partial.price ?? 10,
    currency: "USD",
    keywords: [],
    specifics: partial.specifics || {},
    fieldConfidence: {},
    images: partial.images || [],
    status: partial.status || "listed",
    marketplaceListings: partial.marketplaceListings || [],
    targetMarketplaces: partial.targetMarketplaces || ["ebay"],
    aiGenerated: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: partial.updatedAt || "2026-01-02T00:00:00.000Z",
  }
}

describe("inventory display", () => {
  it("maps imported eBay listings into inventory rows", () => {
    const row = listingToInventoryRow(
      listing({
        title: "Red Tee",
        price: 22,
        specifics: {
          category: "eBay category 15724",
          extras: {
            source: "ebay_import",
            sku: "SKU-1",
            quantity: "4",
            ebayListingId: "123",
          },
        },
        marketplaceListings: [
          {
            marketplaceId: "ebay",
            externalId: "123",
            url: "https://www.ebay.com/itm/123",
            status: "listed",
          },
        ],
        images: [
          {
            id: "img1",
            url: "https://example.com/a.jpg",
            sortOrder: 0,
            isPrimary: true,
          },
        ],
      })
    )
    assert.ok(row)
    assert.equal(row?.sku, "SKU-1")
    assert.equal(row?.quantity, 4)
    assert.equal(row?.listingId, "123")
    assert.equal(row?.marketplace, "eBay")
    assert.equal(row?.photoUrl, "https://example.com/a.jpg")
  })

  it("filters inventory rows by search query", () => {
    const rows = listingsToInventoryRows([
      listing({
        title: "Blue Jacket",
        specifics: {
          extras: { source: "ebay_import", sku: "JKT-1", ebayListingId: "1" },
        },
        marketplaceListings: [
          { marketplaceId: "ebay", externalId: "1", status: "listed" },
        ],
      }),
      listing({
        title: "Red Tee",
        specifics: {
          extras: { source: "ebay_import", sku: "TEE-1", ebayListingId: "2" },
        },
        marketplaceListings: [
          { marketplaceId: "ebay", externalId: "2", status: "listed" },
        ],
      }),
    ])
    assert.equal(filterInventoryRows(rows, "jacket").length, 1)
    assert.equal(filterInventoryRows(rows, "TEE-1").length, 1)
    assert.equal(filterInventoryRows(rows, "nope").length, 0)
  })
})
