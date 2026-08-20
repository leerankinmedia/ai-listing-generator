import { afterEach, describe, it } from "node:test"
import assert from "node:assert/strict"
import { mkdirSync, writeFileSync } from "node:fs"
import {
  attachEbayImageUrls,
  createOrReplaceEbayInventoryItem,
  ebayFetch,
  mapListingToEbayInventory,
  mapListingToEbayOffer,
} from "@/lib/marketplaces/adapters/ebay/client"
import { ensureEbayBusinessPolicyIds } from "@/lib/marketplaces/adapters/ebay/policies"
import { listingShippingIntent } from "@/lib/listings/listing-shipping"
import { toEbayPackageWeightAndSize } from "@/lib/listings/shipping-package"
import { fulfillmentRequestPresence } from "@/lib/marketplaces/adapters/ebay/fulfillment-shipping"
import type { Listing } from "@/lib/types"

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
    <DimensionsRequired>true</DimensionsRequired>
    <WeightRequired>true</WeightRequired>
  </ShippingServiceDetails>
  <ShippingServiceDetails>
    <ShippingService>UPSGround</ShippingService>
    <ShippingCarrier>UPS</ShippingCarrier>
    <ValidForSellingFlow>true</ValidForSellingFlow>
    <ServiceType>Flat</ServiceType>
    <ServiceType>Calculated</ServiceType>
    <DimensionsRequired>true</DimensionsRequired>
    <WeightRequired>true</WeightRequired>
  </ShippingServiceDetails>
  <ShippingServiceDetails>
    <ShippingService>FedExHomeDelivery</ShippingService>
    <ShippingCarrier>FedEx</ShippingCarrier>
    <ValidForSellingFlow>true</ValidForSellingFlow>
    <ServiceType>Flat</ServiceType>
    <ServiceType>Calculated</ServiceType>
    <DimensionsRequired>true</DimensionsRequired>
    <WeightRequired>true</WeightRequired>
  </ShippingServiceDetails>
  <ShippingServiceDetails>
    <ShippingService>FedExGround</ShippingService>
    <ShippingCarrier>FedEx</ShippingCarrier>
    <ValidForSellingFlow>true</ValidForSellingFlow>
    <ServiceType>Flat</ServiceType>
    <ServiceType>Calculated</ServiceType>
  </ShippingServiceDetails>
