import { afterEach, describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  ensureEbayBusinessPolicyIds,
  fulfillmentCacheKey,
  optInAlreadyComplete,
  optInRequiresManualUserAction,
  parseEbayPolicyCache,
  paymentCacheKey,
  pickFulfillmentForMode,
  pickPaymentPolicy,
  pickReturnPolicy,
  returnCacheKey,
  serializeEbayPolicyCache,
} from "@/lib/marketplaces/adapters/ebay/policies"
import type { EbayFulfillmentPolicyRaw } from "@/lib/marketplaces/adapters/ebay/fulfillment-shipping"

const calculatedPolicy: EbayFulfillmentPolicyRaw = {
  fulfillmentPolicyId: "f-calc-1",
  name: "ListWise Calculated · USPSGroundAdvantage · 1d",
  handlingTime: { value: 1, unit: "DAY" },
  shippingOptions: [
    {
      optionType: "DOMESTIC",
      costType: "CALCULATED",
      shippingServices: [
        {
          shippingCarrierCode: "USPS",
          shippingServiceCode: "USPSGroundAdvantage",
          freeShipping: false,
          buyerResponsibleForShipping: false,
        },
      ],
    },
  ],
}

const nativeFlatPolicy: EbayFulfillmentPolicyRaw = {
  fulfillmentPolicyId: "f-flat-native",
  name: "eBay Standard Shipping",
  handlingTime: { value: 1, unit: "DAY" },
  shippingOptions: [
    {
      optionType: "DOMESTIC",
      costType: "FLAT_RATE",
      shippingServices: [
        {
          shippingServiceCode: "USPSGroundAdvantage",
          freeShipping: false,
          shippingCost: { value: "5.99", currency: "USD" },
        },
      ],
    },
  ],
}

describe("eBay policy reuse helpers", () => {
  it("reuses a matching ListWise calculated policy instead of creating another", () => {
    const picked = pickFulfillmentForMode(
      [nativeFlatPolicy, calculatedPolicy],
      "calculated",
      null,
      1,
      "USPSGroundAdvantage"
    )
    assert.equal(picked?.fulfillmentPolicyId, "f-calc-1")
  })

  it("does not treat a free policy as calculated", () => {
    const freePolicy: EbayFulfillmentPolicyRaw = {
      fulfillmentPolicyId: "f-free",
      name: "Free",
      shippingOptions: [
        {
          optionType: "DOMESTIC",
          costType: "FLAT_RATE",
          shippingServices: [
            { shippingServiceCode: "USPSGroundAdvantage", freeShipping: true },
          ],
        },
      ],
    }
    const picked = pickFulfillmentForMode([freePolicy], "calculated", null, 1, null)
    assert.equal(picked, undefined)
  })

  it("prefers ListWise payment/return policies that match seller prefs", () => {
    const payment = pickPaymentPolicy(
      [
        { paymentPolicyId: "pay-native", name: "eBay Payment", immediatePay: false },
        { paymentPolicyId: "pay-lw", name: "ListWise Payment", immediatePay: false },
      ],
      false
    )
    assert.equal(payment?.paymentPolicyId, "pay-lw")

    const returns = pickReturnPolicy(
      [
        {
          returnPolicyId: "ret-30",
          name: "ListWise Returns · 30d · BUYER",
          returnsAccepted: true,
          returnPeriod: { value: 30, unit: "DAY" },
          returnShippingCostPayer: "BUYER",
        },
      ],
      {
        returnsAccepted: true,
        returnWindowDays: 30,
        returnShippingPaidBy: "BUYER",
      }
    )
    assert.equal(returns?.returnPolicyId, "ret-30")
  })

  it("round-trips stored policy IDs so publish can reuse them", () => {
    const key = fulfillmentCacheKey("calculated", "USPSGroundAdvantage", 1)
    const cached = parseEbayPolicyCache(
      serializeEbayPolicyCache({
        marketplaceId: "EBAY_US",
        fulfillment: { [key]: "f-calc-1" },
        payment: { [paymentCacheKey(false)]: "pay-lw" },
        returns: { [returnCacheKey(true, 30, "BUYER")]: "ret-30" },
      })
    )
    assert.equal(cached?.fulfillment[key], "f-calc-1")
    assert.equal(cached?.payment.standard, "pay-lw")
  })

  it("only asks the seller to act when eBay explicitly requires a manual opt-in", () => {
    assert.equal(
      optInRequiresManualUserAction(
        [
          {
            message:
              "You must visit Seller Hub to enable business policies before continuing.",
          },
        ],
        400
      ),
      true
    )
    assert.equal(
      optInRequiresManualUserAction(
        [{ message: "Invalid programType." }],
        400
      ),
      false
    )
    assert.equal(
      optInAlreadyComplete([{ message: "Seller already opted in." }], 409),
      true
    )
  })
})

