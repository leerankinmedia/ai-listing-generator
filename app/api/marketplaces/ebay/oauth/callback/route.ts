import { NextRequest, NextResponse } from "next/server"
import { exchangeEbayCode } from "@/lib/marketplaces/adapters/ebay/oauth"
import {
  PRODUCTION_APP_URL,
  isCanonicalProductionHost,
  isLocalAppHost,
  isVercelDeploymentHost,
  toCanonicalProductionUrl,
} from "@/lib/app-url"
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

function postOAuthConnectionsUrl(
  status: "connected" | "error",
  message?: string
) {
  // Always canonical production — never deployment-specific VERCEL_URL.
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
  const searchParams = request.nextUrl.searchParams
  const paramNames = Array.from(searchParams.keys())

  console.info("[ebay/oauth] callback request", {
    flow: "oauth2_authorization_code",
    host: request.nextUrl.host,
    pathname: request.nextUrl.pathname,
    searchLength: request.nextUrl.search.length,
    paramNames,
    codePresent: searchParams.has("code"),
    statePresent: searchParams.has("state"),
    errorPresent: searchParams.has("error"),
    errorDescriptionPresent: searchParams.has("error_description"),
    hasCookie: Boolean(await readOAuthStateCookie()),
    referer: request.headers.get("referer") || null,
    xForwardedHost: request.headers.get("x-forwarded-host") || null,
  })

  // If eBay hit a deployment-specific *.vercel.app host, bounce to canonical
  // production WHILE PRESERVING ?code=&state= (use 307 — never cacheable 308).
  const forwarded =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    request.headers.get("host") ||
    request.nextUrl.host
  if (
    !isLocalAppHost(forwarded) &&
    !isCanonicalProductionHost(forwarded) &&
    isVercelDeploymentHost(forwarded)
  ) {
    const to = toCanonicalProductionUrl(
      `${request.nextUrl.pathname}${request.nextUrl.search}`
    )
    console.info("[ebay/oauth] callback → canonical host (preserving query)", {
      from: forwarded,
      to,
      paramNames,
    })
    return NextResponse.redirect(to, 307)
  }

  const user = await getServerAuthUser()
  const access = await checkSubscriptionAccess(user?.id)
  if (!access.allowed) {
    return redirectWith(
      "error",
      "Start your 7-day free trial to unlock this feature."
    )
  }

  const error = searchParams.get("error")
  const errorDescription = searchParams.get("error_description")
  if (error) {
    return redirectWith("error", errorDescription || error)
  }

  let code = searchParams.get("code")
  let state = searchParams.get("state")

  if (!code || !state) {
    return redirectWith(
      "error",
      !paramNames.length
        ? "eBay returned to the callback with no OAuth parameters. Confirm the Sandbox RuName is OAuth-enabled (not Auth'n'Auth) and Auth Accepted URL is exactly https://ai-listing-generator-n2ji.vercel.app/api/marketplaces/ebay/oauth/callback"
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
