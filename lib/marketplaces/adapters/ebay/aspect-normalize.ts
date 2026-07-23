/**
 * Pure eBay aspect value normalization / matching (safe for client + server).
 * Maps semantically equivalent AI wording onto exact Taxonomy allowed values.
 */

/** Canonical size tokens used for synonym expansion before matching. */
const SIZE_SYNONYMS: Record<string, string[]> = {
  xxs: ["xxs", "2xs", "extra extra small", "xx-small", "xx small"],
  xs: ["xs", "extra small", "x-small", "x small", "xtra small"],
  s: ["s", "small", "sm"],
  m: ["m", "medium", "med", "md"],
  l: ["l", "large", "lg"],
  xl: [
    "xl",
    "extra large",
    "x-large",
    "x large",
    "xtra large",
    "eg",
    "tg",
    "extra-large",
  ],
  "2xl": [
    "2xl",
    "xxl",
    "2x",
    "xx-large",
    "xx large",
    "extra extra large",
    "2x-large",
    "2 x large",
  ],
  "3xl": ["3xl", "xxxl", "3x", "3x-large", "xxx-large"],
  "4xl": ["4xl", "xxxxl", "4x", "4x-large"],
  "1x": ["1x", "1xl"],
}

const COLOR_SYNONYMS: Record<string, string[]> = {
  gray: [
    "gray",
    "grey",
    "dark gray",
    "dark grey",
    "charcoal",
    "charcoal gray",
    "charcoal grey",
    "heather gray",
    "heather grey",
    "light gray",
    "light grey",
    "slate",
    "slate gray",
    "gunmetal",
  ],
  black: ["black", "jet black", "onyx", "noir"],
  white: ["white", "off white", "off-white", "ivory", "cream", "eggshell"],
  blue: [
    "blue",
    "navy",
    "navy blue",
    "dark blue",
    "light blue",
    "royal blue",
    "sky blue",
    "indigo",
  ],
  red: ["red", "burgundy", "maroon", "crimson", "wine"],
  green: ["green", "olive", "olive green", "forest green", "kelly green", "sage"],
  brown: ["brown", "tan", "beige", "khaki", "camel", "chocolate", "espresso"],
  pink: ["pink", "hot pink", "light pink", "blush", "fuchsia", "magenta"],
  purple: ["purple", "violet", "lavender", "plum"],
  yellow: ["yellow", "gold", "mustard", "lemon"],
  orange: ["orange", "coral", "rust", "tangerine"],
  multicolor: ["multicolor", "multi-color", "multi", "multicoloured", "various"],
}

const DEPARTMENT_SYNONYMS: Record<string, string[]> = {
  men: ["men", "mens", "men's", "man", "male", "gentleman"],
  women: ["women", "womens", "women's", "woman", "female", "ladies", "lady"],
  unisex: ["unisex", "uni-sex", "all gender", "gender neutral"],
  kids: ["kids", "kid", "children", "child", "youth", "boys", "girls", "boy", "girl"],
  boys: ["boys", "boy"],
  girls: ["girls", "girl"],
}

const SIZE_TYPE_SYNONYMS: Record<string, string[]> = {
  regular: ["regular", "regular size", "standard", "std"],
  petite: ["petite"],
  plus: ["plus", "plus size"],
  "big & tall": ["big & tall", "big and tall", "big tall", "b&t"],
  juniors: ["juniors", "junior"],
  maternity: ["maternity"],
}

