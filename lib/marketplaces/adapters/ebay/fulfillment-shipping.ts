/**
 * Parse eBay Account API fulfillment policies into clear shipping modes.
 * Never treat free shipping as an implicit default.
 */

export type EbayShippingMode = "calculated" | "flat" | "free"

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
    }>
  }>
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
    shippingServices: Array<{
      sortOrder: number
      shippingCarrierCode: string
      shippingServiceCode: string
      freeShipping: boolean
      shippingCost?: { value: string; currency: string }
    }>
  }>
}

/**
 * Build a createFulfillmentPolicy body matching what eBay.com / Account API
 * returns for a normal US domestic calculated/flat/free policy.
 *
 * Important (errorId 20403 / LOGISTICS_INFO):
 * - localPickup must be explicit false (eBay Dev Support).
 * - Do NOT set buyerResponsibleForShipping=true (Motors-only; invalid logistics
 *   for apparel and causes LOGISTICS_INFO rejection).
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
}): FulfillmentPolicyCreateRequest {
  const days = Math.max(0, Math.min(30, Math.floor(args.handlingDays || 1)))
  const service =
    String(args.shippingServiceCode || "").trim() || "USPSGroundAdvantage"
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

  const shippingService: FulfillmentPolicyCreateRequest["shippingOptions"][0]["shippingServices"][0] =
    {
      sortOrder: 1,
      shippingCarrierCode: carrier,
      shippingServiceCode: resolvedService,
      freeShipping: args.mode === "free",
    }

  if (args.mode === "flat") {
    shippingService.shippingCost = { value: amount, currency: "USD" }
  } else if (args.mode === "free") {
    shippingService.shippingCost = { value: "0.0", currency: "USD" }
  }
  // CALCULATED: no shippingCost — eBay computes from package weight/dims.

  return {
    name: args.name,
    marketplaceId: args.marketplaceId,
    categoryTypes: [{ name: "ALL_EXCLUDING_MOTORS_VEHICLES", default: true }],
    handlingTime: { value: days, unit: "DAY" },
    // Explicit flags matching eBay.com Account API policies (Dev Support: localPickup false).
    localPickup: false,
    freightShipping: false,
    globalShipping: false,
    pickupDropOff: false,
    shippingOptions: [
      {
        optionType: "DOMESTIC",
        costType,
        shippingServices: [shippingService],
      },
    ],
  }
}

/** Extract rejected field name from eBay 20403 parameters (e.g. LOGISTICS_INFO). */
export function rejectedEbayFieldFromErrors(
  errors: Array<{
    errorId?: number
    message?: string
    longMessage?: string
    parameters?: Array<{ name?: string; value?: string }>
  }>
): string | null {
  for (const err of errors) {
    const params = err.parameters || []
    const fieldName = params.find(
      (p) => (p.name || "").toUpperCase() === "FIELDNAME"
    )?.value
    if (fieldName) return fieldName
    const xpath = params.find((p) => (p.name || "").toUpperCase() === "XPATH")
      ?.value
    if (xpath) return xpath
    const shipElig = params.find(
      (p) => (p.name || "").toUpperCase() === "SHIPELIG_ERROR_CODE_NAME"
    )?.value
    if (shipElig) return shipElig
    // Some responses put the token directly in message/longMessage.
    const hay = `${err.message || ""} ${err.longMessage || ""}`
    const m = hay.match(/\b(LOGISTICS_INFO|localPickup|shippingServiceCode|costType)\b/i)
    if (m) return m[1]
  }
  return null
}
