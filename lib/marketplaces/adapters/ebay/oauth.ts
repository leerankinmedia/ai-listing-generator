/**
 * eBay OAuth 2.0 authorization code grant (NOT Auth'n'Auth).
 * Docs:
 * - https://developer.ebay.com/api-docs/static/oauth-authorization-code-grant.html
 * - Authorize: GET {auth.sandbox.ebay.com|auth.ebay.com}/oauth2/authorize
 * - Token: POST {api.sandbox.ebay.com|api.ebay.com}/identity/v1/oauth2/token
 *
 * Requires an OAuth-enabled RuName (Developer Portal → User Tokens → OAuth).
 * Auth'n'Auth RuNames redirect to the accepted URL without ?code=&state=.
 *
 * Set EBAY_ENV=sandbox for Sandbox credentials.
 * redirect_uri must be the RuName from EBAY_RU_NAME, not the Vercel callback URL.
 */
import { PRODUCTION_APP_URL } from "@/lib/app-url"

export function isEbayConfigured() {
  return Boolean(
    process.env["EBAY_CLIENT_ID"] &&
      process.env["EBAY_CLIENT_SECRET"] &&
      process.env["EBAY_RU_NAME"]
  )
}

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

/** OAuth 2.0 authorize host (never Auth'n'Auth / eBayISAPI SignIn). */
export function ebayAuthBase() {
  return ebayEnv() === "sandbox"
    ? "https://auth.sandbox.ebay.com"
    : "https://auth.ebay.com"
}

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

export function ebayRuName(): string {
  const ruName = cleanEnv(process.env["EBAY_RU_NAME"])
  if (!ruName) {
    throw new Error(
      "EBAY_RU_NAME is required. Use the OAuth-enabled RuName from the eBay Developer Portal (not your app callback URL)."
    )
  }
  if (/^https?:\/\//i.test(ruName) || ruName.includes("/")) {
    throw new Error(
      "EBAY_RU_NAME must be the eBay RuName string (e.g. YourApp-YourCo-xxxxx), not a Vercel/callback URL."
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

/** RFC 3986 query encoding — scope spaces must be %20, not +. */
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
  const clientId = ebayClientId()
  const redirectUri = ebayRuName()
  if (!clientId || !state) {
    throw new Error("eBay authorize URL missing client_id or state.")
  }

  const authBase = ebayAuthBase()
  const query = buildAuthorizeQuery({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: EBAY_SCOPES,
    state,
  })

  // Explicit OAuth 2.0 path — never Auth'n'Auth SignIn / eBayISAPI.
  const url = `${authBase}/oauth2/authorize?${query}`

  console.info("[ebay/oauth] authorize", {
    flow: "oauth2_authorization_code",
    env: ebayEnv(),
    authBase,
    authorizePath: "/oauth2/authorize",
    response_type: "code",
    redirect_uri: redirectUri,
    statePresent: true,
    scopeCount: EBAY_SCOPES.split(" ").length,
  })

  return url
}

/** Canonical production callback — must match RuName Auth Accepted URL. */
export function ebayCallbackUrl() {
  return `${PRODUCTION_APP_URL}/api/marketplaces/ebay/oauth/callback`
}

export async function exchangeEbayCode(code: string) {
  if (!isEbayConfigured()) {
    throw new Error("eBay app credentials are not configured.")
  }
  const apiBase = ebayApiBase()
  const redirectUri = ebayRuName()
  console.info("[ebay/oauth] token exchange", {
    flow: "oauth2_authorization_code",
    env: ebayEnv(),
    apiBase,
    redirect_uri: redirectUri,
  })

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
