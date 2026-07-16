import { NextRequest, NextResponse } from "next/server"
import { exchangeEbayCode } from "@/lib/marketplaces/adapters/ebay/oauth"
import {
  PRODUCTION_APP_URL,
  isLocalAppHost,
  resolveRequestAppBaseUrl,
} from "@/lib/app-url"
import { checkSubscriptionAccess } from "@/lib/billing/access"
import {
  ebayCallbackBridgeHtml,
  inspectEbayCallbackSearchParams,
  logEbayCallbackParams,
} from "@/lib/marketplaces/ebay-callback-params"
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
  request: Request,
  status: "connected" | "error",
  message?: string
) {
  let base = resolveRequestAppBaseUrl(request)

  if (isLocalAppHost(base) || process.env["VERCEL_ENV"] === "production") {
    base = PRODUCTION_APP_URL
  }

  const url = new URL("/dashboard/connections", base)
  url.searchParams.set("ebay", status)
  if (message) url.searchParams.set("message", message.slice(0, 240))

  console.info("[ebay/oauth] post-OAuth redirect", {
    base,
    path: "/dashboard/connections",
    status,
    location: url.toString(),
  })

  return url
}

function redirectWith(
  request: Request,
  status: "connected" | "error",
  message?: string
) {
  const response = NextResponse.redirect(
    postOAuthConnectionsUrl(request, status, message)
  )
  clearOAuthStateCookie(response)
  return response
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const presence = inspectEbayCallbackSearchParams(
    request.url,
    searchParams
  )
  logEbayCallbackParams(presence)

  const cookiePresent = Boolean(await readOAuthStateCookie())
  console.info("[ebay/oauth] callback cookie", {
    name: "lw_oauth_state",
    present: cookiePresent,
    host: presence.host,
    secureExpected:
      process.env["NODE_ENV"] === "production" || Boolean(process.env["VERCEL"]),
    sameSite: "lax",
    path: "/",
  })

  const user = await getServerAuthUser()
  const access = await checkSubscriptionAccess(user?.id)
  if (!access.allowed) {
    return redirectWith(
      request,
      "error",
      "Start your 7-day free trial to unlock this feature."
    )
  }

  const error = searchParams.get("error")
  const errorDescription = searchParams.get("error_description")
  if (error) {
    return redirectWith(request, "error", errorDescription || error)
  }

  let code = searchParams.get("code")
  let state = searchParams.get("state")
  const bridged = searchParams.get("bridged") === "1"

  // If the server saw no `code`, eBay may have put params behind an unencoded `#`
  // (browser strips the fragment). Serve a one-time HTML bridge to recover from href.
  if (!code && !bridged) {
    console.warn(
      "[ebay/oauth] missing code on server request — serving temporary browser bridge",
      {
        codePresent: false,
        statePresent: Boolean(state),
        cookiePresent,
        paramNames: presence.paramNames,
      }
    )
    return new NextResponse(
      ebayCallbackBridgeHtml("/api/marketplaces/ebay/oauth/callback"),
      {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        },
      }
    )
  }

  if (!code) {
    return redirectWith(
      request,
      "error",
      "Missing OAuth code from eBay. Confirm the Sandbox RuName Auth Accepted URL is https://ai-listing-generator-n2ji.vercel.app/api/marketplaces/ebay/oauth/callback"
    )
  }

  if (!state) {
    console.warn(
      "[ebay/oauth] query state missing after eBay return; will use lw_oauth_state cookie nonce if present"
    )
  }

  // Prefer query state; if eBay dropped it, cookie nonce still authorizes the exchange.
  try {
    const cookieValue = await consumeOAuthStateRaw()
    const parsed = assertCookieMatchesQueryState(cookieValue, state, "ebay")
    if (!state) {
      state = parsed.nonce
    }

    // eBay sometimes returns still-encoded code values
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
    return redirectWith(request, "connected")
  } catch (err) {
    return redirectWith(
      request,
      "error",
      err instanceof Error ? err.message : "eBay OAuth failed."
    )
  }
}
