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
  UPS3rdDay: "UPS 3 Day Select",
  UPS2ndDay: "UPS 2nd Day Air",
  FedExHomeDelivery: "FedEx Ground / Home Delivery",
  FedExGround: "FedEx Ground",
  US_eBayStandardEnvelope: "eBay Standard Envelope",
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

/** True when a listed policy has a domestic service LSAS can actually use. */
export function fulfillmentPolicyHasUsableLogistics(
  policy: EbayFulfillmentPolicyRaw
): boolean {
  const option = domesticOption(policy)
  const service = option ? primaryService(option) : null
  return Boolean(
    option &&
      String(option.costType || "").trim() &&
      String(service?.shippingServiceCode || "").trim()
  )
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

/**
 * Production createFulfillmentPolicy shapes.
 *
 * Calculated buyer-pays logistics (EBAY_US Account API / LSAS):
 * - optionType DOMESTIC
 * - costType CALCULATED
 * - sortOrder 1
 * - shippingServiceCode + shippingCarrierCode paired from GeteBayDetails
 * - freeShipping false
 * - buyerResponsibleForShipping / Pickup false (Motors-only true is invalid)
 * - packageHandlingCost 0.0 (calculated handling; not a flat rate)
 * - omit shippingCost (flat-rate-only)
 * - omit shipToLocations on DOMESTIC services (that container is international;
 *   sending it previously caused 20403 LOGISTICS_INFO_IS_MISSING / LSAS 216118)
 *
 * `minimal` drops carrier/flags/packageHandlingCost for retry only.
 * `carrier` is the default complete shape.
 * `devsupport` matches the known eBay Dev Support false-flag example.
 */
export type FulfillmentCreateShape = "minimal" | "carrier" | "devsupport"

export type FulfillmentPolicyCreateRequest = {
  name: string
  marketplaceId: string
  categoryTypes: Array<{ name: string; default?: boolean }>
  handlingTime: { value: number; unit: "DAY" }
  localPickup: false
  freightShipping: false
  globalShipping: false
  pickupDropOff: false
  shippingOptions: Array<{
    optionType: "DOMESTIC"
    costType: "CALCULATED" | "FLAT_RATE"
    packageHandlingCost?: { value: string; currency: string }
    shippingServices: Array<{
      sortOrder: number
      shippingServiceCode: string
      shippingCarrierCode?: string
      freeShipping: boolean
      buyerResponsibleForShipping?: boolean
      buyerResponsibleForPickup?: boolean
      shippingCost?: { value: string; currency: string }
    }>
  }>
}

export type BuildFulfillmentPolicyArgs = {
  marketplaceId: string
  mode: EbayShippingMode
  name: string
  handlingDays: number
  shippingServiceCode: string
  shippingCarrierCode?: string
  flatAmount?: number
  template?: EbayFulfillmentPolicyRaw | null
  setAsDefault?: boolean
  shape?: FulfillmentCreateShape
  includePackageHandlingCost?: boolean
}

export function buildFulfillmentPolicyCreateRequest(
  args: BuildFulfillmentPolicyArgs
): FulfillmentPolicyCreateRequest {
  const days = Math.max(0, Math.min(30, Math.floor(args.handlingDays || 1)))
  const service =
    String(args.shippingServiceCode || "").trim() || "USPSGroundAdvantage"
  const currency = currencyForMarketplace(args.marketplaceId)
  const amount = Math.max(0.01, Number(args.flatAmount) || 5.99).toFixed(2)
  const shape: FulfillmentCreateShape = args.shape || "carrier"

  const templateOption = args.template ? domesticOption(args.template) : null
  const templateService = templateOption ? primaryService(templateOption) : null
  const templateMode = args.template
    ? classifyFulfillmentShippingMode(args.template)
    : null
  // Never copy a template's shipping service onto a different listing.
  // Cached/native policies may be Standard Envelope; the current listing's
  // resolved service is the source of truth.
  const resolvedService = service
  const carrier =
    args.shippingCarrierCode?.trim() ||
    (templateMode === args.mode &&
      templateService?.shippingServiceCode?.trim() === resolvedService &&
      templateService?.shippingCarrierCode?.trim()) ||
    shippingCarrierForService(resolvedService)

  const costType: "CALCULATED" | "FLAT_RATE" =
    args.mode === "calculated" ? "CALCULATED" : "FLAT_RATE"

  const shippingService: FulfillmentPolicyCreateRequest["shippingOptions"][0]["shippingServices"][0] =
    {
      sortOrder: 1,
      shippingServiceCode: resolvedService,
      freeShipping: args.mode === "free",
    }

  if (shape !== "minimal") {
    shippingService.shippingCarrierCode = carrier
    // Explicit false keeps LSAS from dropping the service. Never send true
    // (Motors-only) on ALL_EXCLUDING_MOTORS_VEHICLES policies.
    shippingService.buyerResponsibleForShipping = false
    shippingService.buyerResponsibleForPickup = false
  }

  if (args.mode === "flat") {
    shippingService.shippingCost = { value: amount, currency }
  } else if (args.mode === "free") {
    shippingService.shippingCost = { value: "0.0", currency }
  }
  // Calculated: omit shippingCost. Flat-rate-only field.

  const includePackageHandling =
    args.includePackageHandlingCost ?? args.mode === "calculated"

  const option: FulfillmentPolicyCreateRequest["shippingOptions"][0] = {
    optionType: "DOMESTIC",
    costType,
    shippingServices: [shippingService],
  }
  if (includePackageHandling && args.mode === "calculated") {
    option.packageHandlingCost = { value: "0.0", currency }
  }

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
    shippingOptions: [option],
  }
}

