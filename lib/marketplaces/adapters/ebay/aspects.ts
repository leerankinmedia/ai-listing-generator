import type { Listing } from "@/lib/types"
import { ebayFetch } from "@/lib/marketplaces/adapters/ebay/client"
import { MarketplaceError } from "@/lib/marketplaces/adapters/types"

export type EbayAspectValue = {
  localizedValue?: string
}

export type EbayAspectConstraint = {
  aspectRequired?: boolean
  aspectMode?: string
  aspectDataType?: string
  itemToAspectCardinality?: string
}

export type EbayAspect = {
  localizedAspectName?: string
  aspectConstraint?: EbayAspectConstraint
  aspectValues?: EbayAspectValue[]
}

type ItemAspectsResponse = {
  aspects?: EbayAspect[]
}

export type RequiredEbayField = {
  name: string
  allowedValues?: string[]
}

function marketplaceId() {
  return process.env.EBAY_MARKETPLACE_ID || "EBAY_US"
}

async function getDefaultCategoryTreeId(accessToken: string) {
  const tree = (await ebayFetch(
    `/commerce/taxonomy/v1/get_default_category_tree_id?marketplace_id=${encodeURIComponent(marketplaceId())}`,
    accessToken,
    { method: "GET", step: "getDefaultCategoryTreeIdForAspects" }
  )) as { categoryTreeId?: string } | null

  const categoryTreeId = tree?.categoryTreeId?.trim()
  if (!categoryTreeId) {
    throw new MarketplaceError(
      "Could not load eBay category tree for item aspects.",
      "ebay_category_tree_missing",
      502
    )
  }
  return categoryTreeId
}

/** Taxonomy getItemAspectsForCategory for a leaf category. */
export async function fetchEbayItemAspectsForCategory(
  accessToken: string,
  categoryId: string
): Promise<EbayAspect[]> {
  const categoryTreeId = await getDefaultCategoryTreeId(accessToken)
  const payload = (await ebayFetch(
    `/commerce/taxonomy/v1/category_tree/${encodeURIComponent(categoryTreeId)}/get_item_aspects_for_category?category_id=${encodeURIComponent(categoryId)}`,
    accessToken,
    { method: "GET", step: "getItemAspectsForCategory" }
  )) as ItemAspectsResponse | null

  return payload?.aspects ?? []
}

function allowedValues(aspect: EbayAspect): string[] {
  return (aspect.aspectValues || [])
    .map((v) => v.localizedValue?.trim())
    .filter((v): v is string => Boolean(v))
}

function findAllowedValue(
  candidates: Array<string | undefined>,
  allowed: string[],
  selectionOnly: boolean
): string | undefined {
  const normalizedAllowed = allowed.map((v) => ({
    raw: v,
    key: v.toLowerCase(),
  }))

  for (const candidate of candidates) {
    const value = candidate?.trim()
    if (!value) continue
    if (allowed.length === 0) {
      // FREE_TEXT / open aspect — accept inferred value.
      if (!selectionOnly) return value
      continue
    }
    const match = normalizedAllowed.find((a) => a.key === value.toLowerCase())
    if (match) return match.raw
  }
  return undefined
}

function listingCandidatesForAspect(
  listing: Listing,
  aspectName: string
): Array<string | undefined> {
  const extras = listing.specifics.extras || {}
  const nameKey = aspectName.toLowerCase()
  const fromExtras =
    extras[aspectName] ||
    Object.entries(extras).find(([k]) => k.toLowerCase() === nameKey)?.[1]

  switch (nameKey) {
    case "brand":
      return [fromExtras, listing.specifics.brand, "Unbranded"]
    case "size":
      return [fromExtras, listing.specifics.size]
    case "color":
    case "colour":
      return [fromExtras, listing.specifics.color]
    case "material":
      return [fromExtras, listing.specifics.material]
    case "style":
      return [fromExtras, listing.specifics.style]
    case "pattern":
      return [fromExtras, listing.specifics.pattern]
    case "department":
    case "gender":
      return [fromExtras, listing.specifics.gender]
    case "size type":
      return [
        fromExtras,
        inferSizeTypeFromListing(listing),
        "Regular",
        "Regular Size",
      ]
    default:
      return [fromExtras]
  }
}

/**
 * Infer a Size Type candidate from listing size / title text.
 * Final value is only applied when allowed for the category.
 */
function inferSizeTypeFromListing(listing: Listing): string | undefined {
  const hay = `${listing.specifics.size || ""} ${listing.title || ""}`.toLowerCase()
  if (/\bpetite\b/.test(hay)) return "Petite"
  if (/\bplus\b/.test(hay) || /\b1[x-z]\b/.test(hay) || /\b2[x-z]\b/.test(hay)) {
    return "Plus"
  }
  if (/\bbig\b|\btall\b|\bbig ?& ?tall\b/.test(hay)) return "Big & Tall"
  if (/\bjunior/.test(hay)) return "Juniors"
  if (/\bmaternity\b/.test(hay)) return "Maternity"
  return undefined
}

/**
 * Merge listing specifics into inventory aspects, filling every required Taxonomy
 * aspect when a valid value can be inferred. Returns missing required fields
 * (with allowed values) instead of inventing invalid data.
 */
export function applyRequiredEbayAspects(
  listing: Listing,
  taxonomyAspects: EbayAspect[],
  existingAspects: Record<string, string[]>
): {
  aspects: Record<string, string[]>
  missingRequired: RequiredEbayField[]
  filledRequired: string[]
} {
  const aspects: Record<string, string[]> = { ...existingAspects }
  const missingRequired: RequiredEbayField[] = []
  const filledRequired: string[] = []

  const required = taxonomyAspects.filter(
    (a) => a.aspectConstraint?.aspectRequired && a.localizedAspectName?.trim()
  )

  for (const aspect of required) {
    const name = aspect.localizedAspectName!.trim()
    const allowed = allowedValues(aspect)
    const selectionOnly =
      (aspect.aspectConstraint?.aspectMode || "").toUpperCase() ===
      "SELECTION_ONLY"

    // Preserve already-set values when they are valid for this category.
    const current = aspects[name]?.[0]
    if (current) {
      const kept = findAllowedValue([current], allowed, selectionOnly)
      if (kept || (!selectionOnly && allowed.length === 0)) {
        aspects[name] = [kept || current]
        filledRequired.push(name)
        continue
      }
      // Invalid existing value — clear and try to re-infer.
      delete aspects[name]
    }

    const inferred = findAllowedValue(
      listingCandidatesForAspect(listing, name),
      allowed,
      selectionOnly
    )

    if (inferred) {
      aspects[name] = [inferred]
      filledRequired.push(name)
      continue
    }

    missingRequired.push({
      name,
      allowedValues: allowed.length > 0 ? allowed.slice(0, 40) : undefined,
    })
  }

  console.info("[ebay/taxonomy] TEMP required aspects", {
    requiredCount: required.length,
    filledRequired: filledRequired.join(","),
    missingRequired: missingRequired.map((f) => f.name).join(","),
  })

  return { aspects, missingRequired, filledRequired }
}

export function missingAspectsError(missingRequired: RequiredEbayField[]) {
  const names = missingRequired.map((f) => f.name)
  return new MarketplaceError(
    `Required eBay item specifics need values before publishing: ${names.join(", ")}. Fill the editable fields below and try again.`,
    "ebay_aspects_required",
    400,
    { requiredFields: missingRequired }
  )
}
