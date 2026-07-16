import { NextRequest, NextResponse } from "next/server"
import { exchangeWhatnotCode } from "@/lib/marketplaces/adapters/whatnot/oauth"
import { PRODUCTION_APP_URL } from "@/lib/app-url"
import { checkSubscriptionAccess } from "@/lib/billing/access"
import {
  assertCookieMatchesQueryState,
  clearOAuthStateCookie,
  consumeOAuthStateRaw,
} from "@/lib/marketplaces/oauth-state"
import { saveConnection } from "@/lib/marketplaces/connections/store"
import { getServerAuthUser } from "@/lib/supabase/index"

export const runtime = "nodejs"

function redirectWith(status: "connected" | "error", message?: string) {
  const url = new URL("/dashboard/connections", PRODUCTION_APP_URL)
  url.searchParams.set("whatnot", status)
  if (message) url.searchParams.set("message", message.slice(0, 240))
  const response = NextResponse.redirect(url)
  clearOAuthStateCookie(response)
  return response
}

export async function GET(request: NextRequest) {
  const user = await getServerAuthUser()
  const access = await checkSubscriptionAccess(user?.id)
  if (!access.allowed) {
    return redirectWith(
      "error",
      "Start your 7-day free trial to unlock this feature."
    )
  }

  const { searchParams } = request.nextUrl
  const error = searchParams.get("error")
  const errorDescription = searchParams.get("error_description")
  if (error) {
    return redirectWith("error", errorDescription || error)
  }

  const code = searchParams.get("code")
  let state = searchParams.get("state")
  if (!code) {
    return redirectWith("error", "Missing OAuth code or state from Whatnot.")
  }

  try {
    const cookieValue = await consumeOAuthStateRaw()
    const parsed = assertCookieMatchesQueryState(cookieValue, state, "whatnot")
    if (!state) state = parsed.nonce

    const tokens = await exchangeWhatnotCode(code)
    const now = new Date().toISOString()
    await saveConnection({
      marketplaceId: "whatnot",
      authMethod: "oauth",
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: new Date(Date.now() + tokens.expiresIn * 1000).toISOString(),
      accountLabel: "Whatnot seller",
      connectedAt: now,
      updatedAt: now,
    })
    return redirectWith("connected")
  } catch (err) {
    return redirectWith(
      "error",
      err instanceof Error ? err.message : "Whatnot OAuth failed."
    )
  }
}
