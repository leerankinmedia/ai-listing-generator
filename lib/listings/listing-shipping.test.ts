import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  fulfillmentPolicyArgsFromIntent,
  listingShippingIntent,
  reviewPackageSummary,
  reviewShippingSummary,
} from "@/lib/listings/listing-shipping"
import { buildFulfillmentPolicyCreateRequest } from "@/lib/marketplaces/adapters/ebay/fulfillment-shipping"
import type { Listing } from "@/lib/types"

function baseListing(partial: Partial<Listing> = {}): Listing {
  return {
    id: "lst-ship",
    userId: "user-1",
    title: "American Eagle Men's 32x30 Blue Jeans",
    description: "Pre-owned jeans",
    price: 28,
    currency: "USD",
    keywords: [],
    specifics: {
      shippingMode: "calculated",
      shippingService: "USPSGroundAdvantage",
      handlingTimeDays: 1,
      itemLocationZip: "43604",
      internationalShipping: false,
      returnsAccepted: true,
      returnWindowDays: 30,
      returnShippingPaidBy: "BUYER",
      shippingPackage: {
        weightPounds: 1,
        weightOunces: 8,
        lengthInches: 12,
        widthInches: 9,
        heightInches: 2,
        packageType: "MAILING_BOX",
        irregularPackage: false,
      },
    },
    fieldConfidence: {},
    images: [],
    status: "draft",
    marketplaceListings: [],
    targetMarketplaces: ["ebay"],
    aiGenerated: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  }
}

