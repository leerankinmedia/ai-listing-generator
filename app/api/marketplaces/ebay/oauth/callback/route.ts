import { NextResponse } from "next/server"
import { exchangeEbayCode } from "@/lib/marketplaces/adapters/ebay/oauth"
import {
  PRODUCTION_APP_URL,
  isLocalAppHost,
  resolveRequestAppBaseUrl,
} from "@/lib/app-url"
import { checkSubscriptionAccess } from "@/lib/billing/access"
import { saveConnection } from "@/lib/marketplaces/connections/store"
import {
  assertStateMatches,
  consumeOAuthStateRaw,
  verifyOAuthState,
} from "@/lib/marketplaces/oauth-state"
import { getServerAuthUser } from "@/lib/supabase/index"

export const runtime = "nodejs"

function postOAuthConnectionsUrl(
  request: Request,
  status: "connected" | "error",
  message?: string
) {
  let base = resolveRequestAppBaseUrl(request)

  // Hard guarantee: never send users to localhost after eBay OAuth.
  // On Vercel Production, always use the canonical ListWise origin.
  if (
    isLocalAppHost(base) ||
    process.env["VERCEL_ENV"] === "production"
  ) {
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
  return NextResponse.redirect(postOAuthConnectionsUrl(request, status, message))
}

export async function GET(request: Request) {
  const user = await getServerAuthUser()
  const access = await checkSubscriptionAccess(user?.id)
  if (!access.allowed) {
    return redirectWith(
      request,
      "error",
      "Start your 7-day free trial to unlock this feature."
    )
  }

  const { searchParams } = new URL(request.url)
  const error = searchParams.get("error")
  const errorDescription = searchParams.get("error_description")
  if (error) {
    return redirectWith(request, "error", errorDescription || error)
  }

  const code = searchParams.get("code")
  const state = searchParams.get("state")
  if (!code || !state) {
    return redirectWith(request, "error", "Missing OAuth code or state from eBay.")
  }

  try {
    const cookieState = await consumeOAuthStateRaw()
    assertStateMatches(cookieState, state)
    verifyOAuthState(state, "ebay")

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
