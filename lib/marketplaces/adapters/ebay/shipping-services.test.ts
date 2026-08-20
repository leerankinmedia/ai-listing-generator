import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  parseShippingServiceDetailsXml,
  pickValidDomesticServiceCode,
} from "@/lib/marketplaces/adapters/ebay/shipping-services"

describe("eBay GeteBayDetails shipping services", () => {
  const xml = `
    <ShippingServiceDetails>
      <ShippingService>USPSGroundAdvantage</ShippingService>
      <ShippingCarrier>USPS</ShippingCarrier>
      <ValidForSellingFlow>true</ValidForSellingFlow>
      <ServiceType>Flat</ServiceType>
      <ServiceType>Calculated</ServiceType>
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
})
