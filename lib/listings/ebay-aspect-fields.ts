/**
 * Shared helpers for eBay item-specific fields — AI-employee autofill UX.
 *
 * Confidence tiers:
 * - ≥95%: auto-select exact eBay value (no user interaction)
 * - 70–94%: preselect most likely value + show Review
 * - <70%: leave blank
 */

import {
  colorIsBlackFamily,
  colorIsGrayFamily,
  matchBrandToEbayList,
  matchExactEbayAspectValue,
  matchStyleToEbayList,
  resolveSizeTypeFromText,
} from "@/lib/marketplaces/adapters/ebay/aspect-normalize"
import type { Listing } from "@/lib/types"

const KNOWN_SPECIFIC_KEYS = new Set([
  "brand",
  "size",
  "color",
  "material",
  "style",
  "pattern",
  "gender",
])

/** Auto-select without user interaction when confidence ≥ this. */
export const ASPECT_AUTO_FILL_CONFIDENCE = 0.95
/** Legacy review band — if AI value maps to an eBay option, still auto-select. */
export const ASPECT_REVIEW_CONFIDENCE = 0.7

/** Must-fill clothing aspects — never leave blank when AI/eBay can determine. */
export const MUST_FILL_ASPECTS = new Set(["brand", "style", "size type"])

export function isMustFillAspect(name: string): boolean {
  return MUST_FILL_ASPECTS.has(name.trim().toLowerCase())
}

export type EbayAspectFormField = {
  name: string
  required: boolean
  allowedValues?: string[]
  suggestedValue?: string
  value?: string
  primary?: boolean
}

export type AspectFieldStatus =
  | "auto_filled"
  | "needs_review"
  | "needs_input"
  | "optional_blank"

export type AspectFieldView = {
  field: EbayAspectFormField
  value: string
  status: AspectFieldStatus
  confidence?: number
}

export type AiEmployeeAspectSummary = {
  completed: number
  total: number
  needsAttention: number
  autoFilled: number
  review: number
}

/**
 * Clothing / SEO specifics the AI employee should try to complete.
 */
export const EBAY_SEO_ASPECT_PRIORITY = [
  "Brand",
  "Size Type",
  "Size",
  "Style",
  "Pattern",
  "Material",
  "Fabric Type",
  "Color",
  "Department",
  "Type",
  "Features",
  "Character",
  "Theme",
  "Closure",
  "Rise",
  "Fit",
  "Season",
  "Pocket Type",
  "Country of Origin",
  "Fabric Wash",
  "Waist Size",
  "Inseam",
  "Vintage",
] as const

export const EBAY_PRIMARY_VISIBLE_ASPECTS = [
  "Brand",
  "Size Type",
  "Size",
  "Style",
  "Color",
  "Department",
  "Type",
] as const

export const EBAY_MEASUREMENT_ASPECTS = new Set([
  "waist size",
  "inseam",
  "rise",
  "chest size",
  "length",
  "sleeve length",
  "hip size",
  "neck size",
])

export const EBAY_FORM_ASPECT_PRIORITY = [...EBAY_SEO_ASPECT_PRIORITY]

export function isMeasurementAspect(name: string): boolean {
  return EBAY_MEASUREMENT_ASPECTS.has(name.trim().toLowerCase())
}

export function isPrimaryVisibleAspect(name: string): boolean {
  const key = name.trim().toLowerCase()
  return EBAY_PRIMARY_VISIBLE_ASPECTS.some((n) => n.toLowerCase() === key)
}

export function isSeoPriorityAspect(name: string): boolean {
  const key = name.trim().toLowerCase()
  return EBAY_SEO_ASPECT_PRIORITY.some((n) => n.toLowerCase() === key)
}

export function confidenceForListingAspect(
  listing: Listing,
  aspectName: string
): number | undefined {
  const name = aspectName.trim().toLowerCase()
  const fc = listing.fieldConfidence || {}
  if (name === "brand") return fc.brand?.confidence
  if (name === "size" || name === "waist size") return fc.size?.confidence
  if (name === "color" || name === "colour") return fc.color?.confidence
  if (name === "material" || name === "fabric type") return fc.material?.confidence
  if (
    name === "style" ||
    name === "fit" ||
    name === "type" ||
    name === "item type" ||
    name === "closure" ||
    name === "rise"
  ) {
    return fc.style?.confidence ?? fc.itemType?.confidence
  }
  if (name === "features") return fc.features?.confidence ?? fc.style?.confidence
  if (name === "character") return fc.character?.confidence
  if (name === "pattern") return fc.pattern?.confidence
  if (name === "theme") return fc.theme?.confidence ?? fc.pattern?.confidence
  if (name === "department" || name === "gender") return fc.gender?.confidence
  if (name === "size type") return fc.size?.confidence
  if (name === "season" || name === "pocket type") return fc.style?.confidence
  if (name === "country of origin") return fc.brand?.confidence
  if (name === "fabric wash") return fc.material?.confidence
  return undefined
}

