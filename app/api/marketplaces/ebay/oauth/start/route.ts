import { NextRequest, NextResponse } from "next/server"
import {
  buildEbayAuthorizeUrl,
  ebayClientId,
  isEbayConfigured,
} from "@/lib/marketplaces/adapters/ebay/oauth"
import {
  PRODUCTION_APP_URL,
  PRODUCTION_HOST,
  isCanonicalProductionHost,
  isLocalAppHost,
  isVercelDeploymentHost,
  toCanonicalProductionUrl,
} from "@/lib/app-url"
import { checkMarketplaceConnectionAccess } from "@/lib/billing/access"
import { resolveIsPermanentOwner } from "@/lib/billing/owner-resolve"
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

    // Bounce off temporary deployment hosts so the state cookie is set on the
    // canonical production host (must match RuName Auth Accepted URL).
    // Preserve search explicitly; never use cacheable 308.
    if (
      !isLocalAppHost(host) &&
      !isCanonicalProductionHost(host) &&
      isVercelDeploymentHost(host)
    ) {
      const originalSearch = request.nextUrl.search
      const to = toCanonicalProductionUrl(
        `${request.nextUrl.pathname}${originalSearch}`
      )
      console.info("[ebay/oauth] start → canonical host", {
        from: host,
        toHost: PRODUCTION_HOST,
        to,
        queryPreserved: to.includes(originalSearch || "") || !originalSearch,
        redirected: true,
      })
      return NextResponse.redirect(to, 307)
    }

    const user = await getServerAuthUser()
    if (!user?.id) {
      return NextResponse.json(
        {
          error: "Sign in required to connect a marketplace.",
          code: "unauthorized",
        },
        { status: 401 }
      )
    }

    // Owner must always reach the eBay authorize redirect — resolve before any
    // subscription/trial helper that could return trial_expired.
    const isOwner = await resolveIsPermanentOwner(user)
    if (!isOwner) {
      const gate = await checkMarketplaceConnectionAccess(user)
      if (!gate.ok) {
        return NextResponse.json(gate.body, { status: gate.status })
      }
    } else {
      console.info("[ebay/oauth] Owner bypass — skipping subscription gate", {
        userId: user.id,
        hasSessionEmail: Boolean(user.email),
      })
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
            "eBay is not configured. Set EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, and EBAY_REDIRECT_URI.",
        },
        { status: 503 }
      )
    }

    const { urlState, cookieValue } = createOAuthState("ebay")
    // Official ebay-oauth-nodejs-client builder (+ start checks logged inside).
    const authorizeUrl = buildEbayAuthorizeUrl(urlState)

    // Set Location manually so Next validateURL()/URL() cannot alter encoding.
    const response = new NextResponse(null, { status: 302 })
    response.headers.set("Location", authorizeUrl)
    attachOAuthStateCookie(response, cookieValue)

    const location = response.headers.get("Location") || ""
    const loc = new URL(location)
    const locQuery = location.split("?")[1] || ""
    const locScope = locQuery.match(/(?:^|&)scope=([^&]*)/)
    const clientId = ebayClientId()
    const clientIdRedacted =
      clientId.length <= 6 ? `***${clientId}` : `***${clientId.slice(-6)}`
    console.info("[ebay/oauth] TEMP Location header consent URL (client_id redacted)", {
      temporary: true,
      purpose: "confirm browser redirect matches generated authorize URL",
      completeAuthorizeUrlRedacted: location.replace(
        `client_id=${clientId}`,
        `client_id=${clientIdRedacted}`
      ),
      endpoint: `${loc.origin}${loc.pathname}`,
      redirect_uri: loc.searchParams.get("redirect_uri"),
      response_type: loc.searchParams.get("response_type"),
      scope_exact: locScope ? locScope[1] : null,
      state_present: Boolean(loc.searchParams.get("state")),
      state_length: loc.searchParams.get("state")?.length ?? 0,
      param_names: Array.from(loc.searchParams.keys()),
      locationMatchesAuthorize: location === authorizeUrl,
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
