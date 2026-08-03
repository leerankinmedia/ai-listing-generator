import { NextResponse } from "next/server"
import { ensureEbayUserAccessToken } from "@/lib/insights/ebay-auth"
import {
  applyRequiredEbayAspects,
  fetchEbayItemAspectsForCategory,
} from "@/lib/marketplaces/adapters/ebay/aspects"
import { mapListingToEbayInventory } from "@/lib/marketplaces/adapters/ebay/client"
import {
  mapAiConditionToPolicy,
} from "@/lib/marketplaces/adapters/ebay/condition-map"
import { ebayMarketplaceId } from "@/lib/marketplaces/adapters/ebay/ebay-cache"
import { getItemConditionPoliciesForCategory } from "@/lib/marketplaces/adapters/ebay/metadata-conditions"
import {
  buildCategorySuggestionQuery,
  getEbayCategorySuggestions,
  getEbayDefaultCategoryTreeId,
  type EbayCategorySuggestion,
} from "@/lib/marketplaces/adapters/ebay/taxonomy"
import {
  EBAY_SEO_ASPECT_PRIORITY,
  isPrimaryVisibleAspect,
  type EbayAspectFormField,
} from "@/lib/listings/ebay-aspect-fields"
import { enrichEbayTitleTowardLimit } from "@/lib/listings/ebay-title"
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

function aspectUsage(aspect: {
  aspectConstraint?: { aspectRequired?: boolean; aspectUsage?: string }
}): "REQUIRED" | "RECOMMENDED" | "OPTIONAL" {
  if (aspect.aspectConstraint?.aspectRequired) return "REQUIRED"
  const usage = (aspect.aspectConstraint?.aspectUsage || "").toUpperCase()
  if (usage === "REQUIRED") return "REQUIRED"
  if (usage === "RECOMMENDED") return "RECOMMENDED"
  return "OPTIONAL"
}

