/**
 * Build / extend eBay titles toward 70–80 characters using known attributes.
 * No filler keywords — only real Brand, Department, Size, Color, Style, Type, Material.
 */

import { splitPrimaryColorAndDetails } from "@/lib/marketplaces/adapters/ebay/aspect-normalize"
import type { Listing } from "@/lib/types"

export const EBAY_TITLE_MAX = 80
export const EBAY_TITLE_TARGET_MIN = 70

function cleanPart(value: string | undefined | null): string {
  return (value || "").replace(/\s+/g, " ").trim()
}

function isUnknown(value: string): boolean {
  return !value || /^unknown$/i.test(value)
}

function titleCaseDept(gender: string): string {
  const g = gender.toLowerCase()
  if (g.startsWith("men")) return "Men's"
  if (g.startsWith("women") || g.startsWith("lad")) return "Women's"
  if (g.startsWith("boy")) return "Boys"
  if (g.startsWith("girl")) return "Girls"
  if (g.startsWith("kid") || g.startsWith("child") || g.startsWith("youth")) {
    return "Kids"
  }
  if (g.startsWith("uni")) return "Unisex"
  return gender
}

function primaryColor(raw: string): string {
  const split = splitPrimaryColorAndDetails(raw)
  return split.primaryLabel || raw.split(/[/,|]/)[0]?.trim() || raw
}

function enoughSeoKeywords(listing: Listing): boolean {
  const s = listing.specifics
  const extras = s.extras || {}
  const signals = [
    s.brand,
    s.gender || extras.Department,
    s.size,
    extras.Color || extras.Colour || s.color,
    s.style || extras.Type || extras.type,
  ].filter((v) => cleanPart(v) && !isUnknown(cleanPart(v)))
  return signals.length >= 3
}

/**
 * Assemble a search-optimized title from listing attributes, targeting 70–80 chars
 * when enough accurate keywords are available. Never adds irrelevant filler.
 */
export function buildEbayOptimizedTitle(listing: Listing): string {
  const s = listing.specifics
  const extras = s.extras || {}
  const brand = cleanPart(s.brand)
  const dept = cleanPart(s.gender || extras.Department || extras.department)
  const size = cleanPart(s.size || extras.Size)
  const colorRaw = cleanPart(extras.Color || extras.Colour || s.color)
  const color = colorRaw && !isUnknown(colorRaw) ? primaryColor(colorRaw) : ""
  const style = cleanPart(s.style || extras.Style)
  const type = cleanPart(extras.Type || extras.type || extras["Item Type"])
  const material = cleanPart(s.material || extras.Material)
  const pattern = cleanPart(s.pattern || extras.Pattern)
  const fit = cleanPart(extras.Fit)
  const sizeType = cleanPart(extras["Size Type"])

  const parts: string[] = []
  const push = (part: string) => {
    if (!part || isUnknown(part)) return
    const next = [...parts, part].join(" ")
    if (next.length <= EBAY_TITLE_MAX) parts.push(part)
  }

  push(brand && !isUnknown(brand) ? brand : "")
  if (dept && !isUnknown(dept)) push(titleCaseDept(dept))
  if (sizeType && !/^regular$/i.test(sizeType)) push(sizeType)
  push(size)
  push(color)

  // Prefer type then style; avoid duplicating similar tokens.
  if (type && !isUnknown(type)) push(type)
  else if (style && !isUnknown(style)) push(style)

  if (
    parts.join(" ").length < 60 &&
    fit &&
    !parts.some((p) => p.toLowerCase() === fit.toLowerCase())
  ) {
    push(fit)
  }

  if (
    parts.join(" ").length < 65 &&
    style &&
    type &&
    !parts.some((p) => p.toLowerCase() === style.toLowerCase())
  ) {
    push(style)
  }

  if (parts.join(" ").length < 70) {
    if (
      material &&
      !isUnknown(material) &&
      !/cotton blend|polyester blend|\d+\s*%/i.test(material) &&
      /cashmere|leather|silk|wool|linen|suede|denim/i.test(material)
    ) {
      push(material)
    }
  }
  if (
    parts.join(" ").length < 75 &&
    pattern &&
    !isUnknown(pattern) &&
    !/^solid$/i.test(pattern)
  ) {
    push(pattern)
  }

  let title = parts.join(" ").replace(/\s+/g, " ").trim()
  if (!title) title = cleanPart(listing.title).slice(0, EBAY_TITLE_MAX)

  const existing = cleanPart(listing.title).slice(0, EBAY_TITLE_MAX)
  // Prefer structured SEO build when it reaches the 70–80 target window.
  if (
    title.length >= EBAY_TITLE_TARGET_MIN &&
    title.length <= EBAY_TITLE_MAX
  ) {
    return title
  }
  // If structured build is short but existing AI title is richer and still ≤80, keep it.
  if (existing.length >= title.length + 8 && existing.length <= EBAY_TITLE_MAX) {
    return existing
  }

  return title.slice(0, EBAY_TITLE_MAX)
}

/**
 * Generate / extend an SEO-focused eBay title toward 70–80 chars when enough
 * accurate keywords exist. Never pads with irrelevant filler.
 */
export function enrichEbayTitleTowardLimit(
  title: string,
  listing: Listing
): string {
  const current = cleanPart(title).slice(0, EBAY_TITLE_MAX)
  if (current.length >= EBAY_TITLE_TARGET_MIN && current.length <= EBAY_TITLE_MAX) {
    return current
  }

  if (!enoughSeoKeywords(listing) && current.length >= 40) {
    // Not enough accurate keywords to safely rebuild — keep current, no filler.
    return current
  }

  const built = buildEbayOptimizedTitle({ ...listing, title: current })
  if (
    built.length >= EBAY_TITLE_TARGET_MIN &&
    built.length <= EBAY_TITLE_MAX
  ) {
    return built
  }
  if (built.length > current.length) return built.slice(0, EBAY_TITLE_MAX)

  // Extend existing with unused known attributes only (no filler words).
  let nextTitle = current
  const extras = listing.specifics.extras || {}
  const candidates = [
    listing.specifics.brand,
    listing.specifics.gender ? titleCaseDept(listing.specifics.gender) : "",
    listing.specifics.size,
    primaryColor(extras.Color || listing.specifics.color || ""),
    extras.Type || extras.type,
    listing.specifics.style,
    extras.Fit,
    listing.specifics.pattern,
  ]
    .map(cleanPart)
    .filter((p) => p && !isUnknown(p))

  for (const part of candidates) {
    if (nextTitle.length >= EBAY_TITLE_TARGET_MIN) break
    if (nextTitle.toLowerCase().includes(part.toLowerCase())) continue
    const next = `${nextTitle} ${part}`.replace(/\s+/g, " ").trim()
    if (next.length <= EBAY_TITLE_MAX) nextTitle = next
  }
  return nextTitle.slice(0, EBAY_TITLE_MAX)
}
