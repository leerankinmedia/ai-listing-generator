import { clamp } from "@/lib/utils"

/** eBay title soft/hard bounds for SEO-optimized mobile + desktop SERP. */
export const EBAY_TITLE_MIN = 70
export const EBAY_TITLE_MAX = 80

const STOP = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "of",
  "for",
  "with",
  "to",
  "in",
  "on",
  "at",
  "is",
  "it",
  "no",
  "not",
  "from",
  "this",
  "that",
  "very",
  "just",
  "only",
  "also",
  "has",
  "have",
  "been",
  "were",
  "was",
  "are",
  "lightly",
  "slightly",
  "gently",
  "worn",
  "used",
  "comes",
  "include",
  "included",
  "includes",
  "without",
  "missing",
  "please",
  "see",
  "photos",
  "photo",
  "picture",
  "pictures",
])

/** Normalize whitespace and strip characters eBay often rejects in titles. */
export function sanitizeTitle(raw: string): string {
  return raw
    .replace(/[^\w\s\-./&+'#!]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Fit a title into 70–80 characters without cutting mid-word when possible.
 * Prefers the high end of the range for SEO keyword coverage.
 */
export function fitEbayTitle(raw: string, min = EBAY_TITLE_MIN, max = EBAY_TITLE_MAX): string {
  let title = sanitizeTitle(raw)
  if (title.length <= max && title.length >= min) return title

  if (title.length > max) {
    const truncated = title.slice(0, max + 1)
    const lastSpace = truncated.lastIndexOf(" ")
    title = (lastSpace > min - 10 ? truncated.slice(0, lastSpace) : truncated.slice(0, max)).trim()
  }

  if (title.length < min) {
    // Caller/prompt should supply richer input; pad is not used — return as-is
    // and let warnings surface the shortfall.
    return title
  }

  if (title.length > max) {
    title = title.slice(0, max).trim()
  }

  return title
}

export function titleLengthScore(title: string): number {
  const len = title.length
  if (len >= EBAY_TITLE_MIN && len <= EBAY_TITLE_MAX) return 100
  if (len >= 60 && len < EBAY_TITLE_MIN) return 70
  if (len > EBAY_TITLE_MAX && len <= 85) return 60
  if (len >= 40) return 40
  return 20
}

export function extractKeywordCandidates(text: string, limit = 12): string[] {
  const freq = new Map<string, number>()
  for (const token of text.toLowerCase().split(/[^a-z0-9+]+/)) {
    if (!token || token.length < 2 || STOP.has(token)) continue
    freq.set(token, (freq.get(token) ?? 0) + 1)
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([w]) => w)
}

export function scoreOverall(parts: number[]): number {
  if (!parts.length) return 0
  const avg = parts.reduce((a, b) => a + b, 0) / parts.length
  return Math.round(clamp(avg, 0, 100))
}