export function isAutoFillConfidence(confidence: number | undefined): boolean {
  return typeof confidence === "number" && confidence >= ASPECT_AUTO_FILL_CONFIDENCE
}

export function isReviewConfidence(confidence: number | undefined): boolean {
  return (
    typeof confidence === "number" &&
    confidence >= ASPECT_REVIEW_CONFIDENCE &&
    confidence < ASPECT_AUTO_FILL_CONFIDENCE
  )
}

export function isBlankConfidence(confidence: number | undefined): boolean {
  return confidence == null || confidence < ASPECT_REVIEW_CONFIDENCE
}

export function mapAspectToListingField(
  aspectName: string
): keyof Listing["specifics"] | "extras" {
  const key = aspectName.trim().toLowerCase()
  if (KNOWN_SPECIFIC_KEYS.has(key)) return key as keyof Listing["specifics"]
  if (key === "department") return "gender"
  if (key === "colour") return "color"
  return "extras"
}

export function isExactOption(value: string, options: string[]): boolean {
  const key = value.trim().toLowerCase()
  return options.some((o) => o.trim().toLowerCase() === key)
}

/** eBay accepts free-text Brand values when the exact brand is not in the list. */
export function aspectAllowsCustomValue(aspectName: string): boolean {
  return aspectName.trim().toLowerCase() === "brand"
}

/**
 * Prefer eBay list match; otherwise keep the detected brand as a custom value.
 * Never invent Unbranded / Unknown.
 */
export function resolveBrandAspectValue(
  detected: string | undefined | null,
  options: string[]
): string {
  const raw = (detected || "").trim()
  if (!raw) return ""
  if (/^(unbranded|unknown|n\/?a|none|not\s*applicable)$/i.test(raw)) {
    return ""
  }
  if (options.length > 0) {
    const matched = matchBrandToEbayList(raw, options)
    if (matched.value) return matched.value
  }
  // Custom brand — preserve OCR/tag capitalization (e.g. VEES).
  return raw
}

export function detectedValueForAspect(
  listing: Listing,
  aspectName: string
): string | undefined {
  const name = aspectName.trim().toLowerCase()
  const fc = listing.fieldConfidence || {}
  if (name === "brand") return fc.brand?.value || listing.specifics.brand
  if (name === "size" || name === "waist size") {
    return fc.size?.value || listing.specifics.size
  }
  if (name === "color" || name === "colour") {
    return fc.color?.value || listing.specifics.color
  }
  if (name === "material" || name === "fabric type") {
    return fc.material?.value || listing.specifics.material
  }
  if (
    name === "style" ||
    name === "fit" ||
    name === "closure" ||
    name === "rise"
  ) {
    return fc.style?.value || listing.specifics.style
  }
  if (name === "type" || name === "item type") {
    return (
      listing.specifics.extras?.Type ||
      fc.itemType?.value ||
      fc.style?.value ||
      listing.specifics.style
    )
  }
  if (name === "features") {
    return (
      listing.specifics.extras?.Features ||
      fc.features?.value ||
      fc.style?.value
    )
  }
  if (name === "character") {
    return (
      listing.specifics.extras?.Character ||
      fc.character?.value
    )
  }
  if (name === "pattern") {
    return fc.pattern?.value || listing.specifics.pattern
  }
  if (name === "theme") {
    return (
      listing.specifics.extras?.Theme ||
      fc.theme?.value ||
      fc.pattern?.value ||
      listing.specifics.pattern
    )
  }
  if (name === "department" || name === "gender") {
    return fc.gender?.value || listing.specifics.gender
  }
  if (name === "size type") return fc.size?.value || listing.specifics.size
  return undefined
}

