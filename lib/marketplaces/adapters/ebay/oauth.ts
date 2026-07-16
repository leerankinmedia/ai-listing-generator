/**
 * eBay OAuth 2.0 authorization code grant + token endpoints.
 * Docs:
 * - https://developer.ebay.com/api-docs/static/oauth-authorization-code-grant.html
 * - Token: POST {api.ebay.com|api.sandbox.ebay.com}/identity/v1/oauth2/token
 * - Authorize: GET {auth.ebay.com|auth.sandbox.ebay.com}/oauth2/authorize
 *
 * Set EBAY_ENV=sandbox for Sandbox credentials (auth + token + API).
 * Omit or set EBAY_ENV=production for live credentials.
 *
 * redirect_uri must be the OAuth-enabled RuName from EBAY_RU_NAME
 * (e.g. ListWise-ListWis-xxxxx), NOT the Vercel callback URL.
 */
import { getAppBaseUrl } from "@/lib/marketplaces/connections/crypto"

export function isEbayConfigured() {
  return Boolean(
    process.env["EBAY_CLIENT_ID"] &&
      process.env["EBAY_CLIENT_SECRET"] &&
      process.env["EBAY_RU_NAME"]
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

/** Trim + strip wrapping quotes from Vercel/env values. */
function cleanEnv(value: string | undefined): string {
  if (typeof value !== "string") return ""
  let v = value.trim()
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1).trim()
  }
  return v
}

export function ebayClientId(): string {
  return cleanEnv(process.env["EBAY_CLIENT_ID"])
}

export function ebayClientSecret(): string {
  return cleanEnv(process.env["EBAY_CLIENT_SECRET"])
}

/**
 * Sandbox/Production OAuth RuName for redirect_uri.
 * Must NOT be a URL — eBay rejects https://… callback URLs here.
 */
export function ebayRuName(): string {
  const ruName = cleanEnv(process.env["EBAY_RU_NAME"])
  if (!ruName) {
    throw new Error(
      "EBAY_RU_NAME is required. Use the OAuth-enabled RuName from the eBay Developer Portal (not your app callback URL)."
    )
  }
  if (/^https?:\/\//i.test(ruName) || ruName.includes("/")) {
    throw new Error(
      "EBAY_RU_NAME must be the eBay RuName string (e.g. YourApp-YourCo-xxxxx), not a Vercel/callback URL. Set Your auth accepted URL to the callback in the Developer Portal; keep redirect_uri=RuName in the authorize request."
    )
  }
  return ruName
}

export const EBAY_SCOPES = [
  "https://api.ebay.com/oauth/api_scope",
  "https://api.ebay.com/oauth/api_scope/sell.inventory",
  "https://api.ebay.com/oauth/api_scope/sell.account",
  "https://api.ebay.com/oauth/api_scope/sell.fulfillment",
].join(" ")

/**
 * Build an authorize query string with RFC 3986 encoding.
 * Critical: scope spaces must be %20, not + (URLSearchParams uses + and eBay returns invalid_request).
 */
function buildAuthorizeQuery(params: Record<string, string>): string {
  return Object.entries(params)
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
    )
    .join("&")
}

export function buildEbayAuthorizeUrl(state: string) {
  if (!isEbayConfigured()) {
    throw new Error(
      "eBay is not configured. Set EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, and EBAY_RU_NAME."
    )
  }
  const env = ebayEnv()
  const authBase = ebayAuthBase()
  const clientId = ebayClientId()
  const redirectUri = ebayRuName()
  const responseType = "code"
  const scope = EBAY_SCOPES

  if (!clientId || !state) {
    throw new Error("eBay authorize URL missing client_id or state.")
  }

  // Required eBay consent params (order matches eBay docs).
  const query = buildAuthorizeQuery({
    client_id: clientId,
    response_type: responseType,
    redirect_uri: redirectUri,
    scope,
    state,
  })

  const url = `${authBase}/oauth2/authorize?${query}`

  // Log exact request shape for debugging invalid_request (RuName is not secret).
  console.info("[ebay/oauth] authorize URL", {
    env,
    authBase,
    client_id: clientId,
    response_type: responseType,
    redirect_uri: redirectUri,
    scope,
    scopeEncodedSample: encodeURIComponent(scope).slice(0, 80),
    stateLength: state.length,
    url,
  })

  if (query.includes("+") && /scope=/.test(query)) {
    // Defense: never ship + as scope separators.
    console.warn(
      "[ebay/oauth] authorize query unexpectedly contains '+'; eBay requires %20 between scopes"
    )
  }

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
  const redirectUri = ebayRuName()
  console.info("[ebay/oauth] token exchange", { env, apiBase, redirect_uri: redirectUri })

  const basic = Buffer.from(
    `${ebayClientId()}:${ebayClientSecret()}`
  ).toString("base64")

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
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
    `${ebayClientId()}:${ebayClientSecret()}`
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
