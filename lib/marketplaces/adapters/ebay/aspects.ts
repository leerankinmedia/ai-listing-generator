import type { Listing } from "@/lib/types"
import {
  colorIsBlackFamily,
  colorIsGrayFamily,
  isHighConfidenceField,
  matchExactEbayAspectValue,
} from "@/lib/marketplaces/adapters/ebay/aspect-normalize"
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
  /** Exact eBay allowed value to preselect when a normalized match exists. */
  suggestedValue?: string
}

export type ResolvedEbayAspect = {
  name: string
  value: string
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

function isExactAllowed(value: string, allowed: string[]): boolean {
  if (allowed.length === 0) return true
  const key = value.trim().toLowerCase()
  return allowed.some((a) => a.trim().toLowerCase() === key)
}

function confidenceForAspect(listing: Listing, aspectName: string): number | undefined {
  const name = aspectName.toLowerCase()
  const fc = listing.fieldConfidence || {}
  if (name === "brand") return fc.brand?.confidence
  if (name === "size") return fc.size?.confidence
  if (name === "color" || name === "colour") return fc.color?.confidence
  if (name === "material") return fc.material?.confidence
  if (name === "style") return fc.style?.confidence
  if (name === "pattern") return fc.pattern?.confidence
  if (name === "department" || name === "gender") return fc.gender?.confidence
  if (name === "size type") return fc.size?.confidence
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
      // Prefer detected listing color before extras so a stale auto-mapped
      // extras value (e.g. Black) cannot override Dark Gray → Gray.
      return [listing.specifics.color, fromExtras]
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
    case "type":
      return [
        fromExtras,
        listing.specifics.style,
        listing.specifics.category,
        listing.title,
      ]
    case "theme":
      return [fromExtras, listing.specifics.pattern, listing.specifics.style]
    default:
      return [fromExtras, listing.specifics.extras?.[aspectName]]
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
 * aspect with an *exact* allowed eBay value when a normalized match exists.
 * Never invents values outside the allowed list for SELECTION_ONLY aspects.
 * Preserves values that already exactly match an allowed option (manual picks).
 */
export function applyRequiredEbayAspects(
  listing: Listing,
  taxonomyAspects: EbayAspect[],
  existingAspects: Record<string, string[]>
): {
  aspects: Record<string, string[]>
  missingRequired: RequiredEbayField[]
  filledRequired: string[]
  /** Exact eBay values resolved for required aspects (for client preselect / state). */
  resolvedFields: ResolvedEbayAspect[]
} {
  const aspects: Record<string, string[]> = { ...existingAspects }
  const missingRequired: RequiredEbayField[] = []
  const filledRequired: string[] = []
  const resolvedFields: ResolvedEbayAspect[] = []

  const required = taxonomyAspects.filter(
    (a) => a.aspectConstraint?.aspectRequired && a.localizedAspectName?.trim()
  )

  for (const aspect of required) {
    const name = aspect.localizedAspectName!.trim()
    const allowed = allowedValues(aspect)
    const selectionOnly =
      (aspect.aspectConstraint?.aspectMode || "").toUpperCase() ===
      "SELECTION_ONLY"
    const highConfidence = isHighConfidenceField(
      confidenceForAspect(listing, name)
    )

    // Preserve exact manual / already-valid selections — never overwrite them.
    // Exception: Color — do not keep a stale Black when detected color is gray-family.
    const current = aspects[name]?.[0]?.trim()
    const isColorAspect =
      name.toLowerCase() === "color" || name.toLowerCase() === "colour"
    const detectedColor = listing.specifics.color
    const staleBlackForGray =
      isColorAspect &&
      colorIsGrayFamily(detectedColor) &&
      colorIsBlackFamily(current)

    if (current && isExactAllowed(current, allowed) && !staleBlackForGray) {
      const exact =
        allowed.find((a) => a.toLowerCase() === current.toLowerCase()) || current
      aspects[name] = [exact]
      filledRequired.push(name)
      resolvedFields.push({ name, value: exact })
      continue
    }

    // If extras already holds an exact allowed value, keep it — unless it's a
    // stale Black overriding a gray-family detection.
    const extrasExact = (() => {
      const raw = listing.specifics.extras?.[name]?.trim()
      if (!raw) return undefined
      if (
        isColorAspect &&
        colorIsGrayFamily(detectedColor) &&
        colorIsBlackFamily(raw)
      ) {
        return undefined
      }
      if (isExactAllowed(raw, allowed)) {
        return (
          allowed.find((a) => a.toLowerCase() === raw.toLowerCase()) || raw
        )
      }
      return undefined
    })()
    if (extrasExact) {
      aspects[name] = [extrasExact]
      filledRequired.push(name)
      resolvedFields.push({ name, value: extrasExact })
      continue
    }

    if (current) {
      delete aspects[name]
    }

    const inferred = matchExactEbayAspectValue(
      name,
      listingCandidatesForAspect(listing, name),
      allowed,
      { selectionOnly, highConfidence }
    )

    if (inferred) {
      aspects[name] = [inferred]
      filledRequired.push(name)
      resolvedFields.push({ name, value: inferred })
      continue
    }

    // Still missing — if AI had a near candidate, surface suggestedValue only when
    // it resolves to an exact allowed option (should be rare after match above).
    const suggestedValue = matchExactEbayAspectValue(
      name,
      listingCandidatesForAspect(listing, name),
      allowed,
      { selectionOnly: true, highConfidence }
    )

    missingRequired.push({
      name,
      allowedValues: allowed.length > 0 ? allowed.slice(0, 80) : undefined,
      suggestedValue,
    })
  }

  // Also normalize non-required but commonly mapped aspects already present so
  // publish never sends AI wording against a fixed selection list.
  for (const aspect of taxonomyAspects) {
    const name = aspect.localizedAspectName?.trim()
    if (!name || aspect.aspectConstraint?.aspectRequired) continue
    const allowed = allowedValues(aspect)
    if (allowed.length === 0) continue
    const selectionOnly =
      (aspect.aspectConstraint?.aspectMode || "").toUpperCase() ===
      "SELECTION_ONLY"
    const current = aspects[name]?.[0]
    if (!current) {
      const inferred = matchExactEbayAspectValue(
        name,
        listingCandidatesForAspect(listing, name),
        allowed,
        {
          selectionOnly,
          highConfidence: isHighConfidenceField(
            confidenceForAspect(listing, name)
          ),
        }
      )
      if (inferred) {
        aspects[name] = [inferred]
        resolvedFields.push({ name, value: inferred })
      }
      continue
    }
    if (isExactAllowed(current, allowed)) {
      const exact =
        allowed.find((a) => a.toLowerCase() === current.toLowerCase()) ||
        current
      aspects[name] = [exact]
      continue
    }
    const normalized = matchExactEbayAspectValue(
      name,
      [current, ...listingCandidatesForAspect(listing, name)],
      allowed,
      {
        selectionOnly,
        highConfidence: isHighConfidenceField(
          confidenceForAspect(listing, name)
        ),
      }
    )
    if (normalized) {
      aspects[name] = [normalized]
      resolvedFields.push({ name, value: normalized })
    } else if (selectionOnly) {
      // Do not send invalid AI wording for fixed lists.
      delete aspects[name]
    }
  }

  console.info("[ebay/taxonomy] TEMP required aspects", {
    requiredCount: required.length,
    filledRequired: filledRequired.join(","),
    missingRequired: missingRequired.map((f) => f.name).join(","),
    resolved: resolvedFields.map((f) => `${f.name}=${f.value}`).join(","),
  })

  return { aspects, missingRequired, filledRequired, resolvedFields }
}

export function missingAspectsError(
  missingRequired: RequiredEbayField[],
  resolvedFields: ResolvedEbayAspect[] = []
) {
  const names = missingRequired.map((f) => f.name)
  return new MarketplaceError(
    `Required eBay item specifics need values before publishing: ${names.join(", ")}. Fill the editable fields below and try again.`,
    "ebay_aspects_required",
    400,
    { requiredFields: missingRequired, resolvedFields }
  )
}
