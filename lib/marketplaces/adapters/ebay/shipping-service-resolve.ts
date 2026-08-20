/**
 * Resolve an eBay domestic shipping service for the CURRENT listing.
 *
 * Standard Envelope is a specialized service. It is never a generic default,
 * cheapest-service fallback, or "any calculated policy" reuse target.
 * Ordinary merchandise (clothing, shoes, electronics, home goods) uses
 * parcel services. Apparel's normal recommendation is USPS Ground Advantage
 * unless the seller picked another parcel carrier.
 */

import type { EbayShippingMode } from "@/lib/marketplaces/adapters/ebay/fulfillment-shipping"
import type { EbayDomesticShippingService } from "@/lib/marketplaces/adapters/ebay/shipping-services"
import type { ShippingPackage } from "@/lib/listings/shipping-package"

export const STANDARD_ENVELOPE_SERVICE = "US_eBayStandardEnvelope"
export const USPS_GROUND_ADVANTAGE = "USPSGroundAdvantage"
export const UPS_GROUND = "UPSGround"
export const FEDEX_HOME_DELIVERY = "FedExHomeDelivery"
export const FEDEX_GROUND = "FedExGround"
export const USPS_PRIORITY = "USPSPriority"

/** Parcel services Magical-style recommenders may choose among. */
export const PARCEL_SERVICE_CODES = [
  USPS_GROUND_ADVANTAGE,
  UPS_GROUND,
  FEDEX_HOME_DELIVERY,
  FEDEX_GROUND,
  USPS_PRIORITY,
] as const

export const SHIPPING_SERVICE_LABELS: Record<string, string> = {
  USPSGroundAdvantage: "USPS Ground Advantage",
  USPSPriority: "USPS Priority Mail",
  USPSFirstClass: "USPS First Class",
  USPSParcel: "USPS Parcel Select",
  UPSGround: "UPS Ground",
  FedExHomeDelivery: "FedEx Ground / Home Delivery",
  FedExGround: "FedEx Ground / Home Delivery",
  US_eBayStandardEnvelope: "eBay Standard Envelope",
  FreightOtherServices: "Freight",
}

const SERVICE_ALIASES: Record<string, string> = {
  uspsgroundadvantage: USPS_GROUND_ADVANTAGE,
  usps_groundadvantage: USPS_GROUND_ADVANTAGE,
  usps_ground_advantage: USPS_GROUND_ADVANTAGE,
  "usps ground advantage": USPS_GROUND_ADVANTAGE,
  uspspriority: USPS_PRIORITY,
  usps_priority: USPS_PRIORITY,
  upsground: UPS_GROUND,
  ups_ground: UPS_GROUND,
  fedexhomedelivery: FEDEX_HOME_DELIVERY,
  fedex_home_delivery: FEDEX_HOME_DELIVERY,
  fedexground: FEDEX_GROUND,
  fedex_ground: FEDEX_GROUND,
  us_ebaystandardenvelope: STANDARD_ENVELOPE_SERVICE,
  usebaystandardenvelope: STANDARD_ENVELOPE_SERVICE,
  ebaystandardenvelope: STANDARD_ENVELOPE_SERVICE,
  standardenvelope: STANDARD_ENVELOPE_SERVICE,
  uspsstandardenvelope: STANDARD_ENVELOPE_SERVICE,
}

/** eBay Standard Envelope: max $20, max 3 oz, letter-size envelope. */
export const STANDARD_ENVELOPE_MAX_PRICE_USD = 20
export const STANDARD_ENVELOPE_MAX_OUNCES = 3
export const STANDARD_ENVELOPE_MAX_INCHES = {
  length: 11.5,
  width: 6.125,
  thickness: 0.25,
} as const
export const STANDARD_ENVELOPE_MIN_INCHES = {
  length: 5,
  width: 3.5,
} as const

const GARMENT_LEAF =
  /\b(jeans?|shirts?|t-?shirts?|tees?\b|blouses?|pants|trousers|dresses?|skirts?|jackets?|coats?|hoodies?|sweaters?|sweatshirts?|shorts|leggings?|shoes?|sneakers?|boots?|sandals?|heels?|socks?|underwear|bras?|lingerie|apparel)\b/i

const ORDINARY_PARCEL_PATH =
  /\b(clothing|apparel|shoes?|sneakers?|electronics?|cell phones?|smartphones?|computers?|laptops?|tablets?|cameras?|home\s*&\s*garden|home goods|furniture|kitchen|appliances?)\b/i

const CSA_GARMENT_PATH =
  /clothing,\s*shoes\s*&\s*accessories/i

const ENVELOPE_CATEGORY =
  /\b(trading cards?|sports trading card|non-sport trading|stamps?\b|paper money|coins?\b|stickers?|patches?|decals?)\b/i

const ENVELOPE_EXCEPTION =
  /\b(patches?|decals?|stickers?|pins?)\b/i

