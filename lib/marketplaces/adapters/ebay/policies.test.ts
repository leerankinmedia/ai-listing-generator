import { afterEach, describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  ensureEbayBusinessPolicyIds,
  fulfillmentCacheKey,
  fulfillmentCreateVariants,
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

  it("does not reuse a Standard Envelope policy for apparel / Ground Advantage", () => {
    const envelopePolicy: EbayFulfillmentPolicyRaw = {
      fulfillmentPolicyId: "f-env",
      name: "ListWise Calculated · US_eBayStandardEnvelope",
      handlingTime: { value: 1, unit: "DAY" },
      shippingOptions: [
        {
          optionType: "DOMESTIC",
          costType: "CALCULATED",
          shippingServices: [
            {
              shippingCarrierCode: "USPS",
              shippingServiceCode: "US_eBayStandardEnvelope",
              freeShipping: false,
            },
          ],
        },
      ],
    }
    const picked = pickFulfillmentForMode(
      [envelopePolicy, calculatedPolicy],
      "calculated",
      null,
      1,
      "USPSGroundAdvantage"
    )
    assert.equal(picked?.fulfillmentPolicyId, "f-calc-1")
    assert.equal(
      pickFulfillmentForMode(
        [envelopePolicy],
        "calculated",
        null,
        1,
        "USPSGroundAdvantage"
      ),
      undefined
    )
  })

  it("does not reuse a cached UPS policy when the seller selected USPS", () => {
    const upsPolicy: EbayFulfillmentPolicyRaw = {
      fulfillmentPolicyId: "f-ups",
      name: "ListWise Calculated · UPSGround · 1d",
      handlingTime: { value: 1, unit: "DAY" },
      shippingOptions: [
        {
          optionType: "DOMESTIC",
          costType: "CALCULATED",
          shippingServices: [
            {
              shippingCarrierCode: "UPS",
              shippingServiceCode: "UPSGround",
              freeShipping: false,
            },
          ],
        },
      ],
    }
    const picked = pickFulfillmentForMode(
      [upsPolicy, calculatedPolicy],
      "calculated",
      null,
      1,
      "USPSGroundAdvantage"
    )
    assert.equal(picked?.fulfillmentPolicyId, "f-calc-1")
    assert.equal(
      pickFulfillmentForMode(
        [upsPolicy],
        "calculated",
        null,
        1,
        "USPSGroundAdvantage"
      ),
      undefined
    )
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

describe("fulfillment create variants keep the selected service", () => {
  it("does not add a USPS Priority Mail substitute for Ground Advantage", () => {
    const variants = fulfillmentCreateVariants({
      mode: "calculated",
      service: "USPSGroundAdvantage",
    })
    assert.equal(
      variants.some((v) => v.service === "USPSPriority"),
      false
    )
    assert.ok(variants.every((v) => v.service === "USPSGroundAdvantage"))
    assert.equal(
      variants.some((v) => v.mode === "flat"),
      false
    )
    assert.equal(variants[0]?.id, "calculated-complete")
    assert.equal(variants[0]?.includePackageHandlingCost, true)
  })

  it("keeps USPS Priority, UPS Ground, and FedEx when those are selected", () => {
    for (const service of [
      "USPSPriority",
      "UPSGround",
      "FedExHomeDelivery",
    ]) {
      const variants = fulfillmentCreateVariants({
        mode: "calculated",
        service,
      })
      assert.ok(variants.length > 0)
      assert.ok(variants.every((v) => v.service === service))
    }
  })
})

type FetchCall = { url: string; method: string; body: unknown }

const EBAY_US_PARCEL_DETAILS_XML = `<?xml version="1.0" encoding="utf-8"?>
<GeteBayDetailsResponse xmlns="urn:ebay:apis:eBLBaseComponents">
  <Ack>Success</Ack>
  <ShippingServiceDetails>
    <ShippingService>USPSGroundAdvantage</ShippingService>
    <ShippingCarrier>USPS</ShippingCarrier>
    <ValidForSellingFlow>true</ValidForSellingFlow>
    <ServiceType>Flat</ServiceType>
    <ServiceType>Calculated</ServiceType>
    <DimensionsRequired>true</DimensionsRequired>
    <WeightRequired>true</WeightRequired>
  </ShippingServiceDetails>
  <ShippingServiceDetails>
    <ShippingService>USPSPriority</ShippingService>
    <ShippingCarrier>USPS</ShippingCarrier>
    <ValidForSellingFlow>true</ValidForSellingFlow>
    <ServiceType>Flat</ServiceType>
    <ServiceType>Calculated</ServiceType>
  </ShippingServiceDetails>
  <ShippingServiceDetails>
    <ShippingService>UPSGround</ShippingService>
    <ShippingCarrier>UPS</ShippingCarrier>
    <ValidForSellingFlow>true</ValidForSellingFlow>
    <ServiceType>Flat</ServiceType>
    <ServiceType>Calculated</ServiceType>
  </ShippingServiceDetails>
  <ShippingServiceDetails>
    <ShippingService>FedExHomeDelivery</ShippingService>
    <ShippingCarrier>FedEx</ShippingCarrier>
    <ValidForSellingFlow>true</ValidForSellingFlow>
    <ServiceType>Flat</ServiceType>
    <ServiceType>Calculated</ServiceType>
  </ShippingServiceDetails>
  <ShippingServiceDetails>
    <ShippingService>FedExGround</ShippingService>
    <ShippingCarrier>FedEx</ShippingCarrier>
    <ValidForSellingFlow>true</ValidForSellingFlow>
    <ServiceType>Flat</ServiceType>
    <ServiceType>Calculated</ServiceType>
  </ShippingServiceDetails>
</GeteBayDetailsResponse>`

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

  function mockEbay(
    handler: (url: string, method: string, body: unknown) => Response,
    geteBayDetailsXml = "<GeteBayDetailsResponse><Ack>Success</Ack></GeteBayDetailsResponse>"
  ) {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method || "GET").toUpperCase()
      const rawBody = init?.body
      let body: unknown = null
      if (typeof rawBody === "string") {
        try {
          body = JSON.parse(rawBody)
        } catch {
          body = rawBody
        }
      }
      calls.push({ url, method, body })
      if (url.includes("/ws/api.dll")) {
        return new Response(geteBayDetailsXml, {
          status: 200,
          headers: { "Content-Type": "text/xml" },
        })
      }
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
          marketplaceId?: string
          shipToLocations?: unknown
          shippingOptions?: Array<{
            optionType?: string
            costType?: string
            shippingServices?: Array<{
              shippingServiceCode?: string
              shippingCarrierCode?: string
              buyerResponsibleForShipping?: boolean
              shipToLocations?: unknown
              shippingCost?: unknown
            }>
          }>
        }
        assert.equal(req.marketplaceId, "EBAY_US")
        assert.equal(req.shipToLocations, undefined)
        assert.equal(req.shippingOptions?.[0]?.optionType, "DOMESTIC")
        assert.equal(req.shippingOptions?.[0]?.costType, "CALCULATED")
        assert.equal(
          req.shippingOptions?.[0]?.shippingServices?.[0]?.shippingServiceCode,
          "USPSGroundAdvantage"
        )
        assert.equal(
          req.shippingOptions?.[0]?.shippingServices?.[0]?.shippingCarrierCode,
          "USPS"
        )
        assert.equal(
          req.shippingOptions?.[0]?.shippingServices?.[0]?.shipToLocations,
          undefined
        )
        assert.equal(
          req.shippingOptions?.[0]?.shippingServices?.[0]
            ?.buyerResponsibleForShipping,
          false
        )
        assert.equal(
          (req.shippingOptions?.[0] as { packageHandlingCost?: { value?: string } })
            ?.packageHandlingCost?.value,
          "0.0"
        )
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

  it("invalidates a cached fulfillment ID that has no logistics and creates a replacement", async () => {
    let created = false
    mockEbay((url, method, body) => {
      if (url.includes("/program/get_opted_in_programs")) {
        return jsonResponse(200, {
          programs: [{ programType: "SELLING_POLICY_MANAGEMENT" }],
        })
      }
      if (url.includes("/fulfillment_policy") && method === "GET") {
        return jsonResponse(200, {
          fulfillmentPolicies: created
            ? [{ ...calculatedPolicy, fulfillmentPolicyId: "f-fixed" }]
            : [
                {
                  fulfillmentPolicyId: "f-bad",
                  name: "ListWise Calculated · USPSGroundAdvantage · 1d",
                  shippingOptions: [],
                },
              ],
        })
      }
      if (url.includes("/fulfillment_policy") && method === "POST") {
        created = true
        const req = body as { shipToLocations?: unknown }
        assert.equal(req.shipToLocations, undefined)
        return jsonResponse(201, { fulfillmentPolicyId: "f-fixed" })
      }
      if (url.includes("/payment_policy")) {
        if (method === "GET") {
          return jsonResponse(200, {
            paymentPolicies: [
              { paymentPolicyId: "pay-lw", name: "ListWise Payment", immediatePay: false },
            ],
          })
        }
      }
      if (url.includes("/return_policy")) {
        if (method === "GET") {
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
        fulfillment: { [key]: "f-bad" },
        payment: { standard: "pay-lw" },
        returns: { "1|30|BUYER": "ret-30" },
      },
    })
    assert.equal(result.fulfillmentPolicyId, "f-fixed")
    assert.equal(result.policyCache.fulfillment[key], "f-fixed")
    assert.equal(
      calls.some((c) => c.method === "POST" && c.url.includes("/fulfillment_policy")),
      true
    )
  })

  it("creates calculated USPS Ground Advantage with complete logistics instead of falling back to Priority Mail", async () => {
    const incompleteError = {
      errors: [
        {
          errorId: 20403,
          domain: "API_ACCOUNT",
          category: "REQUEST",
          message: "Invalid LOGISTICS_INFO_IS_MISSING.",
          longMessage: "LSAS validation failed.",
          parameters: [
            { name: "fieldName", value: "LOGISTICS_INFO_IS_MISSING" },
            {
              name: "SHIPELIG_ERROR_CODE_NAME",
              value: "LOGISTICS_INFO_IS_MISSING",
            },
            { name: "additionalInfo", value: "LSAS 216118" },
          ],
        },
      ],
    }
    let created = false
    mockEbay((url, method, body) => {
      if (url.includes("/program/get_opted_in_programs")) {
        return jsonResponse(200, {
          programs: [{ programType: "SELLING_POLICY_MANAGEMENT" }],
        })
      }
      if (url.includes("/fulfillment_policy") && method === "GET") {
        return jsonResponse(200, {
          fulfillmentPolicies: created
            ? [
                {
                  fulfillmentPolicyId: "f-ga-calc",
                  name: "ListWise Calculated · USPSGroundAdvantage · 1d",
                  handlingTime: { value: 1, unit: "DAY" },
                  shippingOptions: [
                    {
                      optionType: "DOMESTIC",
                      costType: "CALCULATED",
                      shippingServices: [
                        {
                          shippingServiceCode: "USPSGroundAdvantage",
                          shippingCarrierCode: "USPS",
                          freeShipping: false,
                          buyerResponsibleForShipping: false,
                          sortOrder: 1,
                        },
                      ],
                    },
                  ],
                },
              ]
            : [],
        })
      }
      if (url.includes("/fulfillment_policy") && method === "POST") {
        const req = body as {
          shipToLocations?: unknown
          shippingOptions?: Array<{
            optionType?: string
            costType?: string
            packageHandlingCost?: { value?: string }
            shippingServices?: Array<{
              sortOrder?: number
              shippingServiceCode?: string
              shippingCarrierCode?: string
              buyerResponsibleForShipping?: boolean
              shippingCost?: unknown
            }>
          }>
        }
        const option = req.shippingOptions?.[0]
        const service = option?.shippingServices?.[0]
        const complete =
          option?.optionType === "DOMESTIC" &&
          option?.costType === "CALCULATED" &&
          service?.shippingServiceCode === "USPSGroundAdvantage" &&
          service?.shippingCarrierCode === "USPS" &&
          service?.sortOrder === 1 &&
          service?.buyerResponsibleForShipping === false &&
          service?.shippingCost == null &&
          option?.packageHandlingCost?.value === "0.0" &&
          req.shipToLocations === undefined
        if (!complete) return jsonResponse(400, incompleteError)
        created = true
        return jsonResponse(201, { fulfillmentPolicyId: "f-ga-calc" })
      }
      if (url.includes("/payment_policy")) {
        if (method === "GET") {
          return jsonResponse(200, {
            paymentPolicies: [
              { paymentPolicyId: "pay-lw", immediatePay: false },
            ],
          })
        }
        return jsonResponse(201, { paymentPolicyId: "pay-lw" })
      }
      if (url.includes("/return_policy")) {
        if (method === "GET") {
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
        return jsonResponse(201, { returnPolicyId: "ret-30" })
      }
      return jsonResponse(500, { errors: [{ message: `unexpected ${method} ${url}` }] })
    }, EBAY_US_PARCEL_DETAILS_XML)

    const result = await ensureEbayBusinessPolicyIds("token", {
      shippingMode: "calculated",
      shippingServiceCode: "USPSGroundAdvantage",
      handlingTimeDays: 1,
    })
    assert.equal(result.fulfillmentPolicyId, "f-ga-calc")
    assert.equal(result.fulfillmentSummary.mode, "calculated")
    assert.equal(result.fulfillmentSummary.serviceCode, "USPSGroundAdvantage")
    const fulfillmentPosts = calls.filter(
      (c) => c.method === "POST" && c.url.includes("/fulfillment_policy")
    )
    assert.equal(fulfillmentPosts.length, 1)
    const createdBody = fulfillmentPosts[0]?.body as {
      shippingOptions?: Array<{
        costType?: string
        shippingServices?: Array<{ shippingServiceCode?: string }>
      }>
    }
    assert.equal(createdBody.shippingOptions?.[0]?.costType, "CALCULATED")
    assert.equal(
      createdBody.shippingOptions?.[0]?.shippingServices?.[0]?.shippingServiceCode,
      "USPSGroundAdvantage"
    )
    assert.equal(
      JSON.stringify(createdBody).includes("USPSPriority"),
      false
    )
  })

  it("resolves the USPS Ground Advantage label to live USPSParcel and creates that policy", async () => {
    const parcelXml = `<?xml version="1.0" encoding="utf-8"?>
<GeteBayDetailsResponse>
  <Ack>Success</Ack>
  <ShippingServiceDetails>
    <Description>USPS Ground Advantage</Description>
    <ShippingService>USPSParcel</ShippingService>
    <ShippingCarrier>USPS</ShippingCarrier>
    <ValidForSellingFlow>true</ValidForSellingFlow>
    <ServiceType>Flat</ServiceType>
    <ServiceType>Calculated</ServiceType>
  </ShippingServiceDetails>
</GeteBayDetailsResponse>`
    let created = false
    mockEbay((url, method, body) => {
      if (url.includes("/program/get_opted_in_programs")) {
        return jsonResponse(200, {
          programs: [{ programType: "SELLING_POLICY_MANAGEMENT" }],
        })
      }
      if (url.includes("/fulfillment_policy") && method === "GET") {
        return jsonResponse(200, {
          fulfillmentPolicies: created
            ? [
                {
                  fulfillmentPolicyId: "f-parcel",
                  name: "ListWise Calculated · USPSParcel · 1d",
                  handlingTime: { value: 1, unit: "DAY" },
                  shippingOptions: [
                    {
                      optionType: "DOMESTIC",
                      costType: "CALCULATED",
                      shippingServices: [
                        {
                          shippingCarrierCode: "USPS",
                          shippingServiceCode: "USPSParcel",
                          freeShipping: false,
                        },
                      ],
                    },
                  ],
                },
              ]
            : [],
        })
      }
      if (url.includes("/fulfillment_policy") && method === "POST") {
        created = true
        const req = body as {
          shippingOptions?: Array<{
            shippingServices?: Array<{
              shippingServiceCode?: string
              shippingCarrierCode?: string
            }>
          }>
        }
        assert.equal(
          req.shippingOptions?.[0]?.shippingServices?.[0]?.shippingServiceCode,
          "USPSParcel"
        )
        assert.equal(
          req.shippingOptions?.[0]?.shippingServices?.[0]?.shippingCarrierCode,
          "USPS"
        )
        assert.notEqual(
          req.shippingOptions?.[0]?.shippingServices?.[0]?.shippingServiceCode,
          "USPS Ground Advantage"
        )
        return jsonResponse(201, { fulfillmentPolicyId: "f-parcel" })
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
    }, parcelXml)

    const result = await ensureEbayBusinessPolicyIds("token", {
      shippingMode: "calculated",
      shippingServiceCode: "USPS Ground Advantage",
      handlingTimeDays: 1,
    })
    assert.equal(result.fulfillmentPolicyId, "f-parcel")
    assert.equal(result.fulfillmentSummary.serviceCode, "USPSParcel")
    assert.equal(result.fulfillmentSummary.serviceLabel, "USPS Ground Advantage")
    assert.equal(
      calls.some(
        (c) =>
          c.method === "POST" &&
          JSON.stringify(c.body).includes("USPSPriority")
      ),
      false
    )
  })

  it("reuses a cached USPS Ground Advantage policy for the friendly label", async () => {
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

    const key = fulfillmentCacheKey("calculated", "USPSGroundAdvantage", 1)
    const result = await ensureEbayBusinessPolicyIds("token", {
      shippingMode: "calculated",
      shippingServiceCode: "USPS Ground Advantage",
      handlingTimeDays: 1,
      policyCache: {
        marketplaceId: "EBAY_US",
        fulfillment: { [key]: "f-calc-1" },
        payment: { standard: "pay-lw" },
        returns: { "1|30|BUYER": "ret-30" },
      },
    })
    assert.equal(result.fulfillmentPolicyId, "f-calc-1")
    assert.equal(result.fulfillmentSummary.serviceLabel, "USPS Ground Advantage")
    assert.equal(
      calls.some((c) => c.method === "POST" && c.url.includes("/fulfillment_policy")),
      false
    )
  })

  it("still rejects an unknown shipping service that is not a catalog parcel", async () => {
    mockEbay((url, method) => {
      if (url.includes("/program/get_opted_in_programs")) {
        return jsonResponse(200, {
          programs: [{ programType: "SELLING_POLICY_MANAGEMENT" }],
        })
      }
      if (url.includes("/fulfillment_policy") && method === "GET") {
        return jsonResponse(200, { fulfillmentPolicies: [] })
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
    }, EBAY_US_PARCEL_DETAILS_XML)

    await assert.rejects(
      () =>
        ensureEbayBusinessPolicyIds("token", {
          shippingMode: "calculated",
          shippingServiceCode: "USPSFakeBoatService",
          handlingTimeDays: 1,
        }),
      (err: unknown) => {
        const error = err as { code?: string }
        assert.equal(error.code, "ebay_shipping_unsupported")
        return true
      }
    )
    assert.equal(
      calls.some(
        (c) => c.method === "POST" && c.url.includes("/fulfillment_policy")
      ),
      false
    )
  })

  it("rejects a cached Standard Envelope policy for apparel and creates Ground Advantage", async () => {
    const envelopePolicy: EbayFulfillmentPolicyRaw = {
      fulfillmentPolicyId: "f-env",
      name: "ListWise Calculated · US_eBayStandardEnvelope",
      handlingTime: { value: 1, unit: "DAY" },
      shippingOptions: [
        {
          optionType: "DOMESTIC",
          costType: "CALCULATED",
          shippingServices: [
            {
              shippingCarrierCode: "USPS",
              shippingServiceCode: "US_eBayStandardEnvelope",
              freeShipping: false,
            },
          ],
        },
      ],
    }
    let created = false
    mockEbay((url, method, body) => {
      if (url.includes("/program/get_opted_in_programs")) {
        return jsonResponse(200, {
          programs: [{ programType: "SELLING_POLICY_MANAGEMENT" }],
        })
      }
      if (url.includes("/fulfillment_policy") && method === "GET") {
        return jsonResponse(200, {
          fulfillmentPolicies: created
            ? [
                envelopePolicy,
                { ...calculatedPolicy, fulfillmentPolicyId: "f-ga" },
              ]
            : [envelopePolicy],
        })
      }
      if (url.includes("/fulfillment_policy") && method === "POST") {
        created = true
        const req = body as {
          shippingOptions?: Array<{
            shippingServices?: Array<{ shippingServiceCode?: string }>
          }>
        }
        assert.equal(
          req.shippingOptions?.[0]?.shippingServices?.[0]?.shippingServiceCode,
          "USPSGroundAdvantage"
        )
        return jsonResponse(201, { fulfillmentPolicyId: "f-ga" })
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
      shippingServiceCode: "US_eBayStandardEnvelope",
      handlingTimeDays: 1,
      categoryId: "11554",
      categoryName: "Jeans",
      categoryPath:
        "Clothing, Shoes & Accessories > Women > Women's Clothing > Jeans",
      listingTitle: "American Eagle Women's Jeans",
      listingPrice: 28,
      listingCurrency: "USD",
      shippingPackage: {
        weightPounds: 0,
        weightOunces: 8,
        lengthInches: 12,
        widthInches: 9,
        heightInches: 1,
      },
      policyCache: {
        marketplaceId: "EBAY_US",
        fulfillment: { [key]: "f-env" },
        payment: { standard: "pay-lw" },
        returns: { "1|30|BUYER": "ret-30" },
      },
    })
    assert.equal(result.fulfillmentPolicyId, "f-ga")
    assert.equal(result.fulfillmentSummary.serviceCode, "USPSGroundAdvantage")
    assert.notEqual(result.policyCache.fulfillment[key], "f-env")
    assert.equal(
      calls.some((c) => c.method === "POST" && c.url.includes("/fulfillment_policy")),
      true
    )
  })
})
