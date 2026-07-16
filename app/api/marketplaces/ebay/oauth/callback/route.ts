import { NextRequest, NextResponse } from "next/server"
import { exchangeEbayCode } from "@/lib/marketplaces/adapters/ebay/oauth"
import { PRODUCTION_APP_URL } from "@/lib/app-url"
import { checkSubscriptionAccess } from "@/lib/billing/access"
import {
  assertCookieMatchesQueryState,
  clearOAuthStateCookie,
  consumeOAuthStateRaw,
  readOAuthStateCookie,
} from "@/lib/marketplaces/oauth-state"
import { saveConnection } from "@/lib/marketplaces/connections/store"
import { getServerAuthUser } from "@/lib/supabase/index"

export const runtime = "nodejs"

/**
 * Read OAuth query params from nextUrl, falling back to the raw request URL.
 * Never log param values (authorization codes are secrets).
 */
function readCallbackParams(request: NextRequest) {
  const nextParams = request.nextUrl.searchParams
  const nextNames = Array.from(nextParams.keys())

  let rawNames: string[] = []
  let rawParams: URLSearchParams | null = null
  try {
    const raw = request.url
    const q = raw.indexOf("?")
    if (q >= 0) {
      // Server request URLs should not include fragments; still strip defensively.
      const query = raw.slice(q + 1).split("#")[0]
      rawParams = new URLSearchParams(query)
      rawNames = Array.from(rawParams.keys())
    }
  } catch {
    // ignore parse errors
  }

  // Prefer whichever source actually carries OAuth fields.
  const useRaw =
    (!nextParams.has("code") && !nextParams.has("error")) &&
    Boolean(rawParams && (rawParams.has("code") || rawParams.has("error")))

  const params = useRaw && rawParams ? rawParams : nextParams

  return {
    params,
    nextNames,
    rawNames,
    usedRawUrl: useRaw,
    searchLength: request.nextUrl.search.length,
  }
}

function postOAuthConnectionsUrl(
  status: "connected" | "error",
  message?: string
) {
  const url = new URL("/dashboard/connections", PRODUCTION_APP_URL)
  url.searchParams.set("ebay", status)
  if (message) url.searchParams.set("message", message.slice(0, 240))
  console.info("[ebay/oauth] post-OAuth redirect", {
    location: url.toString(),
    status,
  })
  return url
}

function redirectWith(status: "connected" | "error", message?: string) {
  const response = NextResponse.redirect(postOAuthConnectionsUrl(status, message))
  clearOAuthStateCookie(response)
  return response
}

export async function GET(request: NextRequest) {
  const { params, nextNames, rawNames, usedRawUrl, searchLength } =
    readCallbackParams(request)

  console.info("[ebay/oauth] callback request", {
    flow: "oauth2_authorization_code",
    host: request.headers.get("host"),
    xForwardedHost: request.headers.get("x-forwarded-host"),
    pathname: request.nextUrl.pathname,
    searchLength,
    nextUrlParamNames: nextNames,
    rawUrlParamNames: rawNames,
    usedRawUrl,
    codePresent: params.has("code"),
    statePresent: params.has("state"),
    errorPresent: params.has("error"),
    errorDescriptionPresent: params.has("error_description"),
    expiresInPresent: params.has("expires_in"),
    hasCookie: Boolean(await readOAuthStateCookie()),
    // No canonical-host redirect on this route — Auth Accepted URL must already
    // be the production callback so ?code=&state= are never bounced/stripped.
    canonicalRedirect: false,
  })

  const user = await getServerAuthUser()
  const access = await checkSubscriptionAccess(user?.id)
  if (!access.allowed) {
    return redirectWith(
      "error",
      "Start your 7-day free trial to unlock this feature."
    )
  }

  const error = params.get("error")
  const errorDescription = params.get("error_description")
  if (error) {
    return redirectWith("error", errorDescription || error)
  }

  let code = params.get("code")
  const state = params.get("state")
  const paramNames = Array.from(params.keys())

  if (!code || !state) {
    return redirectWith(
      "error",
      !paramNames.length
        ? "OAuth callback reached ListWise without query parameters. Check Vercel logs for [ebay/oauth] middleware entry — a redirect may have stripped ?code=&state=."
        : "Missing OAuth code or state from eBay."
    )
  }

  try {
    const cookieValue = await consumeOAuthStateRaw()
    assertCookieMatchesQueryState(cookieValue, state, "ebay")

    try {
      if (code.includes("%")) {
        code = decodeURIComponent(code)
      }
    } catch {
      // keep raw code
    }

    const tokens = await exchangeEbayCode(code)
    const now = new Date().toISOString()
    await saveConnection({
      marketplaceId: "ebay",
      authMethod: "oauth",
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: new Date(Date.now() + tokens.expiresIn * 1000).toISOString(),
      accountLabel: "eBay seller",
      connectedAt: now,
      updatedAt: now,
    })
    return redirectWith("connected")
  } catch (err) {
    return redirectWith(
      "error",
      err instanceof Error ? err.message : "eBay OAuth failed."
    )
  }
}
