import { ebayFetch, ebayFetchResult } from "@/lib/marketplaces/adapters/ebay/client"
import {
  buildFulfillmentPolicyCreateRequest,
  classifyFulfillmentShippingMode,
  defaultEbayShippingMode,
  diagnoseFulfillmentCreateErrors,
  fulfillmentPolicyIsFreeShipping,
  summarizeFulfillmentPolicy,
  type EbayFulfillmentPolicyRaw,
  type EbayFulfillmentShippingSummary,
  type EbayShippingMode,
  type FulfillmentPolicyCreateRequest,
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
  /** Previously stored ListWise policy IDs for this seller (connection meta). */
  policyCache?: EbayPolicyCache | null
}

export type EnsureEbayPoliciesResult = PolicyIds & {
  fulfillmentSummary: EbayFulfillmentShippingSummary
  policyCache: EbayPolicyCache
}

export type EbayPolicyCache = {
  marketplaceId: string
  fulfillment: Record<string, string>
  payment: Record<string, string>
  returns: Record<string, string>
}

type EbayAccountError = {
  errorId?: number
  domain?: string
  category?: string
  message?: string
  longMessage?: string
  parameters?: Array<{ name?: string; value?: string }>
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

function marketplaceId() {
  return process.env.EBAY_MARKETPLACE_ID || "EBAY_US"
}

function accountHeaders(): HeadersInit {
  return { "X-EBAY-C-MARKETPLACE-ID": marketplaceId() }
}

function logPolicies(
  event: string,
  details: Record<string, string | number | boolean | undefined | null>
) {
  console.info(`[ebay/policies] ${event}`, details)
}

function errorsFromBody(data: unknown): EbayAccountError[] {
  if (!data || typeof data !== "object") return []
  const payload = data as { errors?: EbayAccountError[] }
  return Array.isArray(payload.errors) ? payload.errors : []
}

function errorText(errors: EbayAccountError[], extra?: string): string {
  const parts = errors.flatMap((e) => [
    e.message,
    e.longMessage,
    ...(e.parameters || []).map((p) => `${p.name || ""}=${p.value || ""}`),
  ])
  if (extra) parts.push(extra)
  return parts.filter(Boolean).join(" ")
}

export function emptyEbayPolicyCache(
  marketplace = marketplaceId()
): EbayPolicyCache {
  return {
    marketplaceId: marketplace,
    fulfillment: {},
    payment: {},
    returns: {},
  }
}

export function parseEbayPolicyCache(
  raw: string | null | undefined
): EbayPolicyCache | null {
  if (!raw?.trim()) return null
  try {
    const parsed = JSON.parse(raw) as Partial<EbayPolicyCache>
    if (!parsed || typeof parsed !== "object") return null
    return {
      marketplaceId: String(parsed.marketplaceId || marketplaceId()),
      fulfillment:
        parsed.fulfillment && typeof parsed.fulfillment === "object"
          ? { ...parsed.fulfillment }
          : {},
      payment:
        parsed.payment && typeof parsed.payment === "object"
          ? { ...parsed.payment }
          : {},
      returns:
        parsed.returns && typeof parsed.returns === "object"
          ? { ...parsed.returns }
          : {},
    }
  } catch {
    return null
  }
}

export function serializeEbayPolicyCache(cache: EbayPolicyCache): string {
  return JSON.stringify(cache)
}

export function fulfillmentCacheKey(
  mode: EbayShippingMode,
  service: string,
  handlingDays: number,
  flatAmount?: number | null
): string {
  const amount =
    mode === "flat" && flatAmount != null && Number.isFinite(flatAmount)
      ? Number(flatAmount).toFixed(2)
      : ""
  return [mode, service.trim() || "USPSGroundAdvantage", handlingDays, amount].join("|")
}

export function paymentCacheKey(requireImmediatePayment: boolean): string {
  return requireImmediatePayment ? "immediate" : "standard"
}

export function returnCacheKey(
  returnsAccepted: boolean,
  returnWindowDays: number,
  returnShippingPaidBy: "BUYER" | "SELLER"
): string {
  return `${returnsAccepted ? "1" : "0"}|${returnWindowDays}|${returnShippingPaidBy}`
}

export function optInRequiresManualUserAction(
  errors: EbayAccountError[],
  status: number
): boolean {
  const text = errorText(errors).toLowerCase()
  if (!text) return false
  const mentionsSellerHub =
    /seller hub|my ebay|myebay|business policies page|opt.?in page/.test(
      text
    )
  const tellsUserToAct =
    /must (opt|enable|visit|complete)|please (opt|enable|visit|log ?in)|manually (opt|enable|complete)|user action required/.test(
      text
    )
  return (mentionsSellerHub && tellsUserToAct) || (status === 403 && tellsUserToAct)
}

export function optInAlreadyComplete(
  errors: EbayAccountError[],
  status: number
): boolean {
  if (status >= 200 && status < 300) return true
  const text = errorText(errors).toLowerCase()
  return /already (opted|enrolled|enabled)|opted in/.test(text)
}

async function ensureBusinessPoliciesOptIn(accessToken: string) {
  const { status: getStatus, data: getData } = await ebayFetchResult(
    "/sell/account/v1/program/get_opted_in_programs",
    accessToken,
    {
      method: "GET",
      step: "getOptedInPrograms",
      headers: accountHeaders(),
      allowHttpError: true,
    }
  )

  const opted = getData as { programs?: Array<{ programType?: string }> } | null
  const types = (opted?.programs || []).map((p) => p.programType).filter(Boolean)
  logPolicies("opted-in programs", {
    httpStatus: getStatus,
    programs: types.join(",") || "(none)",
  })

  if (types.includes("SELLING_POLICY_MANAGEMENT")) return { alreadyOptedIn: true }

  const { status, data } = await ebayFetchResult(
    "/sell/account/v1/program/opt_in",
    accessToken,
    {
      method: "POST",
      step: "optInBusinessPolicies",
      headers: accountHeaders(),
      allowHttpError: true,
      body: JSON.stringify({ programType: "SELLING_POLICY_MANAGEMENT" }),
    }
  )
  const errors = errorsFromBody(data)
  logPolicies("opt-in SELLING_POLICY_MANAGEMENT", {
    httpStatus: status,
    errorId: errors[0]?.errorId ?? null,
    message: errors[0]?.message || null,
  })

  if (optInAlreadyComplete(errors, status)) return { alreadyOptedIn: false }

  if (optInRequiresManualUserAction(errors, status)) {
    throw new MarketplaceError(
      "eBay requires you to turn on Selling Policy Management in Seller Hub before listings can be published. ListWise cannot complete that step through the API.",
      "ebay_business_policies_opt_in_required",
      400,
      {
        ebay: {
          step: "optInBusinessPolicies",
          httpStatus: status,
          errorId: errors[0]?.errorId ?? null,
          errors,
          responseBody: data,
        },
      }
    )
  }

  if (status >= 400) {
    // Listing existing policies may still work; create will surface a clear error.
    logPolicies("opt-in failed; continuing to list existing policies", {
      httpStatus: status,
      errorId: errors[0]?.errorId ?? null,
    })
  }

  return { alreadyOptedIn: false }
}

export async function listEbayFulfillmentPolicies(
  accessToken: string
): Promise<EbayFulfillmentPolicyRaw[]> {
  const mp = marketplaceId()
  const payload = (await ebayFetch(
    `/sell/account/v1/fulfillment_policy?marketplace_id=${encodeURIComponent(mp)}`,
    accessToken,
    { method: "GET", step: "getFulfillmentPolicies", headers: accountHeaders() }
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
    { method: "GET", step: "getPaymentPolicies", headers: accountHeaders() }
  )) as { paymentPolicies?: EbayPolicy[] } | null
  return payload?.paymentPolicies ?? []
}

async function listReturnPolicies(accessToken: string) {
  const mp = marketplaceId()
  const payload = (await ebayFetch(
    `/sell/account/v1/return_policy?marketplace_id=${encodeURIComponent(mp)}`,
    accessToken,
    { method: "GET", step: "getReturnPolicies", headers: accountHeaders() }
  )) as { returnPolicies?: EbayPolicy[] } | null
  return payload?.returnPolicies ?? []
}

function throwFulfillmentCreateFailed(
  status: number,
  data: unknown,
  requestBody: FulfillmentPolicyCreateRequest,
  errors: EbayAccountError[]
): never {
  const diagnosis = diagnoseFulfillmentCreateErrors(errors)
  const rejectedField = diagnosis.rejectedField || "LOGISTICS_INFO"
  console.error("[ebay/policies] createFulfillmentPolicy REJECTED FIELD", {
    rejectedField,
    lsasCode: diagnosis.lsasCode,
    shipEligCode: diagnosis.shipEligCode,
    xpath: diagnosis.xpath,
    errorId: errors[0]?.errorId ?? 20403,
    message: errors[0]?.message || null,
    longMessage: errors[0]?.longMessage || null,
    parameters: errors[0]?.parameters || null,
    request: requestBody,
    response: data,
  })
  throw new MarketplaceError(
    `Could not set up shipping for this listing. eBay rejected field ${rejectedField} (errorId=${errors[0]?.errorId ?? status}${diagnosis.lsasCode ? `, LSAS ${diagnosis.lsasCode}` : ""}). ${errors[0]?.longMessage || errors[0]?.message || ""}`.trim(),
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
          diagnosis.lsasCode ? `lsasCode=${diagnosis.lsasCode}` : null,
          diagnosis.shipEligCode
            ? `shipElig=${diagnosis.shipEligCode}`
            : null,
          diagnosis.xpath ? `xpath=${diagnosis.xpath}` : null,
          "LSAS 216118 = shipping service not eligible for ship-to locations; send domestic US regionIncluded",
        ].filter((line): line is string => Boolean(line)),
      },
    }
  )
}

