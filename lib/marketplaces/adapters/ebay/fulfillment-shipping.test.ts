import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  buildFulfillmentPolicyCreateRequest,
  classifyFulfillmentShippingMode,
  diagnoseFulfillmentCreateErrors,
  fulfillmentPolicyHasUsableLogistics,
  fulfillmentPolicyIsFreeShipping,
  fulfillmentRequestPresence,
  rejectedEbayFieldFromErrors,
  summarizeFulfillmentPolicy,
  toFinalFulfillmentPolicyJson,
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
    // Motors-only true is invalid; default production shape omits the flags.
    assert.equal(
      "buyerResponsibleForShipping" in
        body.shippingOptions[0].shippingServices[0],
      false
    )
    assert.equal("shipToLocations" in body, false)
    assert.equal(
      "shipToLocations" in body.shippingOptions[0].shippingServices[0],
      false
    )
    assert.equal("insuranceOffered" in body.shippingOptions[0], false)
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

  it("maps production 20403 / LSAS 216118 LOGISTICS_INFO_IS_MISSING", () => {
    const diagnosis = diagnoseFulfillmentCreateErrors([
      {
        errorId: 20403,
        domain: "API_ACCOUNT",
        message: "Invalid LOGISTICS_INFO_IS_MISSING.",
        longMessage: "LSAS validation failed.",
        parameters: [
          { name: "fieldName", value: "LOGISTICS_INFO_IS_MISSING" },
          { name: "SHIPELIG_ERROR_CODE_NAME", value: "LOGISTICS_INFO_IS_MISSING" },
          { name: "additionalInfo", value: "LSAS 216118" },
          { name: "1", value: "216118" },
        ],
      },
    ])
    assert.equal(diagnosis.lsasCode, "216118")
    assert.equal(diagnosis.logisticsInfoMissing, true)
    assert.equal(diagnosis.shouldRetryFlat, true)
    assert.equal(diagnosis.rejectedField, "LOGISTICS_INFO_IS_MISSING")
  })

  it("does not assume 216118 is a shipToLocations field error", () => {
    const diagnosis = diagnoseFulfillmentCreateErrors([
      {
        errorId: 20403,
        longMessage: "LSAS validation failed.",
        parameters: [
          { name: "fieldName", value: "LOGISTICS_INFO_IS_MISSING" },
          { name: "SHIPELIG_ERROR_CODE", value: "216118" },
        ],
      },
    ])
    assert.equal(diagnosis.lsasCode, "216118")
    assert.equal(diagnosis.logisticsInfoMissing, true)
    assert.notEqual(diagnosis.rejectedField, "shipToLocations")
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

  it("final production JSON keeps required EBAY_US fields and omits domestic shipToLocations", () => {
    const body = buildFulfillmentPolicyCreateRequest({
      marketplaceId: "EBAY_US",
      mode: "calculated",
      name: "ListWise Calculated · USPSGroundAdvantage · 1d",
      handlingDays: 1,
      shippingServiceCode: "USPSGroundAdvantage",
    })
    const finalJson = toFinalFulfillmentPolicyJson(body)
    const presence = fulfillmentRequestPresence(finalJson)
    assert.equal(presence.marketplaceId, "EBAY_US")
    assert.equal(presence.categoryType, "ALL_EXCLUDING_MOTORS_VEHICLES")
    assert.equal(presence.handlingTimeValue, 1)
    assert.equal(presence.handlingTimeUnit, "DAY")
    assert.equal(presence.localPickup, false)
    assert.equal(presence.optionType, "DOMESTIC")
    assert.equal(presence.costType, "CALCULATED")
    assert.equal(presence.shippingServiceCode, "USPSGroundAdvantage")
    assert.equal(presence.shippingCarrierCode, "USPS")
    assert.equal(presence.shippingCost, null)
    assert.equal(presence.hasTopLevelShipToLocations, false)
    assert.equal(presence.hasServiceShipToLocations, false)
    assert.equal(presence.hasInsuranceOffered, false)
    assert.equal(presence.buyerResponsibleForShipping, null)
    assert.equal(JSON.stringify(finalJson).includes("shipToLocations"), false)
  })

  it("skips listed policies that have no shipping service (stale / empty logistics)", () => {
    assert.equal(
      fulfillmentPolicyHasUsableLogistics({
        fulfillmentPolicyId: "empty",
        name: "ListWise Calculated",
        shippingOptions: [],
      }),
      false
    )
    assert.equal(
      fulfillmentPolicyHasUsableLogistics({
        fulfillmentPolicyId: "ok",
        shippingOptions: [
          {
            optionType: "DOMESTIC",
            costType: "CALCULATED",
            shippingServices: [{ shippingServiceCode: "USPSGroundAdvantage" }],
          },
        ],
      }),
      true
    )
  })
})

