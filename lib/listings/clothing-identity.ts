/**
 * Clothing identity helpers: multi-photo merge with tag priority,
 * licensed character/franchise fallbacks, and second-pass merge.
 */

import type { ImageDetection } from "@/lib/listings/schema"
import type { DetectedFieldKey, FieldConfidence } from "@/lib/types"

export const IDENTITY_CONFIRM_THRESHOLD = 0.9

export type PhotoKind =
  | "garment"
  | "tag"
  | "label"
  | "graphic"
  | "detail"
  | "other"

export type IdentityFields = {
  brand: FieldConfidence
  category: FieldConfidence
  size: FieldConfidence
  color: FieldConfidence
  material: FieldConfidence
  style: FieldConfidence
  pattern: FieldConfidence
  gender: FieldConfidence
  condition: FieldConfidence
  flaws: FieldConfidence
  character: FieldConfidence
  theme: FieldConfidence
  features: FieldConfidence
  itemType: FieldConfidence
  licensedProperty: FieldConfidence
  styleNumber: FieldConfidence
  countryOfOrigin: FieldConfidence
}

export type IdentitySecondPass = {
  brand: FieldConfidence
  licensedProperty: FieldConfidence
  character: FieldConfidence
  theme: FieldConfidence
  features: FieldConfidence
  itemType: FieldConfidence
  size: FieldConfidence
  gender: FieldConfidence
  material: FieldConfidence
  styleNumber: FieldConfidence
  countryOfOrigin: FieldConfidence
  pattern: FieldConfidence
  logoAndGraphicSummary: string
  tagTextSummary: string
}

const UNKNOWN = /^(unknown|n\/?a|none|not\s*applicable)$/i

export function isUnknownValue(value: string | undefined | null): boolean {
  const v = (value || "").trim()
  return !v || UNKNOWN.test(v)
}

export function isKnownValue(value: string | undefined | null): boolean {
  return !isUnknownValue(value)
}

export function isTagLikePhoto(photoKind?: string | null): boolean {
  const k = (photoKind || "").trim().toLowerCase()
  return k === "tag" || k === "label"
}

export function pickBest(
  fields: Array<{ value: string; confidence: number; rationale?: string }>
): FieldConfidence {
  const ranked = [...fields].sort((a, b) => b.confidence - a.confidence)
  const best = ranked[0] || {
    value: "Unknown",
    confidence: 0,
    rationale: "No detections",
  }
  const known = ranked.filter((f) => isKnownValue(f.value))
  const chosen = known[0] ?? best
  const agreements = known.filter(
    (f) => f.value.toLowerCase() === chosen.value.toLowerCase()
  ).length
  const confidence = Math.min(
    1,
    chosen.confidence + (agreements > 1 ? 0.05 * (agreements - 1) : 0)
  )
  return {
    value: chosen.value,
    confidence: Number(confidence.toFixed(3)),
    rationale: chosen.rationale,
  }
}

/**
 * Prefer tag/label close-ups for brand, size, material, gender, etc.
 * A readable tag overrides cover-image guesses.
 */
export function pickBestPreferTag(
  votes: Array<{
    value: string
    confidence: number
    rationale?: string
    photoKind?: string | null
  }>
): FieldConfidence {
  const tagVotes = votes.filter(
    (v) => isTagLikePhoto(v.photoKind) && isKnownValue(v.value)
  )
  if (tagVotes.length > 0) {
    const best = pickBest(tagVotes)
    return {
      ...best,
      confidence: Number(Math.min(1, Math.max(best.confidence, 0.92)).toFixed(3)),
      rationale: `Tag/label photo override. ${best.rationale || ""}`.trim(),
    }
  }
  return pickBest(votes)
}

export function needsIdentitySecondPass(
  fields: {
    brand?: FieldConfidence
    character?: FieldConfidence
    licensedProperty?: FieldConfidence
    pattern?: FieldConfidence
    style?: FieldConfidence
    features?: FieldConfidence
  },
  detections?: Array<{ photoKind?: string | null; imageSummary?: string }>
): boolean {
  const brand = fields.brand
  const character = fields.character
  const brandLow =
    !brand ||
    isUnknownValue(brand.value) ||
    brand.confidence < IDENTITY_CONFIRM_THRESHOLD
  const characterMissing = !character || isUnknownValue(character.value)
  const characterLow =
    character &&
    isKnownValue(character.value) &&
    character.confidence < IDENTITY_CONFIRM_THRESHOLD

  const hasTagOrGraphic = (detections || []).some((d) => {
    const kind = (d.photoKind || "").toLowerCase()
    return kind === "tag" || kind === "label" || kind === "graphic"
  })

  const identityCueText = [
    fields.pattern?.value,
    fields.style?.value,
    fields.features?.value,
    fields.licensedProperty?.value,
    ...(detections || []).map((d) => d.imageSummary || ""),
  ]
    .join(" ")
    .toLowerCase()

  const hasIdentityCue =
    hasTagOrGraphic ||
    /logo|graphic|embroider|character|cartoon|mascot|franchise|licensed|patch|print|tweety|disney|marvel|looney/i.test(
      identityCueText
    )

  // Always reinforce when brand is uncertain, or when photos/cues suggest IP
  // that the first pass may have treated as a generic garment.
  return Boolean(brandLow || characterLow || (characterMissing && hasIdentityCue))
}