async function postFulfillmentPolicy(
  accessToken: string,
  requestBody: FulfillmentPolicyCreateRequest
): Promise<{ status: number; data: unknown; errors: EbayAccountError[] }> {
  console.info("[ebay/policies] createFulfillmentPolicy REQUEST JSON", {
    step: "createFulfillmentPolicy",
    request: requestBody,
  })

  const { status, data } = await ebayFetchResult(
    "/sell/account/v1/fulfillment_policy",
    accessToken,
    {
      method: "POST",
      step: "createFulfillmentPolicy",
      headers: accountHeaders(),
      allowHttpError: true,
      body: JSON.stringify(requestBody),
    }
  )

  console.info("[ebay/policies] createFulfillmentPolicy RESPONSE JSON", {
    step: "createFulfillmentPolicy",
    httpStatus: status,
    response: data,
  })

  return { status, data, errors: errorsFromBody(data) }
}

async function createFulfillmentPolicyForMode(
  accessToken: string,
  mode: EbayShippingMode,
  flatAmount = 5.99,
  handlingDays = 1,
  shippingServiceCode = "USPSGroundAdvantage",
  template?: EbayFulfillmentPolicyRaw | null,
  setAsDefault = false
): Promise<{ id: string; usedMode: EbayShippingMode }> {
  const days = Math.max(0, Math.min(30, Math.floor(handlingDays || 1)))
  const service =
    String(shippingServiceCode || "").trim() || "USPSGroundAdvantage"
  const amount = Math.max(0.01, Number(flatAmount) || 5.99).toFixed(2)

  const attempt = async (attemptMode: EbayShippingMode) => {
    const name =
      attemptMode === "calculated"
        ? `ListWise Calculated · ${service} · ${days}d`
        : attemptMode === "free"
          ? `ListWise Free · ${service} · ${days}d`
          : `ListWise Flat $${amount} · ${service} · ${days}d`

    const requestBody = buildFulfillmentPolicyCreateRequest({
      marketplaceId: marketplaceId(),
      mode: attemptMode,
      name,
      handlingDays: days,
      shippingServiceCode: service,
      flatAmount: Number(amount),
      template: attemptMode === mode ? template : null,
      setAsDefault,
    })

    const { status, data, errors } = await postFulfillmentPolicy(
      accessToken,
      requestBody
    )
    const payload = data as EbayPolicy | null
    if (status < 400 && payload?.fulfillmentPolicyId) {
      logPolicies("created fulfillment policy for shipping mode", {
        mode: attemptMode,
        requestedMode: mode,
        fulfillmentPolicyId: payload.fulfillmentPolicyId,
        name,
        handlingDays: days,
        shippingServiceCode: service,
      })
      return {
        id: payload.fulfillmentPolicyId,
        usedMode: attemptMode,
        requestBody,
        status,
        data,
        errors,
      }
    }
    return {
      id: null as string | null,
      usedMode: attemptMode,
      requestBody,
      status,
      data,
      errors,
    }
  }

  const first = await attempt(mode)
  if (first.id) return { id: first.id, usedMode: first.usedMode }

  const diagnosis = diagnoseFulfillmentCreateErrors(first.errors)
  if (diagnosis.calculatedNotSupported && mode === "calculated") {
    logPolicies(
      "calculated shipping not supported on this account; creating flat policy from listing settings",
      {
        rejectedField: diagnosis.rejectedField,
        shipElig: diagnosis.shipEligCode,
        lsasCode: diagnosis.lsasCode,
        flatAmount: amount,
      }
    )
    const fallback = await attempt("flat")
    if (fallback.id) return { id: fallback.id, usedMode: fallback.usedMode }
    throwFulfillmentCreateFailed(
      fallback.status,
      fallback.data,
      fallback.requestBody,
      fallback.errors
    )
  }

  throwFulfillmentCreateFailed(
    first.status,
    first.data,
    first.requestBody,
    first.errors
  )
}

