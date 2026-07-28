/**
 * Shared helpers for eBay item-specific fields in the listing editor / publish UI.
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

/** Preferred clothing aspect order in the main listing form. */
export const EBAY_FORM_ASPECT_PRIORITY = [
  "Brand",
  "Size",
  "Color",
  "Material",
  "Pattern",
  "Department",
  "Type",
  "Style",
  "Size Type",
  "Fit",
  "Rise",
  "Wash",
  "Fabric Wash",
  "Closure",
  "Vintage",
]
