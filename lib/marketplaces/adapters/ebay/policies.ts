import { ebayFetch, ebayFetchResult } from "@/lib/marketplaces/adapters/ebay/client"
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

async function listFulfillmentPolicies(accessToken: string) {
  const mp = marketplaceId()
  const payload = (await ebayFetch(
    `/sell/account/v1/fulfillment_policy?marketplace_id=${encodeURIComponent(mp)}`,
    accessToken,
    { method: "GET", step: "getFulfillmentPolicies" }
  )) as { fulfillmentPolicies?: EbayPolicy[] } | null
  return payload?.fulfillmentPolicies ?? []
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

async function createFulfillmentPolicy(accessToken: string) {
  const payload = (await ebayFetch("/sell/account/v1/fulfillment_policy", accessToken, {
    method: "POST",
    step: "createFulfillmentPolicy",
    body: JSON.stringify({
      name: "ListWise Sandbox Fulfillment",
      marketplaceId: marketplaceId(),
      categoryTypes: [{ name: "ALL_EXCLUDING_MOTORS_VEHICLES", default: true }],
      handlingTime: { value: 1, unit: "DAY" },
      shippingOptions: [
        {
          optionType: "DOMESTIC",
          costType: "FLAT_RATE",
          shippingServices: [
            {
              sortOrder: 1,
              shippingServiceCode: "USPSPriority",
              shippingCost: { value: "5.99", currency: "USD" },
            },
          ],
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

/**
 * Resolve Business Policy IDs for the *connected seller*.
 * Env policy IDs are only used when they appear in that seller's Account API list.
 * Otherwise create Sandbox policies for this seller.
 */
export async function ensureEbayBusinessPolicyIds(
  accessToken: string
): Promise<PolicyIds> {
  await ensureBusinessPoliciesOptIn(accessToken)

  let fulfillment = await listFulfillmentPolicies(accessToken)
  let payment = await listPaymentPolicies(accessToken)
  let returns = await listReturnPolicies(accessToken)

  logPolicies("listed seller policies", {
    fulfillmentCount: fulfillment.length,
    paymentCount: payment.length,
    returnCount: returns.length,
    fulfillmentIds: fulfillment.map((p) => p.fulfillmentPolicyId).filter(Boolean).join(","),
    paymentIds: payment.map((p) => p.paymentPolicyId).filter(Boolean).join(","),
    returnIds: returns.map((p) => p.returnPolicyId).filter(Boolean).join(","),
  })

  const envFulfillment = process.env.EBAY_FULFILLMENT_POLICY_ID?.trim()
  const envPayment = process.env.EBAY_PAYMENT_POLICY_ID?.trim()
  const envReturn = process.env.EBAY_RETURN_POLICY_ID?.trim()

  let fulfillmentPolicyId =
    (envFulfillment &&
      fulfillment.find((p) => p.fulfillmentPolicyId === envFulfillment)
        ?.fulfillmentPolicyId) ||
    fulfillment[0]?.fulfillmentPolicyId

  let paymentPolicyId =
    (envPayment &&
      payment.find((p) => p.paymentPolicyId === envPayment)?.paymentPolicyId) ||
    payment[0]?.paymentPolicyId

  let returnPolicyId =
    (envReturn &&
      returns.find((p) => p.returnPolicyId === envReturn)?.returnPolicyId) ||
    returns[0]?.returnPolicyId

  if (envFulfillment && fulfillmentPolicyId !== envFulfillment) {
    logPolicies("env fulfillment policy not owned by seller; ignoring", {
      envFulfillment,
    })
  }
  if (envPayment && paymentPolicyId !== envPayment) {
    logPolicies("env payment policy not owned by seller; ignoring", {
      envPayment,
    })
  }
  if (envReturn && returnPolicyId !== envReturn) {
    logPolicies("env return policy not owned by seller; ignoring", { envReturn })
  }

  if (!fulfillmentPolicyId) {
    fulfillmentPolicyId = await createFulfillmentPolicy(accessToken)
    fulfillment = await listFulfillmentPolicies(accessToken)
  }
  if (!paymentPolicyId) {
    paymentPolicyId = await createPaymentPolicy(accessToken)
    payment = await listPaymentPolicies(accessToken)
  }
  if (!returnPolicyId) {
    returnPolicyId = await createReturnPolicy(accessToken)
    returns = await listReturnPolicies(accessToken)
  }

  // Re-validate IDs exist on seller account after optional creates.
  const ownedFulfillment = fulfillment.find(
    (p) => p.fulfillmentPolicyId === fulfillmentPolicyId
  )?.fulfillmentPolicyId
  const ownedPayment = payment.find((p) => p.paymentPolicyId === paymentPolicyId)
    ?.paymentPolicyId
  const ownedReturn = returns.find((p) => p.returnPolicyId === returnPolicyId)
    ?.returnPolicyId

  // Fresh create may not yet appear in list; accept just-created IDs.
  const finalIds: PolicyIds = {
    fulfillmentPolicyId: ownedFulfillment || fulfillmentPolicyId!,
    paymentPolicyId: ownedPayment || paymentPolicyId!,
    returnPolicyId: ownedReturn || returnPolicyId!,
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
  })

  return finalIds
}
