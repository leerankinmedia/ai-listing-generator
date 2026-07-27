import { NextResponse } from "next/server"
import {
  buildWhatnotAuthorizeUrl,
  isWhatnotConfigured,
} from "@/lib/marketplaces/adapters/whatnot/oauth"
import { getEntitlement } from "@/lib/billing/entitlement"
import { isConnectionsCryptoConfigured } from "@/lib/marketplaces/connections/crypto"
import {
  attachOAuthStateCookie,
  createOAuthState,
} from "@/lib/marketplaces/oauth-state"
import { getServerAuthUser } from "@/lib/supabase/index"

export const runtime = "nodejs"

export async function GET() {
  try {
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

    // Same entitlement path as Billing / eBay OAuth start.
    const entitlement = await getEntitlement(user.id, {
      email: user.email,
      authUser: user,
    })
    const isOwner =
      entitlement.ownerOverride === true || entitlement.status === "owner"
    if (!isOwner && !entitlement.allowed) {
      return NextResponse.json(
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
    if (!isWhatnotConfigured()) {
      return NextResponse.json(
        {
          error:
            "Whatnot is not configured. Set WHATNOT_CLIENT_ID and WHATNOT_CLIENT_SECRET.",
        },
        { status: 503 }
      )
    }

    const { urlState, cookieValue } = createOAuthState("whatnot")
    const url = buildWhatnotAuthorizeUrl(urlState)
    const response = NextResponse.redirect(url)
    return attachOAuthStateCookie(response, cookieValue)
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to start Whatnot OAuth.",
      },
      { status: 500 }
    )
  }
}
