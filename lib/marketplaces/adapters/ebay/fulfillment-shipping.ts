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
