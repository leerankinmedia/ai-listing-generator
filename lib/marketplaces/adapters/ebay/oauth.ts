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

/** Redact client_id for logs/UI — keep only last 6 characters. */
export function redactEbayClientId(clientId: string): string {
  const id = clientId.trim()
  if (!id) return "(missing)"
  if (id.length <= 6) return `***${id}`
  return `***${id.slice(-6)}`
}

export type EbayAuthorizeDebug = {
  temporaryDebug: true
  ebayEnv: "sandbox" | "production"
  authDomain: string
  authBase: string
  authorizePath: "/oauth2/authorize"
  response_type: string
  redirect_uri: string
  redirect_uri_looks_like_url: boolean
  scopes_decoded: string[]
  scope_separator: "space"
  scope_encoding_uses_percent_20: boolean
  scope_encoding_uses_plus: boolean
  state_present: boolean
  state_length: number
  client_id_redacted: string
  /** Authorize URL with client_id redacted — safe to view on mobile. */
  authorize_url_redacted: string
  param_keys: string[]
  notes: string[]
}

function buildEbayAuthorizeParts(state: string) {
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

  const queryParams = {
    client_id: clientId,
    response_type: responseType,
    redirect_uri: redirectUri,
    scope,
    state,
  }
  const query = buildAuthorizeQuery(queryParams)
  const url = `${authBase}/oauth2/authorize?${query}`

  const scopesDecoded = scope.split(" ").filter(Boolean)
  const scopeEncoded = encodeURIComponent(scope)
  const debug: EbayAuthorizeDebug = {
    temporaryDebug: true,
    ebayEnv: env,
    authDomain: new URL(authBase).host,
    authBase,
    authorizePath: "/oauth2/authorize",
    response_type: responseType,
    redirect_uri: redirectUri,
    redirect_uri_looks_like_url: /^https?:\/\//i.test(redirectUri),
    scopes_decoded: scopesDecoded,
    scope_separator: "space",
    scope_encoding_uses_percent_20: scopeEncoded.includes("%20"),
    scope_encoding_uses_plus: query.includes("scope=") && /scope=[^&]*\+/.test(query),
    state_present: Boolean(state),
    state_length: state.length,
    client_id_redacted: redactEbayClientId(clientId),
    authorize_url_redacted: url.replace(
      encodeURIComponent(clientId),
      encodeURIComponent(redactEbayClientId(clientId))
    ),
    param_keys: Object.keys(queryParams),
    notes: [
      "redirect_uri must be the OAuth RuName from EBAY_RU_NAME, not the Vercel callback URL.",
      "client_secret is never included in the authorize URL.",
      "Temporary debug — remove after Sandbox OAuth is working.",
    ],
  }

  return { url, query, debug }
}

/** Temporary safe debug payload for mobile/JSON inspection (no secrets). */
export function inspectEbayAuthorizeRequest(state: string): EbayAuthorizeDebug {
  const { debug } = buildEbayAuthorizeParts(state)
  logEbayAuthorizeDebug(debug)
  return debug
}

export function logEbayAuthorizeDebug(debug: EbayAuthorizeDebug) {
  console.info("[ebay/oauth] authorize debug (redacted)", {
    ebayEnv: debug.ebayEnv,
    authDomain: debug.authDomain,
    authBase: debug.authBase,
    response_type: debug.response_type,
    redirect_uri: debug.redirect_uri,
    scopes_decoded: debug.scopes_decoded,
    state_present: debug.state_present,
    state_length: debug.state_length,
    client_id_redacted: debug.client_id_redacted,
    scope_encoding_uses_percent_20: debug.scope_encoding_uses_percent_20,
    scope_encoding_uses_plus: debug.scope_encoding_uses_plus,
    authorize_url_redacted: debug.authorize_url_redacted,
  })
}

export function buildEbayAuthorizeUrl(state: string) {
  const { url, query, debug } = buildEbayAuthorizeParts(state)
  logEbayAuthorizeDebug(debug)

  if (debug.scope_encoding_uses_plus) {
    console.warn(
      "[ebay/oauth] authorize query unexpectedly contains '+'; eBay requires %20 between scopes"
    )
  }
  if (query.includes("client_secret") || /client_secret=/i.test(url)) {
    console.error("[ebay/oauth] refuse: client_secret must never appear in authorize URL")
    throw new Error("Internal error: authorize URL must not include secrets.")
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
