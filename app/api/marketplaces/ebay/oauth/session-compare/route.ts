import { NextResponse } from "next/server"
import { getEntitlement } from "@/lib/billing/entitlement"
import { getServerAuthUser } from "@/lib/supabase/index"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/marketplaces/ebay/oauth/session-compare
 *
 * Billing-identical auth probe for the Compare button.
 * Never redirects (no host bounce, no eBay Location) so credentialed fetch()
 * cannot fail with a generic CORS "Failed to fetch" from a 302/307.
 */
export async function GET() {
  try {
    // Identical to /api/billing/status
    const user = await getServerAuthUser()
    if (!user?.id) {
      return NextResponse.json(
        {
          ok: false,
          endpoint: "/api/marketplaces/ebay/oauth/session-compare",
          authSource:
            "getServerAuthUser() + getEntitlement(user.id, { email: user.email, authUser: user })",
          matchesBillingStatusRoute: true,
          authenticated: false,
          isOwner: false,
          authenticatedUserId: null,
          authenticatedEmail: null,
          entitlementStatus: null,
          code: "unauthorized",
          error: "Sign in required.",
        },
        {
          status: 401,
          headers: {
            "Cache-Control": "private, no-store, max-age=0, must-revalidate",
          },
        }
      )
    }

    const entitlement = await getEntitlement(user.id, {
      email: user.email,
      authUser: user,
    })
    const isOwner =
      entitlement.ownerOverride === true || entitlement.status === "owner"

    return NextResponse.json(
      {
        ok: true,
        endpoint: "/api/marketplaces/ebay/oauth/session-compare",
        authSource:
          "getServerAuthUser() + getEntitlement(user.id, { email: user.email, authUser: user })",
        matchesBillingStatusRoute: true,
        authenticated: true,
        isOwner,
        authenticatedUserId: user.id,
        authenticatedEmail: user.email ?? null,
        entitlementStatus: entitlement.status,
        entitlementAllowed: entitlement.allowed,
        ownerOverride: entitlement.ownerOverride,
        entitlementDecidingField: entitlement.debug.decidingField,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "private, no-store, max-age=0, must-revalidate",
        },
      }
    )
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        endpoint: "/api/marketplaces/ebay/oauth/session-compare",
        error:
          error instanceof Error
            ? error.message
            : "session-compare failed",
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "private, no-store, max-age=0, must-revalidate",
        },
      }
    )
  }
}
