import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  isActivePublishedOffer,
  listingIdForEbayImport,
  mapEbayImportToListing,
} from "@/lib/marketplaces/adapters/ebay/import-map"

describe("eBay inventory import mapping", () => {
  it("builds a stable listing id per user + eBay listing id", () => {
    const a = listingIdForEbayImport("user-1", "123456789012")
    const b = listingIdForEbayImport("user-1", "123456789012")
    const c = listingIdForEbayImport("user-2", "123456789012")
    assert.equal(a, b)
    assert.notEqual(a, c)
    assert.match(
      a,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    )
  })

  it("maps active offer fields into a ListWise listing", () => {
    const listing = mapEbayImportToListing({
      userId: "11111111-1111-4111-a111-111111111111",
      nowIso: "2026-07-27T00:00:00.000Z",
      imported: {
        offerId: "offer-1",
        sku: "SKU-RED-TEE",
        ebayListingId: "999888777666",
        title: "Vintage Red Tee",
        description: "Soft cotton tee",
        price: 24.5,
        currency: "USD",
        quantity: 3,
        categoryId: "15724",
        imageUrls: ["https://i.ebayimg.com/images/g/abc/s-l1600.jpg"],
        brand: "Nike",
        condition: "USED_EXCELLENT",
        listingStatus: "ACTIVE",
        offerStatus: "PUBLISHED",
      },
    })

    assert.equal(listing.title, "Vintage Red Tee")
    assert.equal(listing.price, 24.5)
    assert.equal(listing.currency, "USD")
    assert.equal(listing.status, "listed")
    assert.equal(listing.specifics.brand, "Nike")
    assert.equal(listing.specifics.category, "eBay category 15724")
    assert.equal(listing.specifics.extras?.sku, "SKU-RED-TEE")
    assert.equal(listing.specifics.extras?.quantity, "3")
    assert.equal(listing.marketplaceListings[0]?.marketplaceId, "ebay")
    assert.equal(listing.marketplaceListings[0]?.externalId, "999888777666")
    assert.equal(listing.images.length, 1)
    assert.equal(listing.images[0]?.isPrimary, true)
    assert.equal(listing.aiGenerated, false)
    assert.deepEqual(listing.targetMarketplaces, ["ebay"])
  })

  it("only treats published/active offers with listing ids as importable", () => {
    assert.equal(
      isActivePublishedOffer({
        offerId: "o1",
        sku: "s1",
        status: "PUBLISHED",
        listing: { listingId: "123", listingStatus: "ACTIVE" },
      }),
      true
    )
    assert.equal(
      isActivePublishedOffer({
        offerId: "o1",
        sku: "s1",
        status: "UNPUBLISHED",
        listing: { listingId: "123", listingStatus: "ENDED" },
      }),
      false
    )
    assert.equal(
      isActivePublishedOffer({
        offerId: "o1",
        sku: "s1",
        status: "PUBLISHED",
        listing: {},
      }),
      false
    )
  })
})
