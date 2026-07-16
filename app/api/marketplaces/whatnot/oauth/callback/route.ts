import { NextResponse } from "next/server"
import { exchangeWhatnotCode } from "@/lib/marketplaces/adapters/whatnot/oauth"
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

function redirectWith(
  request: Request,
  status: "connected" | "error",
  message?: string
) {
  let base = resolveRequestAppBaseUrl(request)
  if (
    isLocalAppHost(base) ||
    process.env["VERCEL_ENV"] === "production"
  ) {
    base = PRODUCTION_APP_URL
  }
  const url = new URL("/dashboard/connections", base)
  url.searchParams.set("whatnot", status)
  if (message) url.searchParams.set("message", message.slice(0, 240))
  return NextResponse.redirect(url)
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
    return redirectWith(
      request,
      "error",
      "Missing OAuth code or state from Whatnot."
    )
  }

  try {
    const cookieState = await consumeOAuthStateRaw()
    assertStateMatches(cookieState, state)
    verifyOAuthState(state, "whatnot")

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
    return redirectWith(request, "connected")
  } catch (err) {
    return redirectWith(
      request,
      "error",
      err instanceof Error ? err.message : "Whatnot OAuth failed."
    )
  }
}
