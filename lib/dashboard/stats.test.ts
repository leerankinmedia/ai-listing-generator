import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  countActiveListings,
  countConnectedShops,
  formatConnectedShopsLabel,
  formatEntitlementStatusLabel,
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
  it("counts only saved listings with status listed as active", () => {
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
    assert.equal(countActiveListings(rows), 1)
  })

  it("formats connected shops from live connection ids as n/9", () => {
    assert.equal(countConnectedShops(["ebay"]), 1)
    assert.equal(countConnectedShops(["ebay", "EBAY"]), 1)
    assert.equal(formatConnectedShopsLabel(1), "1 / 9")
    assert.equal(formatConnectedShopsLabel(0), "0 / 9")
  })

  it("never labels ListWise Pro unless entitlement is unlocked", () => {
    assert.equal(
      formatEntitlementStatusLabel({
        paidToolsUnlocked: false,
        status: "expired",
        statusLabel: "Trial expired",
      }),
      "Trial expired"
    )
    assert.equal(
      formatEntitlementStatusLabel({
        paidToolsUnlocked: true,
        status: "active",
        statusLabel: "Active",
      }),
      "Active"
    )
    assert.equal(
      formatEntitlementStatusLabel({
        paidToolsUnlocked: true,
        status: "owner",
        ownerOverride: true,
        statusLabel: "Founder • Owner",
      }),
      "Founder • Owner"
    )
  })
})
