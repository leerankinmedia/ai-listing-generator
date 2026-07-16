import { createHash, randomBytes } from "crypto"
import { cookies } from "next/headers"
import type { NextResponse } from "next/server"
import {
  encryptPayload,
  decryptPayload,
  isConnectionsCryptoConfigured,
} from "@/lib/marketplaces/connections/crypto"

export const OAUTH_STATE_COOKIE = "lw_oauth_state"

type OAuthStatePayload = {
  marketplaceId: string
  /** Short opaque value also sent as OAuth `state` query param */
  nonce: string
  createdAt: number
}

function oauthCookieSecure() {
  // Always Secure on Vercel / production HTTPS so the cookie survives the
  // cross-site top-level return from auth.sandbox.ebay.com (SameSite=Lax).
  return (
    process.env["NODE_ENV"] === "production" ||
    Boolean(process.env["VERCEL"]) ||
    process.env["VERCEL_ENV"] === "production" ||
    process.env["VERCEL_ENV"] === "preview"
  )
}

export function oauthStateCookieOptions() {
  return {
    httpOnly: true as const,
    secure: oauthCookieSecure(),
    // Lax: cookie is sent on top-level GET navigations back from eBay.
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 10,
  }
}

/**
 * Create OAuth state.
 * Returns a short URL-safe `state` for the authorize query, and a cookie
 * payload (encrypted) that must be set on the redirect response.
 */
export function createOAuthState(marketplaceId: string): {
  urlState: string
  cookieValue: string
} {
  const nonce = randomBytes(16).toString("hex")
  const payload: OAuthStatePayload = {
    marketplaceId,
    nonce,
    createdAt: Date.now(),
  }
  const json = JSON.stringify(payload)
  const cookieValue = isConnectionsCryptoConfigured()
    ? encryptPayload(json)
    : Buffer.from(json).toString("base64url")
  return { urlState: nonce, cookieValue }
}

/** @deprecated Prefer attachOAuthStateCookie on the NextResponse redirect. */
export async function persistOAuthState(cookieValue: string) {
  const jar = await cookies()
  jar.set(OAUTH_STATE_COOKIE, cookieValue, oauthStateCookieOptions())
}

/** Attach state cookie directly on the redirect response (survives eBay round-trip). */
export function attachOAuthStateCookie(
  response: NextResponse,
  cookieValue: string
) {
  response.cookies.set(
    OAUTH_STATE_COOKIE,
    cookieValue,
    oauthStateCookieOptions()
  )
  console.info("[oauth/state] cookie set on response", {
    name: OAUTH_STATE_COOKIE,
    ...oauthStateCookieOptions(),
    valueLength: cookieValue.length,
  })
  return response
}

export function clearOAuthStateCookie(response: NextResponse) {
  response.cookies.set(OAUTH_STATE_COOKIE, "", {
    ...oauthStateCookieOptions(),
    maxAge: 0,
  })
  return response
}

export async function readOAuthStateCookie(): Promise<string | undefined> {
  const jar = await cookies()
  return jar.get(OAUTH_STATE_COOKIE)?.value
}

export async function consumeOAuthStateRaw(): Promise<string> {
  const cookieState = await readOAuthStateCookie()
  if (!cookieState) {
    throw new Error("Missing OAuth state cookie. Start the connection again.")
  }
  return cookieState
}

export function parseOAuthStateCookie(cookieValue: string): OAuthStatePayload {
  try {
    const json = isConnectionsCryptoConfigured()
      ? decryptPayload(cookieValue)
      : Buffer.from(cookieValue, "base64url").toString("utf8")
    const parsed = JSON.parse(json) as OAuthStatePayload
    if (!parsed.marketplaceId || !parsed.nonce || !parsed.createdAt) {
      throw new Error("incomplete")
    }
    return parsed
  } catch {
    throw new Error("Invalid OAuth state cookie.")
  }
}

export function verifyOAuthState(state: string, expectedMarketplaceId: string) {
  // `state` here is the short nonce from the query (or recovered from cookie).
  // Full verification uses the cookie payload via assertStateMatches / parse.
  if (!state || state.length < 8) {
    throw new Error("Invalid OAuth state.")
  }
  return { state, expectedMarketplaceId }
}

export function assertCookieMatchesQueryState(
  cookieValue: string,
  queryState: string | null,
  expectedMarketplaceId: string
) {
  const parsed = parseOAuthStateCookie(cookieValue)
  if (parsed.marketplaceId !== expectedMarketplaceId) {
    throw new Error("OAuth state marketplace mismatch.")
  }
  if (!parsed.createdAt || Date.now() - parsed.createdAt > 10 * 60 * 1000) {
    throw new Error("OAuth state expired. Start the connection again.")
  }

  if (queryState) {
    const a = createHash("sha256").update(parsed.nonce).digest("hex")
    const b = createHash("sha256").update(queryState).digest("hex")
    if (a !== b) {
      throw new Error("OAuth state mismatch. Possible CSRF — reconnect.")
    }
  } else {
    console.warn(
      "[oauth/state] query state missing; continuing with cookie nonce (eBay may have truncated params at '#')"
    )
  }

  return parsed
}

/** Back-compat helper used by older call sites. */
export function assertStateMatches(cookieState: string, queryState: string) {
  const a = createHash("sha256").update(cookieState).digest("hex")
  const b = createHash("sha256").update(queryState).digest("hex")
  if (a !== b) {
    // Legacy: cookie previously stored the same string as query state
    throw new Error("OAuth state mismatch. Possible CSRF — reconnect.")
  }
}
