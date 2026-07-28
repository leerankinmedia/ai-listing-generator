/**
 * Build / extend eBay titles toward 80 characters using known attributes.
 * No filler keywords — only real Brand, Department, Size, Color, Style, Type, Material.
 */

import { splitPrimaryColorAndDetails } from "@/lib/marketplaces/adapters/ebay/aspect-normalize"
import type { Listing } from "@/lib/types"

export const EBAY_TITLE_MAX = 80

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

/**
 * Assemble a search-optimized title from listing attributes, up to 80 chars.
 */
export function buildEbayOptimizedTitle(listing: Listing): string {
  const s = listing.specifics
  const extras = s.extras || {}
  const brand = cleanPart(s.brand)
  const dept = cleanPart(s.gender || extras.Department || extras.department)
  const size = cleanPart(s.size)
  const colorRaw = cleanPart(
    extras.Color || extras.Colour || s.color
  )
  const color = colorRaw && !isUnknown(colorRaw) ? primaryColor(colorRaw) : ""
  const style = cleanPart(s.style)
  const type = cleanPart(extras.Type || extras.type || extras["Item Type"])
  const material = cleanPart(s.material)
  const pattern = cleanPart(s.pattern)

  const parts: string[] = []
  const push = (part: string) => {
    if (!part || isUnknown(part)) return
    const next = [...parts, part].join(" ")
    if (next.length <= EBAY_TITLE_MAX) parts.push(part)
  }

  push(brand && !isUnknown(brand) ? brand : "")
  if (dept && !isUnknown(dept)) push(titleCaseDept(dept))
  push(size)
  push(color)
  // Prefer type then style; avoid duplicating similar tokens.
  if (type && !isUnknown(type)) push(type)
  else if (style && !isUnknown(style)) push(style)
  else push(style)

  // Use remaining space for material / pattern / style if not already used.
  const joined = parts.join(" ")
  if (joined.length < 55) {
    if (
      material &&
      !isUnknown(material) &&
      !/cotton blend|polyester blend|\d+\s*%/i.test(material) &&
      /cashmere|leather|silk|wool|linen|suede|denim/i.test(material)
    ) {
      push(material)
    }
  }
  if (parts.join(" ").length < 65 && pattern && !isUnknown(pattern) && !/^solid$/i.test(pattern)) {
    push(pattern)
  }
  if (
    parts.join(" ").length < 70 &&
    style &&
    !isUnknown(style) &&
    type &&
    !parts.some((p) => p.toLowerCase() === style.toLowerCase())
  ) {
    push(style)
  }

  let title = parts.join(" ").replace(/\s+/g, " ").trim()
  if (!title) title = cleanPart(listing.title).slice(0, EBAY_TITLE_MAX)

  // If AI title is longer/richer and already within 80, prefer extending from it
  // when our structured build is much shorter.
  const existing = cleanPart(listing.title).slice(0, EBAY_TITLE_MAX)
  if (existing.length >= title.length + 8 && existing.length <= EBAY_TITLE_MAX) {
    return existing
  }

  return title.slice(0, EBAY_TITLE_MAX)
}

/** Extend an existing title toward 80 chars with unused known attributes. */
export function enrichEbayTitleTowardLimit(
  title: string,
  listing: Listing
): string {
  let current = cleanPart(title).slice(0, EBAY_TITLE_MAX)
  if (current.length >= 75) return current

  const built = buildEbayOptimizedTitle({ ...listing, title: current })
  if (built.length > current.length) return built.slice(0, EBAY_TITLE_MAX)

  const extras = listing.specifics.extras || {}
  const candidates = [
    listing.specifics.brand,
    listing.specifics.gender ? titleCaseDept(listing.specifics.gender) : "",
    listing.specifics.size,
    primaryColor(extras.Color || listing.specifics.color || ""),
    extras.Type || extras.type,
    listing.specifics.style,
    listing.specifics.pattern,
  ]
    .map(cleanPart)
    .filter((p) => p && !isUnknown(p))

  for (const part of candidates) {
    if (current.toLowerCase().includes(part.toLowerCase())) continue
    const next = `${current} ${part}`.replace(/\s+/g, " ").trim()
    if (next.length <= EBAY_TITLE_MAX) current = next
  }
  return current.slice(0, EBAY_TITLE_MAX)
}
