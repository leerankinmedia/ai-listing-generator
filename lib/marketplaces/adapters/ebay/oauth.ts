/**
 * eBay OAuth 2.0 authorization code grant (NOT Auth'n'Auth).
 * Authorize URLs are built with the official ebay-oauth-nodejs-client so the
 * query string matches eBay's authorization-code format exactly.
 */
import EbayAuthToken from "ebay-oauth-nodejs-client"
import { PRODUCTION_APP_URL } from "@/lib/app-url"

/** Sandbox OAuth RuName that must match EBAY_RU_NAME and the Developer Portal keyset. */
export const EXPECTED_SANDBOX_RUNAME = "Lee_Rankin-LeeRanki-ListWi-rpqhu"

const SANDBOX_AUTHORIZE =
  "https://auth.sandbox.ebay.com/oauth2/authorize"
const PRODUCTION_AUTHORIZE = "https://auth.ebay.com/oauth2/authorize"

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
      "EBAY_RU_NAME is required. Use the OAuth-enabled RuName from the eBay Developer Portal."
    )
  }
  if (/^https?:\/\//i.test(ruName) || ruName.includes("/")) {
    throw new Error(
      "EBAY_RU_NAME must be the eBay RuName string, not a Vercel/callback URL."
    )
  }
  return ruName
}

/** Official eBay sell scopes used for user consent + refresh. */
export const EBAY_SCOPE_LIST = [
  "https://api.ebay.com/oauth/api_scope",
  "https://api.ebay.com/oauth/api_scope/sell.inventory",
  "https://api.ebay.com/oauth/api_scope/sell.account",
  "https://api.ebay.com/oauth/api_scope/sell.fulfillment",
] as const

export const EBAY_SCOPES = EBAY_SCOPE_LIST.join(" ")

function createEbayAuthClient() {
  const env = ebayEnv() === "sandbox" ? "SANDBOX" : "PRODUCTION"
  return new EbayAuthToken({
    clientId: ebayClientId(),
    clientSecret: ebayClientSecret(),
    redirectUri: ebayRuName(),
    env,
  })
}

export type EbayAuthorizeStartCheck = {
  paramNames: string[]
  authorizationEndpoint: string
  authorizationEndpointOk: boolean
  responseType: string
  responseTypeOk: boolean
  redirectUri: string
  redirectUriOk: boolean
  expectedSandboxRuName: string
  clientIdRedacted: string
  clientIdPresent: boolean
  scopes: string[]
  scopeEncoding: "literal_%20_between_uris"
  scopeEncodingOk: boolean
  statePresent: boolean
  stateLength: number
  builder: "ebay-oauth-nodejs-client"
  authorizeUrlRedacted: string
}

function redactClientId(clientId: string) {
  if (!clientId) return "(missing)"
  if (clientId.length <= 6) return `***${clientId}`
  return `***${clientId.slice(-6)}`
}

function inspectAuthorizeUrl(url: string, state: string): EbayAuthorizeStartCheck {
  const parsed = new URL(url)
  const redirectUri = ebayRuName()
  const clientId = ebayClientId()
  const env = ebayEnv()
  const expectedEndpoint =
    env === "sandbox" ? SANDBOX_AUTHORIZE : PRODUCTION_AUTHORIZE

  const scopeParam = parsed.searchParams.get("scope") || ""
  // URLSearchParams decodes %20 to space — check the raw query for literal %20.
  const rawQuery = url.split("?")[1] || ""
  const rawScopeMatch = rawQuery.match(/(?:^|&)scope=([^&]*)/)
  const rawScope = rawScopeMatch ? rawScopeMatch[1] : ""

  return {
    paramNames: Array.from(parsed.searchParams.keys()),
    authorizationEndpoint: `${parsed.origin}${parsed.pathname}`,
    authorizationEndpointOk: `${parsed.origin}${parsed.pathname}` === expectedEndpoint,
    responseType: parsed.searchParams.get("response_type") || "",
    responseTypeOk: parsed.searchParams.get("response_type") === "code",
    redirectUri,
    redirectUriOk:
      env === "sandbox"
        ? redirectUri === EXPECTED_SANDBOX_RUNAME
        : Boolean(redirectUri),
    expectedSandboxRuName: EXPECTED_SANDBOX_RUNAME,
    clientIdRedacted: redactClientId(clientId),
    clientIdPresent: Boolean(clientId),
    scopes: [...EBAY_SCOPE_LIST],
    scopeEncoding: "literal_%20_between_uris",
    scopeEncodingOk:
      rawScope.includes("%20") &&
      !rawScope.includes("%253A") &&
      !rawScope.includes("+") &&
      scopeParam.split(" ").filter(Boolean).length === EBAY_SCOPE_LIST.length,
    statePresent: Boolean(parsed.searchParams.get("state") || state),
    stateLength: (parsed.searchParams.get("state") || state).length,
    builder: "ebay-oauth-nodejs-client",
    authorizeUrlRedacted: url.replace(
      `client_id=${clientId}`,
      `client_id=${redactClientId(clientId)}`
    ),
  }
}

