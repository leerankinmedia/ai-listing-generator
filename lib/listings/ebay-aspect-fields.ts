/**
 * Shared helpers for eBay item-specific fields in the listing editor / publish UI.
 * High-confidence AI auto-fill + compact one-minute listing UX.
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

/** Auto-select eBay values without user interaction at this confidence. */
export const ASPECT_AUTO_FILL_CONFIDENCE = 0.9

export type EbayAspectFormField = {
  name: string
  required: boolean
  allowedValues?: string[]
  suggestedValue?: string
  value?: string
  /** @deprecated Primary visibility is derived from needs-input state. */
  primary?: boolean
}

export type AspectFieldStatus =
  | "auto_filled"
  | "needs_input"
  | "needs_review"
  | "optional_blank"

export type AspectFieldView = {
  field: EbayAspectFormField
  value: string
  status: AspectFieldStatus
  confidence?: number
}

/**
 * High-search clothing specifics — populate when confidently known.
 */
export const EBAY_SEO_ASPECT_PRIORITY = [
  "Brand",
  "Size Type",
  "Size",
  "Style",
  "Color",
  "Department",
  "Type",
  "Pattern",
  "Material",
  "Fabric Wash",
  "Waist Size",
  "Fit",
  "Features",
  "Inseam",
  "Rise",
  "Fabric Type",
  "Closure",
  "Vintage",
  "Theme",
  "Season",
  "Pocket Type",
  "Country of Origin",
] as const

/** @deprecated Visibility is based on needs-input, not a fixed primary list. */
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

/** @deprecated Use EBAY_SEO_ASPECT_PRIORITY */
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

/** Map Taxonomy aspect names onto listing.fieldConfidence keys. */
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
    name === "item type"
  ) {
    return fc.style?.confidence
  }
  if (name === "pattern" || name === "theme") return fc.pattern?.confidence
  if (name === "department" || name === "gender") return fc.gender?.confidence
  if (name === "size type") return fc.size?.confidence
  return undefined
}

export function isAutoFillConfidence(confidence: number | undefined): boolean {
  return typeof confidence === "number" && confidence >= ASPECT_AUTO_FILL_CONFIDENCE
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
  if (name === "style" || name === "fit" || name === "type" || name === "item type") {
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

/** Apply exact eBay values into listing state without overwriting manual exact picks. */
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
        // Preserve manual exact selection on the known field.
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
 * Classify each aspect for the one-minute listing UI.
 * Auto-filled (≥90% + exact eBay match, or already resolved) never needs a main-page dropdown.
 */
export function classifyAspectField(
  field: EbayAspectFormField,
  listing: Listing
): AspectFieldView {
  const confidence = confidenceForListingAspect(listing, field.name)
  const value = resolveAspectFieldValue(field, listing)
  const empty = !value.trim()

  if (!empty) {
    return {
      field,
      value,
      status: "auto_filled",
      confidence,
    }
  }

  if (field.required) {
    // Required + empty: seller must provide input (AI uncertain / no exact match).
    return {
      field,
      value: "",
      status: "needs_input",
      confidence,
    }
  }

  // Optional + empty — hide from UI (no empty dropdowns).
  return { field, value: "", status: "optional_blank", confidence }
}

/**
 * Main page: only required fields that genuinely need user input.
 * Everything else (auto-filled + optional) goes under More item specifics.
 * Empty optional fields are omitted entirely (no empty dropdowns).
 */
export function splitAspectFieldsForDisplay(
  fields: EbayAspectFormField[],
  listing: Listing
): {
  primary: AspectFieldView[]
  more: AspectFieldView[]
  autoFilledCount: number
  hiddenBlankOptional: number
} {
  const primary: AspectFieldView[] = []
  const more: AspectFieldView[] = []
  let autoFilledCount = 0
  let hiddenBlankOptional = 0

  for (const field of fields) {
    const view = classifyAspectField(field, listing)

    if (view.status === "optional_blank") {
      // Never show empty optional dropdowns.
      hiddenBlankOptional += 1
      continue
    }

    if (view.status === "auto_filled") {
      autoFilledCount += 1
      more.push(view)
      continue
    }

    // needs_input / needs_review on required → main page.
    // Optional needs_review (rare) → more with badge, editable when expanded.
    if (field.required && (view.status === "needs_input" || view.status === "needs_review")) {
      primary.push(view)
    } else {
      more.push(view)
    }
  }

  return { primary, more, autoFilledCount, hiddenBlankOptional }
}

export function countCompletedAspects(
  fields: EbayAspectFormField[],
  listing: Listing
): { completed: number; total: number } {
  let completed = 0
  let total = 0
  for (const field of fields) {
    const view = classifyAspectField(field, listing)
    // Don't count hidden blank optionals toward the total sellers care about.
    if (view.status === "optional_blank") continue
    total += 1
    if (view.value.trim()) completed += 1
  }
  // If everything is blank optional, fall back to full field count for the label.
  if (total === 0) {
    return {
      completed: fields.filter((f) => resolveAspectFieldValue(f, listing).trim())
        .length,
      total: fields.length,
    }
  }
  return { completed, total }
}

/**
 * When confidence ≥ 90% and an exact eBay option exists, force-apply it.
 */
export function autoFillHighConfidenceAspects(
  listing: Listing,
  fields: EbayAspectFormField[]
): Listing {
  const optionsByName = new Map<string, string[]>()
  const toApply: Array<{ name: string; value: string }> = []

  for (const field of fields) {
    const confidence = confidenceForListingAspect(listing, field.name)
    if (!isAutoFillConfidence(confidence)) continue
    const options = field.allowedValues || []
    const detected = detectedValueForAspect(listing, field.name)
    const raw = readAspectValue(listing, field.name)
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

/**
 * Silently drop values that are not exact eBay options (selection lists).
 */
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
