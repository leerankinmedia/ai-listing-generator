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
 * trial_expired is emitted only from GET below when Owner resolution fails and
 * getEntitlement().status === "expired".
 */
export async function GET(request: NextRequest) {
  try {
    const host = requestHost(request)

    // Bounce off temporary deployment hosts so the state cookie is set on the
    // canonical production host (must match RuName Auth Accepted URL).
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
    const entitlement = await getEntitlement(user.id, {
      email: user.email || allEmails[0] || null,
      authUser: {
        ...user,
        email: user.email || allEmails[0] || null,
      },
    })

    const isOwner =
      isOwnerUserId(user.id) ||
      owner.isOwner ||
      emailIsOwner ||
      entitlement.ownerOverride === true ||
      entitlement.status === "owner"

    if (isOwner) {
      // Fall through to authorize URL — never trial_expired for Owner.
    } else if (!entitlement.allowed) {
      // Exact trial_expired emitter for Connect with OAuth.
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
    return noStoreJson(
      {
        error:
          error instanceof Error ? error.message : "Failed to start eBay OAuth.",
      },
      500
    )
  }
}
