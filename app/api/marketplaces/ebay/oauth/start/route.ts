import { NextRequest, NextResponse } from "next/server"
import {
  buildEbayAuthorizeUrl,
  ebayClientId,
  isEbayConfigured,
} from "@/lib/marketplaces/adapters/ebay/oauth"
import {
  PRODUCTION_HOST,
  isCanonicalProductionHost,
  isLocalAppHost,
  isVercelDeploymentHost,
  toCanonicalProductionUrl,
} from "@/lib/app-url"
import { getEntitlement } from "@/lib/billing/entitlement"
import { resolveIsPermanentOwnerDetailed } from "@/lib/billing/owner-resolve"
import { isConnectionsCryptoConfigured } from "@/lib/marketplaces/connections/crypto"
import {
  attachOAuthStateCookie,
  createOAuthState,
} from "@/lib/marketplaces/oauth-state"
import { getServerAuthUser } from "@/lib/supabase/index"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function requestHost(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-host")
  if (forwarded) return forwarded.split(",")[0].trim()
  return request.headers.get("host") || request.nextUrl.host
}

function noStoreJson(
  body: Record<string, unknown>,
  status: number
): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0, must-revalidate",
    },
  })
}

/**
 * eBay Connect with OAuth — /api/marketplaces/ebay/oauth/start
 *
 * trial_expired is returned ONLY from this GET handler (below) when the user
 * is not the permanent Owner and getEntitlement().status === "expired".
 * Owner is resolved before that deny so Founder accounts never hit it.
 */
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
      return noStoreJson(
        {
          error: "Sign in required to connect a marketplace.",
          code: "unauthorized",
        },
        401
      )
    }

    // Owner first — never fall through to trial_expired for Founder.
    const owner = await resolveIsPermanentOwnerDetailed(user)
    const entitlement = await getEntitlement(user.id, {
      email: user.email,
      authUser: user,
    })
    const isOwner =
      owner.isOwner ||
      entitlement.ownerOverride === true ||
      entitlement.status === "owner"

    if (!isOwner && !entitlement.allowed) {
      // Exact trial_expired emitter for Connect with OAuth:
      // file: app/api/marketplaces/ebay/oauth/start/route.ts
      // function: GET
      return noStoreJson(
        {
          error:
            entitlement.status === "expired"
              ? "Your free trial has expired. Subscribe on the Billing page to continue."
              : "Start your 7-day free trial to unlock this feature.",
          code:
            entitlement.status === "expired"
              ? "trial_expired"
              : "subscription_required",
        },
        402
      )
    }

    if (!isConnectionsCryptoConfigured()) {
      return noStoreJson(
        {
          error:
            "CONNECTIONS_SECRET is required before connecting marketplaces.",
        },
        503
      )
    }
    if (!isEbayConfigured()) {
      return noStoreJson(
        {
          error:
            "eBay is not configured. Set EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, and EBAY_REDIRECT_URI.",
        },
        503
      )
    }

    const { urlState, cookieValue } = createOAuthState("ebay")
    // Official ebay-oauth-nodejs-client builder (+ start checks logged inside).
    const authorizeUrl = buildEbayAuthorizeUrl(urlState)

    // Set Location manually so Next validateURL()/URL() cannot alter encoding.
    const response = new NextResponse(null, { status: 302 })
    response.headers.set("Location", authorizeUrl)
    response.headers.set(
      "Cache-Control",
      "private, no-store, max-age=0, must-revalidate"
    )
    attachOAuthStateCookie(response, cookieValue)

    const location = response.headers.get("Location") || ""
    const loc = new URL(location)
    const locQuery = location.split("?")[1] || ""
    const locScope = locQuery.match(/(?:^|&)scope=([^&]*)/)
    const clientId = ebayClientId()
    const clientIdRedacted =
      clientId.length <= 6 ? `***${clientId}` : `***${clientId.slice(-6)}`
    console.info("[ebay/oauth] Location header consent URL (client_id redacted)", {
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
      ownerBypass: isOwner,
      ownerVia: owner.via,
    })

    return response
  } catch (error) {
    return noStoreJson(
      {
        error:
          error instanceof Error ? error.message : "Failed to start eBay OAuth.",
      },
      500
    )
  }
}
