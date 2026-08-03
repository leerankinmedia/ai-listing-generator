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
import { isConnectionsCryptoConfigured } from "@/lib/marketplaces/connections/crypto"
import {
  attachOAuthStateCookie,
  createOAuthState,
} from "@/lib/marketplaces/oauth-state"
import { getServerAuthUser } from "@/lib/supabase/index"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Temporary — confirm Connect hits this route handler. Remove after verification. */
const OAUTH_START_VERSION = "verify-hdr-1"

/** Exact function that can emit trial_expired for Connect with OAuth. */
const TRIAL_EXPIRED_FN =
  "app/api/marketplaces/ebay/oauth/start/route.ts:GET"

/** Same auth retrieval as /api/billing/status — do not diverge. */
const BILLING_AUTH_SOURCE =
  "getServerAuthUser() + getEntitlement(user.id, { email: user.email, authUser: user })"

function requestHost(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-host")
  if (forwarded) return forwarded.split(",")[0].trim()
  return request.headers.get("host") || request.nextUrl.host
}

function withOAuthVersionHeaders(
  headers: Record<string, string> = {}
): Record<string, string> {
  return {
    "Cache-Control": "private, no-store, max-age=0, must-revalidate",
    "X-ListWise-OAuth-Version": OAUTH_START_VERSION,
    ...headers,
  }
}

function noStoreJson(
  body: Record<string, unknown>,
  status: number,
  extraHeaders: Record<string, string> = {}
): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: withOAuthVersionHeaders(extraHeaders),
  })
}

function isDebugRequest(request: NextRequest): boolean {
  return request.nextUrl.searchParams.get("debug") === "1"
}

/**
 * eBay Connect with OAuth — /api/marketplaces/ebay/oauth/start
 *
 * Authentication MUST match /api/billing/status exactly:
 *   const user = await getServerAuthUser()
 *   const entitlement = await getEntitlement(user.id, { email: user.email, authUser: user })
 */
