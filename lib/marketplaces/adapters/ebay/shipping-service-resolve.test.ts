import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  groupedParcelShippingOptions,
  isOrdinaryParcelMerchandise,
  isStandardEnvelopeEligible,
  isStandardEnvelopeService,
  recommendedParcelService,
  resolveEbayShippingService,
  shippingServiceCodesEquivalent,
  shippingServiceDisplayLabel,
  STANDARD_ENVELOPE_SERVICE,
  USPS_GROUND_ADVANTAGE,
  UPS_GROUND,
  FEDEX_HOME_DELIVERY,
} from "@/lib/marketplaces/adapters/ebay/shipping-service-resolve"
import { pickValidDomesticServiceCode } from "@/lib/marketplaces/adapters/ebay/shipping-services"
import { listingShippingIntent, reviewShippingSummary } from "@/lib/listings/listing-shipping"
import type { Listing } from "@/lib/types"
import type { EbayDomesticShippingService } from "@/lib/marketplaces/adapters/ebay/shipping-services"

const envelopeFirstServices: EbayDomesticShippingService[] = [
  {
    code: STANDARD_ENVELOPE_SERVICE,
    carrier: "USPS",
    validForSellingFlow: true,
    international: false,
    serviceTypes: ["Flat", "Calculated"],
  },
  {
    code: USPS_GROUND_ADVANTAGE,
    carrier: "USPS",
    validForSellingFlow: true,
    international: false,
    serviceTypes: ["Flat", "Calculated"],
  },
  {
    code: UPS_GROUND,
    carrier: "UPS",
    validForSellingFlow: true,
    international: false,
    serviceTypes: ["Flat", "Calculated"],
  },
  {
    code: FEDEX_HOME_DELIVERY,
    carrier: "FedEx",
    validForSellingFlow: true,
    international: false,
    serviceTypes: ["Flat", "Calculated"],
  },
]

