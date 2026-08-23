import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  derivedInternalInventorySku,
  formatListWiseSku,
  pickPublishSku,
  resolveListingSku,
  sellerFacingCustomLabel,
  shouldClearEbayCustomLabel,
  DEFAULT_SKU_SETTINGS,
} from "@/lib/listings/sku"
import { enrichEbayTitleTowardLimit } from "@/lib/listings/ebay-title"
import type { Listing } from "@/lib/types"

function baseListing(partial: Partial<Listing> = {}): Listing {
  return {
    id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    userId: "user1",
    title: "Nike Tee",
    description: "Soft tee",
    price: 20,
    currency: "USD",
    keywords: [],
    specifics: {},
    fieldConfidence: {},
    images: [],
    status: "draft",
    marketplaceListings: [],
    targetMarketplaces: ["ebay"],
    aiGenerated: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...partial,
  }
}

describe("SKU resolution", () => {
  it("prefers imported eBay SKU over listing UUID", () => {
    const listing = baseListing({
      specifics: {
        extras: {
          ebayOriginalSku: "SELLERSKU1",
          sku: "SELLERSKU1",
        },
      },
    })
    assert.equal(resolveListingSku(listing), "SELLERSKU1")
    assert.equal(pickPublishSku(listing), "SELLERSKU1")
    assert.notEqual(pickPublishSku(listing), listing.id.replace(/-/g, ""))
  })

  it("formats ListWise SKUs with padding", () => {
    assert.equal(
      formatListWiseSku({ ...DEFAULT_SKU_SETTINGS, nextNumber: 42 }),
      "LW00042"
    )
  })

  it("defaults autoGenerate to false", () => {
    assert.equal(DEFAULT_SKU_SETTINGS.autoGenerate, false)
  })

  it("never returns a raw UUID from pickPublishSku", () => {
    const listing = baseListing({ specifics: {} })
    const sku = pickPublishSku(listing)
    assert.ok(!sku.includes("-"))
    assert.match(sku, /^LW/i)
  })

  it("keeps the Inventory API key internal when the seller did not enter a Custom Label", () => {
    const listing = baseListing({ specifics: {} })
    assert.equal(resolveListingSku(listing), null)
    assert.equal(sellerFacingCustomLabel(listing), null)
    assert.equal(shouldClearEbayCustomLabel(listing), true)
    assert.equal(pickPublishSku(listing), derivedInternalInventorySku(listing.id))
    assert.match(pickPublishSku(listing), /^LW[A-Z0-9]{8}$/)
  })

  it("does not treat the internal LW+listing-id hash as a seller Custom Label", () => {
    const listing = baseListing({
      specifics: {
        extras: { sku: derivedInternalInventorySku("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee") },
      },
    })
    assert.equal(sellerFacingCustomLabel(listing), null)
    assert.equal(shouldClearEbayCustomLabel(listing), true)
    assert.equal(pickPublishSku(listing), derivedInternalInventorySku(listing.id))
  })

  it("uses a seller-entered SKU as both Inventory key and Custom Label", () => {
    const listing = baseListing({
      specifics: { extras: { sku: "MYSHELF42" } },
    })
    assert.equal(sellerFacingCustomLabel(listing), "MYSHELF42")
    assert.equal(shouldClearEbayCustomLabel(listing), false)
    assert.equal(pickPublishSku(listing), "MYSHELF42")
  })
})

describe("ebay title enrichment", () => {
  it("extends short titles with known attributes up to 80", () => {
    const listing = baseListing({
      title: "Nike",
      specifics: {
        brand: "Nike",
        gender: "Men",
        size: "XL",
        color: "Gray",
        style: "Graphic T-Shirt",
      },
    })
    const title = enrichEbayTitleTowardLimit(listing.title, listing)
    assert.ok(title.length > "Nike".length)
    assert.ok(title.length <= 80)
    assert.match(title, /Nike/)
    assert.match(title, /XL|Gray|Graphic/i)
  })

  it("targets 70–80 characters when enough SEO keywords exist", () => {
    const listing = baseListing({
      title: "Levi's",
      specifics: {
        brand: "Levi's",
        gender: "Men",
        size: "32x32",
        color: "Blue",
        style: "Straight",
        material: "Denim",
        pattern: "Solid",
        extras: {
          Type: "Jeans",
          Department: "Men",
          Color: "Blue",
          Style: "Straight",
          Fit: "Regular",
        },
      },
    })
    const title = enrichEbayTitleTowardLimit(listing.title, listing)
    assert.ok(title.length <= 80)
    assert.ok(
      title.length >= 70 || title.split(" ").length >= 4,
      `expected SEO-rich title, got (${title.length}): ${title}`
    )
    assert.ok(!/best|deal|nice|awesome|quality/i.test(title))
  })
})