function collapse(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_/]+/g, " ")
    .replace(/[^a-z0-9&+.\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function buildSynonymLookup(table: Record<string, string[]>): Map<string, string> {
  const map = new Map<string, string>()
  for (const [canonical, aliases] of Object.entries(table)) {
    map.set(collapse(canonical), canonical)
    for (const alias of aliases) {
      map.set(collapse(alias), canonical)
    }
  }
  return map
}

const SIZE_LOOKUP = buildSynonymLookup(SIZE_SYNONYMS)
const COLOR_LOOKUP = buildSynonymLookup(COLOR_SYNONYMS)
const DEPARTMENT_LOOKUP = buildSynonymLookup(DEPARTMENT_SYNONYMS)
const SIZE_TYPE_LOOKUP = buildSynonymLookup(SIZE_TYPE_SYNONYMS)

function expandCandidates(
  aspectName: string,
  raw: string
): string[] {
  const name = aspectName.trim().toLowerCase()
  const collapsed = collapse(raw)
  const out = new Set<string>([raw.trim(), collapsed])

  const addCanonical = (canonical: string | undefined) => {
    if (!canonical) return
    out.add(canonical)
    // Also add uppercase/common ebay forms for sizes
    out.add(canonical.toUpperCase())
    out.add(canonical.replace(/\b\w/g, (c) => c.toUpperCase()))
  }

  if (name === "size") {
    addCanonical(SIZE_LOOKUP.get(collapsed))
    // "size xl" / "xl size"
    const stripped = collapsed.replace(/\bsize\b/g, "").trim()
    if (stripped) addCanonical(SIZE_LOOKUP.get(stripped))
  } else if (name === "color" || name === "colour") {
    addCanonical(COLOR_LOOKUP.get(collapsed))
  } else if (name === "department" || name === "gender") {
    addCanonical(DEPARTMENT_LOOKUP.get(collapsed))
  } else if (name === "size type") {
    addCanonical(SIZE_TYPE_LOOKUP.get(collapsed))
  }

  return [...out]
}

function tokenSet(value: string): Set<string> {
  return new Set(
    collapse(value)
      .split(" ")
      .filter((t) => t.length > 1)
  )
}

/**
 * High-confidence shade / fuzzy match: prefer exact synonym map hits;
 * otherwise require strong token overlap against a single closest allowed option.
 */
function closestAllowedByTokens(
  candidate: string,
  allowed: string[],
  highConfidence: boolean
): string | undefined {
  if (!highConfidence || allowed.length === 0) return undefined
  const candTokens = tokenSet(candidate)
  if (candTokens.size === 0) return undefined

  let best: { value: string; score: number } | undefined
  for (const option of allowed) {
    const optTokens = tokenSet(option)
    if (optTokens.size === 0) continue
    let overlap = 0
    for (const t of candTokens) {
      if (optTokens.has(t)) overlap += 1
    }
    // Also score synonym-canonical equality loosely via includes
    const cand = collapse(candidate)
    const opt = collapse(option)
    if (cand.includes(opt) || opt.includes(cand)) overlap += 1
    const score = overlap / Math.max(candTokens.size, optTokens.size)
    if (!best || score > best.score) best = { value: option, score }
  }

  // Only accept strong overlap (e.g. "dark gray" → "Gray")
  if (best && best.score >= 0.5) return best.value
  return undefined
}

export type MatchAspectOptions = {
  /** When true, allow closest-shade / token fuzzy matches onto allowed list. */
  highConfidence?: boolean
  /** SELECTION_ONLY aspects must resolve to an allowed value when a list exists. */
  selectionOnly?: boolean
}

/**
 * Resolve a detected/AI value onto an exact allowed eBay aspect value.
 * Returns the Taxonomy localizedValue string, never the original AI wording,
 * when a fixed selection list is provided.
 */
export function matchExactEbayAspectValue(
  aspectName: string,
  candidates: Array<string | undefined>,
  allowed: string[],
  opts: MatchAspectOptions = {}
): string | undefined {
  const selectionOnly = Boolean(opts.selectionOnly)
  const highConfidence = opts.highConfidence !== false

  if (allowed.length === 0) {
    // Open / free-text aspect — keep first non-empty candidate.
    if (selectionOnly) return undefined
    for (const c of candidates) {
      const v = c?.trim()
      if (v) return v
    }
    return undefined
  }

  const allowedByKey = new Map(
    allowed.map((v) => [collapse(v), v] as const)
  )

  for (const candidate of candidates) {
    const raw = candidate?.trim()
    if (!raw) continue

    // 1) Direct case-insensitive / collapsed match
    const direct = allowedByKey.get(collapse(raw))
    if (direct) return direct

    // 2) Synonym expansions → exact allowed
    for (const expanded of expandCandidates(aspectName, raw)) {
      const hit = allowedByKey.get(collapse(expanded))
      if (hit) return hit
    }

    // 3) High-confidence closest shade / token match
    const fuzzy = closestAllowedByTokens(raw, allowed, highConfidence)
    if (fuzzy) return fuzzy
  }

  return undefined
}

/** Whether listing.fieldConfidence for a related key is high enough for fuzzy shade maps. */
export function isHighConfidenceField(
  confidence: number | undefined
): boolean {
  if (typeof confidence !== "number" || Number.isNaN(confidence)) return true
  return confidence >= 0.7
}