export function applyExactAspectsToListing(
  listing: Listing,
  fields: Array<{ name: string; value: string }>,
  optionsByName?: Map<string, string[]>
): Listing {
  if (fields.length === 0) return listing

  let specifics = { ...listing.specifics }
  let extras = { ...(listing.specifics.extras || {}) }
  let changed = false

  for (const field of fields) {
    const value = field.value?.trim()
    if (!value) continue
    const options = optionsByName?.get(field.name.toLowerCase())
    if (
      options &&
      options.length > 0 &&
      !isExactOption(value, options) &&
      !aspectAllowsCustomValue(field.name)
    ) {
      continue
    }

    const target = mapAspectToListingField(field.name)
    const existingExtra = extras[field.name]?.trim()
    const aspectKey = field.name.trim().toLowerCase()
    const isColorAspect = aspectKey === "color" || aspectKey === "colour"
    const detectedColor =
      listing.fieldConfidence?.color?.value || listing.specifics.color
    const staleBlackExtra =
      isColorAspect &&
      colorIsGrayFamily(detectedColor) &&
      colorIsBlackFamily(existingExtra)

    if (
      existingExtra &&
      isExactOption(existingExtra, options || [existingExtra]) &&
      !staleBlackExtra
    ) {
      // Preserve manual exact selection.
    } else if (existingExtra !== value) {
      extras = { ...extras, [field.name]: value }
      changed = true
    }

    if (target !== "extras" && !isColorAspect) {
      const current = (specifics[target] as string | undefined)?.trim()
      if (
        current &&
        options &&
        options.length > 0 &&
        isExactOption(current, options)
      ) {
        // Preserve manual exact selection.
      } else if (current !== value) {
        specifics = { ...specifics, [target]: value }
        changed = true
      }
    }
  }

  if (!changed) return listing
  return {
    ...listing,
    specifics: { ...specifics, extras },
    updatedAt: new Date().toISOString(),
  }
}

export function resolveSelectValue(
  fieldName: string,
  rawValue: string,
  options: string[],
  suggestedValue?: string,
  detectedValue?: string
): string {
  if (options.length === 0) return rawValue
  const nameKey = fieldName.trim().toLowerCase()
  const isColor = nameKey === "color" || nameKey === "colour"
  const preferNormalize =
    isColor &&
    (colorIsGrayFamily(detectedValue) || colorIsGrayFamily(rawValue))

  if (rawValue && isExactOption(rawValue, options) && !preferNormalize) {
    return (
      options.find((o) => o.toLowerCase() === rawValue.toLowerCase()) || rawValue
    )
  }
  if (suggestedValue && isExactOption(suggestedValue, options) && !preferNormalize) {
    return (
      options.find((o) => o.toLowerCase() === suggestedValue.toLowerCase()) ||
      suggestedValue
    )
  }

  // Brand: fuzzy match eBay list, else keep detected custom brand (e.g. VEES).
  if (nameKey === "brand") {
    for (const candidate of [detectedValue, rawValue, suggestedValue]) {
      const brand = resolveBrandAspectValue(candidate, options)
      if (brand) return brand
    }
    return ""
  }

  // Style: closest eBay style (Straight, Skinny, Flared…).
  if (nameKey === "style") {
    return (
      matchStyleToEbayList(detectedValue, options) ||
      matchStyleToEbayList(rawValue, options) ||
      matchStyleToEbayList(suggestedValue, options) ||
      ""
    )
  }

  // Size Type: special / Regular default handled by resolveMustFillAspectValue.
  if (nameKey === "size type") {
    const hay = [detectedValue, rawValue, suggestedValue].filter(Boolean).join(" ")
    return resolveSizeTypeFromText(hay, options) || ""
  }

  const matched = matchExactEbayAspectValue(
    fieldName,
    [detectedValue, rawValue, suggestedValue],
    options,
    {
      selectionOnly: true,
      highConfidence: true,
    }
  )
  return matched || ""
}

/**
 * Resolve Brand / Style / Size Type aggressively for zero-required openings.
 */
export function resolveMustFillAspectValue(
  fieldName: string,
  listing: Listing,
  options: string[]
): string {
  const nameKey = fieldName.trim().toLowerCase()
  const raw = readAspectValue(listing, fieldName)
  const detected = detectedValueForAspect(listing, fieldName)

  if (nameKey === "brand") {
    return resolveBrandAspectValue(
      detected || raw || listing.specifics.brand,
      options
    )
  }

  if (nameKey === "style") {
    return (
      matchStyleToEbayList(
        detected || raw || listing.specifics.style || listing.fieldConfidence?.style?.value,
        options
      ) ||
      matchExactEbayAspectValue(
        "Style",
        [
          detected,
          raw,
          listing.specifics.style,
          listing.title,
        ],
        options,
        { selectionOnly: true, highConfidence: true }
      ) ||
      ""
    )
  }

  if (nameKey === "size type") {
    const hay = [
      listing.specifics.size,
      listing.title,
      listing.description,
      listing.specifics.flaws,
      raw,
      detected,
    ]
      .filter(Boolean)
      .join(" ")
    return resolveSizeTypeFromText(hay, options) || ""
  }

  return resolveSelectValue(fieldName, raw, options, undefined, detected)
}

