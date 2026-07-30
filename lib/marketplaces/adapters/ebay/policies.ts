import { ebayFetch, ebayFetchResult } from "@/lib/marketplaces/adapters/ebay/client"
import {
  buildFulfillmentPolicyCreateRequest,
  classifyFulfillmentShippingMode,
  defaultEbayShippingMode,
  fulfillmentPolicyIsFreeShipping,
  rejectedEbayFieldFromErrors,
  summarizeFulfillmentPolicy,
  type EbayFulfillmentPolicyRaw,
  type EbayFulfillmentShippingSummary,
  type EbayShippingMode,
} from "@/lib/marketplaces/adapters/ebay/fulfillment-shipping"
import { MarketplaceError } from "@/lib/marketplaces/adapters/types"

type EbayPolicy = {
  fulfillmentPolicyId?: string
  paymentPolicyId?: string
  returnPolicyId?: string
  name?: string
  marketplaceId?: string
}

type PolicyIds = {
  fulfillmentPolicyId: string
  paymentPolicyId: string
  returnPolicyId: string
}

export type EnsureEbayPoliciesOptions = {
  /** Default: calculated (buyer pays). Never silently pick free. */
  shippingMode?: EbayShippingMode | string | null
  /** Required when shippingMode is free or selected policy is free. */
  freeShippingConfirmed?: boolean
  /** Preferred flat amount when creating/selecting flat policies. */
  flatShippingAmount?: number | null
  /** Handling time in business days (default 1). */
  handlingTimeDays?: number | null
  /** eBay shipping service code (e.g. USPSGroundAdvantage). */
  shippingServiceCode?: string | null
  /** Domestic returns accepted. */
  returnsAccepted?: boolean
  /** Return window days (30 or 60). */
  returnWindowDays?: number | null
  /** Who pays return shipping. */
  returnShippingPaidBy?: "BUYER" | "SELLER" | string | null
  /** Require immediate payment on the payment policy. */
  requireImmediatePayment?: boolean
}

export type EnsureEbayPoliciesResult = PolicyIds & {
  fulfillmentSummary: EbayFulfillmentShippingSummary
}

function marketplaceId() {
  return process.env.EBAY_MARKETPLACE_ID || "EBAY_US"
}

function logPolicies(
  event: string,
  details: Record<string, string | number | boolean | undefined | null>
) {
  console.info(`[ebay/policies] TEMP ${event}`, details)
}

async function ensureBusinessPoliciesOptIn(accessToken: string) {
  const opted = (await ebayFetch("/sell/account/v1/program/get_opted_in_programs", accessToken, {
    method: "GET",
    step: "getOptedInPrograms",
  })) as { programs?: Array<{ programType?: string }> } | null

  const types = (opted?.programs || []).map((p) => p.programType).filter(Boolean)
  logPolicies("opted-in programs", { programs: types.join(",") || "(none)" })

  if (types.includes("SELLING_POLICY_MANAGEMENT")) return

  const { status } = await ebayFetchResult(
    "/sell/account/v1/program/opt_in",
    accessToken,
    {
      method: "POST",
      step: "optInBusinessPolicies",
      body: JSON.stringify({ programType: "SELLING_POLICY_MANAGEMENT" }),
    }
  )
  logPolicies("opt-in SELLING_POLICY_MANAGEMENT", { httpStatus: status })
}

export async function listEbayFulfillmentPolicies(
  accessToken: string
): Promise<EbayFulfillmentPolicyRaw[]> {
  const mp = marketplaceId()
  const payload = (await ebayFetch(
    `/sell/account/v1/fulfillment_policy?marketplace_id=${encodeURIComponent(mp)}`,
    accessToken,
    { method: "GET", step: "getFulfillmentPolicies" }
  )) as { fulfillmentPolicies?: EbayFulfillmentPolicyRaw[] } | null
  return payload?.fulfillmentPolicies ?? []
}

export async function listEbayFulfillmentPolicySummaries(
  accessToken: string
): Promise<EbayFulfillmentShippingSummary[]> {
  const policies = await listEbayFulfillmentPolicies(accessToken)
  return policies
    .map((p) => summarizeFulfillmentPolicy(p))
    .filter((s): s is EbayFulfillmentShippingSummary => Boolean(s))
}

