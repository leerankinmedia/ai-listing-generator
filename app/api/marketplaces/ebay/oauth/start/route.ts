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
import {
  collectAuthUserEmails,
  explainOwnerEmailMatch,
  isListWiseOwnerEmail,
  isOwnerUserId,
} from "@/lib/billing/owner"
import { resolveIsPermanentOwnerDetailed } from "@/lib/billing/owner-resolve"
import { isConnectionsCryptoConfigured } from "@/lib/marketplaces/connections/crypto"
import {
  attachOAuthStateCookie,
  createOAuthState,
} from "@/lib/marketplaces/oauth-state"
import {
  createServiceRoleClient,
  getServerAuthUser,
} from "@/lib/supabase/index"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Temporary — confirm Connect hits this route handler. Remove after verification. */
const OAUTH_START_VERSION = "verify-hdr-1"

/** Exact function that can emit trial_expired for Connect with OAuth. */
const TRIAL_EXPIRED_FN =
  "app/api/marketplaces/ebay/oauth/start/route.ts:GET"

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
 * Last-resort Owner email resolution for this route only.
 * Unions session + Auth Admin + profiles emails before any trial deny.
 */
async function collectOwnerEmailsForUser(user: {
  id: string
  email?: string | null
  new_email?: string | null
  user_metadata?: Record<string, unknown> | null
  identities?: Array<{
    identity_data?: Record<string, unknown> | null
    email?: string | null
  }> | null
}): Promise<string[]> {
  const emails = new Set(collectAuthUserEmails(user))
  const admin = createServiceRoleClient()
  if (!admin) return [...emails]

  try {
    const { data } = await admin.auth.admin.getUserById(user.id)
    for (const email of collectAuthUserEmails(data?.user)) {
      emails.add(email)
    }
  } catch {
    // continue
  }

  try {
    const { data } = await admin
      .from("profiles")
      .select("email")
      .eq("id", user.id)
      .maybeSingle()
    if (typeof data?.email === "string" && data.email.includes("@")) {
      emails.add(data.email.normalize("NFKC").trim().toLowerCase())
    }
  } catch {
    // ignore
  }

  return [...emails]
}

/**
 * eBay Connect with OAuth — /api/marketplaces/ebay/oauth/start
 *
 * Temporary: ?debug=1 returns JSON diagnostics instead of redirect/deny.
 * trial_expired is emitted only from GET below when Owner resolution fails and
 * getEntitlement().status === "expired".
 */
export async function GET(request: NextRequest) {
  const debug = isDebugRequest(request)

  try {
    const host = requestHost(request)

    // Bounce off temporary deployment hosts so the state cookie is set on the
    // canonical production host (must match RuName Auth Accepted URL).
    // Preserve search (including ?debug=1).
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
        redirected: true,
      })
      const redirect = NextResponse.redirect(to, 307)
      redirect.headers.set("X-ListWise-OAuth-Version", OAUTH_START_VERSION)
      return redirect
    }

    const user = await getServerAuthUser()
    if (!user?.id) {
      if (debug) {
        return noStoreJson(
          {
            temporaryDebug: true,
            route: TRIAL_EXPIRED_FN,
            authenticated: false,
            isOwner: false,
            authenticatedEmail: null,
            entitlementStatus: null,
            deniedByFunction: null,
            nextAction: "return unauthorized",
            responseHeaders: {
              "X-ListWise-OAuth-Version": OAUTH_START_VERSION,
              "X-ListWise-Deny-Fn": null,
              "X-ListWise-Deciding-Field": null,
            },
            code: "unauthorized",
            error: "Sign in required to connect a marketplace.",
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

    const owner = await resolveIsPermanentOwnerDetailed(user)
    const allEmails = await collectOwnerEmailsForUser(user)
    const emailIsOwner = allEmails.some((email) => isListWiseOwnerEmail(email))
    const primaryEmail = user.email || allEmails[0] || null
    const entitlement = await getEntitlement(user.id, {
      email: primaryEmail,
      authUser: {
        ...user,
        email: primaryEmail,
      },
    })

    const isOwner =
      isOwnerUserId(user.id) ||
      owner.isOwner ||
      emailIsOwner ||
      entitlement.ownerOverride === true ||
      entitlement.status === "owner"

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

    const denyFn = wouldDenyAccess ? TRIAL_EXPIRED_FN : null
    const decidingField = wouldDenyAccess
      ? entitlement.debug.decidingField
      : null

    if (debug) {
      const emailMatch = explainOwnerEmailMatch(allEmails)
      return noStoreJson(
        {
          temporaryDebug: true,
          route: TRIAL_EXPIRED_FN,
          authenticated: true,
          isOwner,
          authenticatedEmail: primaryEmail,
          collectedEmails: allEmails,
          ownerWhitelist: emailMatch.ownerWhitelist,
          ownerEmailMatch: emailMatch.matched,
          ownerMatchedEmail: emailMatch.matchedEmail,
          ownerMismatchReason: emailMatch.mismatchReason,
          ownerVia: owner.via,
          entitlementStatus: entitlement.status,
          entitlementAllowed: entitlement.allowed,
          entitlementDecidingField: entitlement.debug.decidingField,
          deniedByFunction: denyFn,
          nextAction,
          responseHeaders: {
            "X-ListWise-OAuth-Version": OAUTH_START_VERSION,
            "X-ListWise-Deny-Fn": denyFn,
            "X-ListWise-Deciding-Field": decidingField,
          },
          wouldReturnCode: denyCode,
        },
        200,
        wouldDenyAccess
          ? {
              "X-ListWise-Deny-Fn": TRIAL_EXPIRED_FN,
              "X-ListWise-Is-Owner": "false",
              "X-ListWise-Entitlement": entitlement.status,
              "X-ListWise-Owner-Via": owner.via,
              "X-ListWise-Has-Email": allEmails.length > 0 ? "1" : "0",
              "X-ListWise-Deciding-Field": entitlement.debug.decidingField,
            }
          : {
              "X-ListWise-Is-Owner": isOwner ? "true" : "false",
              "X-ListWise-Owner-Via": owner.via,
              "X-ListWise-Deciding-Field": entitlement.debug.decidingField,
            }
      )
    }

    if (wouldDenyAccess) {
      // Exact trial_expired emitter for Connect with OAuth.
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
          "X-ListWise-Owner-Via": owner.via,
          "X-ListWise-Has-Email": allEmails.length > 0 ? "1" : "0",
          "X-ListWise-Deciding-Field": entitlement.debug.decidingField,
        }
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
    const authorizeUrl = buildEbayAuthorizeUrl(urlState)

    const response = new NextResponse(null, { status: 302 })
    response.headers.set("Location", authorizeUrl)
    for (const [key, value] of Object.entries(
      withOAuthVersionHeaders({
        "X-ListWise-Is-Owner": isOwner ? "true" : "false",
        "X-ListWise-Owner-Via": owner.via,
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
      ownerVia: owner.via,
      oauthVersion: OAUTH_START_VERSION,
    })

    return response
  } catch (error) {
    if (debug) {
      return noStoreJson(
        {
          temporaryDebug: true,
          route: TRIAL_EXPIRED_FN,
          isOwner: false,
          authenticatedEmail: null,
          entitlementStatus: null,
          deniedByFunction: null,
          nextAction: "return error",
          responseHeaders: {
            "X-ListWise-OAuth-Version": OAUTH_START_VERSION,
            "X-ListWise-Deny-Fn": null,
            "X-ListWise-Deciding-Field": null,
          },
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
