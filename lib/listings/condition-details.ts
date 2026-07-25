/**
 * eBay / listing condition helpers — never invent wear or damage.
 */

export const DEFAULT_EBAY_CONDITION_DETAILS =
  "Good pre-owned condition. Please review all photos for exact condition and details."

const NONE_FLAWS_RE =
  /^(none|n\/?a|na|no flaws?|none visible|no visible flaws?|nothing|unknown|-|—)?$/i

/** Minimum Vision confidence required before a flaw is treated as verified. */
export const FLAW_CONFIDENCE_THRESHOLD = 0.85

export function isBlankOrNoneFlaws(value: string | undefined | null): boolean {
  if (value == null) return true
  return NONE_FLAWS_RE.test(value.trim())
}

/**
 * Only keep flaws that look verified (non-empty + high confidence).
 * Low-confidence speculative wear is coerced to "None visible".
 */
export function sanitizeDetectedFlaws(
  value: string | undefined | null,
  confidence: number | undefined
): string {
  const trimmed = value?.trim() || ""
  if (isBlankOrNoneFlaws(trimmed)) return "None visible"
  if (
    typeof confidence === "number" &&
    !Number.isNaN(confidence) &&
    confidence < FLAW_CONFIDENCE_THRESHOLD
  ) {
    return "None visible"
  }
  return trimmed
}

export function hasVerifiedFlaws(
  value: string | undefined | null,
  confidence?: number
): boolean {
  const sanitized = sanitizeDetectedFlaws(value, confidence)
  return !isBlankOrNoneFlaws(sanitized)
}

/**
 * Seller notes for eBay conditionDescription.
 * Neutral positive statement when no verified flaws exist.
 */
export function ebayConditionDescription(
  flaws: string | undefined | null,
  confidence?: number
): string {
  if (!hasVerifiedFlaws(flaws, confidence)) {
    return DEFAULT_EBAY_CONDITION_DETAILS
  }
  return sanitizeDetectedFlaws(flaws, confidence)
}

/**
 * Append a Condition notes section for verified flaws only.
 * Does not invent wrinkles, fading, stains, or other damage.
 */
export function appendConditionNotesSection(
  description: string,
  flaws: string | undefined | null,
  confidence?: number
): string {
  const body = description.trim()
  if (!hasVerifiedFlaws(flaws, confidence)) return body
  const notes = sanitizeDetectedFlaws(flaws, confidence)
  if (/condition notes/i.test(body)) return body
  return `${body}\n\nCondition notes\n${notes}`
}