export function readAspectValue(listing: Listing, name: string): string {
  const fromExtras = listing.specifics.extras?.[name]
  if (fromExtras?.trim()) return fromExtras
  const extras = listing.specifics.extras || {}
  const hit = Object.entries(extras).find(
    ([k]) => k.toLowerCase() === name.trim().toLowerCase()
  )
  if (hit?.[1]?.trim()) return hit[1]
  const target = mapAspectToListingField(name)
  if (target === "extras") return ""
  return (listing.specifics[target] as string | undefined) ?? ""
}

export function writeAspectValue(
  listing: Listing,
  name: string,
  value: string
): Listing {
  const target = mapAspectToListingField(name)
  const aspectKey = name.trim().toLowerCase()
  const isColorAspect = aspectKey === "color" || aspectKey === "colour"
  const extras = {
    ...(listing.specifics.extras || {}),
    [name]: value,
  }
  if (target === "extras" || isColorAspect) {
    return {
      ...listing,
      specifics: { ...listing.specifics, extras },
      updatedAt: new Date().toISOString(),
    }
  }
  return {
    ...listing,
    specifics: {
      ...listing.specifics,
      [target]: value,
      extras,
    },
    updatedAt: new Date().toISOString(),
  }
}

export function resolveAspectFieldValue(
  field: EbayAspectFormField,
  listing: Listing
): string {
  const options = field.allowedValues || []
  if (isMustFillAspect(field.name)) {
    const must = resolveMustFillAspectValue(field.name, listing, options)
    if (must) return must
  }
  const raw = readAspectValue(listing, field.name)
  const detected = detectedValueForAspect(listing, field.name)
  if (options.length > 0) {
    return resolveSelectValue(
      field.name,
      raw,
      options,
      field.suggestedValue || field.value,
      detected
    )
  }
  return raw.trim() || field.value?.trim() || ""
}

/**
 * Classify for AI-employee UI.
 * If AI value maps to an eBay option, treat as auto_filled (not Review).
 * Only blank required fields need attention.
 */
export function classifyAspectField(
  field: EbayAspectFormField,
  listing: Listing
): AspectFieldView {
  const confidence = confidenceForListingAspect(listing, field.name)
  const value = resolveAspectFieldValue(field, listing)
  const empty = !value.trim()

  if (!empty) {
    // Known + on the eBay list (or free-text filled) → done. No Review nag.
    return { field, value, status: "auto_filled", confidence }
  }

  if (field.required) {
    return { field, value: "", status: "needs_input", confidence }
  }

  return { field, value: "", status: "optional_blank", confidence }
}

/**
 * Main page: only fields that need attention (Review or blank required).
 * Auto-filled (≥95%) collapse under More. Blank optionals are hidden.
 */
export function splitAspectFieldsForDisplay(
  fields: EbayAspectFormField[],
  listing: Listing
): {
  primary: AspectFieldView[]
  more: AspectFieldView[]
  autoFilledCount: number
  reviewCount: number
  hiddenBlankOptional: number
} {
  const primary: AspectFieldView[] = []
  const more: AspectFieldView[] = []
  let autoFilledCount = 0
  let reviewCount = 0
  let hiddenBlankOptional = 0

  for (const field of fields) {
    const view = classifyAspectField(field, listing)

    if (view.status === "optional_blank") {
      hiddenBlankOptional += 1
      continue
    }

    if (view.status === "auto_filled") {
      autoFilledCount += 1
      more.push(view)
      continue
    }

    if (view.status === "needs_review") {
      reviewCount += 1
      primary.push(view)
      continue
    }

    // needs_input (required blank)
    primary.push(view)
  }

  return {
    primary,
    more,
    autoFilledCount,
    reviewCount,
    hiddenBlankOptional,
  }
}