/**
 * Build authorize URL via official ebay-oauth-nodejs-client
 * (same format as eBay's authorization-code grant docs).
 */
export function buildEbayAuthorizeUrl(state: string) {
  if (!isEbayConfigured()) {
    throw new Error(
      "eBay is not configured. Set EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, and EBAY_RU_NAME."
    )
  }
  if (!state) {
    throw new Error("eBay authorize URL missing state.")
  }

  const envName = ebayEnv() === "sandbox" ? "SANDBOX" : "PRODUCTION"
  const redirectUri = ebayRuName()

  if (ebayEnv() === "sandbox" && redirectUri !== EXPECTED_SANDBOX_RUNAME) {
    throw new Error(
      `EBAY_RU_NAME must be exactly ${EXPECTED_SANDBOX_RUNAME} for Sandbox OAuth (matches the Sandbox RuName/keyset).`
    )
  }

  const client = createEbayAuthClient()
  const url = client.generateUserAuthorizationUrl(
    envName,
    [...EBAY_SCOPE_LIST],
    { state }
  )

  const check = inspectAuthorizeUrl(url, state)
  console.info("[ebay/oauth] start authorize check", check)

  // TEMPORARY: full consent URL for eBay support (Client ID redacted only; no secrets).
  const rawQuery = url.split("?")[1] || ""
  const rawScopeMatch = rawQuery.match(/(?:^|&)scope=([^&]*)/)
  const rawScopeExact = rawScopeMatch ? decodeURIComponent(rawScopeMatch[1].replace(/\+/g, "%20")) : ""
  // Prefer the exact scope substring as it appears in the authorize URL (keep %20).
  const scopeExactInUrl = rawScopeMatch ? rawScopeMatch[1] : ""
  console.info("[ebay/oauth] TEMP consent request URL (client_id redacted)", {
    temporary: true,
    purpose: "eBay support Sandbox consent URL inspection",
    completeAuthorizeUrlRedacted: check.authorizeUrlRedacted,
    endpoint: check.authorizationEndpoint,
    redirect_uri: check.redirectUri,
    response_type: check.responseType,
    scope_exact: scopeExactInUrl,
    scope_decoded: rawScopeExact,
    state_present: check.statePresent,
    state_length: check.stateLength,
    param_names: check.paramNames,
    // Do not log client_secret, cookies, or full client_id.
    client_id: check.clientIdRedacted,
  })

  if (!check.authorizationEndpointOk) {
    throw new Error(
      `Authorize endpoint mismatch. Expected ${ebayEnv() === "sandbox" ? SANDBOX_AUTHORIZE : PRODUCTION_AUTHORIZE}.`
    )
  }
  if (!check.responseTypeOk) {
    throw new Error("Authorize URL missing response_type=code.")
  }
  if (!check.redirectUriOk) {
    throw new Error(
      `redirect_uri must equal ${EXPECTED_SANDBOX_RUNAME} for Sandbox.`
    )
  }
  if (!check.scopeEncodingOk) {
    throw new Error("Authorize URL scope encoding is invalid.")
  }
  if (!check.statePresent) {
    throw new Error("Authorize URL missing state.")
  }
  if (!check.clientIdPresent) {
    throw new Error("Authorize URL missing client_id.")
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
    builder: "urlsearchparams",
  })

  const basic = Buffer.from(
    `${ebayClientId()}:${ebayClientSecret()}`
  ).toString("base64")

  // URLSearchParams correctly encodes authorization codes that contain # ^ etc.
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
