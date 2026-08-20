import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  parseShippingServiceDetailsXml,
  pickValidDomesticServiceCode,
  validateSelectedShippingService,
} from "@/lib/marketplaces/adapters/ebay/shipping-services"

describe("eBay GeteBayDetails shipping services", () => {
  const xml = `
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
      <ValidForSellingFlow>true</ValidForSellingFlow>
      <ServiceType>Flat</ServiceType>
    </ShippingServiceDetails>
    <ShippingServiceDetails>
      <ShippingService>USPS_Intl</ShippingService>
      <InternationalService>true</InternationalService>
      <ValidForSellingFlow>true</ValidForSellingFlow>
    </ShippingServiceDetails>
  `

  it("keeps a requested domestic service that is valid for selling", () => {
    const services = parseShippingServiceDetailsXml(xml)
    assert.equal(
      pickValidDomesticServiceCode("USPSGroundAdvantage", services, true),
      "USPSGroundAdvantage"
    )
    const parsed = services.find((s) => s.code === "USPSGroundAdvantage")
    assert.equal(parsed?.dimensionsRequired, true)
    assert.equal(parsed?.weightRequired, true)
    assert.equal(parsed?.carrier, "USPS")
  })

  it("falls back to a valid domestic USPS service when the requested code is not sellable", () => {
    const services = parseShippingServiceDetailsXml(xml)
    assert.equal(
      pickValidDomesticServiceCode("NotARealService", services, false),
      "USPSGroundAdvantage"
    )
  })

  it("never falls back to Standard Envelope when it is first in GeteBayDetails", () => {
    const envelopeFirst = `
      <ShippingServiceDetails>
        <ShippingService>US_eBayStandardEnvelope</ShippingService>
        <ValidForSellingFlow>true</ValidForSellingFlow>
        <ServiceType>Calculated</ServiceType>
      </ShippingServiceDetails>
      <ShippingServiceDetails>
        <ShippingService>USPSGroundAdvantage</ShippingService>
        <ValidForSellingFlow>true</ValidForSellingFlow>
        <ServiceType>Flat</ServiceType>
        <ServiceType>Calculated</ServiceType>
      </ShippingServiceDetails>
    `
    const services = parseShippingServiceDetailsXml(envelopeFirst)
    assert.equal(
      pickValidDomesticServiceCode("USPSGroundAdvantage", services, {
        preferCalculated: true,
        allowStandardEnvelope: false,
      }),
      "USPSGroundAdvantage"
    )
    assert.equal(
      pickValidDomesticServiceCode("NotARealService", services, {
        preferCalculated: true,
        allowStandardEnvelope: false,
      }),
      "USPSGroundAdvantage"
    )
  })

  it("does not switch a requested UPS service to USPS when UPS is available", () => {
    const mixed = `
      <ShippingServiceDetails>
        <ShippingService>USPSGroundAdvantage</ShippingService>
        <ValidForSellingFlow>true</ValidForSellingFlow>
        <ServiceType>Calculated</ServiceType>
      </ShippingServiceDetails>
      <ShippingServiceDetails>
        <ShippingService>UPSGround</ShippingService>
        <ValidForSellingFlow>true</ValidForSellingFlow>
        <ServiceType>Calculated</ServiceType>
      </ShippingServiceDetails>
    `
    const services = parseShippingServiceDetailsXml(mixed)
    assert.equal(
      pickValidDomesticServiceCode("UPSGround", services, {
        preferCalculated: true,
      }),
      "UPSGround"
    )
  })

  it("keeps USPS Ground Advantage when GeteBayDetails only lists Priority Mail", () => {
    const xml = `
      <ShippingServiceDetails>
        <ShippingService>USPSPriority</ShippingService>
        <ValidForSellingFlow>true</ValidForSellingFlow>
        <ServiceType>Flat</ServiceType>
        <ServiceType>Calculated</ServiceType>
      </ShippingServiceDetails>
    `
    const services = parseShippingServiceDetailsXml(xml)
    assert.equal(
      pickValidDomesticServiceCode("USPSGroundAdvantage", services, true),
      "USPSGroundAdvantage"
    )
  })

  it("validates Ground Advantage calculated + carrier pairing from EBAY_US metadata", () => {
    const services = parseShippingServiceDetailsXml(xml)
    const ok = validateSelectedShippingService({
      requested: "USPSGroundAdvantage",
      costType: "CALCULATED",
      services,
    })
    assert.equal(ok.ok, true)
    if (ok.ok) {
      assert.equal(ok.code, "USPSGroundAdvantage")
      assert.equal(ok.carrier, "USPS")
      assert.equal(ok.validForSellingFlow, true)
      assert.equal(ok.metadataAvailable, true)
    }
  })

  it("rejects calculated shipping when metadata only lists Flat for that service", () => {
    const services = parseShippingServiceDetailsXml(xml)
    const result = validateSelectedShippingService({
      requested: "USPSPriority",
      costType: "CALCULATED",
      services,
    })
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.equal(result.reason, "cost_type_unsupported")
      assert.match(result.message, /did not change the service/i)
    }
  })

  it("does not substitute Priority Mail when Ground Advantage is missing from metadata", () => {
    const priorityOnly = parseShippingServiceDetailsXml(`
      <ShippingServiceDetails>
        <ShippingService>USPSPriority</ShippingService>
        <ShippingCarrier>USPS</ShippingCarrier>
        <ValidForSellingFlow>true</ValidForSellingFlow>
        <ServiceType>Flat</ServiceType>
        <ServiceType>Calculated</ServiceType>
      </ShippingServiceDetails>
    `)
    const result = validateSelectedShippingService({
      requested: "USPSGroundAdvantage",
      costType: "CALCULATED",
      services: priorityOnly,
    })
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.equal(result.reason, "not_found")
      assert.equal(result.code, "USPSGroundAdvantage")
      assert.match(result.message, /did not substitute/i)
    }
  })
})
