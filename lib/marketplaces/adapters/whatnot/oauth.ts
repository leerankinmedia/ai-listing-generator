/**
 * Whatnot Seller API OAuth (authorization code grant).
 * Docs: https://developers.whatnot.com/docs/getting-started/authentication
 * GraphQL: https://developers.whatnot.com/docs/getting-started/introduction
 *
 * Endpoint paths under /seller-api/rest/oauth/* are the live Seller API REST
 * surface (authorize returns HTTP 400 without params; /oauth/authorize is 404).
 * Exact sample URLs in Magidoc are rendered client-side; paths verified against
 * stage/production hosts.
 *
 * Access note: Seller API is Developer Preview. Official docs state Whatnot is
 * not accepting new applicants at this time.
 */
import { getAppBaseUrl } from "@/lib/marketplaces/connections/crypto"

export function isWhatnotConfigured() {
  return Boolean(
    process.env.WHATNOT_CLIENT_ID && process.env.WHATNOT_CLIENT_SECRET
  )
}

export function whatnotEnv(): "stage" | "live" {
  return process.env.WHATNOT_ENV === "live" ? "live" : "stage"
}

export function whatnotSellerApiBase() {
  return whatnotEnv() === "live"
    ? "https://api.whatnot.com/seller-api"
    : "https://api.stage.whatnot.com/seller-api"
}

export function whatnotRedirectUri() {
  return (
    process.env.WHATNOT_REDIRECT_URI ||
    `${getAppBaseUrl()}/api/marketplaces/whatnot/oauth/callback`
  )
}

export const WHATNOT_SCOPES = ["read:inventory", "write:inventory"]

export function buildWhatnotAuthorizeUrl(state: string) {
  if (!isWhatnotConfigured()) {
    throw new Error(
      "Whatnot is not configured. Set WHATNOT_CLIENT_ID and WHATNOT_CLIENT_SECRET."
    )
  }
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.WHATNOT_CLIENT_ID!,
    redirect_uri: whatnotRedirectUri(),
    scope: WHATNOT_SCOPES.join(" "),
    state,
  })
  return `${whatnotSellerApiBase()}/rest/oauth/authorize?${params.toString()}`
}

export async function exchangeWhatnotCode(code: string) {
  if (!isWhatnotConfigured()) {
    throw new Error("Whatnot app credentials are not configured.")
  }
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: whatnotRedirectUri(),
    client_id: process.env.WHATNOT_CLIENT_ID!,
    client_secret: process.env.WHATNOT_CLIENT_SECRET!,
  })

  const response = await fetch(`${whatnotSellerApiBase()}/rest/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  })
  const payload = await response.json()
  if (!response.ok) {
    throw new Error(
      payload.error_description ||
        payload.error ||
        `Whatnot token exchange failed (${response.status})`
    )
  }
  return {
    accessToken: payload.access_token as string,
    refreshToken: payload.refresh_token as string | undefined,
    expiresIn: Number(payload.expires_in ?? 3600),
  }
}

export async function refreshWhatnotToken(refreshToken: string) {
  if (!isWhatnotConfigured()) {
    throw new Error("Whatnot app credentials are not configured.")
  }
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: process.env.WHATNOT_CLIENT_ID!,
    client_secret: process.env.WHATNOT_CLIENT_SECRET!,
  })
  const response = await fetch(`${whatnotSellerApiBase()}/rest/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  })
  const payload = await response.json()
  if (!response.ok) {
    throw new Error(
      payload.error_description ||
        payload.error ||
        `Whatnot token refresh failed (${response.status})`
    )
  }
  return {
    accessToken: payload.access_token as string,
    refreshToken: (payload.refresh_token as string | undefined) ?? refreshToken,
    expiresIn: Number(payload.expires_in ?? 3600),
  }
}

export async function whatnotGraphql<T>(
  accessToken: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const response = await fetch(`${whatnotSellerApiBase()}/graphql`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ query, variables }),
  })
  const payload = await response.json()
  if (!response.ok || payload.errors?.length) {
    const message =
      payload.errors?.[0]?.message ||
      `Whatnot GraphQL error (${response.status})`
    throw new Error(message)
  }
  return payload.data as T
}