async function listPaymentPolicies(accessToken: string) {
  const mp = marketplaceId()
  const payload = (await ebayFetch(
    `/sell/account/v1/payment_policy?marketplace_id=${encodeURIComponent(mp)}`,
    accessToken,
    { method: "GET", step: "getPaymentPolicies" }
  )) as { paymentPolicies?: EbayPolicy[] } | null
  return payload?.paymentPolicies ?? []
}

async function listReturnPolicies(accessToken: string) {
  const mp = marketplaceId()
  const payload = (await ebayFetch(
    `/sell/account/v1/return_policy?marketplace_id=${encodeURIComponent(mp)}`,
    accessToken,
    { method: "GET", step: "getReturnPolicies" }
  )) as { returnPolicies?: EbayPolicy[] } | null
  return payload?.returnPolicies ?? []
}

async function createFulfillmentPolicyForMode(
  accessToken: string,
  mode: EbayShippingMode,
  flatAmount = 5.99,
  handlingDays = 1,
  shippingServiceCode = "USPSGroundAdvantage",
  template?: EbayFulfillmentPolicyRaw | null
): Promise<string> {
  const days = Math.max(0, Math.min(30, Math.floor(handlingDays || 1)))
  const service =
    String(shippingServiceCode || "").trim() || "USPSGroundAdvantage"
  const amount = Math.max(0.01, Number(flatAmount) || 5.99).toFixed(2)
  const name =
    mode === "calculated"
      ? `ListWise Calculated · ${service} · ${days}d`
      : mode === "free"
        ? `ListWise Free · ${service} · ${days}d`
        : `ListWise Flat $${amount} · ${service} · ${days}d`

  const requestBody = buildFulfillmentPolicyCreateRequest({
    marketplaceId: marketplaceId(),
    mode,
    name,
    handlingDays: days,
    shippingServiceCode: service,
    flatAmount: Number(amount),
    template,
  })

  console.info("[ebay/policies] createFulfillmentPolicy REQUEST JSON", {
    step: "createFulfillmentPolicy",
    mode,
    templatePolicyId: template?.fulfillmentPolicyId || null,
    templateName: template?.name || null,
    request: requestBody,
  })

  const { status, data } = await ebayFetchResult(
    "/sell/account/v1/fulfillment_policy",
    accessToken,
    {
      method: "POST",
      step: "createFulfillmentPolicy",
      body: JSON.stringify(requestBody),
    }
  )

  console.info("[ebay/policies] createFulfillmentPolicy RESPONSE JSON", {
    step: "createFulfillmentPolicy",
    httpStatus: status,
    response: data,
  })

  const payload = data as
    | (EbayPolicy & {
        errors?: Array<{
          errorId?: number
          message?: string
          longMessage?: string
          parameters?: Array<{ name?: string; value?: string }>
        }>
      })
    | null

  const errors = Array.isArray(payload?.errors) ? payload!.errors! : []
  if (status >= 400 || errors.length > 0 || !payload?.fulfillmentPolicyId) {
    const rejectedField =
      rejectedEbayFieldFromErrors(errors) || "LOGISTICS_INFO"
    console.error("[ebay/policies] createFulfillmentPolicy REJECTED FIELD", {
      rejectedField,
      errorId: errors[0]?.errorId ?? 20403,
      message: errors[0]?.message || null,
      longMessage: errors[0]?.longMessage || null,
      parameters: errors[0]?.parameters || null,
      request: requestBody,
      response: data,
    })
    throw new MarketplaceError(
      `Could not set up shipping for this listing. eBay rejected field ${rejectedField} (errorId=${errors[0]?.errorId ?? status}). ${errors[0]?.longMessage || errors[0]?.message || ""}`.trim(),
      "ebay_policy_create_failed",
      502,
      {
        ebay: {
          step: "createFulfillmentPolicy",
          httpStatus: status,
          errorId: errors[0]?.errorId ?? 20403,
          errors,
          requestPayload: requestBody,
          responseBody: data,
          diagnosis: [
            `rejectedField=${rejectedField}`,
            "Expected eBay.com-shaped logistics: localPickup=false, shippingCarrierCode set, no Motors-only buyerResponsibleForShipping=true",
          ],
        },
      }
    )
  }

  logPolicies("created fulfillment policy for shipping mode", {
    mode,
    fulfillmentPolicyId: payload.fulfillmentPolicyId,
    name,
    handlingDays: days,
    shippingServiceCode: service,
    localPickup: false,
    shippingCarrierCode:
      requestBody.shippingOptions[0]?.shippingServices[0]?.shippingCarrierCode,
  })
  return payload.fulfillmentPolicyId
}

