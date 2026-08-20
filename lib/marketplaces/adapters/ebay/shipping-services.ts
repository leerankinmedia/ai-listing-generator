import { xmlText } from "@/lib/marketplaces/adapters/ebay/trading-parse"
import { ebayEnv } from "@/lib/marketplaces/adapters/ebay/oauth"

export type EbayDomesticShippingService = {
  code: string
  carrier: string | null
  validForSellingFlow: boolean
  international: boolean
  serviceTypes: string[]
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
        carrier: xmlText(block, "ShippingCarrier") || null,
        validForSellingFlow:
          xmlText(block, "ValidForSellingFlow").toLowerCase() === "true",
        international:
          xmlText(block, "InternationalService").toLowerCase() === "true",
        serviceTypes: types,
      }
    })
    .filter((s) => s.code)
}

export function pickValidDomesticServiceCode(
  requested: string,
  services: EbayDomesticShippingService[],
  preferCalculated: boolean
): string {
  const wanted = requested.trim()
  const domestic = services.filter(
    (s) => s.validForSellingFlow && !s.international
  )
  if (domestic.length === 0) return wanted || "USPSGroundAdvantage"

  const exact = domestic.find(
    (s) => s.code.toLowerCase() === wanted.toLowerCase()
  )
  if (exact) return exact.code

  if (preferCalculated) {
    const calculated = domestic.find((s) =>
      s.serviceTypes.some((t) => t.toUpperCase() === "CALCULATED")
    )
    if (calculated) return calculated.code
  }

  const usps = domestic.find((s) => /^USPS/i.test(s.code))
  return usps?.code || domestic[0].code
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
    console.info("[ebay/policies] GeteBayDetails domestic services", {
      total: parsed.length,
      validDomestic: parsed.filter((s) => s.validForSellingFlow && !s.international)
        .length,
    })
    return parsed
  } catch (err) {
    console.warn("[ebay/policies] GeteBayDetails shipping services error", {
      error: err instanceof Error ? err.message : String(err),
    })
    return []
  }
}