export function summarizeAiEmployeeAspects(
  fields: EbayAspectFormField[],
  listing: Listing
): AiEmployeeAspectSummary {
  let completed = 0
  let total = 0
  let autoFilled = 0
  let review = 0
  let needsAttention = 0

  for (const field of fields) {
    const view = classifyAspectField(field, listing)
    if (view.status === "optional_blank") continue
    total += 1
    if (view.value.trim()) completed += 1
    if (view.status === "auto_filled") autoFilled += 1
    if (view.status === "needs_review") {
      review += 1
      needsAttention += 1
    }
    if (view.status === "needs_input") needsAttention += 1
  }

  if (total === 0) {
    const filled = fields.filter((f) =>
      resolveAspectFieldValue(f, listing).trim()
    ).length
    return {
      completed: filled,
      total: fields.length,
      needsAttention: 0,
      autoFilled: filled,
      review: 0,
    }
  }

  return { completed, total, needsAttention, autoFilled, review }
}

export function countCompletedAspects(
  fields: EbayAspectFormField[],
  listing: Listing
): { completed: number; total: number } {
  const s = summarizeAiEmployeeAspects(fields, listing)
  return { completed: s.completed, total: s.total }
}

/**
 * Auto-select whenever AI knows a value that maps onto an eBay dropdown option.
 * Brand: fuzzy ≥95%. Style: closest eBay style. Size Type: Regular default.
 * Never leave Brand / Style / Size Type blank when determinable.
 */
export function autoFillHighConfidenceAspects(
  listing: Listing,
  fields: EbayAspectFormField[]
): Listing {
  const optionsByName = new Map<string, string[]>()
  const toApply: Array<{ name: string; value: string }> = []

  for (const field of fields) {
    const options = field.allowedValues || []
    const nameKey = field.name.trim().toLowerCase()
    const confidence = confidenceForListingAspect(listing, field.name)
    const detected = detectedValueForAspect(listing, field.name)
    const raw = readAspectValue(listing, field.name)

    if (options.length) optionsByName.set(nameKey, options)

    // Brand / Style / Size Type — always try must-fill resolvers.
    if (isMustFillAspect(field.name)) {
      const value = resolveMustFillAspectValue(field.name, listing, options)
      if (value) toApply.push({ name: field.name, value })
      continue
    }

    // If AI already knows a value that exists on the eBay list → select it.
    if (options.length > 0) {
      const exact = resolveSelectValue(
        field.name,
        raw,
        options,
        field.suggestedValue || field.value,
        detected
      )
      if (exact) {
        toApply.push({ name: field.name, value: exact })
        continue
      }
      // No dropdown match — leave blank (do not invent).
      continue
    }

    // Free-text aspects: fill when we have AI signal (≥70% or any detected string).
    if (
      isBlankConfidence(confidence) &&
      confidence != null &&
      !detected?.trim() &&
      !raw.trim()
    ) {
      continue
    }
    const free = (raw || detected || field.suggestedValue || field.value || "").trim()
    if (free) toApply.push({ name: field.name, value: free })
  }

  return applyExactAspectsToListing(listing, toApply, optionsByName)
}

export function validateAspectsAgainstOptions(
  listing: Listing,
  fields: EbayAspectFormField[]
): { listing: Listing; missingRequired: string[]; cleared: string[] } {
  let next = listing
  const cleared: string[] = []
  const missingRequired: string[] = []

  for (const field of fields) {
    const options = field.allowedValues || []
    const raw = readAspectValue(next, field.name).trim()
    if (!raw) {
      if (field.required) missingRequired.push(field.name)
      continue
    }
    if (options.length === 0) continue
    if (isExactOption(raw, options)) {
      const exact =
        options.find((o) => o.toLowerCase() === raw.toLowerCase()) || raw
      if (exact !== raw) {
        next = writeAspectValue(next, field.name, exact)
      }
      continue
    }
    // Brand may be a custom value not in eBay's predefined list.
    if (aspectAllowsCustomValue(field.name)) {
      continue
    }
    next = writeAspectValue(next, field.name, "")
    cleared.push(field.name)
    if (field.required) missingRequired.push(field.name)
  }

  return { listing: next, missingRequired, cleared }
}

export function formatAiEmployeeBanner(summary: AiEmployeeAspectSummary): string {
  if (summary.total === 0) {
    return "AI is matching eBay item specifics…"
  }
  if (summary.needsAttention === 0) {
    return `AI completed ${summary.completed}/${summary.total} item specifics. Ready to publish.`
  }
  return `AI completed ${summary.completed}/${summary.total} item specifics. Only ${summary.needsAttention} need your attention.`
}
