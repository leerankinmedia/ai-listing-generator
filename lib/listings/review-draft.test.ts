import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  collectEbayPublishBlockers,
  ebayLiveSummary,
  ebayResultIsLive,
  ensureListingQuantity,
  listingQuantity,
  reviewDraftIsPublishReady,
  setListingQuantity,
} from "@/lib/listings/review-draft"
import type { Listing, OneClickPublishResult } from "@/lib/types"

function listing(partial: Partial<Listing> = {}): Listing {
  return {
    id: "lst-1",
    userId: "user-1",
    title: "Nike Men's XL Black Dri-Fit Tee",
    description: "Pre-owned Nike tee in good condition.",
    price: 18,
    currency: "USD",
    keywords: ["nike"],
    specifics: {
      brand: "Nike",
      size: "XL",
      color: "Black",
      gender: "Men",
      condition: "Good",
      ebayCategory: {
        marketplaceId: "EBAY_US",
        categoryTreeId: "0",
        categoryId: "15687",
        categoryName: "T-Shirts",
        categoryPath: "Clothing > Men > T-Shirts",
        leafCategory: true,
      },
      ebayCondition: {
        conditionId: "3000",
        conditionName: "Pre-owned - Good",
        conditionEnum: "USED_GOOD",
      },
      shippingMode: "calculated",
      shippingPackage: {
        weightPounds: 0,
        weightOunces: 8,
        lengthInches: 12,
        widthInches: 9,
        heightInches: 1,
        packageType: "PACKAGE_THICK_ENVELOPE",
      },
      extras: { quantity: "1" },
    },
    fieldConfidence: {},
    images: [
      {
        id: "img-1",
        url: "https://example.com/a.jpg",
        sortOrder: 0,
        isPrimary: true,
        storageStatus: "uploaded",
      },
    ],
    status: "draft",
    marketplaceListings: [],
    targetMarketplaces: ["ebay"],
    aiGenerated: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  }
}

describe("review draft quantity", () => {
  it("defaults to 1 when missing or invalid", () => {
    assert.equal(listingQuantity(listing({ specifics: {} })), 1)
    assert.equal(
      listingQuantity(
        listing({
          specifics: { extras: { quantity: "0" } },
        })
      ),
      1
    )
  })

  it("sets a whole-number quantity of at least 1", () => {
    const next = setListingQuantity(listing(), 3)
    assert.equal(listingQuantity(next), 3)
    assert.equal(next.specifics.extras?.quantity, "3")
    assert.equal(listingQuantity(setListingQuantity(listing(), 0)), 1)
  })

  it("fills quantity=1 on drafts that omitted it", () => {
    const next = ensureListingQuantity(
      listing({ specifics: { extras: { sku: "LW1" } } })
    )
    assert.equal(next.specifics.extras?.quantity, "1")
    assert.equal(next.specifics.extras?.sku, "LW1")
  })
})

describe("collectEbayPublishBlockers", () => {
  const readyMeta = { missing: [], filled: 8, total: 8 }

  it("returns no blockers for a complete clothing draft", () => {
    assert.deepEqual(collectEbayPublishBlockers(listing(), readyMeta), [])
    assert.equal(reviewDraftIsPublishReady(listing(), readyMeta), true)
  })

  it("lists missing required fields in user-facing labels", () => {
    const incomplete = listing({
      title: "  ",
      description: "",
      price: 0,
      images: [],
      specifics: {
        shippingMode: "calculated",
      },
    })
    const blockers = collectEbayPublishBlockers(incomplete, {
      missing: ["Brand"],
      filled: 0,
      total: 0,
    })
    assert.ok(blockers.includes("Title"))
    assert.ok(blockers.includes("Description"))
    assert.ok(blockers.includes("Price"))
    assert.ok(blockers.includes("Photos"))
    assert.ok(blockers.includes("eBay category"))
    assert.ok(blockers.includes("Condition"))
    assert.ok(blockers.includes("Item specifics (still loading)"))
  })

  it("surfaces required item specifics after they load", () => {
    const blockers = collectEbayPublishBlockers(listing(), {
      missing: ["Size Type"],
      filled: 7,
      total: 8,
    })
    assert.deepEqual(blockers, ["Size Type"])
    assert.equal(reviewDraftIsPublishReady(listing(), {
      missing: ["Size Type"],
      filled: 7,
      total: 8,
    }), false)
  })
})

describe("ebay live summary", () => {
  it("prefers the publish result listing id and url", () => {
    const results: OneClickPublishResult[] = [
      {
        marketplaceId: "ebay",
        ok: true,
        status: "published",
        message: "Listed",
        listingRef: {
          marketplaceId: "ebay",
          status: "listed",
          externalId: "123456789012",
          url: "https://www.ebay.com/itm/123456789012",
        },
      },
    ]
    const summary = ebayLiveSummary(listing({ title: "Live tee", price: 22 }), results)
    assert.equal(summary.title, "Live tee")
    assert.equal(summary.price, 22)
    assert.equal(summary.listingId, "123456789012")
    assert.equal(summary.url, "https://www.ebay.com/itm/123456789012")
    assert.equal(ebayResultIsLive(results), true)
  })

  it("does not treat failed publish as live", () => {
    assert.equal(
      ebayResultIsLive([
        {
          marketplaceId: "ebay",
          ok: false,
          status: "error",
          message: "Missing Brand",
        },
      ]),
      false
    )
  })
})
