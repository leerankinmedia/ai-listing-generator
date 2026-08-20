import { xmlText } from "@/lib/marketplaces/adapters/ebay/trading-parse"
import { ebayEnv } from "@/lib/marketplaces/adapters/ebay/oauth"
import {
  isGroundAdvantageService,
  isKnownParcelService,
  isParcelService,
  isStandardEnvelopeService,
  normalizeShippingServiceCode,
  parcelCarrierId,
  shippingServiceCodesEquivalent,
  shippingServiceDisplayLabel,
  USPS_GROUND_ADVANTAGE,
} from "@/lib/marketplaces/adapters/ebay/shipping-service-resolve"

export type EbayShippingCostType = "CALCULATED" | "FLAT_RATE"

export type EbayDomesticShippingService = {
  code: string
  description?: string
  carrier: string | null
  validForSellingFlow: boolean
  international: boolean
  serviceTypes: string[]
  dimensionsRequired?: boolean
  weightRequired?: boolean
}

export type ShippingServiceValidationOk = {
  ok: true
  code: string
  carrier: string
  serviceTypes: string[]
  validForSellingFlow: true
  metadataAvailable: boolean
  dimensionsRequired: boolean
  weightRequired: boolean
}

export type ShippingServiceValidationFail = {
  ok: false
  code: string
  reason:
    | "not_found"
    | "not_valid_for_selling_flow"
    | "international"
    | "envelope_not_allowed"
    | "cost_type_unsupported"
    | "carrier_mismatch"
  message: string
  metadataAvailable: true
}

export type ShippingServiceValidation =
  | ShippingServiceValidationOk
  | ShippingServiceValidationFail

function xmlFlag(block: string, tag: string): boolean {
  return xmlText(block, tag).toLowerCase() === "true"
}

export function normalizeEbayCarrierCode(
  raw: string | null | undefined
): string | null {
  const value = String(raw || "").trim()
  if (!value) return null
  if (/^usps$/i.test(value)) return "USPS"
  if (/^ups$/i.test(value)) return "UPS"
  if (/^fedex$/i.test(value)) return "FedEx"
  return value
}

export function serviceSupportsCostType(
  serviceTypes: string[],
  costType: EbayShippingCostType
): boolean {
  if (serviceTypes.length === 0) return true
  const types = serviceTypes.map((t) => t.trim().toUpperCase())
  if (costType === "CALCULATED") {
    return types.some((t) => t === "CALCULATED" || t === "CALCULATED_SHIPPING")
  }
  return types.some(
    (t) => t === "FLAT" || t === "FLAT_RATE" || t === "FLAT_RATE_SHIPPING"
  )
}

function carriersPaired(
  serviceCode: string,
  metadataCarrier: string | null
): boolean {
  const actual = normalizeEbayCarrierCode(metadataCarrier)
  if (!actual) return true
  const expected = parcelCarrierId(serviceCode) || "USPS"
  return actual.toUpperCase() === expected.toUpperCase()
}

function tradingEndpoint() {
  return ebayEnv() === "sandbox"
    ? "https://api.sandbox.ebay.com/ws/api.dll"
    : "https://api.ebay.com/ws/api.dll"
}

export function parseShippingServiceDetailsXml(
  xml: string
): EbayDomesticShippingService[] {
  const blocks = xml.match(
    /<ShippingServiceDetails[\s\S]*?<\/ShippingServiceDetails>/gi
  )
  if (!blocks) return []
  return blocks
    .map((block) => {
      const code = xmlText(block, "ShippingService")
      const types = [...block.matchAll(/<ServiceType>([\s\S]*?)<\/ServiceType>/gi)].map(
        (m) => m[1].trim()
      )
      return {
        code,
        description: xmlText(block, "Description") || undefined,
        carrier: normalizeEbayCarrierCode(xmlText(block, "ShippingCarrier")),
        validForSellingFlow: xmlFlag(block, "ValidForSellingFlow"),
        international: xmlFlag(block, "InternationalService"),
        serviceTypes: types,
        dimensionsRequired: xmlFlag(block, "DimensionsRequired"),
        weightRequired: xmlFlag(block, "WeightRequired"),
      }
    })
    .filter((s) => s.code)
}

