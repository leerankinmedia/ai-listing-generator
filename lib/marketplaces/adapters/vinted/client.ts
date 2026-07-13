import { createHmac } from "crypto"
import { MarketplaceError } from "@/lib/marketplaces/adapters/types"

export function isVintedConfigured() {
  // Vinted Pro uses per-user access tokens from the Pro portal.
  // App-level config is the API base URL + connection crypto.
  return Boolean(process.env.CONNECTIONS_SECRET)
}

export function vintedBaseUrl() {
  return (process.env.VINTED_PRO_BASE_URL || "https://pro.svc.vinted.com").replace(
    /\/$/,
    ""
  )
}

export function splitVintedToken(token: string): {
  accessKey: string
  signingKey: string
} {
  const trimmed = token.trim()
  const idx = trimmed.indexOf(",")
  if (idx <= 0 || idx === trimmed.length - 1) {
    throw new MarketplaceError(
      "Vinted Pro token must be in the form accessKey,signingKey",
      "vinted_token_format",
      400
    )
  }
  return {
    accessKey: trimmed.slice(0, idx),
    signingKey: trimmed.slice(idx + 1),
  }
}

export function signVintedRequest(params: {
  method: string
  pathWithQuery: string
  accessKey: string
  signingKey: string
  body: string
  timestamp?: number
}) {
  const timestamp = params.timestamp ?? Math.floor(Date.now() / 1000)
  const payload = [
    String(timestamp),
    params.method.toUpperCase(),
    params.pathWithQuery,
    params.accessKey,
    params.body,
  ].join(".")
  const hash = createHmac("sha256", params.signingKey)
    .update(payload)
    .digest("hex")
  return {
    timestamp,
    header: `t=${timestamp},v1=${hash}`,
    payload,
  }
}

export async function vintedFetch(params: {
  method: string
  path: string
  accessKey: string
  signingKey: string
  body?: unknown
  /** Extra HTTP statuses treated as success (CreateItems returns 202). */
  acceptStatuses?: number[]
}) {
  const body = params.body === undefined ? "" : JSON.stringify(params.body)
  const pathWithQuery = params.path.startsWith("/")
    ? params.path
    : `/${params.path}`
  const signature = signVintedRequest({
    method: params.method,
    pathWithQuery,
    accessKey: params.accessKey,
    signingKey: params.signingKey,
    body,
  })

  const response = await fetch(`${vintedBaseUrl()}${pathWithQuery}`, {
    method: params.method,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Vpi-Access-Key": params.accessKey,
      "X-Vpi-Hmac-Sha256": signature.header,
    },
    body: body || undefined,
  })

  const text = await response.text()
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text }
  }

  const accepted = new Set([200, 201, ...(params.acceptStatuses || [])])
  if (!response.ok && !accepted.has(response.status)) {
    const err = json as { message?: string; error?: string }
    throw new MarketplaceError(
      err.message || err.error || `Vinted API error (${response.status})`,
      "vinted_api_error",
      response.status
    )
  }

  return json
}

/** Official Currency enum: EUR | GBP only. */
export function resolveVintedCurrency(listingCurrency?: string): "EUR" | "GBP" {
  const override = process.env.VINTED_CURRENCY?.toUpperCase()
  if (override === "EUR" || override === "GBP") return override
  const currency = (listingCurrency || "").toUpperCase()
  if (currency === "EUR" || currency === "GBP") return currency
  throw new MarketplaceError(
    "Vinted Pro CreateItems only accepts currency EUR or GBP. Set listing currency or VINTED_CURRENCY=EUR|GBP.",
    "vinted_currency_unsupported",
    400
  )
}

/** Map ListWise condition labels to Vinted status names for ontology lookup */
export function mapConditionToVintedStatusName(condition?: string) {
  switch (condition) {
    case "New with tags":
      return "New with tags"
    case "New without tags":
      return "New without tags"
    case "Excellent":
      return "Very good"
    case "Good":
      return "Good"
    case "Fair":
      return "Satisfactory"
    case "Poor":
      return "Satisfactory"
    default:
      return "Good"
  }
}
