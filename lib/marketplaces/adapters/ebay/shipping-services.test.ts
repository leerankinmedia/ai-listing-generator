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
      requested: "USPS Ground Advantage",
      costType: "CALCULATED",
      services: priorityOnly,
    })
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.code, "USPSGroundAdvantage")
      assert.equal(result.carrier, "USPS")
      assert.notEqual(result.code, "USPSPriority")
    }
  })

  it("maps the friendly Ground Advantage label to live USPSParcel metadata", () => {
    const xml = `
      <ShippingServiceDetails>
        <Description>USPS Ground Advantage</Description>
        <ShippingService>USPSParcel</ShippingService>
        <ShippingCarrier>USPS</ShippingCarrier>
        <ValidForSellingFlow>true</ValidForSellingFlow>
        <ServiceType>Flat</ServiceType>
        <ServiceType>Calculated</ServiceType>
      </ShippingServiceDetails>
      <ShippingServiceDetails>
        <ShippingService>USPSPriority</ShippingService>
        <ShippingCarrier>USPS</ShippingCarrier>
        <ValidForSellingFlow>true</ValidForSellingFlow>
        <ServiceType>Flat</ServiceType>
        <ServiceType>Calculated</ServiceType>
      </ShippingServiceDetails>
    `
    const services = parseShippingServiceDetailsXml(xml)
    const parsed = services.find((s) => s.code === "USPSParcel")
    assert.equal(parsed?.description, "USPS Ground Advantage")
    const result = validateSelectedShippingService({
      requested: "USPS Ground Advantage",
      costType: "CALCULATED",
      services,
    })
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.code, "USPSParcel")
      assert.equal(result.carrier, "USPS")
      assert.notEqual(result.code, "USPS Ground Advantage")
      assert.notEqual(result.code, "USPSPriority")
    }
  })

  it("still accepts UPS Ground and FedEx Home Delivery friendly labels", () => {
    const xml = `
      <ShippingServiceDetails>
        <Description>UPS Ground</Description>
        <ShippingService>UPSGround</ShippingService>
        <ShippingCarrier>UPS</ShippingCarrier>
        <ValidForSellingFlow>true</ValidForSellingFlow>
        <ServiceType>Calculated</ServiceType>
      </ShippingServiceDetails>
      <ShippingServiceDetails>
        <Description>FedEx Ground / Home Delivery</Description>
        <ShippingService>FedExHomeDelivery</ShippingService>
        <ShippingCarrier>FedEx</ShippingCarrier>
        <ValidForSellingFlow>true</ValidForSellingFlow>
        <ServiceType>Calculated</ServiceType>
      </ShippingServiceDetails>
    `
    const services = parseShippingServiceDetailsXml(xml)
    const ups = validateSelectedShippingService({
      requested: "UPS Ground",
      costType: "CALCULATED",
      services,
    })
    const fedex = validateSelectedShippingService({
      requested: "FedEx Ground / Home Delivery",
      costType: "CALCULATED",
      services,
    })
    assert.equal(ups.ok, true)
    assert.equal(fedex.ok, true)
    if (ups.ok) assert.equal(ups.code, "UPSGround")
    if (fedex.ok) assert.equal(fedex.code, "FedExHomeDelivery")
  })
})
