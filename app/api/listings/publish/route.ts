import { NextResponse } from "next/server"
import { checkSubscriptionAccess } from "@/lib/billing/access"
import {
  applyPublishResultsToListing,
  publishResultsIncludeSuccess,
} from "@/lib/listings/publish-persist"
import { upsertSupabaseListingServer } from "@/lib/listings/supabase-repo"
import {
  checkpoint,
  currentPublishTrace,
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

function publishJson(body: unknown, status = 200) {
  try {
    return new NextResponse(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json; charset=utf-8" },
    })
  } catch (error) {
    console.error("[publish] response serialize failed", error)
    return new NextResponse(
      JSON.stringify({
        ok: false,
        error: "Publish failed.",
        code: "publish_response_unserializable",
        details:
          error instanceof Error ? error.message : "Could not serialize response.",
      }),
      {
        status: 500,
        headers: { "content-type": "application/json; charset=utf-8" },
      }
    )
  }
}

function publishErrorJson(error: unknown, status = 500) {
  try {
    if (error instanceof Error && error.stack) {
      console.error("[publish] exception stack", error.stack)
    } else {
      console.error("[publish] exception", error)
    }
    const payload = publishFailureBody(error)
    const code =
      (typeof payload.details.code === "string" && payload.details.code) ||
      "publish_failed"
    return publishJson(
      {
        ok: false,
        error: payload.error,
        code,
        details: payload.details,
        stage: payload.stage,
      },
      status
    )
  } catch (fallback) {
    console.error("[publish] error payload failed", fallback, error)
    return publishJson(
      {
        ok: false,
        error: "Publish failed.",
        code: "publish_failed",
        details: fallback instanceof Error ? fallback.message : "unknown",
        stage: currentPublishTrace().stage,
      },
      500
    )
  }
}

/**
 * One-click multi-marketplace publish endpoint.
 * Only publishes through real adapters for connected marketplaces.
 * On success, upserts the listing (status listed + marketplace refs) for the auth user.
 * Failures always return JSON — never a Next.js HTML page.
 */
export async function POST(request: Request) {
  resetPublishTrace()
  checkpoint("request/auth", { event: "start", path: "/api/listings/publish" })
  try {
    const user = await getServerAuthUser()
    if (!user) {
      return publishJson(
        {
          ok: false,
          error: "Unauthorized.",
          code: "unauthorized",
          details: { code: "unauthorized" },
          stage: "request/auth",
        },
        401
      )
    }
    checkpoint("request/auth", { event: "ok", authenticated: true })

    const access = await checkSubscriptionAccess(user.id, user.email)
    if (!access.allowed) {
      return publishJson(
        {
          ok: false,
          error: "Start your 7-day free trial to unlock this feature.",
          code: "subscription_required",
          details: { code: "subscription_required" },
          stage: "request/auth",
        },
        402
      )
    }

    let body: { listing?: Listing; marketplaceIds?: MarketplaceId[] }
    try {
      body = (await request.json()) as {
        listing?: Listing
        marketplaceIds?: MarketplaceId[]
      }
    } catch {
      return publishJson(
        {
          ok: false,
          error: "Publish request body must be JSON.",
          code: "invalid_json",
          details: { code: "invalid_json" },
          stage: "request/auth",
        },
        400
      )
    }

    if (!body.listing || !body.marketplaceIds?.length) {
      return publishJson(
        {
          ok: false,
          error: "listing and marketplaceIds are required.",
          code: "missing_listing",
          details: { code: "missing_listing" },
          stage: "listing_load",
        },
        400
      )
    }

    checkpoint("listing_load", {
      event: "start",
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
    let publishListingOneClick: typeof import("@/lib/marketplaces/publish-service").publishListingOneClick
    try {
      ;({ publishListingOneClick } = await import(
        "@/lib/marketplaces/publish-service"
      ))
    } catch (loadError) {
      checkpoint("listing_load", {
        event: "error",
        reason: "publish_service_import",
        message:
          loadError instanceof Error ? loadError.message.slice(0, 180) : "import_failed",
      })
      console.error(
        "[publish] failed to load publish-service",
        loadError instanceof Error ? loadError.stack : loadError
      )
      throw loadError
    }
    checkpoint("listing_load", { event: "ok", listingId: listingForUser.id })

    const results = await publishListingOneClick(
      listingForUser,
      body.marketplaceIds
    )

    let savedListing: Listing | null = null
    if (publishResultsIncludeSuccess(results)) {
      checkpoint("post_publish_save", {
        event: "start",
        listingId: listingForUser.id,
      })
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
          checkpoint("post_publish_save", {
            event: "ok",
            listingId: savedListing.id,
          })
        } catch (persistError) {
          checkpoint("post_publish_save", {
            event: "error",
            message:
              persistError instanceof Error
                ? persistError.message.slice(0, 180)
                : "persist_failed",
          })
          console.error("[publish] failed to upsert listed listing", persistError)
          savedListing = next
        }
      } else {
        savedListing = next
        checkpoint("post_publish_save", { event: "ok", persisted: false })
      }
    }

    return publishJson({ ok: true, results, listing: savedListing })
  } catch (error) {
    console.error("[publish] failed", error)
    return publishErrorJson(error, 500)
  }
}