/**
 * Never leave Brand blank when a licensed property or recognizable label is visible.
 */
export function applyLicensedBrandFallback(
  fields: Pick<
    IdentityFields,
    "brand" | "licensedProperty" | "character" | "theme"
  >
): Pick<IdentityFields, "brand" | "licensedProperty" | "character" | "theme"> {
  let brand = fields.brand
  let licensed = fields.licensedProperty
  let character = fields.character
  let theme = fields.theme

  if (isUnknownValue(brand.value) && isKnownValue(licensed.value)) {
    brand = {
      value: licensed.value,
      confidence: Math.max(licensed.confidence, 0.9),
      rationale: `Brand set from licensed property label: ${licensed.value}. ${licensed.rationale || ""}`.trim(),
    }
  }

  // Theme: "Cartoon, Looney Tunes" style when franchise + character known.
  if (
    isUnknownValue(theme.value) &&
    (isKnownValue(licensed.value) || isKnownValue(character.value))
  ) {
    const parts: string[] = []
    if (isKnownValue(character.value) || isKnownValue(licensed.value)) {
      parts.push("Cartoon")
    }
    if (isKnownValue(licensed.value)) parts.push(licensed.value)
    else if (isKnownValue(brand.value) && !isUnknownValue(brand.value)) {
      parts.push(brand.value)
    }
    if (parts.length > 0) {
      theme = {
        value: parts.join(", "),
        confidence: Math.max(
          licensed.confidence || 0,
          character.confidence || 0,
          0.85
        ),
        rationale: "Theme derived from licensed property / character.",
      }
    }
  }

  // If brand still blank but character implies a known franchise in rationale/value,
  // keep brand as licensed when we can recover from character context.
  if (
    isUnknownValue(brand.value) &&
    isKnownValue(character.value) &&
    isKnownValue(licensed.value)
  ) {
    brand = {
      value: licensed.value,
      confidence: Math.max(licensed.confidence, character.confidence, 0.9),
      rationale: `Brand from franchise for character ${character.value}.`,
    }
  }

  return { brand, licensedProperty: licensed, character, theme }
}

/** Merge second-pass identity into first-pass garment fields. */
export function mergeIdentitySecondPass(
  first: IdentityFields,
  second: IdentitySecondPass
): IdentityFields {
  const preferSecond = (
    a: FieldConfidence,
    b: FieldConfidence,
    opts?: { preferKnown?: boolean }
  ): FieldConfidence => {
    const aKnown = isKnownValue(a.value)
    const bKnown = isKnownValue(b.value)
    if (opts?.preferKnown !== false) {
      if (!aKnown && bKnown) return b
      if (aKnown && !bKnown) return a
    }
    if (b.confidence > a.confidence + 0.02) return b
    if (aKnown && bKnown && b.confidence >= a.confidence) {
      // Prefer more specific (longer) identity strings when close.
      if (b.value.length > a.value.length + 2 && b.confidence >= a.confidence - 0.05) {
        return b
      }
    }
    return a
  }

  const merged: IdentityFields = {
    ...first,
    brand: preferSecond(first.brand, second.brand),
    licensedProperty: preferSecond(
      first.licensedProperty,
      second.licensedProperty
    ),
    character: preferSecond(first.character, second.character),
    theme: preferSecond(first.theme, second.theme),
    features: preferSecond(first.features, second.features),
    itemType: preferSecond(first.itemType, second.itemType),
    size: preferSecond(first.size, second.size),
    gender: preferSecond(first.gender, second.gender),
    material: preferSecond(first.material, second.material),
    styleNumber: preferSecond(first.styleNumber, second.styleNumber),
    countryOfOrigin: preferSecond(
      first.countryOfOrigin,
      second.countryOfOrigin
    ),
    pattern: preferSecond(first.pattern, second.pattern),
  }

  return {
    ...merged,
    ...applyLicensedBrandFallback(merged),
  }
}

const TAG_PRIORITY_KEYS = new Set([
  "brand",
  "size",
  "material",
  "gender",
  "styleNumber",
  "countryOfOrigin",
  "licensedProperty",
])

