import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  buildFulfillmentPolicyCreateRequest,
  classifyFulfillmentShippingMode,
  diagnoseFulfillmentCreateErrors,
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
    // Dev Support working create uses explicit false — never true (Motors-only).
    assert.equal(
      body.shippingOptions[0].shippingServices[0].buyerResponsibleForShipping,
      false
    )
    assert.equal(
      body.shippingOptions[0].shippingServices[0].buyerResponsibleForPickup,
      false
    )
    assert.equal(body.shippingOptions[0].insuranceOffered, false)
    assert.deepEqual(body.shippingOptions[0].insuranceFee, {
      value: "0.0",
      currency: "USD",
    })
    assert.deepEqual(body.shipToLocations, {
      regionIncluded: [{ regionName: "US", regionType: "COUNTRY" }],
    })
    assert.deepEqual(
      body.shippingOptions[0].shippingServices[0].shipToLocations,
      body.shipToLocations
    )
    assert.equal("default" in body.categoryTypes[0], false)
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

  it("maps 20403 / LSAS 216118 to shipToLocations", () => {
    const diagnosis = diagnoseFulfillmentCreateErrors([
      {
        errorId: 20403,
        domain: "API_ACCOUNT",
        message: "Invalid LOGISTICS_INFO.",
        longMessage: "LSAS validation failed.",
        parameters: [
          { name: "fieldName", value: "LOGISTICS_INFO" },
          { name: "additionalInfo", value: "LSAS 216118" },
          { name: "1", value: "216118" },
        ],
      },
    ])
    assert.equal(diagnosis.lsasCode, "216118")
    assert.equal(diagnosis.shipToLocationInvalid, true)
    assert.equal(diagnosis.rejectedField, "shipToLocations")
  })

  it("maps numeric 216118 parameter values, not just strings", () => {
    const diagnosis = diagnoseFulfillmentCreateErrors([
      {
        errorId: 20403,
        longMessage: "LSAS validation failed.",
        parameters: [
          { name: "fieldName", value: "LOGISTICS_INFO" },
          { name: "SHIPELIG_ERROR_CODE", value: "216118" },
        ],
      },
    ])
    assert.equal(diagnosis.lsasCode, "216118")
    assert.equal(diagnosis.shipToLocationInvalid, true)
  })

  it("detects CALCULATED_SHIPPING_TYPE_NOT_SUPPORTED from SHIPELIG", () => {
    const diagnosis = diagnoseFulfillmentCreateErrors([
      {
        errorId: 20403,
        longMessage: "LSAS validation failed.",
        parameters: [
          {
            name: "SHIPELIG_ERROR_CODE_NAME",
            value: "CALCULATED_SHIPPING_TYPE_NOT_SUPPORTED",
          },
        ],
      },
    ])
    assert.equal(diagnosis.calculatedNotSupported, true)
    assert.equal(diagnosis.rejectedField, "CALCULATED_SHIPPING_TYPE_NOT_SUPPORTED")
  })

  it("sets default:true only when asked (first policy on the account)", () => {
    const body = buildFulfillmentPolicyCreateRequest({
      marketplaceId: "EBAY_US",
      mode: "flat",
      name: "ListWise Flat",
      handlingDays: 1,
      shippingServiceCode: "USPSGroundAdvantage",
      flatAmount: 5.99,
      setAsDefault: true,
    })
    assert.equal(body.categoryTypes[0].default, true)
    assert.equal(body.shippingOptions[0].costType, "FLAT_RATE")
    assert.equal(
      body.shippingOptions[0].shippingServices[0].shippingCost?.value,
      "5.99"
    )
  })
})

