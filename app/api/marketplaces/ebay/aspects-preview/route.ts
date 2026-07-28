import { NextResponse } from "next/server"
import { ensureEbayUserAccessToken } from "@/lib/insights/ebay-auth"
import {
  applyRequiredEbayAspects,
  fetchEbayItemAspectsForCategory,
} from "@/lib/marketplaces/adapters/ebay/aspects"
import { mapListingToEbayInventory } from "@/lib/marketplaces/adapters/ebay/client"
import { resolveEbayLeafCategoryId } from "@/lib/marketplaces/adapters/ebay/taxonomy"
import {
  EBAY_FORM_ASPECT_PRIORITY,
  type EbayAspectFormField,
} from "@/lib/listings/ebay-aspect-fields"
import { getServerAuthUser } from "@/lib/supabase/index"
import type { Listing } from "@/lib/types"

export const runtime = "nodejs"

function allowedValues(aspect: {
  aspectValues?: Array<{ localizedValue?: string }>
}): string[] {
  return (aspect.aspectValues || [])
    .map((v) => v.localizedValue?.trim())
    .filter((v): v is string => Boolean(v))
}

/**
 * Prefetch eBay category aspects and return exact mapped values for the listing.
 * Used by the listing editor to show required item specifics before Publish.
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

    const priorityKeys = new Set(
      EBAY_FORM_ASPECT_PRIORITY.map((n) => n.toLowerCase())
    )
    const formFieldsByKey = new Map<string, EbayAspectFormField>()

    for (const aspect of taxonomyAspects) {
      const name = aspect.localizedAspectName?.trim()
      if (!name) continue
      const key = name.toLowerCase()
      const required = Boolean(aspect.aspectConstraint?.aspectRequired)
      const isPriority = priorityKeys.has(key)
      if (!required && !isPriority) continue

      const allowed = allowedValues(aspect)
      const resolved = applied.aspects[name]?.[0]?.trim()
      const missingEntry = applied.missingRequired.find(
        (f) => f.name.toLowerCase() === key
      )
      formFieldsByKey.set(key, {
        name,
        required,
        allowedValues: allowed.length > 0 ? allowed.slice(0, 80) : undefined,
        suggestedValue: missingEntry?.suggestedValue,
        value: resolved || undefined,
      })
    }

    // Ensure every still-missing required field is present even if taxonomy miss.
    for (const missing of applied.missingRequired) {
      const key = missing.name.toLowerCase()
      if (formFieldsByKey.has(key)) continue
      formFieldsByKey.set(key, {
        name: missing.name,
        required: true,
        allowedValues: missing.allowedValues,
        suggestedValue: missing.suggestedValue,
      })
    }

    const formFields = [...formFieldsByKey.values()].sort((a, b) => {
      const ai = EBAY_FORM_ASPECT_PRIORITY.findIndex(
        (n) => n.toLowerCase() === a.name.toLowerCase()
      )
      const bi = EBAY_FORM_ASPECT_PRIORITY.findIndex(
        (n) => n.toLowerCase() === b.name.toLowerCase()
      )
      const aRank = ai === -1 ? 1000 : ai
      const bRank = bi === -1 ? 1000 : bi
      if (aRank !== bRank) return aRank - bRank
      if (a.required !== b.required) return a.required ? -1 : 1
      return a.name.localeCompare(b.name)
    })

    const missingNames = formFields
      .filter((f) => f.required && !f.value?.trim())
      .map((f) => f.name)

    return NextResponse.json({
      categoryId,
      formFields,
      requiredFields: applied.missingRequired,
      resolvedFields: applied.resolvedFields,
      filledRequired: applied.filledRequired,
      missingRequiredNames: missingNames,
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