export function pickValidDomesticServiceCode(
  requested: string,
  services: EbayDomesticShippingService[],
  options: boolean | {
    preferCalculated?: boolean
    allowStandardEnvelope?: boolean
  } = false
): string {
  const preferCalculated =
    typeof options === "boolean" ? options : Boolean(options.preferCalculated)
  const allowStandardEnvelope =
    typeof options === "boolean" ? false : Boolean(options.allowStandardEnvelope)

  const wanted = normalizeShippingServiceCode(requested) || requested.trim()
  const domestic = services.filter(
    (s) => s.validForSellingFlow && !s.international
  )
  if (domestic.length === 0) {
    if (
      wanted &&
      (allowStandardEnvelope ||
        !isStandardEnvelopeService(wanted))
    ) {
      return wanted
    }
    return USPS_GROUND_ADVANTAGE
  }

  const usable = domestic.filter(
    (s) => allowStandardEnvelope || !isStandardEnvelopeService(s.code)
  )

  const exact = usable.find((s) =>
    shippingServiceCodesEquivalent(s.code, wanted)
  )
  if (exact) return exact.code

  if (wanted && isStandardEnvelopeService(wanted) && !allowStandardEnvelope) {
    // Specialized envelope was requested but this listing is not eligible.
  } else if (wanted && isParcelService(wanted)) {
    // Keep the seller's selected parcel service. Never substitute Priority
    // Mail, another USPS product, UPS, or FedEx.
    return wanted
  }

  const pool = preferCalculated
    ? usable.filter((s) =>
        s.serviceTypes.some((t) => t.toUpperCase() === "CALCULATED")
      )
    : usable
  const search = pool.length > 0 ? pool : usable

  const preferredOrder = [USPS_GROUND_ADVANTAGE]
  for (const code of preferredOrder) {
    const hit = search.find((s) => shippingServiceCodesEquivalent(s.code, code))
    if (hit) return hit.code
  }

  const parcel = search.find((s) => isParcelService(s.code))
  if (parcel) return parcel.code

  return USPS_GROUND_ADVANTAGE
}

function serviceRecordMatches(
  service: EbayDomesticShippingService,
  wanted: string
): boolean {
  if (shippingServiceCodesEquivalent(service.code, wanted)) return true
  if (
    service.description &&
    shippingServiceCodesEquivalent(service.description, wanted)
  ) {
    return true
  }
  if (
    isGroundAdvantageService(wanted) &&
    /ground\s*advantage/i.test(service.description || "")
  ) {
    return true
  }
  return false
}

export function findEbayDomesticShippingService(
  requested: string,
  services: EbayDomesticShippingService[]
): EbayDomesticShippingService | undefined {
  const wanted = normalizeShippingServiceCode(requested) || requested.trim()
  if (!wanted) return undefined
  const matches = services.filter((service) => serviceRecordMatches(service, wanted))
  if (matches.length === 0) return undefined
  const exactCode = matches.find(
    (service) =>
      normalizeShippingServiceCode(service.code).toLowerCase() ===
      wanted.toLowerCase()
  )
  if (exactCode) return exactCode
  const namedGroundAdvantage = matches.find(
    (service) =>
      isGroundAdvantageService(wanted) &&
      /ground\s*advantage/i.test(service.description || "")
  )
  if (namedGroundAdvantage) return namedGroundAdvantage
  const explicitGa = matches.find((service) =>
    shippingServiceCodesEquivalent(service.code, USPS_GROUND_ADVANTAGE)
  )
  return explicitGa || matches[0]
}

function unsupportedMessage(
  code: string,
  costType: EbayShippingCostType,
  reason: ShippingServiceValidationFail["reason"]
): string {
  const label = shippingServiceDisplayLabel(code) || code || "That shipping service"
  const costLabel = costType === "CALCULATED" ? "calculated" : "flat"
  switch (reason) {
    case "not_found":
      return `${label} is not a valid eBay US shipping service for selling. ListWise did not substitute another carrier or service. Choose a supported USPS, UPS, or FedEx service.`
    case "not_valid_for_selling_flow":
      return `${label} is not valid for eBay US selling. ListWise did not substitute another shipping service.`
    case "international":
      return `${label} is an international eBay shipping service. This listing is domestic US only.`
    case "envelope_not_allowed":
      return `eBay Standard Envelope is not eligible for this listing. Choose a parcel service such as USPS Ground Advantage.`
    case "cost_type_unsupported":
      return `${label} does not support ${costLabel} shipping on eBay US. ListWise did not change the service or shipping-cost type.`
    case "carrier_mismatch":
      return `${label} is not paired with its eBay carrier code. ListWise did not substitute another shipping service.`
  }
}

/**
 * Confirm the seller's selected service against GeteBayDetails for EBAY_US.
 * Never substitutes a different service. Empty metadata means the lookup
 * failed — callers keep the selected catalog service instead of guessing.
 */
