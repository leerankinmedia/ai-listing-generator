import { NextResponse } from "next/server"
import { checkSubscriptionAccess } from "@/lib/billing/access"
import {
  applyPublishResultsToListing,
  publishResultsIncludeSuccess,
} from "@/lib/listings/publish-persist"
import { upsertSupabaseListingServer } from "@/lib/listings/supabase-repo"
import {
  checkpoint,
  publishFailureBody,
  resetPublishTrace,
} from "@/lib/marketplaces/publish-error"
import {
  createServerSupabase,
  getServerAuthUser,
  isSupabaseConfigured,
} from "@/lib/supabase/index"
import type { Listing, MarketplaceId } from "@/lib/types"

export const runtime = "nodejs"
export const maxDuration = 300

/**
 * One-click multi-marketplace publish endpoint.
 * Only publishes through real adapters for connected marketplaces.
 * On success, upserts the listing (status listed + marketplace refs) for the auth user.
 * Failures always return JSON { error, stage, details } — never a Next.js HTML page.
 */
export async function POST(request: Request) {
  resetPublishTrace()
  checkpoint("publish_request", { path: "/api/listings/publish" })
  try {
    const user = await getServerAuthUser()
    if (!user) {
      return NextResponse.json(
        {
          error: "Unauthorized.",
          stage: "publish_request",
          details: { code: "unauthorized" },
        },
        { status: 401 }
      )
    }

    const access = await checkSubscriptionAccess(user.id, user.email)
    if (!access.allowed) {
      return NextResponse.json(
        {
          error: "Start your 7-day free trial to unlock this feature.",
          code: "subscription_required",
          stage: "publish_request",
          details: { code: "subscription_required" },
        },
        { status: 402 }
      )
    }

    let body: { listing?: Listing; marketplaceIds?: MarketplaceId[] }
    try {
      body = (await request.json()) as {
        listing?: Listing
        marketplaceIds?: MarketplaceId[]
      }
    } catch {
      return NextResponse.json(
        {
          error: "Publish request body must be JSON.",
          stage: "publish_request",
          details: { code: "invalid_json" },
        },
        { status: 400 }
      )
    }

    if (!body.listing || !body.marketplaceIds?.length) {
      return NextResponse.json(
        {
          error: "listing and marketplaceIds are required.",
          stage: "publish_request",
          details: { code: "missing_listing" },
        },
        { status: 400 }
      )
    }

    checkpoint("publish_request", {
      listingId: body.listing.id,
      marketplaceIds: body.marketplaceIds,
      photoCount: body.listing.images?.length ?? 0,
    })

    // Ensure the listing is owned by the authenticated user (never Sandbox eBay account).
    const listingForUser: Listing = {
      ...body.listing,
      userId: user.id,
    }

    // Dynamic import keeps native sharp out of the route module graph. A failed
    // sharp load used to 500 this endpoint as a Next.js HTML document.
    const { publishListingOneClick } = await import(
      "@/lib/marketplaces/publish-service"
    )

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
          savedListing = next
        }
      } else {
        savedListing = next
      }
    }

    return NextResponse.json({ results, listing: savedListing })
  } catch (error) {
    const payload = publishFailureBody(error)
    console.error("[publish] failed", payload, error)
    return NextResponse.json(payload, { status: 500 })
  }
}
