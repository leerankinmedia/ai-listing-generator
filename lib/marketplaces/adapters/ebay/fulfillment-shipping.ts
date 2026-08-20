/**
 * Parse eBay Account API fulfillment policies into clear shipping modes.
 * Never treat free shipping as an implicit default.
 */

export type EbayShippingMode = "calculated" | "flat" | "free"

export type EbayRegionSet = {
  regionIncluded?: Array<{
    regionName?: string
    regionType?: string
  }>
  regionExcluded?: Array<{
    regionName?: string
    regionType?: string
  }>
}

export type EbayFulfillmentPolicyRaw = {
  fulfillmentPolicyId?: string
  name?: string
  marketplaceId?: string
  handlingTime?: { value?: number; unit?: string }
  shippingOptions?: Array<{
    optionType?: string
    costType?: string
    packageHandlingCost?: { value?: string; currency?: string }
    shippingServices?: Array<{
      shippingServiceCode?: string
      shippingCarrierCode?: string
      freeShipping?: boolean
      buyerResponsibleForShipping?: boolean
      buyerResponsibleForPickup?: boolean
      shippingCost?: { value?: string; currency?: string }
      additionalShippingCost?: { value?: string; currency?: string }
      sortOrder?: number
      shipToLocations?: EbayRegionSet
    }>
    insuranceOffered?: boolean
    insuranceFee?: { value?: string; currency?: string }
  }>
  shipToLocations?: EbayRegionSet
}

export type EbayFulfillmentShippingSummary = {
  fulfillmentPolicyId: string
  name: string
  mode: EbayShippingMode
  isFreeShipping: boolean
  costType: string
  serviceCode: string | null
  serviceLabel: string
  whoPays: "buyer" | "seller"
  flatAmount: number | null
  flatCurrency: string | null
  handlingDays: number | null
  handlingUnit: string | null
  /** One-line human summary of cost settings */
  costSummary: string
}

const SERVICE_LABELS: Record<string, string> = {
  USPSPriority: "USPS Priority Mail",
  USPSFirstClass: "USPS First Class",
  USPSParcel: "USPS Parcel Select",
  USPSGroundAdvantage: "USPS Ground Advantage",
  UPSGround: "UPS Ground",
  FedExHomeDelivery: "FedEx Ground / Home Delivery",
  FedExGround: "FedEx Ground / Home Delivery",
  FreightOtherServices: "Freight",
}

