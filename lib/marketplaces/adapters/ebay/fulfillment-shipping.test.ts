import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  classifyFulfillmentShippingMode,
  fulfillmentPolicyIsFreeShipping,
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
})
