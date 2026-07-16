/**
 * eBay OAuth 2.0 authorization code grant + token endpoints.
 * Docs:
 * - https://developer.ebay.com/api-docs/static/oauth-authorization-code-grant.html
 * - Token: POST {api.ebay.com|api.sandbox.ebay.com}/identity/v1/oauth2/token
 * - Authorize: GET {auth.ebay.com|auth.sandbox.ebay.com}/oauth2/authorize
 *
 * Set EBAY_ENV=sandbox for Sandbox credentials (auth + token + API).
 * Omit or set EBAY_ENV=production for live credentials.
 */
import { getAppBaseUrl } from "@/lib/marketplaces/connections/crypto"

export function isEbayConfigured() {
  return Boolean(
    process.env.EBAY_CLIENT_ID &&
      process.env.EBAY_CLIENT_SECRET &&
      process.env.EBAY_RU_NAME
  )
}

/**
 * Resolve Sandbox vs Production from EBAY_ENV (request-time, bracket access).
 * Values: sandbox | sbx | test → sandbox; anything else → production.
 */
export function ebayEnv(): "sandbox" | "production" {
  const raw = process.env["EBAY_ENV"]
  const normalized =
    typeof raw === "string" ? raw.trim().toLowerCase() : ""
  if (
    normalized === "sandbox" ||
    normalized === "sbx" ||
    normalized === "test"
  ) {
    return "sandbox"
  }
  return "production"
}

export function ebayApiBase() {
  return ebayEnv() === "sandbox"
    ? "https://api.sandbox.ebay.com"
    : "https://api.ebay.com"
}

/** User-facing OAuth authorize host — never use Production when EBAY_ENV=sandbox. */
export function ebayAuthBase() {
  return ebayEnv() === "sandbox"
    ? "https://auth.sandbox.ebay.com"
    : "https://auth.ebay.com"
}

export const EBAY_SCOPES = [
  "https://api.ebay.com/oauth/api_scope",
  "https://api.ebay.com/oauth/api_scope/sell.inventory",
  "https://api.ebay.com/oauth/api_scope/sell.account",
  "https://api.ebay.com/oauth/api_scope/sell.fulfillment",
].join(" ")

export function buildEbayAuthorizeUrl(state: string) {
  if (!isEbayConfigured()) {
    throw new Error(
      "eBay is not configured. Set EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, and EBAY_RU_NAME."
    )
  }
  const env = ebayEnv()
  const authBase = ebayAuthBase()
  const params = new URLSearchParams({
    client_id: process.env.EBAY_CLIENT_ID!,
    response_type: "code",
    redirect_uri: process.env.EBAY_RU_NAME!,
    scope: EBAY_SCOPES,
    state,
  })
  const url = `${authBase}/oauth2/authorize?${params.toString()}`
  console.info("[ebay/oauth] authorize", { env, authBase })
  return url
}

export function ebayCallbackUrl() {
  return `${getAppBaseUrl()}/api/marketplaces/ebay/oauth/callback`
}

export async function exchangeEbayCode(code: string) {
  if (!isEbayConfigured()) {
    throw new Error("eBay app credentials are not configured.")
  }
  const env = ebayEnv()
  const apiBase = ebayApiBase()
  console.info("[ebay/oauth] token exchange", { env, apiBase })

  const basic = Buffer.from(
    `${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`
  ).toString("base64")

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: process.env.EBAY_RU_NAME!,
  })

  const response = await fetch(`${apiBase}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  })

  const payload = await response.json()
  if (!response.ok) {
    throw new Error(
      payload.error_description ||
        payload.error ||
        `eBay token exchange failed (${response.status})`
    )
  }

  return {
    accessToken: payload.access_token as string,
    refreshToken: payload.refresh_token as string | undefined,
    expiresIn: Number(payload.expires_in ?? 7200),
    tokenType: payload.token_type as string,
  }
}

export async function refreshEbayToken(refreshToken: string) {
  if (!isEbayConfigured()) {
    throw new Error("eBay app credentials are not configured.")
  }
  const apiBase = ebayApiBase()
  const basic = Buffer.from(
    `${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`
  ).toString("base64")

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: EBAY_SCOPES,
  })

  const response = await fetch(`${apiBase}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  })
  const payload = await response.json()
  if (!response.ok) {
    throw new Error(
      payload.error_description ||
        payload.error ||
        `eBay token refresh failed (${response.status})`
    )
  }
  return {
    accessToken: payload.access_token as string,
    refreshToken: (payload.refresh_token as string | undefined) ?? refreshToken,
    expiresIn: Number(payload.expires_in ?? 7200),
  }
}
