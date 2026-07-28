import { NextResponse } from "next/server"
import { ensureEbayUserAccessToken } from "@/lib/insights/ebay-auth"
import { listEbayFulfillmentPolicySummaries } from "@/lib/marketplaces/adapters/ebay/policies"
import { getServerAuthUser } from "@/lib/supabase/index"

export const runtime = "nodejs"

/**
 * GET /api/marketplaces/ebay/fulfillment-policies
 * Returns the connected seller's fulfillment policies with parsed shipping cost settings.
 */
export async function GET() {
  try {
    const user = await getServerAuthUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
    }

    const token = await ensureEbayUserAccessToken()
    if (!token.ok) {
      return NextResponse.json(
        { error: token.reason, code: "ebay_not_connected", policies: [] },
        { status: 400 }
      )
    }

    const policies = await listEbayFulfillmentPolicySummaries(token.accessToken)

    return NextResponse.json({
      policies,
      defaultMode: "calculated",
    })
  } catch (error) {
    console.error("[ebay/fulfillment-policies]", error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load eBay fulfillment policies.",
        policies: [],
      },
      { status: 500 }
    )
  }
}
