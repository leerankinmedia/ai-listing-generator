import { NextRequest, NextResponse } from "next/server"
import {
  buildEbayAuthorizeUrl,
  isEbayConfigured,
} from "@/lib/marketplaces/adapters/ebay/oauth"
import {
  PRODUCTION_APP_URL,
  canonicalProductionRedirectIfNeeded,
} from "@/lib/app-url"
import { checkSubscriptionAccess } from "@/lib/billing/access"
import { isConnectionsCryptoConfigured } from "@/lib/marketplaces/connections/crypto"
import {
  attachOAuthStateCookie,
  createOAuthState,
} from "@/lib/marketplaces/oauth-state"
import { getServerAuthUser } from "@/lib/supabase/index"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  try {
    // eBay OAuth must start on the canonical production host so the state
    // cookie and RuName Auth Accepted URL share one domain.
    const canonical = canonicalProductionRedirectIfNeeded(request)
    if (canonical) {
      console.info("[ebay/oauth] start → canonical host", {
        from: request.nextUrl.host,
        to: canonical,
      })
      return NextResponse.redirect(canonical, 308)
    }

    const user = await getServerAuthUser()
    const access = await checkSubscriptionAccess(user?.id)
    if (!access.allowed) {
      return NextResponse.json(
        {
          error: "Start your 7-day free trial to unlock this feature.",
          code: "subscription_required",
        },
        { status: 402 }
      )
    }

    if (!isConnectionsCryptoConfigured()) {
      return NextResponse.json(
        {
          error:
            "CONNECTIONS_SECRET is required before connecting marketplaces.",
        },
        { status: 503 }
      )
    }
    if (!isEbayConfigured()) {
      return NextResponse.json(
        {
          error:
            "eBay is not configured. Set EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, and EBAY_RU_NAME.",
        },
        { status: 503 }
      )
    }

    const { urlState, cookieValue } = createOAuthState("ebay")
    const url = buildEbayAuthorizeUrl(urlState)
    const response = NextResponse.redirect(url)
    console.info("[ebay/oauth] start redirect to eBay OAuth", {
      host: request.nextUrl.host,
      appOrigin: PRODUCTION_APP_URL,
      flow: "oauth2_authorization_code",
    })
    return attachOAuthStateCookie(response, cookieValue)
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to start eBay OAuth.",
      },
      { status: 500 }
    )
  }
}
