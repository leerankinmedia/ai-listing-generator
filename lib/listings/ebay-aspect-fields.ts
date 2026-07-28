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
  matchExactEbayAspectValue,
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

/** Auto-select without user interaction. */
export const ASPECT_AUTO_FILL_CONFIDENCE = 0.95
/** Preselect + Review badge. Below this → leave blank. */
export const ASPECT_REVIEW_CONFIDENCE = 0.7

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
  "Closure",
  "Rise",
  "Fit",
  "Theme",
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
    name === "features" ||
    name === "closure" ||
    name === "rise"
  ) {
    return fc.style?.confidence
  }
  if (name === "pattern" || name === "theme") return fc.pattern?.confidence
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
    name === "type" ||
    name === "item type" ||
    name === "features" ||
    name === "closure" ||
    name === "rise"
  ) {
    return fc.style?.value || listing.specifics.style
  }
  if (name === "pattern" || name === "theme") {
    return fc.pattern?.value || listing.specifics.pattern
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
    if (options && options.length > 0 && !isExactOption(value, options)) {
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
 * ≥95% filled → auto_filled · 70–94% filled → needs_review · empty required → needs_input
 */
export function classifyAspectField(
  field: EbayAspectFormField,
  listing: Listing
): AspectFieldView {
  const confidence = confidenceForListingAspect(listing, field.name)
  const value = resolveAspectFieldValue(field, listing)
  const empty = !value.trim()

  if (!empty) {
    if (isAutoFillConfidence(confidence)) {
      return { field, value, status: "auto_filled", confidence }
    }
    if (isReviewConfidence(confidence)) {
      return { field, value, status: "needs_review", confidence }
    }
    // Filled without Vision confidence (exact Taxonomy match / manual) → treat as done.
    if (confidence == null) {
      return { field, value, status: "auto_filled", confidence }
    }
    // Confidence known but <70% yet somehow filled — still ask for review.
    return { field, value, status: "needs_review", confidence }
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
 * AI employee fill:
 * - ≥95%: apply exact eBay value
 * - 70–94%: preselect most likely exact value (Review later)
 * - <70%: leave blank (do not invent)
 */
export function autoFillHighConfidenceAspects(
  listing: Listing,
  fields: EbayAspectFormField[]
): Listing {
  const optionsByName = new Map<string, string[]>()
  const toApply: Array<{ name: string; value: string }> = []

  for (const field of fields) {
    const confidence = confidenceForListingAspect(listing, field.name)
    // Below review threshold — leave blank even if a fuzzy guess exists.
    if (isBlankConfidence(confidence) && confidence != null) continue

    const options = field.allowedValues || []
    const detected = detectedValueForAspect(listing, field.name)
    const raw = readAspectValue(listing, field.name)

    // No Vision confidence: only keep values already exact on the listing / server.
    if (confidence == null) {
      if (options.length === 0) {
        const free = (raw || field.value || "").trim()
        if (free) toApply.push({ name: field.name, value: free })
      } else if (raw && isExactOption(raw, options)) {
        const exact =
          options.find((o) => o.toLowerCase() === raw.toLowerCase()) || raw
        toApply.push({ name: field.name, value: exact })
      } else if (field.value && isExactOption(field.value, options)) {
        toApply.push({ name: field.name, value: field.value })
      }
      if (options.length) optionsByName.set(field.name.toLowerCase(), options)
      continue
    }

    // ≥70%: try exact eBay match (fuzzy allowed at ≥95%).
    if (options.length === 0) {
      const free = (raw || detected || field.suggestedValue || field.value || "").trim()
      if (free) toApply.push({ name: field.name, value: free })
      continue
    }

    const exact = resolveSelectValue(
      field.name,
      raw,
      options,
      field.suggestedValue || field.value,
      detected
    )
    if (exact) toApply.push({ name: field.name, value: exact })
    optionsByName.set(field.name.toLowerCase(), options)
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