export type ShippingServiceResolveInput = {
  marketplaceId?: string | null
  categoryId?: string | null
  categoryName?: string | null
  categoryPath?: string | null
  listingCategory?: string | null
  title?: string | null
  price?: number | null
  currency?: string | null
  package?: Pick<
    ShippingPackage,
    "weightPounds" | "weightOunces" | "lengthInches" | "widthInches" | "heightInches"
  > | null
  sellerPreferredService?: string | null
  shippingMode?: EbayShippingMode | string | null
  availableServices?: EbayDomesticShippingService[]
}

export type ShippingServiceResolution = {
  code: string
  label: string
  specialized: boolean
  envelopeEligible: boolean
  ordinaryParcelMerchandise: boolean
  reason: string
}

export function normalizeShippingServiceCode(
  code: string | null | undefined
): string {
  const raw = String(code || "").trim()
  if (!raw) return ""
  const aliased = SERVICE_ALIASES[raw.toLowerCase().replace(/\s+/g, " ")]
  return aliased || raw
}

export function shippingServiceCodesEquivalent(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const left = normalizeShippingServiceCode(a)
  const right = normalizeShippingServiceCode(b)
  if (!left || !right) return false
  return left.toLowerCase() === right.toLowerCase()
}

export function isStandardEnvelopeService(
  code: string | null | undefined
): boolean {
  const normalized = normalizeShippingServiceCode(code)
  return normalized === STANDARD_ENVELOPE_SERVICE
}

export function isParcelService(code: string | null | undefined): boolean {
  const normalized = normalizeShippingServiceCode(code)
  if (!normalized || isStandardEnvelopeService(normalized)) return false
  return (
    PARCEL_SERVICE_CODES.some(
      (c) => c.toLowerCase() === normalized.toLowerCase()
    ) ||
    /^USPS/i.test(normalized) ||
    /^UPS/i.test(normalized) ||
    /^FedEx/i.test(normalized)
  )
}

export function shippingServiceDisplayLabel(
  code: string | null | undefined
): string {
  const normalized = normalizeShippingServiceCode(code)
  if (!normalized) return "USPS Ground Advantage"
  return SHIPPING_SERVICE_LABELS[normalized] || normalized
}

function haystack(input: ShippingServiceResolveInput): string {
  return [
    input.categoryPath,
    input.categoryName,
    input.listingCategory,
    input.title,
  ]
    .filter(Boolean)
    .join(" | ")
}

export function isOrdinaryParcelMerchandise(
  input: ShippingServiceResolveInput
): boolean {
  const text = haystack(input)
  if (!text.trim()) return false
  if (GARMENT_LEAF.test(text)) return true
  if (CSA_GARMENT_PATH.test(text) && !ENVELOPE_EXCEPTION.test(text)) return true
  if (ORDINARY_PARCEL_PATH.test(text) && !ENVELOPE_EXCEPTION.test(text)) {
    return true
  }
  const listingCat = String(input.listingCategory || "").toLowerCase()
  if (
    listingCat === "clothing" ||
    listingCat === "shoes" ||
    listingCat === "electronics" ||
    listingCat === "home"
  ) {
    return true
  }
  return false
}

export function isStandardEnvelopeCategory(
  input: ShippingServiceResolveInput
): boolean {
  if (isOrdinaryParcelMerchandise(input)) return false
  const text = haystack(input)
  return ENVELOPE_CATEGORY.test(text)
}

export function packageFitsStandardEnvelope(
  pkg: ShippingServiceResolveInput["package"]
): boolean {
  if (!pkg) return false
  const ounces =
    (Number(pkg.weightPounds) || 0) * 16 + (Number(pkg.weightOunces) || 0)
  if (!(ounces > 0) || ounces > STANDARD_ENVELOPE_MAX_OUNCES) return false
  const dims = [
    Number(pkg.lengthInches) || 0,
    Number(pkg.widthInches) || 0,
    Number(pkg.heightInches) || 0,
  ]
    .filter((n) => n > 0)
    .sort((a, b) => b - a)
  if (dims.length < 3) return false
  const [length, width, thickness] = dims
  if (length > STANDARD_ENVELOPE_MAX_INCHES.length) return false
  if (width > STANDARD_ENVELOPE_MAX_INCHES.width) return false
  if (thickness > STANDARD_ENVELOPE_MAX_INCHES.thickness) return false
  if (length < STANDARD_ENVELOPE_MIN_INCHES.length) return false
  if (width < STANDARD_ENVELOPE_MIN_INCHES.width) return false
  return true
}

export function priceFitsStandardEnvelope(
  price: number | null | undefined,
  currency?: string | null
): boolean {
  if (price == null || !Number.isFinite(price) || price <= 0) return false
  const cur = String(currency || "USD").toUpperCase()
  if (cur && cur !== "USD") return false
  return price <= STANDARD_ENVELOPE_MAX_PRICE_USD
}

/**
 * Deliberate envelope eligibility: category allowlist AND price AND package.
 * A light package alone is never enough. Ordinary merchandise never qualifies.
 */