async function createPaymentPolicy(
  accessToken: string,
  requireImmediatePayment: boolean
) {
  const name = requireImmediatePayment
    ? "ListWise Payment · Immediate"
    : "ListWise Payment"
  const payload = (await ebayFetch("/sell/account/v1/payment_policy", accessToken, {
    method: "POST",
    step: "createPaymentPolicy",
    body: JSON.stringify({
      name,
      marketplaceId: marketplaceId(),
      categoryTypes: [{ name: "ALL_EXCLUDING_MOTORS_VEHICLES", default: true }],
      immediatePay: Boolean(requireImmediatePayment),
    }),
  })) as EbayPolicy

  if (!payload.paymentPolicyId) {
    throw new MarketplaceError(
      "Could not set up payment settings for this listing. Try publishing again.",
      "ebay_policy_create_failed",
      502
    )
  }
  return payload.paymentPolicyId
}

async function createReturnPolicy(
  accessToken: string,
  options: {
    returnsAccepted: boolean
    returnWindowDays: number
    returnShippingPaidBy: "BUYER" | "SELLER"
  }
) {
  const accepted = options.returnsAccepted
  const days = options.returnWindowDays === 60 ? 60 : 30
  const payer = options.returnShippingPaidBy === "SELLER" ? "SELLER" : "BUYER"
  const name = accepted
    ? `ListWise Returns · ${days}d · ${payer}`
    : "ListWise Returns · Not accepted"

  const body: Record<string, unknown> = {
    name,
    marketplaceId: marketplaceId(),
    categoryTypes: [{ name: "ALL_EXCLUDING_MOTORS_VEHICLES", default: true }],
    returnsAccepted: accepted,
  }
  if (accepted) {
    body.returnPeriod = { value: days, unit: "DAY" }
    body.refundMethod = "MONEY_BACK"
    body.returnShippingCostPayer = payer
  }

  const payload = (await ebayFetch("/sell/account/v1/return_policy", accessToken, {
    method: "POST",
    step: "createReturnPolicy",
    body: JSON.stringify(body),
  })) as EbayPolicy

  if (!payload.returnPolicyId) {
    throw new MarketplaceError(
      "Could not set up return settings for this listing. Try publishing again.",
      "ebay_policy_create_failed",
      502
    )
  }
  return payload.returnPolicyId
}

function pickFulfillmentForMode(
  policies: EbayFulfillmentPolicyRaw[],
  mode: EbayShippingMode,
  flatAmount?: number | null,
  handlingDays?: number | null,
  shippingServiceCode?: string | null
): EbayFulfillmentPolicyRaw | undefined {
  const matching = policies.filter(
    (p) => classifyFulfillmentShippingMode(p) === mode
  )
  const days =
    typeof handlingDays === "number" && Number.isFinite(handlingDays)
      ? Math.max(0, Math.min(30, Math.floor(handlingDays)))
      : 1

  const withHandling = matching.filter((p) => {
    const summary = summarizeFulfillmentPolicy(p)
    return summary?.handlingDays == null || summary.handlingDays === days
  })

  let pool = withHandling.length > 0 ? withHandling : matching

  const serviceWanted = String(shippingServiceCode || "").trim()
  if (serviceWanted) {
    const withService = pool.filter((p) => {
      const summary = summarizeFulfillmentPolicy(p)
      return (
        !summary?.serviceCode ||
        summary.serviceCode.toLowerCase() === serviceWanted.toLowerCase()
      )
    })
    if (withService.length > 0) pool = withService
  }

  if (mode === "flat" && flatAmount != null && Number.isFinite(flatAmount)) {
    const target = Number(flatAmount)
    const byAmount = pool.find((p) => {
      const summary = summarizeFulfillmentPolicy(p)
      return (
        summary?.flatAmount != null &&
        Math.abs(summary.flatAmount - target) < 0.009
      )
    })
    if (byAmount) return byAmount
  }

  // Prefer eBay.com / seller-native policies over ListWise-generated ones.
  const ebayNative = pool.find(
    (p) => !(p.name || "").toLowerCase().includes("listwise")
  )
  if (ebayNative) return ebayNative

  // Prefer ListWise-created policies for the mode.
  const listwise = pool.find((p) =>
    (p.name || "").toLowerCase().includes("listwise")
  )
  return listwise || pool[0]
}

