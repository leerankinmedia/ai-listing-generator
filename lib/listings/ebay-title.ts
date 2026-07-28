/**
 * Build / extend eBay titles toward 70–80 characters using known attributes.
 * Priority: Brand → Character → Department → Pattern/Color → Type → Size.
 * No filler keywords — only real searchable attributes.
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

function shortType(type: string): string {
  // Compress verbose AI item types for title space.
  return type
    .replace(/\bwomen'?s\b/gi, "")
    .replace(/\bmen'?s\b/gi, "")
    .replace(/\bbutton-?front\b/gi, "Button")
    .replace(/\bshirt\/blouse\b/gi, "Shirt")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function enoughSeoKeywords(listing: Listing): boolean {
  const s = listing.specifics
  const extras = s.extras || {}
  const signals = [
    s.brand,
    extras.Character || listing.fieldConfidence?.character?.value,
    s.gender || extras.Department,
    s.size,
    extras.Color || extras.Colour || s.color,
    s.style || extras.Type || extras.type,
    s.pattern,
  ].filter((v) => cleanPart(v) && !isUnknown(cleanPart(v)))
  return signals.length >= 3
}

/**
 * Assemble a search-optimized title from listing attributes, targeting 70–80 chars
 * when enough accurate keywords are available. Never adds irrelevant filler.
 *
 * Example shape:
 * Vintage Looney Tunes Tweety Bird Women's Gingham Sleeveless Button Shirt 22W
 */
export function buildEbayOptimizedTitle(listing: Listing): string {
  const s = listing.specifics
  const extras = s.extras || {}
  const brand = cleanPart(s.brand)
  const character = cleanPart(
    extras.Character ||
      extras.character ||
      listing.fieldConfidence?.character?.value
  )
  const dept = cleanPart(s.gender || extras.Department || extras.department)
  const size = cleanPart(s.size || extras.Size)
  const colorRaw = cleanPart(extras.Color || extras.Colour || s.color)
  const color = colorRaw && !isUnknown(colorRaw) ? primaryColor(colorRaw) : ""
  const style = cleanPart(s.style || extras.Style)
  const type = cleanPart(
    extras.Type ||
      extras.type ||
      extras["Item Type"] ||
      listing.fieldConfidence?.itemType?.value
  )
  const material = cleanPart(s.material || extras.Material)
  const pattern = cleanPart(s.pattern || extras.Pattern)
  const fit = cleanPart(extras.Fit)
  const sizeType = cleanPart(extras["Size Type"])
  const vintage = cleanPart(extras.Vintage)
  const isVintage =
    /^yes$/i.test(vintage) ||
    /\bvintage\b/i.test(`${listing.title} ${listing.description}`)

  const parts: string[] = []
  const push = (part: string) => {
    if (!part || isUnknown(part)) return
    const next = [...parts, part].join(" ")
    if (next.length <= EBAY_TITLE_MAX) parts.push(part)
  }

  if (isVintage) push("Vintage")
  push(brand && !isUnknown(brand) ? brand : "")
  if (
    character &&
    !isUnknown(character) &&
    !parts.some((p) => p.toLowerCase().includes(character.toLowerCase()))
  ) {
    push(character)
  }
  if (dept && !isUnknown(dept)) push(titleCaseDept(dept))
  if (sizeType && !/^regular$/i.test(sizeType)) push(sizeType)

  // Prefer searchable pattern (gingham) over plain color when both compete for space.
  const patternSearchable =
    pattern && !isUnknown(pattern) && !/^solid$/i.test(pattern)
  if (patternSearchable) {
    let patLabel = pattern
    if (/gingham/i.test(pattern)) patLabel = "Gingham"
    else if (/\bchecks?\b/i.test(pattern)) patLabel = "Check"
    else if (/\bstripes?\b|\bstriped\b/i.test(pattern)) patLabel = "Striped"
    else if (/\bfloral\b/i.test(pattern)) patLabel = "Floral"
    else {
      patLabel = pattern.replace(/\b\w/g, (c) => c.toUpperCase())
      if (patLabel.includes(" ")) patLabel = patLabel.split(/\s+/)[0]
    }
    push(patLabel)
  } else {
    push(color)
  }

  // Prefer type then style; avoid duplicating similar tokens.
  if (type && !isUnknown(type)) {
    const shortened = shortType(type)
    // Push meaningful tokens from type that are not already present.
    for (const token of shortened.split(/\s+/)) {
      if (!token || isUnknown(token)) continue
      if (parts.some((p) => p.toLowerCase() === token.toLowerCase())) continue
      if (
        dept &&
        titleCaseDept(dept).toLowerCase().includes(token.toLowerCase())
      ) {
        continue
      }
      push(token)
    }
  } else if (style && !isUnknown(style)) {
    push(shortType(style))
  }

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
    const styleShort = shortType(style)
    if (
      styleShort &&
      !parts.some((p) => styleShort.toLowerCase().includes(p.toLowerCase()))
    ) {
      push(styleShort.split(/\s+/)[0])
    }
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

  // Size near the end (common eBay apparel pattern).
  push(size)

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
    extras.Character || listing.fieldConfidence?.character?.value,
    listing.specifics.gender ? titleCaseDept(listing.specifics.gender) : "",
    listing.specifics.pattern && !/^solid$/i.test(listing.specifics.pattern)
      ? listing.specifics.pattern
      : "",
    extras.Type || extras.type || listing.fieldConfidence?.itemType?.value,
    listing.specifics.style,
    listing.specifics.size,
    primaryColor(extras.Color || listing.specifics.color || ""),
    extras.Fit,
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