export function validateSelectedShippingService(opts: {
  requested: string
  costType: EbayShippingCostType
  services: EbayDomesticShippingService[]
  allowStandardEnvelope?: boolean
}): ShippingServiceValidation {
  const requested =
    normalizeShippingServiceCode(opts.requested) || opts.requested.trim()
  const code = requested || USPS_GROUND_ADVANTAGE
  const catalogCarrier = parcelCarrierId(code) || "USPS"

  if (opts.services.length === 0) {
    return {
      ok: true,
      code,
      carrier: catalogCarrier,
      serviceTypes: [],
      validForSellingFlow: true,
      metadataAvailable: false,
      dimensionsRequired: opts.costType === "CALCULATED",
      weightRequired: opts.costType === "CALCULATED",
    }
  }

  const match = findEbayDomesticShippingService(code, opts.services)
  const fail = (
    reason: ShippingServiceValidationFail["reason"],
    serviceCode = code
  ): ShippingServiceValidationFail => ({
    ok: false,
    code: serviceCode,
    reason,
    metadataAvailable: true,
    message: unsupportedMessage(serviceCode, opts.costType, reason),
  })

  if (!match) {
    // Known catalog parcels stay selected. Live metadata may omit an enum
    // while still accepting the service, and must never be compared to the
    // friendly UI label as if it were a shippingServiceCode.
    if (isKnownParcelService(code)) {
      return {
        ok: true,
        code,
        carrier: catalogCarrier,
        serviceTypes: [],
        validForSellingFlow: true,
        metadataAvailable: true,
        dimensionsRequired: opts.costType === "CALCULATED",
        weightRequired: opts.costType === "CALCULATED",
      }
    }
    return fail("not_found")
  }
  if (!match.validForSellingFlow) {
    return fail("not_valid_for_selling_flow", match.code)
  }
  if (match.international) return fail("international", match.code)
  if (isStandardEnvelopeService(match.code) && !opts.allowStandardEnvelope) {
    return fail("envelope_not_allowed", match.code)
  }
  if (!serviceSupportsCostType(match.serviceTypes, opts.costType)) {
    return fail("cost_type_unsupported", match.code)
  }
  if (!carriersPaired(match.code, match.carrier)) {
    return fail("carrier_mismatch", match.code)
  }

  return {
    ok: true,
    code: match.code,
    carrier: normalizeEbayCarrierCode(match.carrier) || catalogCarrier,
    serviceTypes: match.serviceTypes,
    validForSellingFlow: true,
    metadataAvailable: true,
    dimensionsRequired: Boolean(match.dimensionsRequired),
    weightRequired: Boolean(match.weightRequired),
  }
}

/**
 * Discover marketplace-valid domestic shipping service codes for this seller.
 * Failures are non-fatal — callers keep the listing's requested code.
 */
export async function fetchValidDomesticShippingServices(
  accessToken: string
): Promise<EbayDomesticShippingService[]> {
  const body = `<?xml version="1.0" encoding="utf-8"?>
<GeteBayDetailsRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ErrorLanguage>en_US</ErrorLanguage>
  <DetailName>ShippingServiceDetails</DetailName>
</GeteBayDetailsRequest>`

  try {
    const response = await fetch(tradingEndpoint(), {
      method: "POST",
      headers: {
        "Content-Type": "text/xml",
        "X-EBAY-API-IAF-TOKEN": accessToken,
        "X-EBAY-API-CALL-NAME": "GeteBayDetails",
        "X-EBAY-API-SITEID": "0",
        "X-EBAY-API-COMPATIBILITY-LEVEL": "1193",
      },
      body,
    })
    const xml = await response.text()
    if (!response.ok) {
      console.warn("[ebay/policies] GeteBayDetails shipping services failed", {
        httpStatus: response.status,
      })
      return []
    }
    const parsed = parseShippingServiceDetailsXml(xml)
    const validDomestic = parsed.filter(
      (s) => s.validForSellingFlow && !s.international
    )
    console.info("[ebay/policies] GeteBayDetails domestic services", {
      marketplaceId: "EBAY_US",
      total: parsed.length,
      validDomestic: validDomestic.length,
      calculated: validDomestic.filter((s) =>
        serviceSupportsCostType(s.serviceTypes, "CALCULATED")
      ).length,
      codes: validDomestic.map((s) => s.code).slice(0, 40),
    })
    return parsed
  } catch (err) {
    console.warn("[ebay/policies] GeteBayDetails shipping services error", {
      error: err instanceof Error ? err.message : String(err),
    })
    return []
  }
}
