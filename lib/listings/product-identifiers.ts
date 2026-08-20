/**
 * Product identifiers (MPN / UPC / EAN / ISBN) must never be hallucinated.
 * eBay Magical may invent an MPN; ListWise only publishes one when it is
 * actually visible or reliably identified on a tag/label/barcode.
 */

export const PRODUCT_IDENTIFIER_ASPECTS = [
  "mpn",
  "upc",
  "ean",
  "isbn",
  "epid",
  "manufacturer part number",
] as const

const DOES_NOT_APPLY_RE = /^(does\s+not\s+apply|n\/?a|not\s+applicable|none)$/i

export function isProductIdentifierAspect(name: string): boolean {
  const key = name.trim().toLowerCase()
  return PRODUCT_IDENTIFIER_ASPECTS.some((n) => n === key)
}

export function isDoesNotApplyValue(value: string | undefined | null): boolean {
  return DOES_NOT_APPLY_RE.test((value || "").trim())
}

/** Prefer the exact Taxonomy spelling when eBay offers "Does not apply". */
export function doesNotApplyValue(allowed: string[]): string | undefined {
  const hit = allowed.find((option) => isDoesNotApplyValue(option))
  if (hit) return hit
  if (allowed.length === 0) return "Does not apply"
  return undefined
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "")
}

function looksLikeUpc(value: string): boolean {
  const digits = digitsOnly(value)
  return digits.length === 12
}

function looksLikeEan(value: string): boolean {
  const digits = digitsOnly(value)
  return digits.length === 13
}

function looksLikeIsbn(value: string): boolean {
  const compact = value.replace(/[-\s]/g, "").toUpperCase()
  return /^(97[89])?\d{9}[\dX]$/.test(compact)
}

/**
 * Real MPNs are tag/part codes — not sizes, brands, garment words, or
 * style-ish guesses like "AE123".
 */
export function looksLikeMpn(value: string): boolean {
  const raw = value.trim()
  if (raw.length < 4 || raw.length > 40) return false
  if (isDoesNotApplyValue(raw)) return false
  if (/^(unknown|none|n\/?a)$/i.test(raw)) return false
  if (/^(s|m|l|xl|xxl|xxxl|os|onesize)$/i.test(raw)) return false
  if (/^\d{1,2}([x×\/]\d{1,2})?$/i.test(raw)) return false
  if (
    /^(jeans?|pants?|shirt|tee|hoodie|denim|cotton|polyester|american\s+eagle)$/i.test(
      raw
    )
  ) {
    return false
  }
  // Require at least one digit so brand/style words are not treated as MPNs.
  if (!/\d/.test(raw)) return false
  return /^[A-Za-z0-9][A-Za-z0-9._\-\/]*$/.test(raw)
}

export type ProductIdentifierKind = "mpn" | "upc" | "ean" | "isbn" | "epid"

export function identifierKindFromAspect(
  name: string
): ProductIdentifierKind | null {
  const key = name.trim().toLowerCase()
  if (key === "mpn" || key === "manufacturer part number") return "mpn"
  if (key === "upc") return "upc"
  if (key === "ean") return "ean"
  if (key === "isbn") return "isbn"
  if (key === "epid") return "epid"
  return null
}

export function identifierLooksValid(
  kind: ProductIdentifierKind,
  value: string
): boolean {
  const raw = value.trim()
  if (!raw || isDoesNotApplyValue(raw)) return false
  switch (kind) {
    case "upc":
      return looksLikeUpc(raw)
    case "ean":
      return looksLikeEan(raw)
    case "isbn":
      return looksLikeIsbn(raw)
    case "epid":
      return /^\d{9,15}$/.test(digitsOnly(raw))
    case "mpn":
      return looksLikeMpn(raw)
  }
}

/**
 * Style / RN / SKU numbers are not MPNs unless the model explicitly labeled
 * the value as MPN with tag evidence.
 */
export function isVerifiedProductIdentifier(opts: {
  kind: ProductIdentifierKind
  value: string | undefined | null
  confidence?: number
  rationale?: string
  sourceField?: string
}): boolean {
  const value = (opts.value || "").trim()
  if (!identifierLooksValid(opts.kind, value)) return false
  if (opts.sourceField && /style\s*number|stylenumber|rn\b/i.test(opts.sourceField)) {
    return false
  }
  if ((opts.confidence ?? 1) < 0.85) return false
  const rationale = (opts.rationale || "").toLowerCase()
  if (
    rationale &&
    /guess|infer|likely|probably|assume|invent/i.test(rationale) &&
    !/tag|label|barcode|printed|readable|ocr/i.test(rationale)
  ) {
    return false
  }
  return true
}
