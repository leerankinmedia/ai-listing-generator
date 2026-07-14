import { NextResponse } from "next/server"
import { checkSubscriptionAccess } from "@/lib/billing/access"
import { publishListingOneClick } from "@/lib/marketplaces/publish-service"
import { getServerAuthUser } from "@/lib/supabase/index"
import type { Listing, MarketplaceId } from "@/lib/types"

export const runtime = "nodejs"

/**
 * One-click multi-marketplace publish endpoint.
 * Only publishes through real adapters for connected marketplaces.
 */
export async function POST(request: Request) {
  try {
    const user = await getServerAuthUser()
    const access = await checkSubscriptionAccess(user?.id)
    if (!access.allowed) {
      return NextResponse.json(
        {
          error:
            "Subscription required. Start your trial or renew to unlock ListWise.",
          code: "subscription_required",
        },
        { status: 402 }
      )
    }

    const body = (await request.json()) as {
      listing?: Listing
      marketplaceIds?: MarketplaceId[]
    }

    if (!body.listing || !body.marketplaceIds?.length) {
      return NextResponse.json(
        { error: "listing and marketplaceIds are required." },
        { status: 400 }
      )
    }

    const results = await publishListingOneClick(
      body.listing,
      body.marketplaceIds
    )

    return NextResponse.json({ results })
  } catch (error) {
    console.error("[publish]", error)
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Publish failed.",
      },
      { status: 500 }
    )
  }
}
