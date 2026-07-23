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
    // Gray/Grey spelling variants for color matching against eBay lists.
    if (canonical === "gray") {
      out.add("grey")
      out.add("Gray")
      out.add("Grey")
    }
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

function isGrayFamily(value: string): boolean {
  const c = collapse(value)
  return (
    COLOR_LOOKUP.get(c) === "gray" ||
    /\b(gray|grey|charcoal|slate|gunmetal|heather)\b/.test(c)
  )
}

function isBlackFamily(value: string): boolean {
  const c = collapse(value)
  return COLOR_LOOKUP.get(c) === "black" || /\b(black|onyx|noir)\b/.test(c)
}

/**
 * Color-only: map detected wording onto an exact allowed eBay color.
 * Prefers synonym/exact matches (Dark Gray → Gray). Never maps gray-family
 * values onto Black. Fuzzy nearest-color is last resort and family-safe.
 */
function matchExactEbayColorValue(
  candidates: Array<string | undefined>,
  allowed: string[],
  highConfidence: boolean
): { value?: string; detected?: string; path?: string } {
  if (allowed.length === 0) {
    for (const c of candidates) {
      const v = c?.trim()
      if (v) return { value: v, detected: v, path: "free_text" }
    }
    return {}
  }

  // Index allowed values with gray≡grey equivalence.
  const allowedByKey = new Map<string, string>()
  for (const v of allowed) {
    const key = collapse(v)
    allowedByKey.set(key, v)
    if (key === "gray") allowedByKey.set("grey", v)
    if (key === "grey") allowedByKey.set("gray", v)
  }

  const findGrayAllowed = () =>
    allowed.find((a) => {
      const k = collapse(a)
      return k === "gray" || k === "grey"
    })

  for (const candidate of candidates) {
    const raw = candidate?.trim()
    if (!raw) continue

    // 1) Direct case-insensitive match
    const direct = allowedByKey.get(collapse(raw))
    if (direct) {
      return { value: direct, detected: raw, path: "exact" }
    }

    // 2) Synonym / normalized expansions (Dark Gray, Charcoal, Grey → gray)
    for (const expanded of expandCandidates("color", raw)) {
      const hit = allowedByKey.get(collapse(expanded))
      if (hit) {
        // Guard: never accept Black for a gray-family detection.
        if (isGrayFamily(raw) && isBlackFamily(hit)) continue
        return { value: hit, detected: raw, path: "synonym" }
      }
    }

    // Explicit gray-family → preferred Gray/Grey allowed option.
    if (isGrayFamily(raw)) {
      const grayOpt = findGrayAllowed()
      if (grayOpt) {
        return { value: grayOpt, detected: raw, path: "gray_family" }
      }
      // No Gray in this category — do not fall through to Black via fuzzy.
      continue
    }
  }

  // 3) Nearest-color fallback only when synonym/exact failed — never gray→black.
  if (highConfidence) {
    for (const candidate of candidates) {
      const raw = candidate?.trim()
      if (!raw) continue
      if (isGrayFamily(raw)) continue
      const fuzzy = closestAllowedByTokens(raw, allowed, true)
      if (!fuzzy) continue
      if (isGrayFamily(raw) && isBlackFamily(fuzzy)) continue
      if (isBlackFamily(fuzzy) && !isBlackFamily(raw)) {
        // Avoid mapping non-black detections onto Black.
        continue
      }
      return { value: fuzzy, detected: raw, path: "fuzzy" }
    }
  }

  return {}
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
    // Never consider Black as nearest for gray-family candidates.
    if (isGrayFamily(candidate) && isBlackFamily(option)) continue

    const optTokens = tokenSet(option)
    if (optTokens.size === 0) continue
    let overlap = 0
    for (const t of candTokens) {
      if (optTokens.has(t)) overlap += 1
    }
    const cand = collapse(candidate)
    const opt = collapse(option)
    if (cand.includes(opt) || opt.includes(cand)) overlap += 1
    const score = overlap / Math.max(candTokens.size, optTokens.size)
    if (!best || score > best.score) best = { value: option, score }
  }

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
  const name = aspectName.trim().toLowerCase()

  if (name === "color" || name === "colour") {
    const matched = matchExactEbayColorValue(candidates, allowed, highConfidence)
    if (matched.detected || matched.value) {
      console.info("[ebay/color] TEMP detected-to-selected mapping", {
        detected: matched.detected || null,
        selected: matched.value || null,
        path: matched.path || null,
        allowedSample: allowed.slice(0, 12),
      })
    }
    return matched.value
  }

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

    // 3) High-confidence closest shade / token match (non-color aspects)
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

/** Exported for aspect apply-layer guards (gray-family must not stick as Black). */
export function colorIsGrayFamily(value: string | undefined): boolean {
  if (!value?.trim()) return false
  return isGrayFamily(value)
}

export function colorIsBlackFamily(value: string | undefined): boolean {
  if (!value?.trim()) return false
  return isBlackFamily(value)
}