export function mergeClothingDetections(detections: ImageDetection[]): {
  fields: IdentityFields
  perImage: Array<{ index: number; summary: string; flaws: string; photoKind?: string }>
} {
  const empty = (rationale = "No detection"): FieldConfidence => ({
    value: "Unknown",
    confidence: 0,
    rationale,
  })

  const withKind = <T extends { value: string; confidence: number; rationale: string }>(
    field: T,
    d: ImageDetection
  ) => ({
    ...field,
    photoKind: d.photoKind,
  })

  const vote = (
    key: keyof ImageDetection,
    preferTag: boolean
  ): FieldConfidence => {
    const votes = detections.map((d) => {
      const field = d[key]
      if (
        field &&
        typeof field === "object" &&
        "value" in field &&
        "confidence" in field
      ) {
        return withKind(
          field as { value: string; confidence: number; rationale: string },
          d
        )
      }
      return {
        value: "Unknown",
        confidence: 0,
        rationale: "Missing",
        photoKind: d.photoKind,
      }
    })
    return preferTag ? pickBestPreferTag(votes) : pickBest(votes)
  }

  let fields: IdentityFields = {
    brand: vote("brand", true),
    category: vote("category", false),
    size: vote("size", true),
    color: vote("color", false),
    material: vote("material", true),
    style: vote("style", false),
    pattern: vote("pattern", false),
    gender: vote("gender", true),
    condition: vote("condition", false),
    flaws: vote("flaws", false),
    character: vote("character", false),
    theme: vote("theme", false),
    features: vote("features", false),
    itemType: vote("itemType", false),
    licensedProperty: vote("licensedProperty", true),
    styleNumber: vote("styleNumber", true),
    countryOfOrigin: vote("countryOfOrigin", true),
  }

  fields = {
    ...fields,
    ...applyLicensedBrandFallback(fields),
  }

  // Prefer graphic-photo character/theme when garment shots missed them.
  const graphicVotes = detections.filter(
    (d) => (d.photoKind || "").toLowerCase() === "graphic"
  )
  if (graphicVotes.length > 0 && isUnknownValue(fields.character.value)) {
    const char = pickBest(
      graphicVotes.map((d) => withKind(d.character, d))
    )
    if (isKnownValue(char.value)) {
      fields.character = {
        ...char,
        rationale: `Graphic photo identity. ${char.rationale || ""}`.trim(),
      }
    }
  }

  const perImage = detections.map((d, index) => ({
    index,
    summary: d.imageSummary,
    flaws: d.flaws.value,
    photoKind: d.photoKind,
  }))

  return { fields, perImage }
}

export function identityExtrasFromFields(fields: IdentityFields): Record<string, string> {
  const extras: Record<string, string> = {}
  if (isKnownValue(fields.character.value)) {
    extras.Character = fields.character.value
  }
  if (isKnownValue(fields.theme.value)) {
    extras.Theme = fields.theme.value
  }
  if (isKnownValue(fields.features.value)) {
    extras.Features = fields.features.value
  }
  if (isKnownValue(fields.itemType.value)) {
    extras.Type = fields.itemType.value
  }
  if (isKnownValue(fields.styleNumber.value)) {
    extras["Style Number"] = fields.styleNumber.value
  }
  if (isKnownValue(fields.countryOfOrigin.value)) {
    extras["Country of Origin"] = fields.countryOfOrigin.value
  }
  if (isKnownValue(fields.licensedProperty.value)) {
    extras["Licensed Property"] = fields.licensedProperty.value
  }
  return extras
}

export function identityFieldConfidence(
  fields: IdentityFields
): Partial<Record<DetectedFieldKey, FieldConfidence>> {
  return {
    brand: fields.brand,
    category: fields.category,
    size: fields.size,
    color: fields.color,
    material: fields.material,
    style: fields.style,
    pattern: fields.pattern,
    gender: fields.gender,
    condition: fields.condition,
    flaws: fields.flaws,
    character: fields.character,
    theme: fields.theme,
    features: fields.features,
    itemType: fields.itemType,
  }
}

export function needsBrandCharacterConfirm(fields: {
  brand?: FieldConfidence
  character?: FieldConfidence
}): boolean {
  const brand = fields.brand
  const character = fields.character
  const brandNeeds =
    brand &&
    isKnownValue(brand.value) &&
    brand.confidence < IDENTITY_CONFIRM_THRESHOLD
  const characterNeeds =
    character &&
    isKnownValue(character.value) &&
    character.confidence < IDENTITY_CONFIRM_THRESHOLD
  return Boolean(brandNeeds || characterNeeds)
}

/** Suppress unused-export lint for TAG_PRIORITY_KEYS documentation. */
export const TAG_OVERRIDE_FIELDS = [...TAG_PRIORITY_KEYS]