type FetchCall = { url: string; method: string; body: unknown }

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

describe("ensureEbayBusinessPolicyIds retrieve/reuse/create", () => {
  const originalFetch = globalThis.fetch
  let calls: FetchCall[] = []

  afterEach(() => {
    globalThis.fetch = originalFetch
    calls = []
  })

  function mockEbay(handler: (url: string, method: string, body: unknown) => Response) {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method || "GET").toUpperCase()
      const body = init?.body ? JSON.parse(String(init.body)) : null
      calls.push({ url, method, body })
      return handler(url, method, body)
    }) as typeof fetch
  }

  it("reuses existing EBAY_US policies and does not POST createFulfillmentPolicy", async () => {
    mockEbay((url, method) => {
      if (url.includes("/program/get_opted_in_programs")) {
        return jsonResponse(200, {
          programs: [{ programType: "SELLING_POLICY_MANAGEMENT" }],
        })
      }
      if (url.includes("/fulfillment_policy") && method === "GET") {
        return jsonResponse(200, { fulfillmentPolicies: [calculatedPolicy] })
      }
      if (url.includes("/payment_policy") && method === "GET") {
        return jsonResponse(200, {
          paymentPolicies: [
            { paymentPolicyId: "pay-lw", name: "ListWise Payment", immediatePay: false },
          ],
        })
      }
      if (url.includes("/return_policy") && method === "GET") {
        return jsonResponse(200, {
          returnPolicies: [
            {
              returnPolicyId: "ret-30",
              name: "ListWise Returns · 30d · BUYER",
              returnsAccepted: true,
              returnPeriod: { value: 30, unit: "DAY" },
              returnShippingCostPayer: "BUYER",
            },
          ],
        })
      }
      return jsonResponse(500, { errors: [{ message: `unexpected ${method} ${url}` }] })
    })

    const result = await ensureEbayBusinessPolicyIds("token", {
      shippingMode: "calculated",
      shippingServiceCode: "USPSGroundAdvantage",
      handlingTimeDays: 1,
    })

    assert.equal(result.fulfillmentPolicyId, "f-calc-1")
    assert.equal(result.paymentPolicyId, "pay-lw")
    assert.equal(result.returnPolicyId, "ret-30")
    assert.equal(
      calls.some(
        (c) => c.method === "POST" && c.url.includes("/fulfillment_policy")
      ),
      false
    )
    assert.equal(
      result.policyCache.fulfillment[
        fulfillmentCacheKey("calculated", "USPSGroundAdvantage", 1)
      ],
      "f-calc-1"
    )
  })

  it("creates policies from ListWise prefs when the seller has none, then caches IDs", async () => {
    let fulfillmentCreated = false
    mockEbay((url, method, body) => {
      if (url.includes("/program/get_opted_in_programs")) {
        return jsonResponse(200, { programs: [] })
      }
      if (url.includes("/program/opt_in") && method === "POST") {
        assert.deepEqual(body, { programType: "SELLING_POLICY_MANAGEMENT" })
        return jsonResponse(200, {})
      }
      if (url.includes("/fulfillment_policy") && method === "GET") {
        return jsonResponse(200, {
          fulfillmentPolicies: fulfillmentCreated
            ? [{ ...calculatedPolicy, fulfillmentPolicyId: "f-new" }]
            : [],
        })
      }
      if (url.includes("/fulfillment_policy") && method === "POST") {
        fulfillmentCreated = true
        const req = body as {
          shipToLocations?: { regionIncluded?: Array<{ regionName?: string }> }
          shippingOptions?: Array<{
            shippingServices?: Array<{
              buyerResponsibleForShipping?: boolean
              shipToLocations?: unknown
            }>
          }>
        }
        assert.equal(req.shipToLocations?.regionIncluded?.[0]?.regionName, "US")
        assert.equal(
          req.shippingOptions?.[0]?.shippingServices?.[0]
            ?.buyerResponsibleForShipping,
          false
        )
        assert.ok(req.shippingOptions?.[0]?.shippingServices?.[0]?.shipToLocations)
        return jsonResponse(201, { fulfillmentPolicyId: "f-new" })
      }
      if (url.includes("/payment_policy") && method === "GET") {
        return jsonResponse(200, {
          paymentPolicies: fulfillmentCreated
            ? [{ paymentPolicyId: "pay-new", immediatePay: false }]
            : [],
        })
      }
      if (url.includes("/payment_policy") && method === "POST") {
        return jsonResponse(201, { paymentPolicyId: "pay-new" })
      }
      if (url.includes("/return_policy") && method === "GET") {
        return jsonResponse(200, {
          returnPolicies: fulfillmentCreated
            ? [
                {
                  returnPolicyId: "ret-new",
                  returnsAccepted: true,
                  returnPeriod: { value: 30, unit: "DAY" },
                  returnShippingCostPayer: "BUYER",
                },
              ]
            : [],
        })
      }
      if (url.includes("/return_policy") && method === "POST") {
        return jsonResponse(201, { returnPolicyId: "ret-new" })
      }
      return jsonResponse(500, { errors: [{ message: `unexpected ${method} ${url}` }] })
    })

    const result = await ensureEbayBusinessPolicyIds("token", {
      shippingMode: "calculated",
      shippingServiceCode: "USPSGroundAdvantage",
      handlingTimeDays: 1,
    })
    assert.equal(result.fulfillmentPolicyId, "f-new")
    assert.equal(result.paymentPolicyId, "pay-new")
    assert.equal(result.returnPolicyId, "ret-new")
    assert.equal(
      calls.filter((c) => c.method === "POST" && c.url.includes("/fulfillment_policy"))
        .length,
      1
    )
  })

  it("does not create a second fulfillment policy when a cached ListWise ID still exists", async () => {
    mockEbay((url, method) => {
      if (url.includes("/program/get_opted_in_programs")) {
        return jsonResponse(200, {
          programs: [{ programType: "SELLING_POLICY_MANAGEMENT" }],
        })
      }
      if (url.includes("/fulfillment_policy") && method === "GET") {
        return jsonResponse(200, { fulfillmentPolicies: [calculatedPolicy] })
      }
      if (url.includes("/payment_policy") && method === "GET") {
        return jsonResponse(200, {
          paymentPolicies: [
            { paymentPolicyId: "pay-lw", name: "ListWise Payment", immediatePay: false },
          ],
        })
      }
      if (url.includes("/return_policy") && method === "GET") {
        return jsonResponse(200, {
          returnPolicies: [
            {
              returnPolicyId: "ret-30",
              returnsAccepted: true,
              returnPeriod: { value: 30, unit: "DAY" },
              returnShippingCostPayer: "BUYER",
            },
          ],
        })
      }
      return jsonResponse(500, { errors: [{ message: `unexpected ${method} ${url}` }] })
    })

    const key = fulfillmentCacheKey("calculated", "USPSGroundAdvantage", 1)
    const result = await ensureEbayBusinessPolicyIds("token", {
      shippingMode: "calculated",
      shippingServiceCode: "USPSGroundAdvantage",
      handlingTimeDays: 1,
      policyCache: {
        marketplaceId: "EBAY_US",
        fulfillment: { [key]: "f-calc-1" },
        payment: { standard: "pay-lw" },
        returns: { "1|30|BUYER": "ret-30" },
      },
    })
    assert.equal(result.fulfillmentPolicyId, "f-calc-1")
    assert.equal(
      calls.some((c) => c.method === "POST"),
      false
    )
  })
})