function moneyValue(raw?: string | null): number | null {
  if (raw == null || raw === "") return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

function domesticOption(policy: EbayFulfillmentPolicyRaw) {
  const options = policy.shippingOptions || []
  return (
    options.find((o) => (o.optionType || "").toUpperCase() === "DOMESTIC") ||
    options[0] ||
    null
  )
}

function primaryService(
  option: NonNullable<ReturnType<typeof domesticOption>>
) {
  const services = [...(option.shippingServices || [])].sort(
    (a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99)
  )
  return services[0] || null
}

/** True when the domestic shipping service is free for the buyer. */
export function fulfillmentPolicyIsFreeShipping(
  policy: EbayFulfillmentPolicyRaw
): boolean {
  const option = domesticOption(policy)
  if (!option) return false
  const service = primaryService(option)
  if (!service) return false
  if (service.freeShipping === true) return true
  if (service.buyerResponsibleForShipping === false) {
    const cost = moneyValue(service.shippingCost?.value)
    if (cost != null && cost <= 0) return true
  }
  const costType = (option.costType || "").toUpperCase()
  if (costType === "FLAT_RATE" || costType === "FLAT_RATE_SHIPPING") {
    const cost = moneyValue(service.shippingCost?.value)
    if (cost != null && cost <= 0) return true
  }
  return false
}

export function classifyFulfillmentShippingMode(
  policy: EbayFulfillmentPolicyRaw
): EbayShippingMode {
  if (fulfillmentPolicyIsFreeShipping(policy)) return "free"
  const option = domesticOption(policy)
  const costType = (option?.costType || "").toUpperCase()
  if (costType === "CALCULATED" || costType === "CALCULATED_SHIPPING") {
    return "calculated"
  }
  return "flat"
}

export function summarizeFulfillmentPolicy(
  policy: EbayFulfillmentPolicyRaw
): EbayFulfillmentShippingSummary | null {
  const id = policy.fulfillmentPolicyId?.trim()
  if (!id) return null

  const option = domesticOption(policy)
  const service = option ? primaryService(option) : null
  const mode = classifyFulfillmentShippingMode(policy)
  const isFree = mode === "free"
  const costType = (option?.costType || "UNKNOWN").toUpperCase()
  const serviceCode = service?.shippingServiceCode?.trim() || null
  const serviceLabel = serviceCode
    ? SERVICE_LABELS[serviceCode] || serviceCode
    : "Unknown service"
  const flatAmount = moneyValue(service?.shippingCost?.value)
  const flatCurrency = service?.shippingCost?.currency || "USD"
  const handlingDays =
    typeof policy.handlingTime?.value === "number"
      ? policy.handlingTime.value
      : null
  const handlingUnit = policy.handlingTime?.unit || "DAY"

  let costSummary: string
  if (isFree) {
    costSummary = "Free shipping (seller pays)"
  } else if (mode === "calculated") {
    costSummary = "Buyer pays calculated shipping"
  } else if (flatAmount != null) {
    costSummary = `Buyer pays flat ${flatCurrency} ${flatAmount.toFixed(2)}`
  } else {
    costSummary = "Buyer pays flat shipping"
  }

  return {
    fulfillmentPolicyId: id,
    name: policy.name?.trim() || "Fulfillment policy",
    mode,
    isFreeShipping: isFree,
    costType,
    serviceCode,
    serviceLabel,
    whoPays: isFree ? "seller" : "buyer",
    flatAmount: mode === "flat" ? flatAmount : null,
    flatCurrency: mode === "flat" ? flatCurrency : null,
    handlingDays,
    handlingUnit,
    costSummary,
  }
}

export function shippingModeLabel(mode: EbayShippingMode): string {
  switch (mode) {
    case "calculated":
      return "Calculated"
    case "flat":
      return "Flat"
    case "free":
      return "Free"
  }
}

export function shippingModeDescription(mode: EbayShippingMode): string {
  switch (mode) {
    case "calculated":
      return "Buyer pays postage calculated from your package weight and size."
    case "flat":
      return "Buyer pays a fixed shipping amount you set."
    case "free":
      return "You pay shipping. Confirm before publishing."
  }
}

export function defaultEbayShippingMode(
  value: string | undefined | null
): EbayShippingMode {
  if (value === "flat" || value === "free" || value === "calculated") {
    return value
  }
  return "calculated"
}

export function formatHandlingTime(
  days: number | null | undefined,
  unit?: string | null
): string {
  if (days == null) return "Not set"
  const u = (unit || "DAY").toLowerCase()
  if (u.startsWith("day")) return days === 1 ? "1 business day" : `${days} business days`
  return `${days} ${unit || "DAY"}`
}

/** Map ListWise / eBay shipping service codes to Account API carrier codes. */
export function shippingCarrierForService(serviceCode: string): string {
  const code = serviceCode.trim()
  if (/^USPS/i.test(code) || /^US_eBay/i.test(code)) return "USPS"
  if (/^UPS/i.test(code)) return "UPS"
  if (/^FedEx/i.test(code)) return "FedEx"
  if (/^Freight/i.test(code)) return "OTHER"
  return "USPS"
}

export type EbayDomesticRegion = {
  regionName: string
  regionType?: "COUNTRY" | "COUNTRY_REGION" | "WORLD_REGION"
}

export type EbayDomesticRegionSet = {
  regionIncluded: EbayDomesticRegion[]
}

/**
 * USPS Ground Advantage (and other domestic US services) are not worldwide.
 * LSAS 216118 is shipping-eligibility against ship-to locations: omitting
 * shipToLocations lets LSAS default to an incompatible destination set.
 */
export function domesticUsShipToLocations(): EbayDomesticRegionSet {
  return {
    regionIncluded: [{ regionName: "US", regionType: "COUNTRY" }],
  }
}

export function currencyForMarketplace(marketplaceId: string): string {
  const id = (marketplaceId || "EBAY_US").toUpperCase()
  if (id === "EBAY_GB" || id === "EBAY_UK") return "GBP"
  if (id === "EBAY_AU") return "AUD"
  if (id === "EBAY_CA") return "CAD"
  if (id === "EBAY_DE" || id === "EBAY_FR" || id === "EBAY_IT" || id === "EBAY_ES") {
    return "EUR"
  }
  return "USD"
}

export type FulfillmentPolicyCreateRequest = {
  name: string
  marketplaceId: string
  categoryTypes: Array<{ name: string; default?: boolean }>
  handlingTime: { value: number; unit: "DAY" }
  localPickup: false
  freightShipping: false
  globalShipping: false
  pickupDropOff: false
  shipToLocations: EbayDomesticRegionSet
  shippingOptions: Array<{
    optionType: "DOMESTIC"
    costType: "CALCULATED" | "FLAT_RATE"
    insuranceOffered: false
    insuranceFee: { value: string; currency: string }
    shippingServices: Array<{
      sortOrder: number
      shippingCarrierCode: string
      shippingServiceCode: string
      freeShipping: boolean
      buyerResponsibleForShipping: false
      buyerResponsibleForPickup: false
      shipToLocations: EbayDomesticRegionSet
      shippingCost?: { value: string; currency: string }
    }>
  }>
}

/**
 * Build a createFulfillmentPolicy body matching eBay Dev Support's accepted
 * Account API shape for a normal US domestic calculated/flat/free policy.
 *
 * 20403 / LSAS 216118 (LOGISTICS_INFO):
 * - shipToLocations.regionIncluded must be US COUNTRY (Ground Advantage is
 *   domestic-only; missing destinations fail LSAS eligibility 216118).
 * - buyerResponsibleForShipping/Pickup must be explicit false (not omitted,
 *   never true — true is Motors-only).
 * - insuranceOffered false + insuranceFee 0.0 (Dev Support working payload).
 * - localPickup/freight/global/pickupDropOff explicit false.
 * - Include shippingCarrierCode with shippingServiceCode.
 * - CALCULATED must omit shippingCost; FLAT/FREE include it.
 *
 * When a template policy from the seller's eBay account exists, reuse its
 * logistics shape (costType/carrier/service) instead of inventing values.
 */
export function buildFulfillmentPolicyCreateRequest(args: {
  marketplaceId: string
  mode: EbayShippingMode
  name: string
  handlingDays: number
  shippingServiceCode: string
  flatAmount?: number
  /** Existing seller policy to copy logistics shape from (eBay.com-created preferred). */
  template?: EbayFulfillmentPolicyRaw | null
  /** Set true only when the seller has no fulfillment policy yet. */
  setAsDefault?: boolean
}): FulfillmentPolicyCreateRequest {
  const days = Math.max(0, Math.min(30, Math.floor(args.handlingDays || 1)))
  const service =
    String(args.shippingServiceCode || "").trim() || "USPSGroundAdvantage"
  const currency = currencyForMarketplace(args.marketplaceId)
  const amount = Math.max(0.01, Number(args.flatAmount) || 5.99).toFixed(2)

  const templateOption = args.template
    ? domesticOption(args.template)
    : null
  const templateService = templateOption
    ? primaryService(templateOption)
    : null

  // Prefer service/carrier already present on the seller's eBay.com policy when
  // that template matches the requested shipping mode.
  const templateMode = args.template
    ? classifyFulfillmentShippingMode(args.template)
    : null
  const resolvedService =
    templateMode === args.mode && templateService?.shippingServiceCode?.trim()
      ? templateService.shippingServiceCode.trim()
      : service

  const carrier =
    (templateMode === args.mode &&
      templateService?.shippingCarrierCode?.trim()) ||
    shippingCarrierForService(resolvedService)

  const costType: "CALCULATED" | "FLAT_RATE" =
    args.mode === "calculated" ? "CALCULATED" : "FLAT_RATE"

  const shipTo = domesticUsShipToLocations()

  const shippingService: FulfillmentPolicyCreateRequest["shippingOptions"][0]["shippingServices"][0] =
    {
      sortOrder: 1,
      shippingCarrierCode: carrier,
      shippingServiceCode: resolvedService,
      freeShipping: args.mode === "free",
      // Dev Support working create: explicit false. true is Motors-only (20403).
      buyerResponsibleForShipping: false,
      buyerResponsibleForPickup: false,
      shipToLocations: shipTo,
    }

  if (args.mode === "flat") {
    shippingService.shippingCost = { value: amount, currency }
  } else if (args.mode === "free") {
    shippingService.shippingCost = { value: "0.0", currency }
  }
  // CALCULATED: no shippingCost — eBay computes from package weight/dims.

  return {
    name: args.name,
    marketplaceId: args.marketplaceId,
    categoryTypes: [
      {
        name: "ALL_EXCLUDING_MOTORS_VEHICLES",
        ...(args.setAsDefault ? { default: true } : {}),
      },
    ],
    handlingTime: { value: days, unit: "DAY" },
    localPickup: false,
    freightShipping: false,
    globalShipping: false,
    pickupDropOff: false,
    shipToLocations: shipTo,
    shippingOptions: [
      {
        optionType: "DOMESTIC",
        costType,
        insuranceOffered: false,
        insuranceFee: { value: "0.0", currency },
        shippingServices: [shippingService],
      },
    ],
  }
}

export type EbayAccountError = {
  errorId?: number
  message?: string
  longMessage?: string
  parameters?: Array<{ name?: string; value?: string }>
}

export type FulfillmentCreateDiagnosis = {
  rejectedField: string | null
  lsasCode: string | null
  shipEligCode: string | null
  xpath: string | null
  calculatedNotSupported: boolean
  shipToLocationInvalid: boolean
}

function paramByName(
  params: Array<{ name?: string; value?: string }>,
  name: string
): string | null {
  const wanted = name.toUpperCase()
  const hit = params.find((p) => (p.name || "").toUpperCase() === wanted)
  return hit?.value?.trim() || null
}

/** Extract rejected field name from eBay 20403 parameters (e.g. LOGISTICS_INFO). */
export function rejectedEbayFieldFromErrors(
  errors: EbayAccountError[]
): string | null {
  return diagnoseFulfillmentCreateErrors(errors).rejectedField
}

/**
 * Parse the full 20403 / LSAS body, including numeric parameter values like 216118.
 */
export function diagnoseFulfillmentCreateErrors(
  errors: EbayAccountError[]
): FulfillmentCreateDiagnosis {
  let rejectedField: string | null = null
  let lsasCode: string | null = null
  let shipEligCode: string | null = null
  let xpath: string | null = null

  for (const err of errors) {
    const params = err.parameters || []
    const fieldName = paramByName(params, "fieldName")
    const xpathValue = paramByName(params, "XPATH")
    const shipElig = paramByName(params, "SHIPELIG_ERROR_CODE_NAME")
    const additional = paramByName(params, "additionalInfo")
    const hay = [
      err.message || "",
      err.longMessage || "",
      additional || "",
      ...params.map((p) => `${p.name || ""} ${p.value || ""}`),
    ].join(" ")

    if (!xpath && xpathValue) xpath = xpathValue
    if (!shipEligCode && shipElig) shipEligCode = shipElig

    const lsasMatch = hay.match(/\bLSAS[^\d]{0,8}(\d{5,6})\b/i)
    const codeMatch = hay.match(/\b(216118)\b/)
    if (!lsasCode && (lsasMatch?.[1] || codeMatch?.[1])) {
      lsasCode = lsasMatch?.[1] || codeMatch?.[1] || null
    }
    for (const p of params) {
      if ((p.name || "").trim() === "216118" && p.value) {
        lsasCode = lsasCode || "216118"
      }
      if ((p.value || "").trim() === "216118") {
        lsasCode = "216118"
      }
    }

    if (!rejectedField && fieldName) rejectedField = fieldName
    else if (!rejectedField && xpathValue) rejectedField = xpathValue
    else if (!rejectedField && shipElig) rejectedField = shipElig
    else if (!rejectedField) {
      const m = hay.match(
        /\b(LOGISTICS_INFO|shipToLocations|localPickup|shippingServiceCode|costType|buyerResponsibleForShipping)\b/i
      )
      if (m) rejectedField = m[1]
    }
    if (!rejectedField && lsasCode === "216118") {
      rejectedField = "shipToLocations"
    }
    if (lsasCode === "216118" && rejectedField === "LOGISTICS_INFO") {
      rejectedField = "shipToLocations"
    }
  }

  const allText = errors
    .map((e) =>
      [
        e.message,
        e.longMessage,
        ...(e.parameters || []).map((p) => `${p.name}=${p.value}`),
      ].join(" ")
    )
    .join(" ")
    .toUpperCase()

  const calculatedNotSupported =
    shipEligCode === "CALCULATED_SHIPPING_TYPE_NOT_SUPPORTED" ||
    allText.includes("CALCULATED_SHIPPING_TYPE_NOT_SUPPORTED")

  const shipToLocationInvalid =
    lsasCode === "216118" ||
    /SHIPTOLOCATION/i.test(rejectedField || "") ||
    /SHIPTOLOCATION/i.test(xpath || "") ||
    /SHIP_TO_LOCATION/i.test(shipEligCode || "") ||
    /SHIP_TO_LOCATION/i.test(allText)

  if (!rejectedField && shipToLocationInvalid) rejectedField = "shipToLocations"
  if (!rejectedField && calculatedNotSupported) {
    rejectedField = "costType"
  }

  return {
    rejectedField,
    lsasCode,
    shipEligCode,
    xpath,
    calculatedNotSupported,
    shipToLocationInvalid,
  }
}