type EbayPaymentPolicyRaw = EbayPolicy & {
  immediatePay?: boolean
}

type EbayReturnPolicyRaw = EbayPolicy & {
  returnsAccepted?: boolean
  returnPeriod?: { value?: number; unit?: string }
  returnShippingCostPayer?: string
  refundMethod?: string
}

function pickPaymentPolicy(
  policies: EbayPaymentPolicyRaw[],
  requireImmediatePayment: boolean
): EbayPaymentPolicyRaw | undefined {
  const matching = policies.filter(
    (p) => Boolean(p.immediatePay) === requireImmediatePayment
  )
  const pool = matching.length > 0 ? matching : []
  const listwise = pool.find((p) =>
    (p.name || "").toLowerCase().includes("listwise")
  )
  return listwise || pool[0]
}

function pickReturnPolicy(
  policies: EbayReturnPolicyRaw[],
  options: {
    returnsAccepted: boolean
    returnWindowDays: number
    returnShippingPaidBy: "BUYER" | "SELLER"
  }
): EbayReturnPolicyRaw | undefined {
  const matching = policies.filter((p) => {
    const accepted = p.returnsAccepted !== false
    if (accepted !== options.returnsAccepted) return false
    if (!options.returnsAccepted) return true
    const days = p.returnPeriod?.value
    if (days != null && days !== options.returnWindowDays) return false
    const payer = (p.returnShippingCostPayer || "").toUpperCase()
    if (payer && payer !== options.returnShippingPaidBy) return false
    return true
  })
  const listwise = matching.find((p) =>
    (p.name || "").toLowerCase().includes("listwise")
  )
  return listwise || matching[0]
}

/**
 * Resolve Business Policy IDs for the *connected seller*.
 * Shipping mode defaults to buyer-pays calculated — never silently uses free shipping.
 */