/** JSON.parse(JSON.stringify) of the create body — the bytes actually POSTed. */
export function toFinalFulfillmentPolicyJson(
  body: FulfillmentPolicyCreateRequest
): Record<string, unknown> {
  return JSON.parse(JSON.stringify(body)) as Record<string, unknown>
}

export type FulfillmentRequestPresence = {
  marketplaceId: string | null
  categoryType: string | null
  handlingTimeValue: number | null
  handlingTimeUnit: string | null
  localPickup: unknown
  optionType: string | null
  costType: string | null
  shippingServiceCode: string | null
  shippingCarrierCode: string | null
  sortOrder: number | null
  shippingCost: unknown
  freeShipping: unknown
  buyerResponsibleForShipping: unknown
  buyerResponsibleForPickup: unknown
  packageHandlingCost: unknown
  hasTopLevelShipToLocations: boolean
  hasServiceShipToLocations: boolean
  hasInsuranceOffered: boolean
  shippingOptionsCount: number
  shippingServicesCount: number
}

export function fulfillmentRequestPresence(
  finalJson: Record<string, unknown>
): FulfillmentRequestPresence {
  const options = Array.isArray(finalJson.shippingOptions)
    ? (finalJson.shippingOptions as Array<Record<string, unknown>>)
    : []
  const option = options[0] || {}
  const services = Array.isArray(option.shippingServices)
    ? (option.shippingServices as Array<Record<string, unknown>>)
    : []
  const service = services[0] || {}
  const handling =
    finalJson.handlingTime && typeof finalJson.handlingTime === "object"
      ? (finalJson.handlingTime as Record<string, unknown>)
      : {}
  const categories = Array.isArray(finalJson.categoryTypes)
    ? (finalJson.categoryTypes as Array<Record<string, unknown>>)
    : []

  return {
    marketplaceId:
      typeof finalJson.marketplaceId === "string" ? finalJson.marketplaceId : null,
    categoryType:
      typeof categories[0]?.name === "string" ? categories[0].name : null,
    handlingTimeValue:
      typeof handling.value === "number" ? handling.value : null,
    handlingTimeUnit:
      typeof handling.unit === "string" ? handling.unit : null,
    localPickup: finalJson.localPickup ?? null,
    optionType: typeof option.optionType === "string" ? option.optionType : null,
    costType: typeof option.costType === "string" ? option.costType : null,
    shippingServiceCode:
      typeof service.shippingServiceCode === "string"
        ? service.shippingServiceCode
        : null,
    shippingCarrierCode:
      typeof service.shippingCarrierCode === "string"
        ? service.shippingCarrierCode
        : null,
    sortOrder: typeof service.sortOrder === "number" ? service.sortOrder : null,
    shippingCost: service.shippingCost ?? null,
    freeShipping: service.freeShipping ?? null,
    buyerResponsibleForShipping: service.buyerResponsibleForShipping ?? null,
    buyerResponsibleForPickup: service.buyerResponsibleForPickup ?? null,
    packageHandlingCost: option.packageHandlingCost ?? null,
    hasTopLevelShipToLocations: Object.prototype.hasOwnProperty.call(
      finalJson,
      "shipToLocations"
    ),
    hasServiceShipToLocations: Object.prototype.hasOwnProperty.call(
      service,
      "shipToLocations"
    ),
    hasInsuranceOffered: Object.prototype.hasOwnProperty.call(
      option,
      "insuranceOffered"
    ),
    shippingOptionsCount: options.length,
    shippingServicesCount: services.length,
  }
}

export function logFulfillmentCreateDiagnostics(opts: {
  variant: string
  listingSnapshot?: Record<string, string | number | boolean | null | undefined>
  request: FulfillmentPolicyCreateRequest
}) {
  const finalJson = toFinalFulfillmentPolicyJson(opts.request)
  const presence = fulfillmentRequestPresence(finalJson)
  console.info("[ebay/policies] createFulfillmentPolicy FINAL JSON", {
    variant: opts.variant,
    listingSnapshot: opts.listingSnapshot || null,
    presence,
    finalJson,
  })
  return { finalJson, presence }
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
  logisticsInfoMissing: boolean
  shouldRetryFlat: boolean
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
    else if (!rejectedField && shipElig) rejectedField = shipElig
    else if (!rejectedField && xpathValue) rejectedField = xpathValue
    else if (!rejectedField) {
      const m = hay.match(
        /\b(LOGISTICS_INFO_IS_MISSING|LOGISTICS_INFO|shipToLocations|localPickup|shippingServiceCode|costType|buyerResponsibleForShipping)\b/i
      )
      if (m) rejectedField = m[1]
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

  const logisticsInfoMissing =
    (rejectedField || "").toUpperCase() === "LOGISTICS_INFO_IS_MISSING" ||
    (shipEligCode || "").toUpperCase() === "LOGISTICS_INFO_IS_MISSING" ||
    allText.includes("LOGISTICS_INFO_IS_MISSING")

  if (logisticsInfoMissing) rejectedField = "LOGISTICS_INFO_IS_MISSING"
  if (!rejectedField && calculatedNotSupported) {
    rejectedField = "CALCULATED_SHIPPING_TYPE_NOT_SUPPORTED"
  }

  const shouldRetryFlat =
    logisticsInfoMissing ||
    calculatedNotSupported ||
    lsasCode === "216118"

  return {
    rejectedField,
    lsasCode,
    shipEligCode,
    xpath,
    calculatedNotSupported,
    logisticsInfoMissing,
    shouldRetryFlat,
  }
}