async function createPaymentPolicy(
  accessToken: string,
  requireImmediatePayment: boolean,
  setAsDefault: boolean
) {
  const name = requireImmediatePayment
    ? "ListWise Payment · Immediate"
    : "ListWise Payment"
  const { status, data } = await ebayFetchResult(
    "/sell/account/v1/payment_policy",
    accessToken,
    {
      method: "POST",
      step: "createPaymentPolicy",
      headers: accountHeaders(),
      allowHttpError: true,
      body: JSON.stringify({
        name,
        marketplaceId: marketplaceId(),
        categoryTypes: [
          {
            name: "ALL_EXCLUDING_MOTORS_VEHICLES",
            ...(setAsDefault ? { default: true } : {}),
          },
        ],
        immediatePay: Boolean(requireImmediatePayment),
      }),
    }
  )
  const payload = data as EbayPolicy | null
  if (status >= 400 || !payload?.paymentPolicyId) {
    const errors = errorsFromBody(data)
    throw new MarketplaceError(
      "Could not set up payment settings for this listing. Try publishing again.",
      "ebay_policy_create_failed",
      502,
      {
        ebay: {
          step: "createPaymentPolicy",
          httpStatus: status,
          errorId: errors[0]?.errorId ?? null,
          errors,
          responseBody: data,
        },
      }
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
  },
  setAsDefault: boolean
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
    categoryTypes: [
      {
        name: "ALL_EXCLUDING_MOTORS_VEHICLES",
        ...(setAsDefault ? { default: true } : {}),
      },
    ],
    returnsAccepted: accepted,
  }
  if (accepted) {
    body.returnPeriod = { value: days, unit: "DAY" }
    body.refundMethod = "MONEY_BACK"
    body.returnShippingCostPayer = payer
  }

  const { status, data } = await ebayFetchResult(
    "/sell/account/v1/return_policy",
    accessToken,
    {
      method: "POST",
      step: "createReturnPolicy",
      headers: accountHeaders(),
      allowHttpError: true,
      body: JSON.stringify(body),
    }
  )
  const payload = data as EbayPolicy | null
  if (status >= 400 || !payload?.returnPolicyId) {
    const errors = errorsFromBody(data)
    throw new MarketplaceError(
      "Could not set up return settings for this listing. Try publishing again.",
      "ebay_policy_create_failed",
      502,
      {
        ebay: {
          step: "createReturnPolicy",
          httpStatus: status,
          errorId: errors[0]?.errorId ?? null,
          errors,
          responseBody: data,
        },
      }
    )
  }
  return payload.returnPolicyId
}

