import type { Listing } from "@/lib/types"
import {
  colorIsBlackFamily,
  colorIsGrayFamily,
  isHighConfidenceField,
  matchExactEbayAspectValue,
  resolveEbayGrayAspectValue,
  splitPrimaryColorAndDetails,
} from "@/lib/marketplaces/adapters/ebay/aspect-normalize"
import { ebayFetch } from "@/lib/marketplaces/adapters/ebay/client"
import { MarketplaceError } from "@/lib/marketplaces/adapters/types"
import {
  ASPECT_AUTO_FILL_CONFIDENCE,
  EBAY_SEO_ASPECT_PRIORITY,
  isMeasurementAspect,
  isSeoPriorityAspect,
} from "@/lib/listings/ebay-aspect-fields"

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
  if (name === "size" || name === "waist size") return fc.size?.confidence
  if (name === "color" || name === "colour") return fc.color?.confidence
  if (name === "material" || name === "fabric type") return fc.material?.confidence
  if (name === "style" || name === "fit" || name === "type" || name === "item type") {
    return fc.style?.confidence
  }
  if (name === "pattern" || name === "theme") return fc.pattern?.confidence
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
      // Never invent Unbranded — only use when AI/detected brand exists.
      return [fromExtras, listing.specifics.brand]
    case "size":
      return [fromExtras, listing.specifics.size]
    case "waist size":
      // Measurement — explicit only, never invent from garment size letters.
      return [
        fromExtras,
        extras["Waist Size"],
        extras.waist,
        // Numeric waist in size like "32x32" or "W32"
        extractNumericWaist(listing.specifics.size || listing.title || ""),
      ]
    case "inseam":
      return [
        fromExtras,
        extras.Inseam,
        extras.inseam,
        extractNumericInseam(listing.specifics.size || listing.title || ""),
      ]
    case "color":
    case "colour":
      return [
        listing.fieldConfidence?.color?.value,
        listing.specifics.color,
        fromExtras,
      ]
    case "material":
      return [fromExtras, listing.specifics.material]
    case "fabric type":
      return [fromExtras, extras["Fabric Type"], listing.specifics.material]
    case "style":
      return [
        fromExtras,
        listing.fieldConfidence?.style?.value,
        listing.specifics.style,
      ]
    case "pattern":
      return [fromExtras, listing.specifics.pattern]
    case "department":
    case "gender":
      return [fromExtras, listing.specifics.gender]
    case "size type":
      // Only when size/title implies a type — never default to Regular.
      return [fromExtras, inferSizeTypeFromListing(listing)]
    case "type":
    case "item type":
      return [
        fromExtras,
        listing.specifics.style,
        inferGarmentType(listing),
      ]
    case "theme":
      return [fromExtras, listing.specifics.pattern]
    case "rise":
      return [fromExtras, extras.Rise, extras.rise]
    case "fit":
      return [fromExtras, extras.Fit, extras.fit, listing.specifics.style]
    case "fabric wash":
    case "wash":
      return [fromExtras, extras["Fabric Wash"], extras.Wash]
    case "features":
      return [fromExtras, extras.Features]
    case "closure":
      return [fromExtras, extras.Closure]
    case "vintage":
      // Only when explicitly known — never invent "No".
      return [fromExtras, extras.Vintage]
    case "season":
      return [fromExtras, extras.Season]
    case "pocket type":
      return [fromExtras, extras["Pocket Type"], extras.Pocket]
    case "country of origin":
      return [fromExtras, extras["Country of Origin"], extras.Country]
    default:
      return [
        fromExtras,
        listing.specifics.extras?.[aspectName],
        ...Object.entries(extras)
          .filter(([k]) => k.toLowerCase() === nameKey)
          .map(([, v]) => v),
      ]
  }
}

function extractNumericWaist(text: string): string | undefined {
  const m =
    text.match(/\b(?:w\s*)?(\d{2})\s*[x×\/]\s*\d{2}\b/i) ||
    text.match(/\bw(?:aist)?[:\s-]*(\d{2})\b/i)
  if (!m) return undefined
  const n = Number(m[1])
  if (n >= 22 && n <= 60) return String(n)
  return undefined
}

function extractNumericInseam(text: string): string | undefined {
  const m =
    text.match(/\b\d{2}\s*[x×\/]\s*(\d{2})\b/i) ||
    text.match(/\b(?:l|inseam)[:\s-]*(\d{2})\b/i)
  if (!m) return undefined
  const n = Number(m[1])
  if (n >= 24 && n <= 38) return String(n)
  return undefined
}

