/**
 * eBay OAuth 2.0 authorization code grant (NOT Auth'n'Auth).
 * Authorize URL format matches ebay-oauth-nodejs-client:
 *   client_id, redirect_uri (RuName), response_type, scope (URIs + literal %20), state
 * Do not encodeURIComponent the whole query — that double-encodes scopes into %253A/%252F
 * and breaks the Sandbox consent page ("Something went wrong on our end").
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

/** Decoded scope list — joined with literal "%20" for the authorize URL (eBay client style). */
export const EBAY_SCOPE_LIST = [
  "https://api.ebay.com/oauth/api_scope",
  "https://api.ebay.com/oauth/api_scope/sell.inventory",
  "https://api.ebay.com/oauth/api_scope/sell.account",
  "https://api.ebay.com/oauth/api_scope/sell.fulfillment",
] as const

/** Space-separated scopes for token refresh bodies (form-urlencoded). */
export const EBAY_SCOPES = EBAY_SCOPE_LIST.join(" ")

function assertUrlSafeOAuthValue(name: string, value: string) {
  // Values are placed raw in the query string (per ebay-oauth-nodejs-client).
  // Reject anything that would alter the query structure.
  if (!value || /[\s&?#]/.test(value)) {
    throw new Error(`Invalid eBay OAuth ${name} value.`)
  }
}

/**
 * Build Sandbox/Production authorize URL.
 * Matches https://github.com/eBay/ebay-oauth-nodejs-client generateUserAuthorizationUrl:
 * scopes joined with "%20", client_id / redirect_uri / state left unencoded.
 */
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

  assertUrlSafeOAuthValue("client_id", clientId)
  assertUrlSafeOAuthValue("redirect_uri", redirectUri)
  assertUrlSafeOAuthValue("state", state)

  const authBase = ebayAuthBase()
  // Literal %20 between scope URIs — do NOT encodeURIComponent the scope string
  // (that turns https:// into https%3A%2F%2F and can break Sandbox consent).
  const scope = EBAY_SCOPE_LIST.join("%20")

  const queryParam = [
    `client_id=${clientId}`,
    `redirect_uri=${redirectUri}`,
    `response_type=code`,
    `scope=${scope}`,
    `state=${state}`,
  ].join("&")

  const url = `${authBase}/oauth2/authorize?${queryParam}`

  // Safe log: redact client_id, never log secrets. Detect accidental double-encoding.
  const clientIdRedacted =
    clientId.length <= 6 ? `***${clientId}` : `***${clientId.slice(-6)}`
  const authorizeUrlRedacted = url.replace(
    `client_id=${clientId}`,
    `client_id=${clientIdRedacted}`
  )
  console.info("[ebay/oauth] authorize URL", {
    flow: "oauth2_authorization_code",
    env: ebayEnv(),
    authBase,
    response_type: "code",
    redirect_uri: redirectUri,
    stateLength: state.length,
    scopeCount: EBAY_SCOPE_LIST.length,
    scopeUsesLiteralPercent20: scope.includes("%20"),
    scopeDoubleEncoded: scope.includes("%253A") || scope.includes("%252F"),
    authorizeUrlRedacted,
  })

  if (scope.includes("%253A") || url.includes("%2520") || url.includes("%253A")) {
    throw new Error(
      "eBay authorize URL appears double-encoded. Refusing to redirect."
    )
  }

  return url
}

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
