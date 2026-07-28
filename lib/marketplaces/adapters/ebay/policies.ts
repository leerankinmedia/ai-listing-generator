import { ebayFetch, ebayFetchResult } from "@/lib/marketplaces/adapters/ebay/client"
import {
  classifyFulfillmentShippingMode,
  defaultEbayShippingMode,
  fulfillmentPolicyIsFreeShipping,
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
  /** Optional explicit fulfillment policy id (must match mode rules). */
  fulfillmentPolicyId?: string | null
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
  flatAmount = 5.99
): Promise<string> {
  const amount = Math.max(0.01, Number(flatAmount) || 5.99).toFixed(2)
  const name =
    mode === "calculated"
      ? "ListWise Calculated Shipping (buyer pays)"
      : mode === "free"
        ? "ListWise Free Shipping"
        : `ListWise Flat Shipping $${amount}`

  const shippingServices =
    mode === "calculated"
      ? [
          {
            sortOrder: 1,
            shippingServiceCode: "USPSPriority",
            freeShipping: false,
            buyerResponsibleForShipping: true,
            buyerResponsibleForPickup: false,
          },
        ]
      : mode === "free"
        ? [
            {
              sortOrder: 1,
              shippingServiceCode: "USPSPriority",
              freeShipping: true,
              buyerResponsibleForShipping: false,
              buyerResponsibleForPickup: false,
              shippingCost: { value: "0.0", currency: "USD" },
            },
          ]
        : [
            {
              sortOrder: 1,
              shippingServiceCode: "USPSPriority",
              freeShipping: false,
              buyerResponsibleForShipping: true,
              buyerResponsibleForPickup: false,
              shippingCost: { value: amount, currency: "USD" },
            },
          ]

  const payload = (await ebayFetch("/sell/account/v1/fulfillment_policy", accessToken, {
    method: "POST",
    step: "createFulfillmentPolicy",
    body: JSON.stringify({
      name,
      marketplaceId: marketplaceId(),
      categoryTypes: [{ name: "ALL_EXCLUDING_MOTORS_VEHICLES", default: true }],
      handlingTime: { value: 1, unit: "DAY" },
      shippingOptions: [
        {
          optionType: "DOMESTIC",
          costType: mode === "calculated" ? "CALCULATED" : "FLAT_RATE",
          shippingServices,
        },
      ],
    }),
  })) as EbayPolicy

  if (!payload.fulfillmentPolicyId) {
    throw new MarketplaceError(
      "eBay did not return a fulfillmentPolicyId after create.",
      "ebay_policy_create_failed",
      502
    )
  }
  logPolicies("created fulfillment policy for shipping mode", {
    mode,
    fulfillmentPolicyId: payload.fulfillmentPolicyId,
    name,
  })
  return payload.fulfillmentPolicyId
}

async function createPaymentPolicy(accessToken: string) {
  const payload = (await ebayFetch("/sell/account/v1/payment_policy", accessToken, {
    method: "POST",
    step: "createPaymentPolicy",
    body: JSON.stringify({
      name: "ListWise Sandbox Payment",
      marketplaceId: marketplaceId(),
      categoryTypes: [{ name: "ALL_EXCLUDING_MOTORS_VEHICLES", default: true }],
      // US managed payments: no PayPal recipient required.
      immediatePay: false,
    }),
  })) as EbayPolicy

  if (!payload.paymentPolicyId) {
    throw new MarketplaceError(
      "eBay did not return a paymentPolicyId after create.",
      "ebay_policy_create_failed",
      502
    )
  }
  return payload.paymentPolicyId
}

async function createReturnPolicy(accessToken: string) {
  const payload = (await ebayFetch("/sell/account/v1/return_policy", accessToken, {
    method: "POST",
    step: "createReturnPolicy",
    body: JSON.stringify({
      name: "ListWise Sandbox Returns",
      marketplaceId: marketplaceId(),
      categoryTypes: [{ name: "ALL_EXCLUDING_MOTORS_VEHICLES", default: true }],
      returnsAccepted: true,
      returnPeriod: { value: 30, unit: "DAY" },
      refundMethod: "MONEY_BACK",
      returnShippingCostPayer: "BUYER",
    }),
  })) as EbayPolicy

  if (!payload.returnPolicyId) {
    throw new MarketplaceError(
      "eBay did not return a returnPolicyId after create.",
      "ebay_policy_create_failed",
      502
    )
  }
  return payload.returnPolicyId
}

