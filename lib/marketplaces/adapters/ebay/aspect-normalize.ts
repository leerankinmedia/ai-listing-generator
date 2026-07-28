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

const MATERIAL_SYNONYMS: Record<string, string[]> = {
  cotton: ["cotton", "100% cotton", "cotton blend", "pure cotton"],
  polyester: ["polyester", "poly", "100% polyester"],
  wool: ["wool", "wool blend", "merino", "cashmere"],
  silk: ["silk", "silk blend"],
  linen: ["linen", "linen blend"],
  denim: ["denim", "jean", "jeans fabric"],
  leather: ["leather", "genuine leather", "faux leather", "vegan leather"],
  nylon: ["nylon"],
  spandex: ["spandex", "elastane", "lycra"],
  rayon: ["rayon", "viscose"],
  fleece: ["fleece"],
}

const PATTERN_SYNONYMS: Record<string, string[]> = {
  solid: ["solid", "solid color", "plain", "no pattern"],
  striped: ["striped", "stripes", "stripe", "pinstripe"],
  plaid: ["plaid", "check", "checked", "checkered", "tartan"],
  floral: ["floral", "flower", "flowers"],
  graphic: ["graphic", "graphic print", "print", "printed"],
  logo: ["logo", "logo print", "branded"],
  camouflage: ["camouflage", "camo"],
  "polka dot": ["polka dot", "polka dots", "dotted", "dots"],
  colorblock: ["colorblock", "color block", "colourblock"],
}

const STYLE_SYNONYMS: Record<string, string[]> = {
  casual: ["casual"],
  athletic: ["athletic", "sport", "sports", "athleisure", "activewear"],
  formal: ["formal", "dressy", "business"],
  vintage: ["vintage", "retro"],
  streetwear: ["streetwear", "street wear"],
  outdoor: ["outdoor", "outdoors", "hiking"],
  basic: ["basic", "essential"],
}