describe("listing shipping intent", () => {
  it("captures calculated USPS Ground Advantage / buyer pays", () => {
    const intent = listingShippingIntent(baseListing())
    assert.equal(intent.deliveryMethod, "shipping_only")
    assert.equal(intent.mode, "calculated")
    assert.equal(intent.costType, "CALCULATED")
    assert.equal(intent.shippingServiceCode, "USPSGroundAdvantage")
    assert.equal(intent.whoPays, "buyer")
    assert.equal(intent.international, false)
    assert.equal(intent.itemLocationZip, "43604")
    assert.equal(intent.handlingTimeDays, 1)
    assert.equal(intent.returnsAccepted, true)
    assert.equal(intent.returnWindowDays, 30)
    assert.equal(intent.package?.weightPounds, 1)
    assert.equal(intent.package?.weightOunces, 8)
    assert.match(reviewShippingSummary(baseListing()), /USPS Ground Advantage — Buyer pays/)
    assert.match(reviewPackageSummary(baseListing()), /1 lb 8 oz/)
  })

  it("shows USPS Ground Advantage — Buyer pays even if envelope was stored on apparel", () => {
    const listing = baseListing({
      title: "Women's skinny jeans",
      specifics: {
        ...baseListing().specifics,
        ebayCategory: {
          marketplaceId: "EBAY_US",
          categoryTreeId: "0",
          categoryId: "11554",
          categoryName: "Jeans",
          categoryPath:
            "Clothing, Shoes & Accessories > Women > Women's Clothing > Jeans",
          leafCategory: true,
        },
        shippingService: "US_eBayStandardEnvelope",
      },
    })
    assert.equal(listingShippingIntent(listing).shippingServiceCode, "USPSGroundAdvantage")
    assert.equal(reviewShippingSummary(listing), "USPS Ground Advantage — Buyer pays")
  })

  it("maps calculated intent onto the known-good Account API shape", () => {
    const intent = listingShippingIntent(baseListing())
    const args = fulfillmentPolicyArgsFromIntent(intent)
    const body = buildFulfillmentPolicyCreateRequest({
      ...args,
      name: "ListWise test",
    })
    assert.equal(body.marketplaceId, "EBAY_US")
    assert.equal(body.globalShipping, false)
    assert.equal(body.shippingOptions[0].optionType, "DOMESTIC")
    assert.equal(body.shippingOptions[0].costType, "CALCULATED")
    assert.equal(
      body.shippingOptions[0].shippingServices[0].shippingServiceCode,
      "USPSGroundAdvantage"
    )
    assert.equal(
      body.shippingOptions[0].shippingServices[0].shippingCarrierCode,
      "USPS"
    )
    assert.equal(body.shippingOptions[0].packageHandlingCost?.value, "0.0")
    assert.equal(
      body.shippingOptions[0].shippingServices[0].shippingCost,
      undefined
    )
    assert.equal(
      Object.prototype.hasOwnProperty.call(body, "shipToLocations"),
      false
    )
  })

  it("captures flat buyer-pays shipping", () => {
    const listing = baseListing({
      specifics: {
        ...baseListing().specifics,
        shippingMode: "flat",
        flatShippingAmount: 5.99,
      },
    })
    const intent = listingShippingIntent(listing)
    assert.equal(intent.mode, "flat")
    assert.equal(intent.whoPays, "buyer")
    assert.equal(intent.flatAmount, 5.99)
    const body = buildFulfillmentPolicyCreateRequest({
      ...fulfillmentPolicyArgsFromIntent(intent),
      name: "flat",
    })
    assert.equal(body.shippingOptions[0].costType, "FLAT_RATE")
    assert.equal(body.shippingOptions[0].shippingServices[0].shippingCost?.value, "5.99")
  })

  it("captures free shipping / seller pays", () => {
    const listing = baseListing({
      specifics: {
        ...baseListing().specifics,
        shippingMode: "free",
        freeShippingConfirmed: true,
      },
    })
    const intent = listingShippingIntent(listing)
    assert.equal(intent.mode, "free")
    assert.equal(intent.whoPays, "seller")
    const body = buildFulfillmentPolicyCreateRequest({
      ...fulfillmentPolicyArgsFromIntent(intent),
      name: "free",
    })
    assert.equal(body.shippingOptions[0].shippingServices[0].freeShipping, true)
    assert.equal(body.shippingOptions[0].shippingServices[0].shippingCost?.value, "0.0")
  })

  it("persists the seller-selected UPS/FedEx service onto the fulfillment create body", () => {
    const listing = baseListing({
      specifics: {
        ...baseListing().specifics,
        shippingService: "UPSGround",
        extras: { shippingService: "UPSGround" },
      },
    })
    const intent = listingShippingIntent(listing)
    assert.equal(intent.shippingServiceCode, "UPSGround")
    const body = buildFulfillmentPolicyCreateRequest({
      ...fulfillmentPolicyArgsFromIntent(intent),
      name: "ups",
    })
    assert.equal(
      body.shippingOptions[0].shippingServices[0].shippingServiceCode,
      "UPSGround"
    )
    assert.equal(
      body.shippingOptions[0].shippingServices[0].shippingCarrierCode,
      "UPS"
    )
  })

  it("maps each selected ListWise service to the same eBay API code through draft intent and create body", () => {
    const services = [
      { code: "USPSGroundAdvantage", carrier: "USPS" },
      { code: "USPSPriority", carrier: "USPS" },
      { code: "UPSGround", carrier: "UPS" },
      { code: "FedExHomeDelivery", carrier: "FedEx" },
    ] as const
    for (const { code, carrier } of services) {
      const listing = baseListing({
        specifics: {
          ...baseListing().specifics,
          shippingService: code,
          extras: { shippingService: code },
        },
      })
      const intent = listingShippingIntent(listing)
      assert.equal(intent.shippingServiceCode, code)
      const body = buildFulfillmentPolicyCreateRequest({
        ...fulfillmentPolicyArgsFromIntent(intent),
        name: code,
      })
      assert.equal(
        body.shippingOptions[0].shippingServices[0].shippingServiceCode,
        code
      )
      assert.equal(
        body.shippingOptions[0].shippingServices[0].shippingCarrierCode,
        carrier
      )
    }
  })
})