export function pickFulfillmentForMode(
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

  // Prefer previously created ListWise policies so we do not duplicate.
  const listwise = pool.find((p) =>
    (p.name || "").toLowerCase().includes("listwise")
  )
  if (listwise) return listwise

  // Otherwise reuse any compatible seller-native policy.
  return pool[0]
}

export function pickPaymentPolicy(
  policies: EbayPaymentPolicyRaw[],
  requireImmediatePayment: boolean
): EbayPaymentPolicyRaw | undefined {
  const matching = policies.filter(
    (p) => Boolean(p.immediatePay) === requireImmediatePayment
  )
  const listwise = matching.find((p) =>
    (p.name || "").toLowerCase().includes("listwise")
  )
  return listwise || matching[0]
}

export function pickReturnPolicy(
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

function cachedFulfillment(
  policies: EbayFulfillmentPolicyRaw[],
  cache: EbayPolicyCache,
  key: string
): EbayFulfillmentPolicyRaw | undefined {
  const id = cache.fulfillment[key]?.trim()
  if (!id) return undefined
  return policies.find((p) => p.fulfillmentPolicyId === id)
}

/**
 * Resolve Business Policy IDs for the *connected seller*.
 * Shipping mode defaults to buyer-pays calculated — never silently uses free shipping.
 * Reuses existing EBAY_US policies when compatible; creates from ListWise
 * selling preferences only when none exist.
 */
export async function ensureEbayBusinessPolicyIds(
  accessToken: string,
  options: EnsureEbayPoliciesOptions = {}
): Promise<EnsureEbayPoliciesResult> {
  await ensureBusinessPoliciesOptIn(accessToken)

  const shippingMode = defaultEbayShippingMode(options.shippingMode)
  const freeConfirmed = Boolean(options.freeShippingConfirmed)
  const cache = options.policyCache?.marketplaceId
    ? {
        ...emptyEbayPolicyCache(options.policyCache.marketplaceId),
        ...options.policyCache,
        fulfillment: { ...options.policyCache.fulfillment },
        payment: { ...options.policyCache.payment },
        returns: { ...options.policyCache.returns },
      }
    : emptyEbayPolicyCache()

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

  const handlingDays =
    typeof options.handlingTimeDays === "number" &&
    Number.isFinite(options.handlingTimeDays)
      ? Math.max(0, Math.min(30, Math.floor(options.handlingTimeDays)))
      : 1
  const shippingServiceCode =
    String(options.shippingServiceCode || "").trim() || "USPSGroundAdvantage"
  const returnsAccepted = options.returnsAccepted !== false
  const returnWindowDays = options.returnWindowDays === 60 ? 60 : 30
  const returnShippingPaidBy =
    options.returnShippingPaidBy === "SELLER" ? "SELLER" : "BUYER"
  const requireImmediatePayment = Boolean(options.requireImmediatePayment)
  const fKey = fulfillmentCacheKey(
    shippingMode,
    shippingServiceCode,
    handlingDays,
    options.flatShippingAmount
  )
  const pKey = paymentCacheKey(requireImmediatePayment)
  const rKey = returnCacheKey(
    returnsAccepted,
    returnWindowDays,
    returnShippingPaidBy
  )

  let selected =
    cachedFulfillment(fulfillment, cache, fKey) ||
    pickFulfillmentForMode(
      fulfillment,
      shippingMode,
      options.flatShippingAmount,
      handlingDays,
      shippingServiceCode
    )

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
    logPolicies("reusing existing seller fulfillment policy", {
      fulfillmentPolicyId: summary?.fulfillmentPolicyId,
      name: summary?.name,
      mode: summary?.mode,
      policyService: summary?.serviceCode,
      requestedService: shippingServiceCode,
      policyHandling: summary?.handlingDays,
      requestedHandling: handlingDays,
    })
  }

  if (!selected) {
    const template =
      fulfillment.find((p) => classifyFulfillmentShippingMode(p) === shippingMode) ||
      fulfillment.find((p) => {
        const m = classifyFulfillmentShippingMode(p)
        return shippingMode === "free"
          ? m === "flat" || m === "free"
          : m === "calculated" || m === "flat"
      }) ||
      null

    const created = await createFulfillmentPolicyForMode(
      accessToken,
      shippingMode,
      options.flatShippingAmount ?? 5.99,
      handlingDays,
      shippingServiceCode,
      template,
      fulfillment.length === 0
    )
    fulfillment = await listEbayFulfillmentPolicies(accessToken)
    selected =
      fulfillment.find((p) => p.fulfillmentPolicyId === created.id) ||
      ({
        fulfillmentPolicyId: created.id,
        name: `ListWise · ${shippingServiceCode} · ${handlingDays}d`,
        handlingTime: { value: handlingDays, unit: "DAY" },
        shippingOptions: [
          {
            optionType: "DOMESTIC",
            costType: created.usedMode === "calculated" ? "CALCULATED" : "FLAT_RATE",
            shippingServices: [
              {
                shippingCarrierCode: "USPS",
                shippingServiceCode,
                freeShipping: created.usedMode === "free",
                buyerResponsibleForShipping: false,
                buyerResponsibleForPickup: false,
                shippingCost:
                  created.usedMode === "flat"
                    ? {
                        value: String(
                          Math.max(0.01, options.flatShippingAmount ?? 5.99)
                        ),
                        currency: "USD",
                      }
                    : created.usedMode === "free"
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

  cache.fulfillment[fKey] = fulfillmentSummary.fulfillmentPolicyId

  let paymentSelected =
    (cache.payment[pKey] &&
      payment.find((p) => p.paymentPolicyId === cache.payment[pKey])) ||
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
      requireImmediatePayment,
      payment.length === 0
    )
    payment = (await listPaymentPolicies(accessToken)) as EbayPaymentPolicyRaw[]
  }
  cache.payment[pKey] = paymentPolicyId

  let returnSelected =
    (cache.returns[rKey] &&
      returns.find((p) => p.returnPolicyId === cache.returns[rKey])) ||
    pickReturnPolicy(returns, {
      returnsAccepted,
      returnWindowDays,
      returnShippingPaidBy,
    })

  let returnPolicyId = returnSelected?.returnPolicyId
  if (!returnPolicyId) {
    returnPolicyId = await createReturnPolicy(
      accessToken,
      {
        returnsAccepted,
        returnWindowDays,
        returnShippingPaidBy,
      },
      returns.length === 0
    )
    returns = (await listReturnPolicies(accessToken)) as EbayReturnPolicyRaw[]
  }
  cache.returns[rKey] = returnPolicyId

  const ownedPayment = payment.find((p) => p.paymentPolicyId === paymentPolicyId)
    ?.paymentPolicyId
  const ownedReturn = returns.find((p) => p.returnPolicyId === returnPolicyId)
    ?.returnPolicyId

  const finalIds: EnsureEbayPoliciesResult = {
    fulfillmentPolicyId: fulfillmentSummary.fulfillmentPolicyId,
    paymentPolicyId: ownedPayment || paymentPolicyId!,
    returnPolicyId: ownedReturn || returnPolicyId!,
    fulfillmentSummary,
    policyCache: cache,
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