function inferGarmentType(listing: Listing): string | undefined {
  const hay =
    `${listing.specifics.category || ""} ${listing.title || ""} ${listing.specifics.style || ""}`.toLowerCase()
  if (/\bjeans?\b/.test(hay)) return "Jeans"
  if (/\bt-?shirts?\b|\btees?\b/.test(hay)) return "T-Shirt"
  if (/\bhoodies?\b/.test(hay)) return "Hoodie"
  if (/\bsweatshirts?\b/.test(hay)) return "Sweatshirt"
  if (/\bjackets?\b/.test(hay)) return "Jacket"
  if (/\bdresses?\b/.test(hay)) return "Dress"
  if (/\bshorts?\b/.test(hay)) return "Shorts"
  if (/\bskirts?\b/.test(hay)) return "Skirt"
  if (/\bleggings?\b/.test(hay)) return "Leggings"
  if (/\bpants?\b|\btrousers?\b/.test(hay)) return "Pants"
  return undefined
}

/** True when Vision/detected color or form state still indicates gray-family. */
function listingHasGrayFamilyColor(
  listing: Listing,
  aspects?: Record<string, string[]>
): boolean {
  const extras = listing.specifics.extras || {}
  const signals = [
    listing.fieldConfidence?.color?.value,
    listing.specifics.color,
    extras.Color,
    extras.Colour,
    aspects?.Color?.[0],
    aspects?.Colour?.[0],
  ]
  return signals.some((v) => colorIsGrayFamily(v))
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
    // ≥90% AI confidence enables fuzzy shade maps onto exact eBay options.
    const autoFillReady =
      (confidenceForAspect(listing, name) ?? 0) >= ASPECT_AUTO_FILL_CONFIDENCE ||
      highConfidence

    // Preserve exact manual / already-valid selections — never overwrite them.
    // Exception: Color — do not keep a stale Black when any gray-family signal
    // remains (detected attributes, specifics, or fieldConfidence).
    const current = aspects[name]?.[0]?.trim()
    const isColorAspect =
      name.toLowerCase() === "color" || name.toLowerCase() === "colour"
    const grayDetected =
      isColorAspect && listingHasGrayFamilyColor(listing, aspects)
    const staleBlackForGray =
      isColorAspect && grayDetected && colorIsBlackFamily(current)

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
      if (isColorAspect && grayDetected && colorIsBlackFamily(raw)) {
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
      {
        selectionOnly,
        // Measurements: exact match only — never fuzzy-invent inches.
        // Other aspects: fuzzy only when AI confidence is high (≥90% preferred).
        highConfidence: isMeasurementAspect(name) ? false : autoFillReady,
      }
    )

    if (inferred) {
      aspects[name] = [inferred]
      filledRequired.push(name)
      resolvedFields.push({ name, value: inferred })
      continue
    }

    // Still missing — if AI had a near candidate, surface suggestedValue only when
    // it resolves to an exact allowed option (should be rare after match above).
    const suggestedValue = isMeasurementAspect(name)
      ? undefined
      : matchExactEbayAspectValue(
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

  // Populate recommended / high-search clothing specifics with exact allowed
  // values when confidently known. Never invent measurements or uncertain data.
  const seoPriorityKeys = new Set(
    EBAY_SEO_ASPECT_PRIORITY.map((n) => n.toLowerCase())
  )
  for (const aspect of taxonomyAspects) {
    const name = aspect.localizedAspectName?.trim()
    if (!name || aspect.aspectConstraint?.aspectRequired) continue
    const key = name.toLowerCase()
    const allowed = allowedValues(aspect)
    const selectionOnly =
      (aspect.aspectConstraint?.aspectMode || "").toUpperCase() ===
      "SELECTION_ONLY"
    const isSeo = seoPriorityKeys.has(key) || isSeoPriorityAspect(name)
    const conf = confidenceForAspect(listing, name)
    const highConfidence =
      (conf ?? 0) >= ASPECT_AUTO_FILL_CONFIDENCE ||
      isHighConfidenceField(conf)
    const current = aspects[name]?.[0]

    // Skip inventing measurement aspects without an explicit candidate.
    if (isMeasurementAspect(name)) {
      const candidates = listingCandidatesForAspect(listing, name).filter(
        (c) => c?.trim()
      )
      if (candidates.length === 0) {
        if (current && allowed.length > 0 && !isExactAllowed(current, allowed)) {
          delete aspects[name]
        }
        continue
      }
    }

    if (!current) {
      // Only auto-fill SEO / recommended clothing aspects (or free-text with signal).
      if (!isSeo && allowed.length > 0) continue
      // Exact/synonym match always OK; fuzzy shade only at ≥90% confidence.
      const allowFuzzy =
        !isMeasurementAspect(name) &&
        (conf ?? 0) >= ASPECT_AUTO_FILL_CONFIDENCE
      const inferred = matchExactEbayAspectValue(
        name,
        listingCandidatesForAspect(listing, name),
        allowed,
        {
          selectionOnly: selectionOnly || allowed.length > 0,
          highConfidence: allowFuzzy,
        }
      )
      if (inferred) {
        aspects[name] = [inferred]
        resolvedFields.push({ name, value: inferred })
      }
      continue
    }
    if (allowed.length === 0) continue
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
        highConfidence:
          !isMeasurementAspect(name) &&
          ((conf ?? 0) >= ASPECT_AUTO_FILL_CONFIDENCE || highConfidence),
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

/**
 * Final Color aspect correction immediately before inventory write.
 * Forces Dark Gray / Charcoal / Grey → exact eBay Gray (never Black).
 * Primary colors only on Color (e.g. White with red stitch → White).
 */
export function finalizeEbayColorAspect(
  listing: Listing,
  taxonomyAspects: EbayAspect[],
  existingAspects: Record<string, string[]>
): {
  aspects: Record<string, string[]>
  color?: string
} {
  const aspects: Record<string, string[]> = { ...existingAspects }
  const colorAspect =
    taxonomyAspects.find((a) => {
      const n = a.localizedAspectName?.trim().toLowerCase()
      return n === "color" || n === "colour"
    }) || null
  const aspectName = colorAspect?.localizedAspectName?.trim() || "Color"
  const allowed = colorAspect ? allowedValues(colorAspect) : []

  const extras = listing.specifics.extras || {}
  const grayFamily = listingHasGrayFamilyColor(listing, aspects)
  const signals = [
    listing.fieldConfidence?.color?.value,
    listing.specifics.color,
    // Ignore stale Black extras when detection is gray-family.
    grayFamily && colorIsBlackFamily(extras.Color) ? undefined : extras.Color,
    grayFamily && colorIsBlackFamily(extras.Colour)
      ? undefined
      : extras.Colour,
    grayFamily && colorIsBlackFamily(aspects.Color?.[0])
      ? undefined
      : aspects.Color?.[0],
    grayFamily && colorIsBlackFamily(aspects.Colour?.[0])
      ? undefined
      : aspects.Colour?.[0],
    grayFamily ? "Dark Gray" : undefined,
    grayFamily ? "Charcoal" : undefined,
    grayFamily ? "Grey" : undefined,
    grayFamily ? "Gray" : undefined,
  ]

  let finalColor = matchExactEbayAspectValue(aspectName, signals, allowed, {
    selectionOnly: allowed.length > 0,
    highConfidence: true,
  })

  if (grayFamily) {
    const grayOpt = resolveEbayGrayAspectValue(allowed)
    if (grayOpt) finalColor = grayOpt
    else if (!finalColor || colorIsBlackFamily(finalColor)) finalColor = "Gray"
  }

  if (finalColor) {
    // Inventory API expects product.aspects.Color as an exact allowed value.
    aspects.Color = [finalColor]
    aspects[aspectName] = [finalColor]
    if (aspectName.toLowerCase() === "colour") {
      aspects.Colour = [finalColor]
    }
  }

  console.info("[ebay/color] TEMP finalize Color aspect", {
    detected:
      listing.fieldConfidence?.color?.value ||
      listing.specifics.color ||
      null,
    selected: finalColor || null,
    payloadColor: aspects.Color?.[0] || null,
  })

  return { aspects, color: finalColor }
}

/**
 * Move accent details out of Color ("White with red stitch" → Color White,
 * detail "red stitching" into Accents / Pattern / Style / description).
 */
export function relocateEbayColorAccentDetails(
  listing: Listing,
  existingAspects: Record<string, string[]>,
  description: string
): {
  aspects: Record<string, string[]>
  description: string
  accentDetail?: string
} {
  const aspects: Record<string, string[]> = { ...existingAspects }
  const raw =
    listing.fieldConfidence?.color?.value ||
    listing.specifics.color ||
    aspects.Color?.[0] ||
    ""
  const split = splitPrimaryColorAndDetails(raw)
  const detail = split.detail?.trim()
  if (!detail) {
    return { aspects, description }
  }

  const detailKey = detail.toLowerCase()
  if (!aspects.Accents?.[0]?.trim()) {
    aspects.Accents = [detail]
  }

  const looksPattern =
    /\b(stripe|striped|plaid|floral|print|graphic|logo|dot|camo)\b/i.test(detail)
  if (looksPattern && !aspects.Pattern?.[0]?.trim()) {
    aspects.Pattern = [detail]
  } else if (
    !looksPattern &&
    !aspects.Style?.[0]?.trim() &&
    /\b(stitch|embroidery|trim|piping|contrast)\b/i.test(detail)
  ) {
    // Keep Style if empty and detail is a style accent — optional.
    // Prefer Accents for stitching; leave Style alone when Pattern fits better.
  }

  let nextDescription = description || ""
  if (!nextDescription.toLowerCase().includes(detailKey)) {
    nextDescription = `${nextDescription.trim()}\n\nDetails: ${detail}.`.trim()
  }

  console.info("[ebay/color] relocated accent detail from Color", {
    primary: split.primaryLabel || aspects.Color?.[0] || null,
    detail,
  })

  return { aspects, description: nextDescription, accentDetail: detail }
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
