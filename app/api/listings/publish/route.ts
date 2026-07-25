import { NextResponse } from "next/server"
import { checkSubscriptionAccess } from "@/lib/billing/access"
import {
  applyPublishResultsToListing,
  publishResultsIncludeSuccess,
} from "@/lib/listings/publish-persist"
import { upsertSupabaseListingServer } from "@/lib/listings/supabase-repo"
import { publishListingOneClick } from "@/lib/marketplaces/publish-service"
import {
  createServerSupabase,
  getServerAuthUser,
  isSupabaseConfigured,
} from "@/lib/supabase/index"
import type { Listing, MarketplaceId } from "@/lib/types"

export const runtime = "nodejs"

/**
 * One-click multi-marketplace publish endpoint.
 * Only publishes through real adapters for connected marketplaces.
 * On success, upserts the listing (status listed + marketplace refs) for the auth user.
 */
export async function POST(request: Request) {
  try {
    const user = await getServerAuthUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
    }

    const access = await checkSubscriptionAccess(user.id)
    if (!access.allowed) {
      return NextResponse.json(
        {
          error: "Start your 7-day free trial to unlock this feature.",
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

    // Ensure the listing is owned by the authenticated user (never Sandbox eBay account).
    const listingForUser: Listing = {
      ...body.listing,
      userId: user.id,
    }

    const results = await publishListingOneClick(
      listingForUser,
      body.marketplaceIds
    )

    let savedListing: Listing | null = null
    if (publishResultsIncludeSuccess(results)) {
      const next = applyPublishResultsToListing(
        listingForUser,
        results,
        user.id
      )
      if (isSupabaseConfigured()) {
        try {
          const supabase = await createServerSupabase()
          savedListing = await upsertSupabaseListingServer(supabase, next)
          console.info("[publish] TEMP upserted listed listing", {
            listingId: savedListing.id,
            userId: savedListing.userId,
            status: savedListing.status,
            marketplaces: savedListing.marketplaceListings
              .map((m) => `${m.marketplaceId}:${m.externalId || "none"}`)
              .join(","),
          })
        } catch (persistError) {
          console.error("[publish] failed to upsert listed listing", persistError)
          // Still return publish results; client can retry save with listing payload.
          savedListing = next
        }
      } else {
        savedListing = next
      }
    }

    return NextResponse.json({ results, listing: savedListing })
  } catch (error) {
    console.error("[publish]", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Publish failed.",
      },
      { status: 500 }
    )
  }
}
