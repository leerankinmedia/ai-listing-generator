import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  buildImportGetOffersPath,
  isActivePublishedOffer,
  isEbayInventoryApiSku,
  listWiseImportKey,
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

  it("import getOffers path never includes sku=", () => {
    const path = buildImportGetOffersPath(0, 25, "EBAY_US")
    assert.equal(/[?&]sku=/i.test(path), false)
    assert.match(path, /\/sell\/inventory\/v1\/offer\?/)
    assert.match(path, /limit=25/)
    assert.match(path, /offset=0/)
    assert.match(path, /marketplace_ids=EBAY_US/)
  })

  it("only allows strictly alphanumeric Inventory API SKUs ≤50 chars", () => {
    assert.equal(isEbayInventoryApiSku("ABC123"), true)
    assert.equal(isEbayInventoryApiSku("a".repeat(50)), true)
    assert.equal(isEbayInventoryApiSku(""), false)
    assert.equal(isEbayInventoryApiSku("   "), false)
    assert.equal(isEbayInventoryApiSku("SKU-RED"), false)
    assert.equal(isEbayInventoryApiSku("SKU_RED"), false)
    assert.equal(isEbayInventoryApiSku("SKU RED"), false)
    assert.equal(isEbayInventoryApiSku("a".repeat(51)), false)
    assert.equal(isEbayInventoryApiSku("sku!"), false)
  })

  it("generates an alphanumeric ListWise import key", () => {
    const key = listWiseImportKey("999888777666", "offer-1")
    assert.match(key, /^[A-Za-z0-9]{1,50}$/)
    assert.ok(key.startsWith("LW"))
  })

  it("maps active offer fields into a ListWise listing", () => {
    const listing = mapEbayImportToListing({
      userId: "11111111-1111-4111-a111-111111111111",
      nowIso: "2026-07-27T00:00:00.000Z",
      imported: {
        offerId: "offer-1",
        sku: "SKUREDTEE",
        ebayListingId: "999888777666",
        title: "Vintage Red Tee",
        description: "Soft cotton tee",
        price: 24.5,
        currency: "USD",
        quantity: 3,
        categoryId: "15724",
        categoryName: "T-Shirts",
        imageUrls: [
          "https://i.ebayimg.com/images/g/abc/s-l1600.jpg",
          "https://i.ebayimg.com/images/g/def/s-l1600.jpg",
        ],
        brand: "Nike",
        condition: "Used",
        conditionId: "3000",
        conditionDescription: "Light wear",
        listingStatus: "ACTIVE",
        offerStatus: "PUBLISHED",
        listingFormat: "FixedPriceItem",
        startTime: "2026-01-01T00:00:00.000Z",
        shippingType: "Flat",
        shippingCost: "5.99",
        itemSpecifics: {
          Brand: "Nike",
          Size: "M",
          Color: "Red",
          Material: "Cotton",
          Style: "Crew Neck",
          Pattern: "Solid",
          Gender: "Men",
          Department: "Men",
          Type: "T-Shirt",
        },
        detailStatus: "full",
      },
    })

    assert.equal(listing.title, "Vintage Red Tee")
    assert.equal(listing.description, "Soft cotton tee")
    assert.equal(listing.price, 24.5)
    assert.equal(listing.currency, "USD")
    assert.equal(listing.status, "listed")
    assert.equal(listing.specifics.brand, "Nike")
    assert.equal(listing.specifics.size, "M")
    assert.equal(listing.specifics.color, "Red")
    assert.equal(listing.specifics.material, "Cotton")
    assert.equal(listing.specifics.style, "Crew Neck")
    assert.equal(listing.specifics.pattern, "Solid")
    assert.equal(listing.specifics.gender, "Men")
    assert.equal(listing.specifics.condition, "Good")
    assert.equal(listing.specifics.flaws, "Light wear")
    assert.equal(listing.specifics.category, "T-Shirts")
    assert.equal(listing.specifics.extras?.sku, "SKUREDTEE")
    assert.equal(listing.specifics.extras?.ebaySku, "SKUREDTEE")
    assert.equal(listing.specifics.extras?.quantity, "3")
    assert.equal(listing.specifics.extras?.department, "Men")
    assert.equal(listing.specifics.extras?.type, "T-Shirt")
    assert.equal(listing.specifics.extras?.ebayListingFormat, "FixedPriceItem")
    assert.equal(listing.specifics.extras?.ebayShippingCost, "5.99")
    assert.equal(listing.marketplaceListings[0]?.marketplaceId, "ebay")
    assert.equal(listing.marketplaceListings[0]?.externalId, "999888777666")
    assert.equal(listing.images.length, 2)
    assert.equal(listing.images[0]?.isPrimary, true)
    assert.equal(listing.images[1]?.sortOrder, 1)
    assert.equal(listing.aiGenerated, false)
    assert.deepEqual(listing.targetMarketplaces, ["ebay"])
  })

  it("preserves invalid seller SKU while using a safe ListWise inventory key", () => {
    const listing = mapEbayImportToListing({
      userId: "11111111-1111-4111-a111-111111111111",
      nowIso: "2026-07-27T00:00:00.000Z",
      imported: {
        offerId: "offer-9",
        sku: "SKU-RED_TEE",
        ebayListingId: "111222333444",
        title: "Hyphen SKU Tee",
        description: "",
        price: 10,
        currency: "USD",
        quantity: 1,
        categoryId: "15724",
        imageUrls: [],
        listingStatus: "ACTIVE",
        offerStatus: "PUBLISHED",
      },
    })
    assert.equal(listing.specifics.extras?.ebaySku, "SKU-RED_TEE")
    assert.equal(listing.specifics.extras?.ebayOriginalSku, "SKU-RED_TEE")
    assert.equal(isEbayInventoryApiSku(listing.specifics.extras?.sku), true)
    assert.notEqual(listing.specifics.extras?.sku, "SKU-RED_TEE")
  })

  it("imports active offers even when seller SKU is blank", () => {
    assert.equal(
      isActivePublishedOffer({
        offerId: "o1",
        sku: "",
        status: "PUBLISHED",
        listing: { listingId: "123", listingStatus: "ACTIVE" },
      }),
      true
    )
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
