import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  countActiveListings,
  countConnectedShops,
  formatConnectedShopsLabel,
} from "@/lib/dashboard/stats"
import type { Listing } from "@/lib/types"

function listing(partial: Partial<Listing>): Listing {
  return {
    id: partial.id || "1",
    userId: "u1",
    title: "Tee",
    description: "",
    price: 10,
    currency: "USD",
    keywords: [],
    specifics: {},
    fieldConfidence: {},
    images: [],
    status: partial.status || "draft",
    marketplaceListings: partial.marketplaceListings || [],
    targetMarketplaces: [],
    aiGenerated: true,
    createdAt: "",
    updatedAt: "",
  }
}

describe("dashboard stats", () => {
  it("counts only listed / marketplace-listed items as active", () => {
    const rows = [
      listing({ status: "draft" }),
      listing({ status: "ready" }),
      listing({ status: "listed" }),
      listing({
        status: "ready",
        marketplaceListings: [
          { marketplaceId: "ebay", status: "listed", externalId: "123" },
        ],
      }),
    ]
    assert.equal(countActiveListings(rows), 2)
  })

  it("formats connected shops from live connection ids as n/9", () => {
    assert.equal(countConnectedShops(["ebay"]), 1)
    assert.equal(formatConnectedShopsLabel(1), "1 / 9")
    assert.equal(formatConnectedShopsLabel(0), "0 / 9")
  })
})