export function isStandardEnvelopeEligible(
  input: ShippingServiceResolveInput
): boolean {
  if (isOrdinaryParcelMerchandise(input)) return false
  if (!isStandardEnvelopeCategory(input)) return false
  if (!priceFitsStandardEnvelope(input.price, input.currency)) return false
  if (!packageFitsStandardEnvelope(input.package)) return false
  return true
}

function validDomestic(
  services: EbayDomesticShippingService[] | undefined
): EbayDomesticShippingService[] {
  return (services || []).filter((s) => s.validForSellingFlow && !s.international)
}

function availableHas(
  services: EbayDomesticShippingService[] | undefined,
  code: string
): boolean {
  const list = validDomestic(services)
  if (list.length === 0) return true
  return list.some((s) => shippingServiceCodesEquivalent(s.code, code))
}

function firstAvailableParcel(
  services: EbayDomesticShippingService[] | undefined,
  preferCalculated: boolean
): string {
  const list = validDomestic(services)
  const preferred = [
    USPS_GROUND_ADVANTAGE,
    UPS_GROUND,
    FEDEX_HOME_DELIVERY,
    FEDEX_GROUND,
    USPS_PRIORITY,
  ]
  const pool = preferCalculated
    ? list.filter((s) =>
        s.serviceTypes.some((t) => t.toUpperCase() === "CALCULATED")
      )
    : list
  const search = pool.length > 0 ? pool : list
  for (const code of preferred) {
    const hit = search.find((s) => shippingServiceCodesEquivalent(s.code, code))
    if (hit && !isStandardEnvelopeService(hit.code)) return hit.code
  }
  const parcel = search.find(
    (s) => isParcelService(s.code) && !isStandardEnvelopeService(s.code)
  )
  if (parcel) return parcel.code
  return USPS_GROUND_ADVANTAGE
}

export function recommendedParcelService(
  input: ShippingServiceResolveInput
): string {
  const preferCalculated =
    input.shippingMode !== "flat" && input.shippingMode !== "free"
  const preferred = normalizeShippingServiceCode(input.sellerPreferredService)
  if (
    preferred &&
    isParcelService(preferred) &&
    !isStandardEnvelopeService(preferred) &&
    availableHas(input.availableServices, preferred)
  ) {
    return preferred
  }
  if (availableHas(input.availableServices, USPS_GROUND_ADVANTAGE)) {
    return USPS_GROUND_ADVANTAGE
  }
  return firstAvailableParcel(input.availableServices, preferCalculated)
}

export function resolveEbayShippingService(
  input: ShippingServiceResolveInput
): ShippingServiceResolution {
  const ordinary = isOrdinaryParcelMerchandise(input)
  const envelopeEligible = isStandardEnvelopeEligible(input)
  const preferred = normalizeShippingServiceCode(input.sellerPreferredService)

  if (
    preferred &&
    isParcelService(preferred) &&
    !isStandardEnvelopeService(preferred)
  ) {
    const code = availableHas(input.availableServices, preferred)
      ? preferred
      : recommendedParcelService(input)
    return {
      code,
      label: shippingServiceDisplayLabel(code),
      specialized: false,
      envelopeEligible,
      ordinaryParcelMerchandise: ordinary,
      reason: shippingServiceCodesEquivalent(code, preferred)
        ? "seller_parcel_preference"
        : "seller_parcel_preference_remapped",
    }
  }

  if (isStandardEnvelopeService(preferred)) {
    if (envelopeEligible && availableHas(input.availableServices, preferred)) {
      return {
        code: STANDARD_ENVELOPE_SERVICE,
        label: shippingServiceDisplayLabel(STANDARD_ENVELOPE_SERVICE),
        specialized: true,
        envelopeEligible: true,
        ordinaryParcelMerchandise: ordinary,
        reason: "seller_envelope_eligible",
      }
    }
    const code = recommendedParcelService({
      ...input,
      sellerPreferredService: null,
    })
    return {
      code,
      label: shippingServiceDisplayLabel(code),
      specialized: false,
      envelopeEligible,
      ordinaryParcelMerchandise: ordinary,
      reason: ordinary
        ? "envelope_rejected_ordinary_merchandise"
        : "envelope_ineligible",
    }
  }

  if (envelopeEligible && !preferred) {
    return {
      code: STANDARD_ENVELOPE_SERVICE,
      label: shippingServiceDisplayLabel(STANDARD_ENVELOPE_SERVICE),
      specialized: true,
      envelopeEligible: true,
      ordinaryParcelMerchandise: ordinary,
      reason: "envelope_eligible_default",
    }
  }

  const code = recommendedParcelService(input)
  return {
    code,
    label: shippingServiceDisplayLabel(code),
    specialized: false,
    envelopeEligible,
    ordinaryParcelMerchandise: ordinary,
    reason: ordinary ? "ordinary_parcel_default" : "parcel_default",
  }
}
