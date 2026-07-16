import { NextRequest, NextResponse } from "next/server"
import {
  buildEbayAuthorizeUrl,
  isEbayConfigured,
} from "@/lib/marketplaces/adapters/ebay/oauth"
import {
  PRODUCTION_APP_URL,
  isCanonicalProductionHost,
  isLocalAppHost,
  isVercelDeploymentHost,
  toCanonicalProductionUrl,
} from "@/lib/app-url"
import { checkSubscriptionAccess } from "@/lib/billing/access"
import { isConnectionsCryptoConfigured } from "@/lib/marketplaces/connections/crypto"
import {
  attachOAuthStateCookie,
  createOAuthState,
} from "@/lib/marketplaces/oauth-state"
import { getServerAuthUser } from "@/lib/supabase/index"

export const runtime = "nodejs"

function requestHost(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-host")
  if (forwarded) return forwarded.split(",")[0].trim()
  return request.headers.get("host") || request.nextUrl.host
}

export async function GET(request: NextRequest) {
  try {
    const host = requestHost(request)

    // Only bounce off temporary deployment hosts (never 308 — browsers cache those).
    // Skip when already on canonical production or localhost.
    if (
      !isLocalAppHost(host) &&
      !isCanonicalProductionHost(host) &&
      isVercelDeploymentHost(host)
    ) {
      const to = toCanonicalProductionUrl(
        `${request.nextUrl.pathname}${request.nextUrl.search}`
      )
      console.info("[ebay/oauth] start → canonical host", { from: host, to })
      return NextResponse.redirect(to, 307)
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
    const authorizeUrl = buildEbayAuthorizeUrl(urlState)

    // Set Location manually so Next validateURL()/URL() cannot alter encoding.
    const response = new NextResponse(null, { status: 302 })
    response.headers.set("Location", authorizeUrl)
    attachOAuthStateCookie(response, cookieValue)

    console.info("[ebay/oauth] start redirect to eBay OAuth", {
      host,
      appOrigin: PRODUCTION_APP_URL,
      flow: "oauth2_authorization_code",
      locationMatchesAuthorize: response.headers.get("Location") === authorizeUrl,
    })

    return response
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