/**
 * Load Taxonomy aspects + Metadata conditions for a leaf category.
 * Uses the listing's saved ebayCategory.categoryId when present; otherwise
 * returns category suggestions so the UI can pick a leaf first.
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

    const body = (await request.json()) as {
      listing?: Listing
      categoryId?: string
    }
    if (!body.listing) {
      return NextResponse.json({ error: "listing is required." }, { status: 400 })
    }

    const listing = body.listing
    const marketplaceId = ebayMarketplaceId()
    const tree = await getEbayDefaultCategoryTreeId(
      token.accessToken,
      marketplaceId
    )

    const suggestQuery = buildCategorySuggestionQuery({
      title: listing.title,
      itemType:
        listing.fieldConfidence?.itemType?.value ||
        listing.specifics.extras?.Type ||
        listing.specifics.style,
      department: listing.specifics.gender,
      brand: listing.specifics.brand,
      keywords: listing.keywords,
      categoryHint: listing.specifics.category,
    })

    let suggestions: EbayCategorySuggestion[] = []
    try {
      const suggested = await getEbayCategorySuggestions(
        token.accessToken,
        suggestQuery || listing.title || "item",
        { marketplaceId, categoryTreeId: tree.categoryTreeId, limit: 8 }
      )
      suggestions = suggested.suggestions
    } catch {
      suggestions = []
    }

    const explicitCategoryId =
      (body.categoryId || "").trim() ||
      listing.specifics.ebayCategory?.categoryId?.trim() ||
      ""

    // Prefer saved leaf category; else auto-pick top suggestion so aspects can load.
    const categoryId =
      explicitCategoryId || suggestions[0]?.categoryId || ""
    const selectedSuggestion =
      suggestions.find((s) => s.categoryId === categoryId) || suggestions[0]

    if (!categoryId) {
      return NextResponse.json({
        marketplaceId,
        categoryTreeId: tree.categoryTreeId,
        categoryId: null,
        categorySuggestions: suggestions,
        formFields: [],
        conditions: [],
        mappedCondition: null,
        needsCategorySelection: true,
      })
    }

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

    const seoKeys = new Set(EBAY_SEO_ASPECT_PRIORITY.map((n) => n.toLowerCase()))
    const formFieldsByKey = new Map<string, EbayAspectFormField>()

    for (const aspect of taxonomyAspects) {
      const name = aspect.localizedAspectName?.trim()
      if (!name) continue
      const key = name.toLowerCase()
      const usage = aspectUsage(aspect)
      const required = usage === "REQUIRED"
      const isSeo = seoKeys.has(key)
      // Include required, recommended, SEO priority, and optional with values — full set.
      if (!required && usage === "OPTIONAL" && !isSeo) {
        // Still include optional aspects so "More item specifics" is complete.
      }

      const allowed = allowedValues(aspect)
      const resolved = applied.aspects[name]?.[0]?.trim()
      const missingEntry = applied.missingRequired.find(
        (f) => f.name.toLowerCase() === key
      )
      formFieldsByKey.set(key, {
        name,
        required,
        primary: required || isPrimaryVisibleAspect(name),
        allowedValues: allowed.length > 0 ? allowed.slice(0, 120) : undefined,
        suggestedValue: missingEntry?.suggestedValue,
        value: resolved || undefined,
      })
    }

    for (const missing of applied.missingRequired) {
      const key = missing.name.toLowerCase()
      if (formFieldsByKey.has(key)) continue
      formFieldsByKey.set(key, {
        name: missing.name,
        required: true,
        primary: true,
        allowedValues: missing.allowedValues,
        suggestedValue: missing.suggestedValue,
      })
    }

    const formFields = [...formFieldsByKey.values()].sort((a, b) => {
      const ai = EBAY_SEO_ASPECT_PRIORITY.findIndex(
        (n) => n.toLowerCase() === a.name.toLowerCase()
      )
      const bi = EBAY_SEO_ASPECT_PRIORITY.findIndex(
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

    const seoTotal = formFields.length
    const seoCompleted = formFields.filter((f) => f.value?.trim()).length

    const extras = { ...(listing.specifics.extras || {}) }
    for (const field of applied.resolvedFields) {
      if (field.value?.trim()) extras[field.name] = field.value.trim()
    }
    const listingForTitle: Listing = {
      ...listing,
      specifics: { ...listing.specifics, extras },
    }
    const suggestedTitle = enrichEbayTitleTowardLimit(
      listing.title,
      listingForTitle
    )

    let conditions: Array<{
      conditionId: string
      conditionDescription: string
      conditionHelpText?: string
    }> = []
    let mappedCondition = null as ReturnType<typeof mapAiConditionToPolicy>
    let itemConditionRequired = false
    try {
      const policy = await getItemConditionPoliciesForCategory(
        token.accessToken,
        categoryId,
        marketplaceId
      )
      conditions = policy.conditions
      itemConditionRequired = policy.itemConditionRequired
      mappedCondition = mapAiConditionToPolicy(
        listing.specifics.condition ||
          listing.fieldConfidence?.condition?.value,
        policy.conditions
      )
    } catch (err) {
      console.warn("[ebay/aspects-preview] condition policies", err)
    }

    const categoryPath =
      listing.specifics.ebayCategory?.categoryPath ||
      selectedSuggestion?.categoryPath ||
      listing.specifics.category ||
      selectedSuggestion?.categoryName ||
      ""
    const categoryName =
      listing.specifics.ebayCategory?.categoryName ||
      selectedSuggestion?.categoryName ||
      ""

    return NextResponse.json({
      marketplaceId,
      categoryTreeId: tree.categoryTreeId,
      categoryId,
      categoryName,
      categoryPath,
      leafCategory: true,
      categorySuggestions: suggestions,
      formFields,
      requiredFields: applied.missingRequired,
      resolvedFields: applied.resolvedFields,
      filledRequired: applied.filledRequired,
      missingRequiredNames: missingNames,
      aspectFilledCount: filledNames.size,
      aspectTotalCount: relevant.length,
      seoCompleted,
      seoTotal,
      suggestedTitle,
      conditions,
      itemConditionRequired,
      mappedCondition,
      validConditionIds: conditions.map((c) => c.conditionId),
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