function listing(partial: Partial<Listing> = {}, specifics: Listing["specifics"] = {}): Listing {
  return {
    id: "lst-ship-resolve",
    userId: "user-1",
    title: "Test item",
    description: "Test",
    price: 24.99,
    currency: "USD",
    keywords: [],
    specifics,
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

const jeansCategory = {
  marketplaceId: "EBAY_US",
  categoryTreeId: "0",
  categoryId: "11554",
  categoryName: "Jeans",
  categoryPath:
    "Clothing, Shoes & Accessories > Women > Women's Clothing > Jeans",
  leafCategory: true,
} as const

const shirtCategory = {
  marketplaceId: "EBAY_US",
  categoryTreeId: "0",
  categoryId: "15687",
  categoryName: "T-Shirts",
  categoryPath: "Clothing, Shoes & Accessories > Men > Men's Clothing > Shirts > T-Shirts",
  leafCategory: true,
} as const

const tradingCardCategory = {
  marketplaceId: "EBAY_US",
  categoryTreeId: "0",
  categoryId: "183050",
  categoryName: "Sports Trading Cards",
  categoryPath: "Collectibles > Trading Cards > Sports Trading Cards",
  leafCategory: true,
} as const

const apparelPackage8oz = {
  weightPounds: 0,
  weightOunces: 8,
  lengthInches: 12,
  widthInches: 9,
  heightInches: 1,
  packageType: "PACKAGE_THICK_ENVELOPE",
}

const heavyParcel = {
  weightPounds: 5,
  weightOunces: 0,
  lengthInches: 14,
  widthInches: 10,
  heightInches: 8,
  packageType: "MAILING_BOX",
}

const envelopePackage = {
  weightPounds: 0,
  weightOunces: 1,
  lengthInches: 6,
  widthInches: 4,
  heightInches: 0.2,
  packageType: "LETTER",
}

describe("eBay shipping service resolution", () => {
  it("women's jeans must never select Standard Envelope", () => {
    const resolved = resolveEbayShippingService({
      categoryId: jeansCategory.categoryId,
      categoryName: jeansCategory.categoryName,
      categoryPath: jeansCategory.categoryPath,
      title: "American Eagle Women's Jeans",
      price: 18,
      currency: "USD",
      package: apparelPackage8oz,
      sellerPreferredService: STANDARD_ENVELOPE_SERVICE,
      shippingMode: "calculated",
      availableServices: envelopeFirstServices,
    })
    assert.equal(isOrdinaryParcelMerchandise({
      categoryPath: jeansCategory.categoryPath,
      categoryName: jeansCategory.categoryName,
    }), true)
    assert.equal(isStandardEnvelopeEligible({
      categoryPath: jeansCategory.categoryPath,
      categoryName: jeansCategory.categoryName,
      price: 18,
      package: envelopePackage,
    }), false)
    assert.equal(isStandardEnvelopeService(resolved.code), false)
    assert.equal(resolved.code, USPS_GROUND_ADVANTAGE)
  })

  it("shirt must never select Standard Envelope", () => {
    const resolved = resolveEbayShippingService({
      categoryId: shirtCategory.categoryId,
      categoryName: shirtCategory.categoryName,
      categoryPath: shirtCategory.categoryPath,
      title: "Nike Men's T-Shirt",
      price: 12,
      package: apparelPackage8oz,
      sellerPreferredService: STANDARD_ENVELOPE_SERVICE,
      availableServices: envelopeFirstServices,
    })
    assert.equal(isStandardEnvelopeService(resolved.code), false)
    assert.equal(resolved.code, USPS_GROUND_ADVANTAGE)
  })

  it("normal 8 oz apparel defaults to Ground Advantage", () => {
    const resolved = resolveEbayShippingService({
      categoryPath: jeansCategory.categoryPath,
      categoryName: jeansCategory.categoryName,
      price: 28,
      package: apparelPackage8oz,
      shippingMode: "calculated",
      availableServices: envelopeFirstServices,
    })
    assert.equal(resolved.code, USPS_GROUND_ADVANTAGE)
    const intent = listingShippingIntent(
      listing(
        { title: "Women's jeans", price: 28 },
        {
          ebayCategory: { ...jeansCategory },
          shippingMode: "calculated",
          shippingPackage: apparelPackage8oz,
        }
      )
    )
    assert.equal(intent.shippingServiceCode, USPS_GROUND_ADVANTAGE)
    assert.match(
      reviewShippingSummary(
        listing(
          { title: "Women's jeans", price: 28 },
          {
            ebayCategory: { ...jeansCategory },
            shippingMode: "calculated",
            shippingService: STANDARD_ENVELOPE_SERVICE,
            shippingPackage: apparelPackage8oz,
          }
        )
      ),
      /USPS Ground Advantage — Buyer pays/
    )
  })

  it("heavier parcel uses a normal parcel service, never envelope", () => {
    const resolved = resolveEbayShippingService({
      categoryPath: "Home & Garden > Kitchen",
      categoryName: "Kitchen",
      listingCategory: "home",
      price: 40,
      package: heavyParcel,
      availableServices: envelopeFirstServices,
    })
    assert.equal(isStandardEnvelopeService(resolved.code), false)
    assert.equal(resolved.code, USPS_GROUND_ADVANTAGE)
  })

  it("legitimate Standard Envelope eligible listing may select it", () => {
    const input = {
      categoryId: tradingCardCategory.categoryId,
      categoryName: tradingCardCategory.categoryName,
      categoryPath: tradingCardCategory.categoryPath,
      title: "2020 Panini Prizm Rookie Card",
      price: 8,
      currency: "USD",
      package: envelopePackage,
      shippingMode: "calculated" as const,
      availableServices: envelopeFirstServices,
    }
    assert.equal(isStandardEnvelopeEligible(input), true)
    const resolved = resolveEbayShippingService(input)
    assert.equal(resolved.code, STANDARD_ENVELOPE_SERVICE)
    assert.equal(resolved.specialized, true)
  })

  it("seller manually choosing UPS/FedEx is preserved", () => {
    const ups = resolveEbayShippingService({
      categoryPath: jeansCategory.categoryPath,
      categoryName: jeansCategory.categoryName,
      package: apparelPackage8oz,
      sellerPreferredService: UPS_GROUND,
      availableServices: envelopeFirstServices,
    })
    assert.equal(ups.code, UPS_GROUND)
    const fedex = resolveEbayShippingService({
      categoryPath: jeansCategory.categoryPath,
      categoryName: jeansCategory.categoryName,
      package: apparelPackage8oz,
      sellerPreferredService: FEDEX_HOME_DELIVERY,
      availableServices: envelopeFirstServices,
    })
    assert.equal(fedex.code, FEDEX_HOME_DELIVERY)
  })

  it("does not infer envelope just because the package is light", () => {
    const resolved = resolveEbayShippingService({
      categoryPath: jeansCategory.categoryPath,
      categoryName: jeansCategory.categoryName,
      price: 10,
      package: envelopePackage,
      availableServices: envelopeFirstServices,
    })
    assert.equal(isStandardEnvelopeService(resolved.code), false)
    assert.equal(resolved.code, USPS_GROUND_ADVANTAGE)
  })

  it("never falls back to Standard Envelope as the cheapest calculated service", () => {
    assert.equal(
      pickValidDomesticServiceCode("USPSGroundAdvantage", envelopeFirstServices, {
        preferCalculated: true,
        allowStandardEnvelope: false,
      }),
      USPS_GROUND_ADVANTAGE
    )
    assert.equal(
      pickValidDomesticServiceCode("NotARealService", envelopeFirstServices, {
        preferCalculated: true,
        allowStandardEnvelope: false,
      }),
      USPS_GROUND_ADVANTAGE
    )
    const cheapest = recommendedParcelService({
      availableServices: envelopeFirstServices,
      shippingMode: "calculated",
    })
    assert.equal(isStandardEnvelopeService(cheapest), false)
  })

  it("keeps a seller UPS choice instead of substituting USPS Ground Advantage", () => {
    const resolved = resolveEbayShippingService({
      categoryPath: jeansCategory.categoryPath,
      categoryName: jeansCategory.categoryName,
      package: apparelPackage8oz,
      sellerPreferredService: UPS_GROUND,
      availableServices: envelopeFirstServices,
    })
    assert.equal(resolved.code, UPS_GROUND)
    assert.equal(
      pickValidDomesticServiceCode(UPS_GROUND, envelopeFirstServices, {
        preferCalculated: true,
      }),
      UPS_GROUND
    )
  })

  it("keeps a selected UPS service even when GeteBayDetails lists a different UPS product", () => {
    const upsOnlyMissingGround: EbayDomesticShippingService[] = [
      {
        code: USPS_GROUND_ADVANTAGE,
        carrier: "USPS",
        validForSellingFlow: true,
        international: false,
        serviceTypes: ["Flat", "Calculated"],
      },
      {
        code: "UPS3rdDay",
        carrier: "UPS",
        validForSellingFlow: true,
        international: false,
        serviceTypes: ["Flat", "Calculated"],
      },
    ]
    assert.equal(
      pickValidDomesticServiceCode("UPSGround", upsOnlyMissingGround, {
        preferCalculated: true,
      }),
      "UPSGround"
    )
    assert.equal(
      recommendedParcelService({
        sellerPreferredService: "UPSGround",
        availableServices: upsOnlyMissingGround,
        shippingMode: "calculated",
      }),
      "UPSGround"
    )
  })

  it("never substitutes USPS Priority Mail for selected Ground Advantage", () => {
    const priorityOnly: EbayDomesticShippingService[] = [
      {
        code: "USPSPriority",
        carrier: "USPS",
        validForSellingFlow: true,
        international: false,
        serviceTypes: ["Flat", "Calculated"],
      },
    ]
    assert.equal(
      pickValidDomesticServiceCode("USPSGroundAdvantage", priorityOnly, {
        preferCalculated: true,
      }),
      "USPSGroundAdvantage"
    )
    const resolved = resolveEbayShippingService({
      categoryPath: jeansCategory.categoryPath,
      categoryName: jeansCategory.categoryName,
      package: apparelPackage8oz,
      sellerPreferredService: USPS_GROUND_ADVANTAGE,
      availableServices: priorityOnly,
    })
    assert.equal(resolved.code, USPS_GROUND_ADVANTAGE)
  })

  it("maps friendly carrier labels to eBay API codes and keeps Ground Advantage display", () => {
    assert.equal(
      resolveEbayShippingService({
        sellerPreferredService: "USPS Ground Advantage",
      }).code,
      USPS_GROUND_ADVANTAGE
    )
    assert.equal(
      resolveEbayShippingService({
        sellerPreferredService: "USPS Ground Advantage",
      }).label,
      "USPS Ground Advantage"
    )
    assert.equal(
      resolveEbayShippingService({ sellerPreferredService: "UPS Ground" }).code,
      UPS_GROUND
    )
    assert.equal(
      resolveEbayShippingService({
        sellerPreferredService: "FedEx Ground / Home Delivery",
      }).code,
      FEDEX_HOME_DELIVERY
    )
    assert.equal(
      shippingServiceDisplayLabel("USPSParcel"),
      "USPS Ground Advantage"
    )
    assert.equal(
      shippingServiceCodesEquivalent("USPS Ground Advantage", "USPSParcel"),
      true
    )
    assert.equal(
      shippingServiceCodesEquivalent("USPSGroundAdvantage", "USPSPriority"),
      false
    )
  })

  it("lists grouped USPS/UPS/FedEx parcel services and never envelope", () => {
    const groups = groupedParcelShippingOptions()
    assert.deepEqual(
      groups.map((g) => g.carrier),
      ["USPS", "UPS", "FedEx"]
    )
    assert.ok(groups.some((g) => g.options.some((o) => o.value === USPS_GROUND_ADVANTAGE)))
    assert.ok(groups.some((g) => g.options.some((o) => o.value === UPS_GROUND)))
    assert.ok(
      groups.some((g) => g.options.some((o) => o.value === FEDEX_HOME_DELIVERY))
    )
    assert.equal(
      groups.some((g) => g.options.some((o) => isStandardEnvelopeService(o.value))),
      false
    )
  })
})
