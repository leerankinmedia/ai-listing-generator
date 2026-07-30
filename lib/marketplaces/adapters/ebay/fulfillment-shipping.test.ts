import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  buildFulfillmentPolicyCreateRequest,
  classifyFulfillmentShippingMode,
  fulfillmentPolicyIsFreeShipping,
  rejectedEbayFieldFromErrors,
  summarizeFulfillmentPolicy,
} from "@/lib/marketplaces/adapters/ebay/fulfillment-shipping"

describe("fulfillment shipping classification", () => {
  it("detects free shipping from freeShipping flag", () => {
    const policy = {
      fulfillmentPolicyId: "f1",
      name: "Free Ship",
      handlingTime: { value: 1, unit: "DAY" },
      shippingOptions: [
        {
          optionType: "DOMESTIC",
          costType: "FLAT_RATE",
          shippingServices: [
            {
              shippingServiceCode: "USPSPriority",
              freeShipping: true,
              shippingCost: { value: "0.0", currency: "USD" },
            },
          ],
        },
      ],
    }
    assert.equal(fulfillmentPolicyIsFreeShipping(policy), true)
    assert.equal(classifyFulfillmentShippingMode(policy), "free")
    const summary = summarizeFulfillmentPolicy(policy)!
    assert.equal(summary.whoPays, "seller")
    assert.match(summary.costSummary, /Free shipping/i)
  })

  it("detects calculated buyer-pays shipping", () => {
    const policy = {
      fulfillmentPolicyId: "f2",
      name: "Calc",
      handlingTime: { value: 2, unit: "DAY" },
      shippingOptions: [
        {
          optionType: "DOMESTIC",
          costType: "CALCULATED",
          shippingServices: [
            {
              shippingServiceCode: "USPSPriority",
              freeShipping: false,
              buyerResponsibleForShipping: true,
            },
          ],
        },
      ],
    }
    assert.equal(fulfillmentPolicyIsFreeShipping(policy), false)
    assert.equal(classifyFulfillmentShippingMode(policy), "calculated")
    const summary = summarizeFulfillmentPolicy(policy)!
    assert.equal(summary.whoPays, "buyer")
    assert.match(summary.costSummary, /calculated/i)
  })

  it("detects flat rate buyer-pays shipping", () => {
    const policy = {
      fulfillmentPolicyId: "f3",
      name: "Flat 5.99",
      shippingOptions: [
        {
          optionType: "DOMESTIC",
          costType: "FLAT_RATE",
          shippingServices: [
            {
              shippingServiceCode: "USPSPriority",
              freeShipping: false,
              shippingCost: { value: "5.99", currency: "USD" },
            },
          ],
        },
      ],
    }
    assert.equal(classifyFulfillmentShippingMode(policy), "flat")
    const summary = summarizeFulfillmentPolicy(policy)!
    assert.equal(summary.flatAmount, 5.99)
    assert.match(summary.costSummary, /5\.99/)
  })

  it("treats zero flat cost as free shipping", () => {
    const policy = {
      fulfillmentPolicyId: "f4",
      name: "Zero",
      shippingOptions: [
        {
          optionType: "DOMESTIC",
          costType: "FLAT_RATE",
          shippingServices: [
            {
              shippingServiceCode: "USPSPriority",
              freeShipping: false,
              shippingCost: { value: "0.00", currency: "USD" },
            },
          ],
        },
      ],
    }
    assert.equal(classifyFulfillmentShippingMode(policy), "free")
  })

  it("builds calculated USPS Ground Advantage body like eBay.com (no Motors flags)", () => {
    const body = buildFulfillmentPolicyCreateRequest({
      marketplaceId: "EBAY_US",
      mode: "calculated",
      name: "ListWise Calculated · USPSGroundAdvantage · 1d",
      handlingDays: 1,
      shippingServiceCode: "USPSGroundAdvantage",
    })

    assert.equal(body.localPickup, false)
    assert.equal(body.freightShipping, false)
    assert.equal(body.globalShipping, false)
    assert.equal(body.pickupDropOff, false)
    assert.equal(body.shippingOptions[0].costType, "CALCULATED")
    assert.equal(
      body.shippingOptions[0].shippingServices[0].shippingServiceCode,
      "USPSGroundAdvantage"
    )
    assert.equal(
      body.shippingOptions[0].shippingServices[0].shippingCarrierCode,
      "USPS"
    )
    assert.equal(body.shippingOptions[0].shippingServices[0].freeShipping, false)
    assert.equal(
      body.shippingOptions[0].shippingServices[0].shippingCost,
      undefined
    )
    // Must not invent Motors-only buyerResponsibleForShipping=true (LOGISTICS_INFO).
    assert.equal(
      "buyerResponsibleForShipping" in body.shippingOptions[0].shippingServices[0],
      false
    )
  })

  it("clones carrier/service from an eBay.com template policy", () => {
    const template = {
      fulfillmentPolicyId: "ebay-native-1",
      name: "Calculated: USPS Ground Advantage",
      shippingOptions: [
        {
          optionType: "DOMESTIC",
          costType: "CALCULATED",
          shippingServices: [
            {
              sortOrder: 1,
              shippingCarrierCode: "USPS",
              shippingServiceCode: "USPSGroundAdvantage",
              freeShipping: false,
            },
          ],
        },
      ],
    }
    const body = buildFulfillmentPolicyCreateRequest({
      marketplaceId: "EBAY_US",
      mode: "calculated",
      name: "Clone",
      handlingDays: 1,
      shippingServiceCode: "USPSPriority",
      template,
    })
    assert.equal(
      body.shippingOptions[0].shippingServices[0].shippingServiceCode,
      "USPSGroundAdvantage"
    )
    assert.equal(
      body.shippingOptions[0].shippingServices[0].shippingCarrierCode,
      "USPS"
    )
  })

  it("extracts LOGISTICS_INFO as the rejected field from 20403", () => {
    const field = rejectedEbayFieldFromErrors([
      {
        errorId: 20403,
        message: "Invalid LOGISTICS_INFO.",
        longMessage: "Invalid LOGISTICS_INFO.",
        parameters: [{ name: "fieldName", value: "LOGISTICS_INFO" }],
      },
    ])
    assert.equal(field, "LOGISTICS_INFO")
  })
})