</GeteBayDetailsResponse>`

const LOGISTICS_MISSING = {
  errors: [
    {
      errorId: 20403,
      domain: "API_ACCOUNT",
      category: "REQUEST",
      message: "Invalid LOGISTICS_INFO_IS_MISSING.",
      longMessage: "LSAS validation failed.",
      parameters: [
        { name: "fieldName", value: "LOGISTICS_INFO_IS_MISSING" },
        { name: "SHIPELIG_ERROR_CODE_NAME", value: "LOGISTICS_INFO_IS_MISSING" },
        { name: "additionalInfo", value: "LSAS 216118" },
      ],
    },
  ],
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function jeansListing(serviceCode: string): Listing {
  return {
    id: `lst-${serviceCode.toLowerCase()}`,
    userId: "user-1",
    title: "American Eagle Men's 32x30 Blue Jeans",
    description: "Pre-owned American Eagle jeans. Soft denim, clean, ready to ship.",
    price: 28,
    currency: "USD",
    keywords: ["American Eagle", "jeans"],
    specifics: {
      brand: "American Eagle",
      size: "32x30",
      color: "Blue",
      gender: "Men",
      category: "Jeans",
      condition: "Good",
      shippingMode: "calculated",
      shippingService: serviceCode,
      handlingTimeDays: 1,
      itemLocationZip: "43604",
      internationalShipping: false,
      returnsAccepted: true,
      returnWindowDays: 30,
      returnShippingPaidBy: "BUYER",
      ebayCategory: {
        marketplaceId: "EBAY_US",
        categoryTreeId: "0",
        categoryId: "11483",
        categoryName: "Jeans",
        categoryPath:
          "Clothing, Shoes & Accessories > Men > Men's Clothing > Jeans",
        leafCategory: true,
      },
      ebayCondition: {
        conditionId: "3000",
        conditionName: "Used",
        conditionEnum: "USED_GOOD",
      },
      shippingPackage: {
        weightPounds: 0,
        weightOunces: 8,
        lengthInches: 17,
        widthInches: 14,
        heightInches: 2,
        packageType: "MAILING_BOX",
        irregularPackage: false,
      },
    },
    fieldConfidence: {},
    images: [
      {
        id: "img-1",
        url: "https://i.ebayimg.com/images/g/listwise/s-l1600.jpg",
        isPrimary: true,
        sortOrder: 0,
      },
    ],
    status: "draft",
    marketplaceListings: [],
    targetMarketplaces: ["ebay"],
    aiGenerated: true,
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-20T00:00:00.000Z",
  }
}

function calculatedLogisticsComplete(
  body: unknown,
  expectedService: string,
  expectedCarrier: string
): boolean {
  if (!body || typeof body !== "object") return false
  const req = body as {
    marketplaceId?: string
    shipToLocations?: unknown
    handlingTime?: { value?: number; unit?: string }
    shippingOptions?: Array<{
      optionType?: string
      costType?: string
      packageHandlingCost?: { value?: string; currency?: string }
      shippingServices?: Array<{
        sortOrder?: number
        shippingServiceCode?: string
        shippingCarrierCode?: string
        freeShipping?: boolean
        buyerResponsibleForShipping?: boolean
        shippingCost?: unknown
      }>
    }>
  }
  const option = req.shippingOptions?.[0]
  const service = option?.shippingServices?.[0]
  return (
    req.marketplaceId === "EBAY_US" &&
    req.shipToLocations === undefined &&
    req.handlingTime?.value === 1 &&
    req.handlingTime?.unit === "DAY" &&
    option?.optionType === "DOMESTIC" &&
    option?.costType === "CALCULATED" &&
    option?.packageHandlingCost?.value === "0.0" &&
    service?.sortOrder === 1 &&
    service?.shippingServiceCode === expectedService &&
    service?.shippingCarrierCode === expectedCarrier &&
    service?.freeShipping === false &&
    service?.buyerResponsibleForShipping === false &&
    service?.shippingCost == null
  )
}

describe("production-equivalent eBay publish path — calculated parcel services", () => {
  const originalFetch = globalThis.fetch
  let calls: FetchCall[] = []

  afterEach(() => {
    globalThis.fetch = originalFetch
    calls = []
  })

  function mockPublishPath(expectedService: string, expectedCarrier: string) {
    const createdPolicies: Record<string, unknown> = {}
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
        return new Response(EBAY_US_PARCEL_DETAILS_XML, {
          status: 200,
          headers: { "Content-Type": "text/xml" },
        })
      }
      if (url.includes("/program/get_opted_in_programs")) {
        return jsonResponse(200, {
          programs: [{ programType: "SELLING_POLICY_MANAGEMENT" }],
        })
      }
      if (url.includes("/fulfillment_policy") && method === "GET") {
        return jsonResponse(200, {
          fulfillmentPolicies: Object.values(createdPolicies),
        })
      }
      if (url.includes("/fulfillment_policy") && method === "POST") {
        if (!calculatedLogisticsComplete(body, expectedService, expectedCarrier)) {
          return jsonResponse(400, LOGISTICS_MISSING)
        }
        const req = body as {
          shippingOptions?: Array<{
            shippingServices?: Array<{ shippingServiceCode?: string }>
          }>
        }
        assert.equal(
          JSON.stringify(body).includes("USPSPriority") &&
            expectedService !== "USPSPriority",
          false
        )
        const id = `f-${expectedService}`
        createdPolicies[id] = {
          fulfillmentPolicyId: id,
          name: `ListWise Calculated · ${expectedService} · 1d`,
          marketplaceId: "EBAY_US",
          handlingTime: { value: 1, unit: "DAY" },
          shippingOptions: req.shippingOptions,
        }
        return jsonResponse(201, { fulfillmentPolicyId: id, warnings: [] })
      }
      if (url.includes("/payment_policy")) {
        if (method === "GET") {
          return jsonResponse(200, {
            paymentPolicies: [
              { paymentPolicyId: "pay-lw", name: "ListWise Payment", immediatePay: false },
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
                name: "ListWise Returns · 30d · BUYER",
                returnsAccepted: true,
                returnPeriod: { value: 30, unit: "DAY" },
                returnShippingCostPayer: "BUYER",
              },
            ],
          })
        }
        return jsonResponse(201, { returnPolicyId: "ret-30" })
      }
      if (url.includes("/inventory_item/") && method === "PUT") {
        const item = body as {
          packageWeightAndSize?: {
            weight?: { value?: number; unit?: string }
            dimensions?: { length?: number; width?: number; height?: number; unit?: string }
          }
        }
        assert.ok(item.packageWeightAndSize)
        assert.equal(item.packageWeightAndSize?.weight?.unit, "POUND")
        assert.equal(item.packageWeightAndSize?.dimensions?.unit, "INCH")
        assert.equal(item.packageWeightAndSize?.dimensions?.length, 17)
        assert.equal(item.packageWeightAndSize?.dimensions?.width, 14)
        assert.equal(item.packageWeightAndSize?.dimensions?.height, 2)
        return jsonResponse(204, {})
      }
      if (url.includes("/sell/inventory/v1/offer") && method === "POST" && !url.includes("/publish")) {
        const offer = body as {
          listingPolicies?: { fulfillmentPolicyId?: string }
          merchantLocationKey?: string
          categoryId?: string
        }
        assert.equal(offer.listingPolicies?.fulfillmentPolicyId, `f-${expectedService}`)
        assert.equal(offer.merchantLocationKey, "listwise-toledo")
        assert.equal(offer.categoryId, "11483")
        return jsonResponse(201, { offerId: `offer-${expectedService}` })
      }
      if (url.includes("/publish") && method === "POST") {
        return jsonResponse(200, { listingId: `listing-${expectedService}` })
      }
      return jsonResponse(500, { errors: [{ message: `unexpected ${method} ${url}` }] })
    }) as typeof fetch
  }

  async function publishPath(serviceCode: string, carrier: string) {
    const listing = jeansListing(serviceCode)
    const intent = listingShippingIntent(listing)
    assert.equal(intent.mode, "calculated")
    assert.equal(intent.whoPays, "buyer")
    assert.equal(intent.shippingServiceCode, serviceCode)
    assert.equal(intent.handlingTimeDays, 1)
    assert.equal(intent.itemLocationZip, "43604")
    assert.equal(intent.package?.weightOunces, 8)
    assert.equal(intent.package?.lengthInches, 17)

    const policies = await ensureEbayBusinessPolicyIds("token", {
      shippingMode: intent.mode,
      freeShippingConfirmed: intent.freeShippingConfirmed,
      handlingTimeDays: intent.handlingTimeDays,
      shippingServiceCode: intent.shippingServiceCode,
      categoryId: listing.specifics.ebayCategory?.categoryId,
      categoryName: listing.specifics.ebayCategory?.categoryName,
      categoryPath: listing.specifics.ebayCategory?.categoryPath,
      listingTitle: listing.title,
      listingPrice: listing.price,
      listingCurrency: listing.currency,
      shippingPackage: listing.specifics.shippingPackage || null,
      returnsAccepted: intent.returnsAccepted,
      returnWindowDays: intent.returnWindowDays,
      returnShippingPaidBy: intent.returnShippingPaidBy,
    })

    assert.equal(policies.fulfillmentSummary.mode, "calculated")
    assert.equal(policies.fulfillmentSummary.serviceCode, serviceCode)
    assert.equal(policies.fulfillmentSummary.whoPays, "buyer")

    const { sku, inventoryItem } = mapListingToEbayInventory(listing)
    attachEbayImageUrls(inventoryItem, [listing.images[0]!.url])
    inventoryItem.packageWeightAndSize = toEbayPackageWeightAndSize(
      listing.specifics.shippingPackage!
    )
    const replaced = await createOrReplaceEbayInventoryItem({
      accessToken: "token",
      sku,
      inventoryItem,
    })

    const offer = mapListingToEbayOffer(
      listing,
      replaced.sku,
      "listwise-toledo",
      {
        fulfillmentPolicyId: policies.fulfillmentPolicyId,
        paymentPolicyId: policies.paymentPolicyId,
        returnPolicyId: policies.returnPolicyId,
      },
      listing.specifics.ebayCategory!.categoryId
    )
    const created = (await ebayFetch("/sell/inventory/v1/offer", "token", {
      method: "POST",
      step: "createOffer",
      body: JSON.stringify(offer),
    })) as { offerId?: string }
    const published = (await ebayFetch(
      `/sell/inventory/v1/offer/${created.offerId}/publish`,
      "token",
      { method: "POST", step: "publishOffer", body: "{}" }
    )) as { listingId?: string }

    const fulfillmentPost = calls.find(
      (c) => c.method === "POST" && c.url.includes("/fulfillment_policy")
    )
    assert.ok(fulfillmentPost, "expected createFulfillmentPolicy POST")
    assert.equal(
      calculatedLogisticsComplete(fulfillmentPost.body, serviceCode, carrier),
      true
    )
    const presence = fulfillmentRequestPresence(
      fulfillmentPost.body as Record<string, unknown>
    )
    assert.equal(presence.costType, "CALCULATED")
    assert.equal(presence.optionType, "DOMESTIC")
    assert.equal(presence.shippingServiceCode, serviceCode)
    assert.equal(presence.shippingCarrierCode, carrier)
    assert.equal(presence.shippingCost, null)
    assert.equal(presence.hasTopLevelShipToLocations, false)
    assert.equal(presence.buyerResponsibleForShipping, false)
    assert.equal(published.listingId, `listing-${serviceCode}`)
    assert.equal(
      calls.some(
        (c) =>
          c.method === "POST" &&
          c.url.includes("/fulfillment_policy") &&
          JSON.stringify(c.body).includes("20403")
      ),
      false
    )

    return {
      intent,
      policies,
      offer,
      published,
      fulfillmentRequest: fulfillmentPost.body,
      fulfillmentResponse: {
        fulfillmentPolicyId: policies.fulfillmentPolicyId,
      },
      presence,
    }
  }

  it("publishes American Eagle jeans with USPS Ground Advantage calculated shipping", async () => {
    mockPublishPath("USPSGroundAdvantage", "USPS")
    const logs: unknown[] = []
    const originalInfo = console.info
    console.info = (...args: unknown[]) => {
      logs.push(args)
      originalInfo.apply(console, args)
    }
    try {
      const result = await publishPath("USPSGroundAdvantage", "USPS")
      assert.equal(result.policies.fulfillmentSummary.serviceCode, "USPSGroundAdvantage")
      assert.equal(result.published.listingId, "listing-USPSGroundAdvantage")
      assert.equal(
        JSON.stringify(result.fulfillmentRequest).includes("USPSPriority"),
        false
      )
      const artifact = {
        flow: "American Eagle jeans / USPS Ground Advantage / calculated / buyer pays / 8 oz / 17x14x2 / 1 day / ZIP 43604",
        sanitizedFulfillmentPolicyRequest: result.fulfillmentRequest,
        ebayFulfillmentResponse: result.fulfillmentResponse,
        presence: result.presence,
        offerListingPolicies: result.offer.listingPolicies,
        publishedListingId: result.published.listingId,
      }
      mkdirSync("/opt/cursor/artifacts", { recursive: true })
      writeFileSync(
        "/opt/cursor/artifacts/ga_calculated_publish_path.json",
        JSON.stringify(artifact, null, 2)
      )
      originalInfo("[ebay/policies] SANITIZED createFulfillmentPolicy request", artifact)
    } finally {
      console.info = originalInfo
    }
  })

  it("publishes the same jeans flow for USPS Priority Mail", async () => {
    mockPublishPath("USPSPriority", "USPS")
    const result = await publishPath("USPSPriority", "USPS")
    assert.equal(result.policies.fulfillmentSummary.serviceCode, "USPSPriority")
    assert.equal(result.published.listingId, "listing-USPSPriority")
  })

  it("publishes the same jeans flow for UPS Ground", async () => {
    mockPublishPath("UPSGround", "UPS")
    const result = await publishPath("UPSGround", "UPS")
    assert.equal(result.policies.fulfillmentSummary.serviceCode, "UPSGround")
    assert.equal(result.published.listingId, "listing-UPSGround")
  })

  it("publishes the same jeans flow for FedEx Ground / Home Delivery", async () => {
    mockPublishPath("FedExHomeDelivery", "FedEx")
    const result = await publishPath("FedExHomeDelivery", "FedEx")
    assert.equal(result.policies.fulfillmentSummary.serviceCode, "FedExHomeDelivery")
    assert.equal(result.published.listingId, "listing-FedExHomeDelivery")
  })
})