const TYPE_SYNONYMS: Record<string, string[]> = {
  "t-shirt": ["t-shirt", "t shirt", "tee", "tee shirt", "tshirt", "graphic tee"],
  shirt: ["shirt", "button up", "button-up", "button down", "button-down"],
  blouse: ["blouse"],
  hoodie: ["hoodie", "hooded sweatshirt", "hoody"],
  sweatshirt: ["sweatshirt", "crewneck", "crew neck"],
  sweater: ["sweater", "jumper", "pullover", "knit"],
  jacket: ["jacket", "coat", "outerwear"],
  jeans: ["jeans", "denim jeans", "denim pants"],
  pants: ["pants", "trousers", "slacks"],
  shorts: ["shorts"],
  skirt: ["skirt"],
  dress: ["dress"],
  leggings: ["leggings", "tights"],
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

function titleCaseColor(canonical: string): string {
  if (canonical === "gray") return "Gray"
  return canonical.replace(/\b\w/g, (c) => c.toUpperCase())
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
const MATERIAL_LOOKUP = buildSynonymLookup(MATERIAL_SYNONYMS)
const PATTERN_LOOKUP = buildSynonymLookup(PATTERN_SYNONYMS)
const STYLE_LOOKUP = buildSynonymLookup(STYLE_SYNONYMS)
const TYPE_LOOKUP = buildSynonymLookup(TYPE_SYNONYMS)

/**
 * Split compound color wording into an eBay primary color + accent detail.
 * Example: "White with red stitch" → primary White, detail "red stitch".
 */
export function splitPrimaryColorAndDetails(raw: string | undefined | null): {
  primary?: string
  primaryLabel?: string
  detail?: string
} {
  const input = (raw || "").trim()
  if (!input) return {}

  const collapsed = collapse(input)

  const finish = (canonical: string, detail?: string) => ({
    primary: canonical,
    primaryLabel: titleCaseColor(canonical),
    detail: detail?.trim() || undefined,
  })

  // "{color} with {detail}" — e.g. White with red stitch / stitching
  const withMatch = collapsed.match(
    /^(.+?)\s+with\s+(?:a\s+|an\s+|the\s+)?(.+)$/i
  )
  if (withMatch) {
    const colorPart = withMatch[1]
    let detail = withMatch[2].trim()
    // Prefer human phrasing for common stitch notes
    if (/\bstitch(?:ing|es)?\b/i.test(detail) && !/\bstitching\b/i.test(detail)) {
      detail = detail.replace(/\bstitch\b/i, "stitching")
    }
    const direct = COLOR_LOOKUP.get(collapse(colorPart))
    if (direct) return finish(direct, detail)

    // First known color token in the left side (e.g. "bright white")
    const words = collapse(colorPart).split(" ").filter(Boolean)
    for (let len = Math.min(3, words.length); len >= 1; len--) {
      for (let i = 0; i <= words.length - len; i++) {
        const phrase = words.slice(i, i + len).join(" ")
        const hit = COLOR_LOOKUP.get(phrase)
        if (hit) return finish(hit, detail)
      }
    }
  }

  // Full-string synonym (Dark Gray/Charcoal → gray) — no separate detail
  const full = COLOR_LOOKUP.get(collapsed)
  if (full) return finish(full)

  // Leading primary color word, remainder is detail
  const words = collapsed.split(" ").filter(Boolean)
  for (let len = Math.min(3, words.length); len >= 1; len--) {
    const phrase = words.slice(0, len).join(" ")
    const hit = COLOR_LOOKUP.get(phrase)
    if (hit) {
      const rest = words.slice(len).join(" ").trim()
      // Shade compounds like "dark gray" already consumed — no detail
      if (!rest || COLOR_LOOKUP.get(collapsed) === hit) return finish(hit)
      // Avoid treating "blue" remainder of "navy blue" as detail
      if (COLOR_LOOKUP.get(rest) === hit) return finish(hit)
      return finish(hit, rest)
    }
  }

  return {}
}

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
    const split = splitPrimaryColorAndDetails(raw)
    if (split.primary) {
      addCanonical(split.primary)
      if (split.primaryLabel) out.add(split.primaryLabel)
    }
    addCanonical(COLOR_LOOKUP.get(collapsed))
    // Compound detections like "Dark Gray/Charcoal" → match each part.
    const words = collapsed.split(" ").filter(Boolean)
    for (const word of words) {
      addCanonical(COLOR_LOOKUP.get(word))
    }
    for (let i = 0; i < words.length - 1; i++) {
      addCanonical(COLOR_LOOKUP.get(`${words[i]} ${words[i + 1]}`))
    }
  } else if (name === "department" || name === "gender") {
    addCanonical(DEPARTMENT_LOOKUP.get(collapsed))
  } else if (name === "size type") {
    addCanonical(SIZE_TYPE_LOOKUP.get(collapsed))
  } else if (name === "material") {
    addCanonical(MATERIAL_LOOKUP.get(collapsed))
  } else if (name === "pattern") {
    addCanonical(PATTERN_LOOKUP.get(collapsed))
  } else if (name === "style") {
    addCanonical(STYLE_LOOKUP.get(collapsed))
  } else if (name === "type" || name === "item type") {
    addCanonical(TYPE_LOOKUP.get(collapsed))
    for (const word of collapsed.split(" ").filter(Boolean)) {
      addCanonical(TYPE_LOOKUP.get(word))
    }
  } else if (name === "brand") {
    // Normalize casing / strip common prefixes for free-text + selection lists.
    const stripped = collapsed.replace(/^(brand|by)\s+/i, "").trim()
    if (stripped) {
      out.add(stripped)
      out.add(stripped.replace(/\b\w/g, (c) => c.toUpperCase()))
    }
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
      if (!v) continue
      const split = splitPrimaryColorAndDetails(v)
      if (split.primaryLabel) {
        return {
          value: split.primaryLabel,
          detected: v,
          path: "primary_free_text",
        }
      }
      return { value: v, detected: v, path: "free_text" }
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

  // Any gray-family signal wins over a stale exact "Black" earlier in the list.
  // Dark Gray / Charcoal / Grey → eBay Gray (never Black).
  const grayRaw = candidates.find((c) => c?.trim() && isGrayFamily(c))
  if (grayRaw?.trim()) {
    const grayOpt = findGrayAllowed()
    if (grayOpt) {
      return {
        value: grayOpt,
        detected: grayRaw.trim(),
        path: "gray_family_priority",
      }
    }
  }

  // Prefer primary color extracted from compounds ("White with red stitch" → White).
  for (const candidate of candidates) {
    const raw = candidate?.trim()
    if (!raw) continue
    const split = splitPrimaryColorAndDetails(raw)
    if (!split.primary) continue
    const primaryHit =
      allowedByKey.get(collapse(split.primary)) ||
      allowedByKey.get(collapse(split.primaryLabel || ""))
    if (primaryHit) {
      if (isGrayFamily(raw) && isBlackFamily(primaryHit)) continue
      return {
        value: primaryHit,
        detected: raw,
        path: "primary_color_split",
      }
    }
  }

  for (const candidate of candidates) {
    const raw = candidate?.trim()
    if (!raw) continue

    // 1) Direct case-insensitive match
    const direct = allowedByKey.get(collapse(raw))
    if (direct) {
      // Stale Black must not win when a later/sibling candidate is gray-family
      // (already handled above). Still block black for gray raw values.
      if (isGrayFamily(raw) && isBlackFamily(direct)) continue
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

/**
 * Resolve gray-family wording onto the exact allowed eBay Color option.
 * Prefers Taxonomy "Gray" / "Grey"; never returns Black for gray-family input.
 */
export function resolveEbayGrayAspectValue(
  allowed: string[]
): string | undefined {
  if (allowed.length === 0) return "Gray"
  const gray = allowed.find((a) => {
    const k = a.trim().toLowerCase()
    return k === "gray" || k === "grey"
  })
  return gray
}
