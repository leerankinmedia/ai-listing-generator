/**
 * Shared helpers for eBay item-specific fields in the listing editor / publish UI.
 * SEO clothing priorities + primary vs collapsed form layout.
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

export type EbayAspectFormField = {
  name: string
  required: boolean
  allowedValues?: string[]
  suggestedValue?: string
  value?: string
  /** Show on the main page (not inside "More item specifics"). */
  primary?: boolean
}

/**
 * High-search clothing specifics — populate when confidently known.
 * Order matters for title/SEO preference.
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

/** Most important editable fields kept visible on the main listing page. */
export const EBAY_PRIMARY_VISIBLE_ASPECTS = [
  "Brand",
  "Size Type",
  "Size",
  "Style",
  "Color",
  "Department",
  "Type",
] as const

/**
 * Measurement / uncertain aspects — never invent; only fill from explicit data.
 */
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

    // Color: keep AI-detected wording in specifics.color.
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
  // Case-insensitive extras lookup
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

/**
 * Split form fields into primary (main page) vs more (collapsed).
 * Missing required always stay primary so the seller sees them early.
 */
export function splitAspectFieldsForDisplay(
  fields: EbayAspectFormField[],
  listing: Listing
): { primary: EbayAspectFormField[]; more: EbayAspectFormField[] } {
  const primary: EbayAspectFormField[] = []
  const more: EbayAspectFormField[] = []

  for (const field of fields) {
    const raw = readAspectValue(listing, field.name)
    const options = field.allowedValues || []
    const value =
      options.length > 0
        ? resolveSelectValue(
            field.name,
            raw,
            options,
            field.suggestedValue || field.value
          )
        : raw
    const empty = !value.trim()
    const forcePrimary =
      field.primary === true ||
      isPrimaryVisibleAspect(field.name) ||
      (field.required && empty)

    if (forcePrimary) primary.push(field)
    else more.push(field)
  }

  return { primary, more }
}

export function countCompletedAspects(
  fields: EbayAspectFormField[],
  listing: Listing
): { completed: number; total: number } {
  let completed = 0
  for (const field of fields) {
    const raw = readAspectValue(listing, field.name)
    const options = field.allowedValues || []
    const value =
      options.length > 0
        ? resolveSelectValue(
            field.name,
            raw,
            options,
            field.suggestedValue || field.value
          )
        : raw.trim() || field.value || ""
    if (value.trim()) completed += 1
  }
  return { completed, total: fields.length }
}

/**
 * Silently drop values that are not exact eBay options (selection lists).
 * Returns listing with invalid extras cleared + list of still-missing required names.
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
      // Normalize casing to exact option
      const exact =
        options.find((o) => o.toLowerCase() === raw.toLowerCase()) || raw
      if (exact !== raw) {
        next = writeAspectValue(next, field.name, exact)
      }
      continue
    }
    // Invalid for fixed list — clear silently; only ask if required.
    next = writeAspectValue(next, field.name, "")
    cleared.push(field.name)
    if (field.required) missingRequired.push(field.name)
  }

  return { listing: next, missingRequired, cleared }
}
