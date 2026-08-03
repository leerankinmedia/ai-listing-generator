import { createHash, randomBytes } from "crypto"
import { cookies } from "next/headers"
import type { NextRequest, NextResponse } from "next/server"
import {
  encryptPayload,
  decryptPayloadWithFallback,
  isConnectionsCryptoConfigured,
} from "@/lib/marketplaces/connections/crypto"

export const OAUTH_STATE_COOKIE = "lw_oauth_state"

/** Legacy URL `state` was a 32-char hex nonce; payload state is longer. */
const LEGACY_NONCE_RE = /^[a-f0-9]{32}$/i

type OAuthStatePayload = {
  marketplaceId: string
  /** Short opaque value used for CSRF binding */
  nonce: string
  createdAt: number
}

function oauthCookieSecure() {
  // Always Secure on Vercel / production HTTPS so the cookie can use
  // SameSite=None and survive the cross-site return from auth.ebay.com.
  return (
    process.env["NODE_ENV"] === "production" ||
    Boolean(process.env["VERCEL"]) ||
    process.env["VERCEL_ENV"] === "production" ||
    process.env["VERCEL_ENV"] === "preview"
  )
}

export function oauthStateCookieOptions() {
  const secure = oauthCookieSecure()
  return {
    httpOnly: true as const,
    secure,
    // None+Secure: cookie set via credentialed fetch() must still be included
    // when eBay top-level-redirects back to /api/ebay/callback. Lax is often
    // enough for top-level GET, but fetch-set cookies are flaky with Lax on
    // some browsers after a cross-site authorize round-trip.
    // Local http://localhost cannot use None (requires Secure) → Lax.
    sameSite: (secure ? "none" : "lax") as "none" | "lax",
    path: "/",
    maxAge: 60 * 10,
    // Host-only (no Domain) so production alias and callback share the cookie.
  }
}

/**
 * Create OAuth state.
 *
 * `urlState` is the encrypted payload (same value as the cookie). Connect uses
 * fetch() + JSON authorizeUrl, so the browser may drop `lw_oauth_state` before
 * eBay returns — putting the payload in `state=` lets the callback verify
 * without the cookie. Cookie remains a double-submit when present.
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
  return { urlState: cookieValue, cookieValue }
}

/** @deprecated Prefer attachOAuthStateCookie on the NextResponse redirect. */
export async function persistOAuthState(cookieValue: string) {
  const jar = await cookies()
  jar.set(OAUTH_STATE_COOKIE, cookieValue, oauthStateCookieOptions())
}

/** Attach state cookie directly on the redirect/JSON response. */
export function attachOAuthStateCookie(
  response: NextResponse,
  cookieValue: string
) {
  const opts = oauthStateCookieOptions()
  response.cookies.set(OAUTH_STATE_COOKIE, cookieValue, opts)
  console.info("[oauth/state] cookie set on response", {
    name: OAUTH_STATE_COOKIE,
    httpOnly: opts.httpOnly,
    secure: opts.secure,
    sameSite: opts.sameSite,
    path: opts.path,
    maxAge: opts.maxAge,
    domain: "(host-only)",
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

/** Prefer the incoming request cookie jar (survives middleware better). */
export function readOAuthStateCookieFromRequest(
  request: NextRequest
): string | undefined {
  return request.cookies.get(OAUTH_STATE_COOKIE)?.value
}

export async function readOAuthStateCookie(): Promise<string | undefined> {
  const jar = await cookies()
  return jar.get(OAUTH_STATE_COOKIE)?.value
}

export async function consumeOAuthStateRaw(
  request?: NextRequest
): Promise<string> {
  const cookieState =
    (request ? readOAuthStateCookieFromRequest(request) : undefined) ||
    (await readOAuthStateCookie())
  if (!cookieState) {
    throw new Error("Missing OAuth state cookie. Start the connection again.")
  }
  return cookieState
}

export function parseOAuthStateCookie(cookieValue: string): OAuthStatePayload {
  try {
    const json = isConnectionsCryptoConfigured()
      ? decryptPayloadWithFallback(cookieValue)
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

function assertPayloadFresh(
  parsed: OAuthStatePayload,
  expectedMarketplaceId: string
) {
  if (parsed.marketplaceId !== expectedMarketplaceId) {
    throw new Error("OAuth state marketplace mismatch.")
  }
  if (!parsed.createdAt || Date.now() - parsed.createdAt > 10 * 60 * 1000) {
    throw new Error("OAuth state expired. Start the connection again.")
  }
  return parsed
}

/**
 * Verify OAuth state from cookie and/or query `state`.
 *
 * Current flow: query `state` IS the encrypted cookie payload. Cookie is
 * optional; when both are present they must match.
 * Legacy flow: query `state` is a 32-char nonce; cookie holds the payload.
 */
export function resolveAndAssertOAuthState(
  cookieValue: string | undefined,
  queryState: string | null,
  expectedMarketplaceId: string
): OAuthStatePayload {
  const legacyNonce =
    Boolean(queryState) && LEGACY_NONCE_RE.test(queryState || "")

  // Current: payload in URL (and optionally mirrored in cookie).
  if (queryState && !legacyNonce) {
    const parsed = assertPayloadFresh(
      parseOAuthStateCookie(queryState),
      expectedMarketplaceId
    )
    if (cookieValue && cookieValue !== queryState) {
      // Cookie present but differs — require same nonce (CSRF double-submit).
      const fromCookie = parseOAuthStateCookie(cookieValue)
      if (fromCookie.nonce !== parsed.nonce) {
        throw new Error("OAuth state mismatch. Possible CSRF — reconnect.")
      }
    }
    return parsed
  }

  // Legacy: nonce in URL, payload only in cookie.
  if (!cookieValue) {
    throw new Error("Missing OAuth state cookie. Start the connection again.")
  }
  return assertCookieMatchesQueryState(
    cookieValue,
    queryState,
    expectedMarketplaceId
  )
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
  const parsed = assertPayloadFresh(
    parseOAuthStateCookie(cookieValue),
    expectedMarketplaceId
  )

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