export async function ensureEbayBusinessPolicyIds(
  accessToken: string,
  options: EnsureEbayPoliciesOptions = {}
): Promise<EnsureEbayPoliciesResult> {
  await ensureBusinessPoliciesOptIn(accessToken)

  const shippingMode = defaultEbayShippingMode(options.shippingMode)
  const freeConfirmed = Boolean(options.freeShippingConfirmed)

  let fulfillment = await listEbayFulfillmentPolicies(accessToken)
  let payment = (await listPaymentPolicies(accessToken)) as EbayPaymentPolicyRaw[]
  let returns = (await listReturnPolicies(accessToken)) as EbayReturnPolicyRaw[]

  logPolicies("listed seller policies", {
    fulfillmentCount: fulfillment.length,
    paymentCount: payment.length,
    returnCount: returns.length,
    requestedShippingMode: shippingMode,
    fulfillmentIds: fulfillment
      .map((p) => p.fulfillmentPolicyId)
      .filter(Boolean)
      .join(","),
  })

  // Log each fulfillment policy's actual cost settings for debugging.
  for (const policy of fulfillment) {
    const summary = summarizeFulfillmentPolicy(policy)
    if (!summary) continue
    logPolicies("fulfillment policy shipping settings", {
      fulfillmentPolicyId: summary.fulfillmentPolicyId,
      name: summary.name,
      mode: summary.mode,
      isFreeShipping: summary.isFreeShipping,
      costType: summary.costType,
      costSummary: summary.costSummary,
      service: summary.serviceCode,
      handlingDays: summary.handlingDays,
    })
  }

  const envFulfillment = process.env.EBAY_FULFILLMENT_POLICY_ID?.trim()
  const envPayment = process.env.EBAY_PAYMENT_POLICY_ID?.trim()
  const envReturn = process.env.EBAY_RETURN_POLICY_ID?.trim()
  const handlingDays =
    typeof options.handlingTimeDays === "number" &&
    Number.isFinite(options.handlingTimeDays)
      ? Math.max(0, Math.min(30, Math.floor(options.handlingTimeDays)))
      : 1
  const shippingServiceCode =
    String(options.shippingServiceCode || "").trim() || "USPSGroundAdvantage"
  const returnsAccepted = options.returnsAccepted !== false
  const returnWindowDays =
    options.returnWindowDays === 60 ? 60 : 30
  const returnShippingPaidBy =
    options.returnShippingPaidBy === "SELLER" ? "SELLER" : "BUYER"
  const requireImmediatePayment = Boolean(options.requireImmediatePayment)

  // Env fulfillment ID is only noted in logs; ListWise always picks/creates
  // from the seller's Calculated / Flat / Free choice automatically.
  if (envFulfillment) {
    const envPolicy = fulfillment.find((p) => p.fulfillmentPolicyId === envFulfillment)
    if (!envPolicy) {
      logPolicies("env fulfillment policy not owned by seller; ignoring", {
        envFulfillment,
      })
    } else {
      const envMode = classifyFulfillmentShippingMode(envPolicy)
      const envFree = fulfillmentPolicyIsFreeShipping(envPolicy)
      if (envMode !== shippingMode || (envFree && shippingMode !== "free")) {
        logPolicies("env fulfillment policy skipped — shipping mode mismatch", {
          envFulfillment,
          envMode,
          envFree,
          requestedShippingMode: shippingMode,
        })
      }
    }
  }

  let selected = pickFulfillmentForMode(
    fulfillment,
    shippingMode,
    options.flatShippingAmount,
    handlingDays,
    shippingServiceCode
  )

  // Prefer an existing seller policy for this shipping mode (especially
  // eBay.com-created). Do NOT discard it for service/handling mismatch and
  // invent a new LOGISTICS_INFO payload — reuse what already works.
  if (!selected) {
    selected = pickFulfillmentForMode(
      fulfillment,
      shippingMode,
      options.flatShippingAmount,
      null,
      null
    )
  }

  if (selected) {
    const summary = summarizeFulfillmentPolicy(selected)
    const serviceMismatch =
      Boolean(summary?.serviceCode) &&
      summary!.serviceCode!.toLowerCase() !== shippingServiceCode.toLowerCase()
    const handlingMismatch =
      summary?.handlingDays != null && summary.handlingDays !== handlingDays
    if (serviceMismatch || handlingMismatch) {
      logPolicies(
        "reusing existing seller fulfillment policy despite service/handling difference (avoid invalid create)",
        {
          fulfillmentPolicyId: summary?.fulfillmentPolicyId,
          name: summary?.name,
          policyService: summary?.serviceCode,
          requestedService: shippingServiceCode,
          policyHandling: summary?.handlingDays,
          requestedHandling: handlingDays,
        }
      )
    }
  }

  if (!selected) {
    // Clone logistics from any same-mode-ish calculated/flat template on the
    // account when available; otherwise build the eBay.com-shaped payload.
    const template =
      fulfillment.find((p) => classifyFulfillmentShippingMode(p) === shippingMode) ||
      fulfillment.find((p) => {
        const m = classifyFulfillmentShippingMode(p)
        return shippingMode === "free"
          ? m === "flat" || m === "free"
          : m === "calculated" || m === "flat"
      }) ||
      null

    const createdId = await createFulfillmentPolicyForMode(
      accessToken,
      shippingMode,
      options.flatShippingAmount ?? 5.99,
      handlingDays,
      shippingServiceCode,
      template
    )
    fulfillment = await listEbayFulfillmentPolicies(accessToken)
    selected =
      fulfillment.find((p) => p.fulfillmentPolicyId === createdId) ||
      ({
        fulfillmentPolicyId: createdId,
        name: `ListWise · ${shippingServiceCode} · ${handlingDays}d`,
        handlingTime: { value: handlingDays, unit: "DAY" },
        shippingOptions: [
          {
            optionType: "DOMESTIC",
            costType: shippingMode === "calculated" ? "CALCULATED" : "FLAT_RATE",
            shippingServices: [
              {
                shippingCarrierCode: "USPS",
                shippingServiceCode,
                freeShipping: shippingMode === "free",
                shippingCost:
                  shippingMode === "flat"
                    ? {
                        value: String(
                          Math.max(0.01, options.flatShippingAmount ?? 5.99)
                        ),
                        currency: "USD",
                      }
                    : shippingMode === "free"
                      ? { value: "0.0", currency: "USD" }
                      : undefined,
              },
            ],
          },
        ],
      } satisfies EbayFulfillmentPolicyRaw)
  }

  const fulfillmentSummary = summarizeFulfillmentPolicy(selected)
  if (!fulfillmentSummary) {
    throw new MarketplaceError(
      "Could not configure shipping for this listing. Try publishing again.",
      "ebay_fulfillment_unreadable",
      502
    )
  }

  // Hard guard: never publish free shipping unless explicitly chosen + confirmed.
  if (fulfillmentSummary.isFreeShipping) {
    if (shippingMode !== "free") {
      throw new MarketplaceError(
        "Shipping is set to free, but this listing is not. Choose Calculated or Flat, or switch to Free and confirm.",
        "ebay_free_shipping_not_selected",
        400
      )
    }
    if (!freeConfirmed) {
      throw new MarketplaceError(
        "Free shipping requires confirmation before publishing.",
        "ebay_free_shipping_unconfirmed",
        400
      )
    }
  }

  let paymentSelected =
    (envPayment &&
      payment.find((p) => p.paymentPolicyId === envPayment)) ||
    pickPaymentPolicy(payment, requireImmediatePayment)

  if (
    paymentSelected &&
    Boolean(paymentSelected.immediatePay) !== requireImmediatePayment
  ) {
    paymentSelected = undefined
  }

  let paymentPolicyId = paymentSelected?.paymentPolicyId
  if (!paymentPolicyId) {
    paymentPolicyId = await createPaymentPolicy(
      accessToken,
      requireImmediatePayment
    )
    payment = (await listPaymentPolicies(accessToken)) as EbayPaymentPolicyRaw[]
  }

  let returnSelected =
    (envReturn && returns.find((p) => p.returnPolicyId === envReturn)) ||
    pickReturnPolicy(returns, {
      returnsAccepted,
      returnWindowDays,
      returnShippingPaidBy,
    })

  let returnPolicyId = returnSelected?.returnPolicyId
  if (!returnPolicyId) {
    returnPolicyId = await createReturnPolicy(accessToken, {
      returnsAccepted,
      returnWindowDays,
      returnShippingPaidBy,
    })
    returns = (await listReturnPolicies(accessToken)) as EbayReturnPolicyRaw[]
  }

  if (envPayment && paymentPolicyId !== envPayment) {
    logPolicies("env payment policy not owned by seller; ignoring", {
      envPayment,
    })
  }
  if (envReturn && returnPolicyId !== envReturn) {
    logPolicies("env return policy not owned by seller; ignoring", { envReturn })
  }

  const ownedPayment = payment.find((p) => p.paymentPolicyId === paymentPolicyId)
    ?.paymentPolicyId
  const ownedReturn = returns.find((p) => p.returnPolicyId === returnPolicyId)
    ?.returnPolicyId

  const finalIds: EnsureEbayPoliciesResult = {
    fulfillmentPolicyId: fulfillmentSummary.fulfillmentPolicyId,
    paymentPolicyId: ownedPayment || paymentPolicyId!,
    returnPolicyId: ownedReturn || returnPolicyId!,
    fulfillmentSummary,
  }

  if (
    !finalIds.fulfillmentPolicyId ||
    !finalIds.paymentPolicyId ||
    !finalIds.returnPolicyId
  ) {
    throw new MarketplaceError(
      "Could not prepare shipping, payment, or return settings for this listing.",
      "ebay_policies_missing",
      400
    )
  }

  logPolicies("using seller policy ids for offer", {
    fulfillmentPolicyId: finalIds.fulfillmentPolicyId,
    paymentPolicyId: finalIds.paymentPolicyId,
    returnPolicyId: finalIds.returnPolicyId,
    shippingMode: fulfillmentSummary.mode,
    isFreeShipping: fulfillmentSummary.isFreeShipping,
    costSummary: fulfillmentSummary.costSummary,
    freeShippingConfirmed: freeConfirmed,
    shippingServiceCode,
    requireImmediatePayment,
    returnsAccepted,
    returnWindowDays,
  })

  return finalIds
}