export async function GET(request: NextRequest) {
  const debug = isDebugRequest(request)

  try {
    const host = requestHost(request)
    const secFetchMode = request.headers.get("sec-fetch-mode")
    // Host bounce is for top-level Connect navigations only. Credentialed
    // fetch() (Compare button / Connect via XHR) must not 307 cross-host —
    // browsers surface that as TypeError: Failed to fetch (CORS on redirect).
    const isCredentialedFetch =
      secFetchMode === "cors" || secFetchMode === "same-origin"

    if (
      !debug &&
      !isCredentialedFetch &&
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
        redirected: true,
      })
      const redirect = NextResponse.redirect(to, 307)
      redirect.headers.set("X-ListWise-OAuth-Version", OAUTH_START_VERSION)
      return redirect
    }

    // ——— identical to app/api/billing/status/route.ts ———
    const user = await getServerAuthUser()
    if (!user?.id) {
      if (debug) {
        return noStoreJson(
          {
            temporaryDebug: true,
            authSource: BILLING_AUTH_SOURCE,
            matchesBillingStatusRoute: true,
            authenticated: false,
            isOwner: false,
            authenticatedUserId: null,
            authenticatedEmail: null,
            entitlementStatus: null,
            nextAction: "return unauthorized",
            code: "unauthorized",
          },
          200
        )
      }
      return noStoreJson(
        {
          error: "Sign in required to connect a marketplace.",
          code: "unauthorized",
        },
        401
      )
    }

    const entitlement = await getEntitlement(user.id, {
      email: user.email,
      authUser: user,
    })
    // ——— end identical billing auth block ———

    // Same Owner recognition Billing uses for Founder UI.
    const isOwner =
      entitlement.ownerOverride === true || entitlement.status === "owner"

    const wouldDenyAccess = !isOwner && !entitlement.allowed
    const denyCode = wouldDenyAccess
      ? entitlement.status === "expired"
        ? "trial_expired"
        : "subscription_required"
      : null
    const nextAction = wouldDenyAccess
      ? denyCode === "trial_expired"
        ? "return trial_expired"
        : "return subscription_required"
      : !isConnectionsCryptoConfigured()
        ? "return connections_secret_missing"
        : !isEbayConfigured()
          ? "return ebay_not_configured"
          : "redirect to eBay"

    if (debug) {
      return noStoreJson(
        {
          temporaryDebug: true,
          route: TRIAL_EXPIRED_FN,
          authSource: BILLING_AUTH_SOURCE,
          matchesBillingStatusRoute: true,
          authenticated: true,
          isOwner,
          authenticatedUserId: user.id,
          authenticatedEmail: user.email ?? null,
          entitlementStatus: entitlement.status,
          entitlementAllowed: entitlement.allowed,
          ownerOverride: entitlement.ownerOverride,
          entitlementDecidingField: entitlement.debug.decidingField,
          deniedByFunction: wouldDenyAccess ? TRIAL_EXPIRED_FN : null,
          nextAction,
          wouldReturnCode: denyCode,
          responseHeaders: {
            "X-ListWise-OAuth-Version": OAUTH_START_VERSION,
            "X-ListWise-Deny-Fn": wouldDenyAccess ? TRIAL_EXPIRED_FN : null,
            "X-ListWise-Deciding-Field": wouldDenyAccess
              ? entitlement.debug.decidingField
              : null,
          },
        },
        200
      )
    }

    if (wouldDenyAccess) {
      return noStoreJson(
        {
          error:
            entitlement.status === "expired"
              ? "Your free trial has expired. Subscribe on the Billing page to continue."
              : "Start your 7-day free trial to unlock this feature.",
          code: denyCode,
        },
        402,
        {
          "X-ListWise-Deny-Fn": TRIAL_EXPIRED_FN,
          "X-ListWise-Is-Owner": "false",
          "X-ListWise-Entitlement": entitlement.status,
          "X-ListWise-Deciding-Field": entitlement.debug.decidingField,
        }
      )
    }

    if (!isConnectionsCryptoConfigured()) {
      return noStoreJson(
        {
          error:
            "Marketplace credential storage is not available. Set SUPABASE_SERVICE_ROLE_KEY (or CONNECTIONS_SECRET) on the server.",
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
    // Default: inventory publish scopes only. ?marketing=1 adds sell.marketing
    // when the seller reconnects specifically for Promoted Listings.
    const includeMarketing =
      request.nextUrl.searchParams.get("marketing") === "1" ||
      request.nextUrl.searchParams.get("includeMarketing") === "1"
    const authorizeUrl = buildEbayAuthorizeUrl(urlState, { includeMarketing })

    // Credentialed fetch() + redirect:manual cannot read a cross-origin 302
    // Location (browser reports status 0 / opaqueredirect). Return the eBay
    // authorize URL as JSON so Connect can navigate explicitly.
    const wantsJsonAuthorize =
      isCredentialedFetch ||
      request.nextUrl.searchParams.get("format") === "json" ||
      (request.headers.get("accept") || "").includes("application/json")

    if (wantsJsonAuthorize) {
      const jsonResponse = noStoreJson(
        {
          ok: true,
          authorizeUrl,
          redirectUrl: authorizeUrl,
          isOwner,
          authenticatedUserId: user.id,
          authenticatedEmail: user.email ?? null,
        },
        200,
        {
          "X-ListWise-Is-Owner": isOwner ? "true" : "false",
        }
      )
      attachOAuthStateCookie(jsonResponse, cookieValue)
      return jsonResponse
    }

    const response = new NextResponse(null, { status: 302 })
    response.headers.set("Location", authorizeUrl)
    for (const [key, value] of Object.entries(
      withOAuthVersionHeaders({
        "X-ListWise-Is-Owner": isOwner ? "true" : "false",
      })
    )) {
      response.headers.set(key, value)
    }
    attachOAuthStateCookie(response, cookieValue)

    const location = response.headers.get("Location") || ""
    const loc = new URL(location)
    const locQuery = location.split("?")[1] || ""
    const locScope = locQuery.match(/(?:^|&)scope=([^&]*)/)
    const clientId = ebayClientId()
    const clientIdRedacted =
      clientId.length <= 6 ? `***${clientId}` : `***${clientId.slice(-6)}`
    console.info("[ebay/oauth] Location header consent URL (client_id redacted)", {
      completeAuthorizeUrlRedacted: location.replace(
        `client_id=${clientId}`,
        `client_id=${clientIdRedacted}`
      ),
      endpoint: `${loc.origin}${loc.pathname}`,
      redirect_uri: loc.searchParams.get("redirect_uri"),
      response_type: loc.searchParams.get("response_type"),
      scope_exact: locScope ? locScope[1] : null,
      state_present: Boolean(loc.searchParams.get("state")),
      ownerBypass: isOwner,
      authUserId: user.id,
      authEmail: user.email ?? null,
      oauthVersion: OAUTH_START_VERSION,
    })

    return response
  } catch (error) {
    if (debug) {
      return noStoreJson(
        {
          temporaryDebug: true,
          authSource: BILLING_AUTH_SOURCE,
          error:
            error instanceof Error
              ? error.message
              : "Failed to start eBay OAuth.",
        },
        200
      )
    }
    return noStoreJson(
      {
        error:
          error instanceof Error ? error.message : "Failed to start eBay OAuth.",
      },
      500
    )
  }
}
