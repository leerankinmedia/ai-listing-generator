import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  applyEbaySellerDefaultsToListing,
  ebaySellerDefaultsAreReady,
  missingEbaySellerDefaultFields,
  normalizeEbaySellerDefaults,
  resolveOfferPriceFloor,
  DEFAULT_EBAY_SELLER_DEFAULTS,
} from "@/lib/seller/ebay-defaults"
import { createEmptyListing } from "@/lib/listings/local-db"

describe("ebay seller defaults", () => {
  it("normalizes unknown input to safe defaults", () => {
    const d = normalizeEbaySellerDefaults({})
    assert.equal(d.handlingTimeDays, 1)
    assert.equal(d.shippingMode, "calculated")
    assert.equal(d.shippingService, "USPSGroundAdvantage")
    assert.equal(d.promotedListings, "off")
    assert.equal(d.refundMethod, "MONEY_BACK")
  })

  it("requires package, zip, and custom promo percent when incomplete", () => {
    const missing = missingEbaySellerDefaultFields({
      ...DEFAULT_EBAY_SELLER_DEFAULTS,
      promotedListings: "custom",
      promotedListingsPercent: null,
    })
    assert.ok(missing.some((m) => m.includes("ZIP")))
    assert.ok(missing.some((m) => m.includes("package")))
    assert.ok(missing.some((m) => m.includes("promoted")))
  })

  it("is ready when package + zip are set", () => {
    const defaults = normalizeEbaySellerDefaults({
      ...DEFAULT_EBAY_SELLER_DEFAULTS,
      itemLocationZip: "43604",
      package: {
        weightPounds: 1,
        weightOunces: 0,
        lengthInches: 12,
        widthInches: 9,
        heightInches: 1,
        packageType: "PACKAGE_THICK_ENVELOPE",
      },
    })
    assert.equal(ebaySellerDefaultsAreReady(defaults), true)
  })

  it("applies defaults to a new listing without inventing zeros", () => {
    const listing = createEmptyListing("user_1")
    const defaults = normalizeEbaySellerDefaults({
      handlingTimeDays: 3,
      shippingMode: "calculated",
      shippingService: "USPSPriority",
      itemLocationZip: "43604",
      allowOffers: true,
      returnsAccepted: false,
      requireImmediatePayment: true,
      promotedListings: "dynamic",
      package: {
        weightPounds: 1,
        weightOunces: 0,
        lengthInches: 12,
        widthInches: 9,
        heightInches: 1,
        packageType: "PACKAGE_THICK_ENVELOPE",
      },
    })
    const next = applyEbaySellerDefaultsToListing(listing, defaults, {
      onlyIfUnset: false,
    })
    assert.equal(next.specifics.handlingTimeDays, 3)
    assert.equal(next.specifics.shippingService, "USPSPriority")
    assert.equal(next.specifics.allowOffers, true)
    assert.equal(next.specifics.returnsAccepted, false)
    assert.equal(next.specifics.requireImmediatePayment, true)
    assert.equal(next.specifics.promotedListings, "dynamic")
    assert.equal(next.specifics.extras?.itemLocationZip, "43604")
    assert.equal(next.specifics.itemLocationZip, "43604")
    assert.equal(next.specifics.internationalShipping, false)
    assert.equal(next.specifics.extras?.quantity, "1")
    assert.equal(next.specifics.shippingPackage?.weightPounds, 1)
  })

  it("resolves offer floors from amount or percent", () => {
    assert.equal(resolveOfferPriceFloor(100, 40, null), 40)
    assert.equal(resolveOfferPriceFloor(100, null, 50), 50)
    assert.equal(resolveOfferPriceFloor(100, 40, 50), 50)
  })
})