function pickFulfillmentForMode(
  policies: EbayFulfillmentPolicyRaw[],
  mode: EbayShippingMode,
  preferredId?: string | null,
  flatAmount?: number | null
): EbayFulfillmentPolicyRaw | undefined {
  const matching = policies.filter(
    (p) => classifyFulfillmentShippingMode(p) === mode
  )

  if (preferredId) {
    const preferred = matching.find((p) => p.fulfillmentPolicyId === preferredId)
    if (preferred) return preferred
  }

  if (mode === "flat" && flatAmount != null && Number.isFinite(flatAmount)) {
    const target = Number(flatAmount)
    const byAmount = matching.find((p) => {
      const summary = summarizeFulfillmentPolicy(p)
      return (
        summary?.flatAmount != null &&
        Math.abs(summary.flatAmount - target) < 0.009
      )
    })
    if (byAmount) return byAmount
  }

  // Prefer ListWise-created policies for the mode.
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
  let payment = await listPaymentPolicies(accessToken)
  let returns = await listReturnPolicies(accessToken)

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

  // Env fulfillment ID is only eligible when it matches the requested shipping mode
  // and is not free shipping (unless the seller explicitly chose free + confirmed).
  let preferredFulfillmentId = options.fulfillmentPolicyId?.trim() || null
  if (envFulfillment) {
    const envPolicy = fulfillment.find((p) => p.fulfillmentPolicyId === envFulfillment)
    if (!envPolicy) {
      logPolicies("env fulfillment policy not owned by seller; ignoring", {
        envFulfillment,
      })
    } else {
      const envMode = classifyFulfillmentShippingMode(envPolicy)
      const envFree = fulfillmentPolicyIsFreeShipping(envPolicy)
      if (envMode === shippingMode && !(envFree && shippingMode !== "free")) {
        preferredFulfillmentId = preferredFulfillmentId || envFulfillment
      } else {
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
    preferredFulfillmentId,
    options.flatShippingAmount
  )

  if (!selected) {
    const createdId = await createFulfillmentPolicyForMode(
      accessToken,
      shippingMode,
      options.flatShippingAmount ?? 5.99
    )
    fulfillment = await listEbayFulfillmentPolicies(accessToken)
    selected =
      fulfillment.find((p) => p.fulfillmentPolicyId === createdId) ||
      ({
        fulfillmentPolicyId: createdId,
        name:
          shippingMode === "calculated"
            ? "ListWise Calculated Shipping (buyer pays)"
            : shippingMode === "free"
              ? "ListWise Free Shipping"
              : "ListWise Flat Shipping",
        handlingTime: { value: 1, unit: "DAY" },
        shippingOptions: [
          {
            optionType: "DOMESTIC",
            costType: shippingMode === "calculated" ? "CALCULATED" : "FLAT_RATE",
            shippingServices: [
              {
                shippingServiceCode: "USPSPriority",
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
      "Could not read shipping settings from the selected eBay fulfillment policy.",
      "ebay_fulfillment_unreadable",
      502
    )
  }

  // Hard guard: never publish free shipping unless explicitly chosen + confirmed.
  if (fulfillmentSummary.isFreeShipping) {
    if (shippingMode !== "free") {
      throw new MarketplaceError(
        `Selected eBay fulfillment policy "${fulfillmentSummary.name}" is free shipping, but this listing is set to "${shippingMode}". Choose Buyer pays calculated/flat shipping, or confirm Free shipping.`,
        "ebay_free_shipping_not_selected",
        400
      )
    }
    if (!freeConfirmed) {
      throw new MarketplaceError(
        `Free shipping policy "${fulfillmentSummary.name}" requires confirmation before publishing. Confirm Free shipping in the Shipping section.`,
        "ebay_free_shipping_unconfirmed",
        400
      )
    }
  }

  let paymentPolicyId =
    (envPayment &&
      payment.find((p) => p.paymentPolicyId === envPayment)?.paymentPolicyId) ||
    payment[0]?.paymentPolicyId

  let returnPolicyId =
    (envReturn &&
      returns.find((p) => p.returnPolicyId === envReturn)?.returnPolicyId) ||
    returns[0]?.returnPolicyId

  if (envPayment && paymentPolicyId !== envPayment) {
    logPolicies("env payment policy not owned by seller; ignoring", {
      envPayment,
    })
  }
  if (envReturn && returnPolicyId !== envReturn) {
    logPolicies("env return policy not owned by seller; ignoring", { envReturn })
  }

  if (!paymentPolicyId) {
    paymentPolicyId = await createPaymentPolicy(accessToken)
    payment = await listPaymentPolicies(accessToken)
  }
  if (!returnPolicyId) {
    returnPolicyId = await createReturnPolicy(accessToken)
    returns = await listReturnPolicies(accessToken)
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
      "Connected eBay seller is missing Business Policies (payment/fulfillment/return).",
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
  })

  return finalIds
}
