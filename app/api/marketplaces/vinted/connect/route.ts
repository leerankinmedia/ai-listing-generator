import { NextResponse } from "next/server"
import { splitVintedToken } from "@/lib/marketplaces/adapters/vinted/client"
import { MarketplaceError } from "@/lib/marketplaces/adapters/types"
import { getEntitlement } from "@/lib/billing/entitlement"
import { isConnectionsCryptoConfigured } from "@/lib/marketplaces/connections/crypto"
import { saveConnection } from "@/lib/marketplaces/connections/store"
import { getServerAuthUser } from "@/lib/supabase/index"

export const runtime = "nodejs"

/**
 * Vinted Pro Integrations uses accessKey + signingKey (not browser OAuth).
 * Body: { token: "accessKey,signingKey", accountLabel?: string }
 */
export async function POST(request: Request) {
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

    const body = (await request.json()) as {
      token?: string
      accountLabel?: string
    }
    if (!body.token?.trim()) {
      return NextResponse.json(
        { error: "token is required (accessKey,signingKey)." },
        { status: 400 }
      )
    }

    const { accessKey, signingKey } = splitVintedToken(body.token)
    const now = new Date().toISOString()
    await saveConnection({
      marketplaceId: "vinted",
      authMethod: "api_token",
      accessToken: accessKey,
      meta: { signingKey },
      accountLabel: body.accountLabel?.trim() || "Vinted Pro",
      connectedAt: now,
      updatedAt: now,
    })

    return NextResponse.json({
      ok: true,
      connection: {
        marketplaceId: "vinted",
        connected: true,
        accountLabel: body.accountLabel?.trim() || "Vinted Pro",
        authMethod: "api_token",
        connectedAt: now,
      },
    })
  } catch (error) {
    const status = error instanceof MarketplaceError ? error.status : 500
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Vinted connect failed.",
      },
      { status }
    )
  }
}
