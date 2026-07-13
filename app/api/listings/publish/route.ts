import { NextResponse } from "next/server"
import { publishListingOneClick } from "@/lib/marketplaces/publish-service"
import type { Listing, MarketplaceId } from "@/lib/types"

export const runtime = "nodejs"

/**
 * One-click multi-marketplace publish endpoint.
 * Accepts a full listing payload + target IDs; adapters fulfill jobs.
 */
export async function POST(request: Request) {
  try {
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

    const results = await publishListingOneClick(body.listing, {
      marketplaceIds: body.marketplaceIds,
    })

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
