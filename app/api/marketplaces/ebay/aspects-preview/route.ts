import { NextResponse } from "next/server"
import { ensureEbayUserAccessToken } from "@/lib/insights/ebay-auth"
import {
  applyRequiredEbayAspects,
  fetchEbayItemAspectsForCategory,
} from "@/lib/marketplaces/adapters/ebay/aspects"
import { mapListingToEbayInventory } from "@/lib/marketplaces/adapters/ebay/client"
import { resolveEbayLeafCategoryId } from "@/lib/marketplaces/adapters/ebay/taxonomy"
import { getServerAuthUser } from "@/lib/supabase/index"
import type { Listing } from "@/lib/types"

export const runtime = "nodejs"

/**
 * Prefetch eBay category aspects and return exact mapped values for the listing.
 * Used by the Publish UI to prefill specifics before the seller hits Publish.
 */
export async function POST(request: Request) {
  try {
    const user = await getServerAuthUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
    }

    const token = await ensureEbayUserAccessToken()
    if (!token.ok) {
      return NextResponse.json(
        { error: token.reason, code: "ebay_not_connected" },
        { status: 400 }
      )
    }

    const body = (await request.json()) as { listing?: Listing }
    if (!body.listing) {
      return NextResponse.json({ error: "listing is required." }, { status: 400 })
    }

    const listing = body.listing
    const { categoryId } = await resolveEbayLeafCategoryId(
      token.accessToken,
      listing.title || listing.specifics.category || "clothing"
    )
    const taxonomyAspects = await fetchEbayItemAspectsForCategory(
      token.accessToken,
      categoryId
    )
    const { inventoryItem } = mapListingToEbayInventory(listing)
    const applied = applyRequiredEbayAspects(
      listing,
      taxonomyAspects,
      inventoryItem.product.aspects
    )

    const relevant = taxonomyAspects.filter((a) => a.localizedAspectName?.trim())
    const filledNames = new Set(
      Object.entries(applied.aspects)
        .filter(([, v]) => v?.[0]?.trim())
        .map(([k]) => k.toLowerCase())
    )

    return NextResponse.json({
      categoryId,
      requiredFields: applied.missingRequired,
      resolvedFields: applied.resolvedFields,
      filledRequired: applied.filledRequired,
      aspectFilledCount: filledNames.size,
      aspectTotalCount: relevant.length,
      aspectsPreview: Object.fromEntries(
        Object.entries(applied.aspects).map(([k, v]) => [k, v[0]])
      ),
    })
  } catch (error) {
    console.error("[ebay/aspects-preview]", error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load eBay item specifics.",
      },
      { status: 500 }
    )
  }
}
