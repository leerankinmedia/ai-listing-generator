import type { ListingInput, ListingResult, ListingWarning } from "@/types/listing"
import { suggestCategoryFromText } from "@/lib/ebay/categories"
import {
  EBAY_TITLE_MAX,
  EBAY_TITLE_MIN,
  extractKeywordCandidates,
  fitEbayTitle,
  scoreOverall,
  titleLengthScore,
} from "@/lib/ebay/title"

function titleCaseToken(token: string): string {
  const lower = token.toLowerCase()
  const keepLowerStyle = new Set([
    "low",
    "mid",
    "high",
    "og",
    "se",
    "pe",
    "qs",
  ])
  if (keepLowerStyle.has(lower)) {
    return lower.charAt(0).toUpperCase() + lower.slice(1)
  }
  if (/^\d/.test(token)) return token.toUpperCase()
  if (token.length <= 2 && /^[a-z0-9]+$/i.test(token)) return token.toUpperCase()
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase()
}

/** Pull product-model phrases from notes (e.g. "Dunk Low Panda") excluding brand/noise. */
function extractModelPhrase(input: ListingInput): string {
  if (!input.notes?.trim()) return ""
  const brand = (input.brand || "").toLowerCase()
  const stopBreak = new Set([
    "lightly",
    "slightly",
    "gently",
    "worn",
    "used",
    "no",
    "box",
    "tags",
    "tag",
    "with",
    "without",
    "missing",
    "includes",
    "include",
    "comes",
  ])
  const tokens = input.notes
    .replace(/[^\w\s+/.-]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)

  const kept: string[] = []
  for (const token of tokens) {
    const lower = token.toLowerCase()
    if (brand && lower === brand) continue
    if (stopBreak.has(lower)) break
    kept.push(titleCaseToken(token))
    if (kept.length >= 5) break
  }
  return kept.join(" ")
}

const TITLE_NOISE = new Set([
  "box",
  "tags",
  "tag",
  "worn",
  "used",
  "lightly",
  "slightly",
  "no",
  "not",
])

function buildTitle(input: ListingInput): string {
  const model = extractModelPhrase(input)
  const itemType = inferItemType(input)
  const department = /women|dress|handbag/i.test(`${input.notes} ${input.categoryHint}`)
    ? "Womens"
    : /kid|youth|boys|girls/i.test(`${input.notes} ${input.categoryHint}`)
      ? "Youth"
      : "Mens"

  const ordered = [
    input.brand,
    model,
    model.toLowerCase().includes(itemType.split(" ")[0].toLowerCase()) ? "" : itemType,
    department,
    input.color,
    input.material,
    input.size ? `Size ${input.size}` : "",
    input.condition?.includes("New")
      ? "New"
      : input.condition?.includes("Excellent")
        ? "Excellent"
        : "",
  ]
    .map((p) => (p || "").trim())
    .filter(Boolean)

  const deduped: string[] = []
  for (const part of ordered) {
    if (deduped.some((d) => d.toLowerCase() === part.toLowerCase())) continue
    const soFar = deduped.join(" ").toLowerCase()
    if (part.split(" ").every((w) => soFar.includes(w.toLowerCase()))) continue
    deduped.push(part)
  }

  let base = deduped.join(" ")

  if (base.length < EBAY_TITLE_MIN && input.notes) {
    const extras = extractKeywordCandidates(input.notes, 8)
      .filter((w) => !TITLE_NOISE.has(w.toLowerCase()))
      .map(titleCaseToken)
      .filter((w) => !base.toLowerCase().includes(w.toLowerCase()))
    for (const w of extras) {
      if (`${base} ${w}`.length > EBAY_TITLE_MAX) break
      base = `${base} ${w}`.trim()
    }
  }

  if (base.length < EBAY_TITLE_MIN) {
    const fillers = [
      "Authentic",
      "Pre-Owned",
      "Fast Ship",
      "Reseller Ready",
      "Clean",
      "Great Condition",
      "See Photos",
    ]
    for (const f of fillers) {
      if (base.toLowerCase().includes(f.toLowerCase())) continue
      const candidate = `${base} ${f}`.trim()
      if (candidate.length > EBAY_TITLE_MAX) {
        // Try a shorter filler that still helps reach min
        continue
      }
      base = candidate
      if (base.length >= EBAY_TITLE_MIN) break
    }
  }

  // Final pad with compact SEO tokens if still short
  if (base.length < EBAY_TITLE_MIN) {
    const compact = ["Vintage", "Style", "Deal", "Quality"]
    for (const f of compact) {
      if (base.toLowerCase().includes(f.toLowerCase())) continue
      const candidate = `${base} ${f}`.trim()
      if (candidate.length > EBAY_TITLE_MAX) continue
      base = candidate
      if (base.length >= EBAY_TITLE_MIN) break
    }
  }

  return fitEbayTitle(base)
}

function inferItemType(input: ListingInput): string {
  const hay = `${input.notes} ${input.categoryHint}`.toLowerCase()
  if (/sneaker|shoe|jordan|yeezy|trainer/.test(hay)) return "Athletic Shoes"
  if (/hoodie|sweatshirt/.test(hay)) return "Hoodie"
  if (/jacket|coat|puffer/.test(hay)) return "Jacket"
  if (/dress/.test(hay)) return "Dress"
  if (/bag|handbag|tote|purse/.test(hay)) return "Handbag"
  if (/watch/.test(hay)) return "Wristwatch"
  if (/jean|denim/.test(hay)) return "Jeans"
  if (/shirt|tee|t-shirt/.test(hay)) return "T-Shirt"
  if (/phone|iphone|samsung/.test(hay)) return "Smartphone"
  return "Item"
}

function buildDescription(input: ListingInput, title: string): string {
  const condition = input.condition || "Pre-owned — see photos for details"
  const brand = input.brand || "Unbranded / see photos"
  const details = [
    input.size && `Size: ${input.size}`,
    input.color && `Color: ${input.color}`,
    input.material && `Material: ${input.material}`,
  ]
    .filter(Boolean)
    .join("\n")

  return [
    `${title}`,
    "",
    `Offered in ${condition}. Brand: ${brand}.`,
    "",
    details || "Key details are based on seller notes and photos — please review images carefully.",
    "",
    input.notes
      ? `Seller notes:\n${input.notes.trim()}`
      : "Additional measurements and provenance were not provided. Message us if you need specifics before purchase.",
    "",
    "Ships promptly from a smoke-free workspace. Please review all photos as they are part of the description. Feel free to message with questions — we respond quickly.",
  ].join("\n")
}

function buildSpecifics(input: ListingInput): Record<string, string> {
  const specifics: Record<string, string> = {}
  if (input.brand) specifics.Brand = input.brand
  if (input.size) specifics.Size = input.size
  if (input.color) specifics.Color = input.color
  if (input.material) specifics.Material = input.material
  if (input.condition) specifics.Condition = input.condition
  const hay = `${input.notes} ${input.categoryHint}`
  specifics.Department = /women|dress|handbag/i.test(hay)
    ? "Women"
    : /men|jordan|dunk|hoodie|jean|sneaker|shoe/i.test(hay)
      ? "Men"
      : "Unisex Adults"
  specifics.Style = inferItemType(input)
  if (/sneaker|shoe|dunk|jordan|yeezy/i.test(hay)) {
    specifics["Shoe Width"] = specifics["Shoe Width"] || "Medium (D, M)"
    specifics["Type"] = "Athletic"
  }
  if (!specifics.Brand) specifics.Brand = "Unbranded"
  return specifics
}

function buildPricing(input: ListingInput) {
  const margin = (input.targetMarginPercent ?? 55) / 100
  const cost = input.cost
  let suggested: number
  if (cost != null && cost > 0) {
    suggested = Math.round((cost / (1 - Math.min(margin, 0.85))) * 100) / 100
  } else {
    const hay = `${input.brand} ${input.notes} ${input.categoryHint}`.toLowerCase()
    if (/nike|adidas|jordan|levi|coach|kate spade/.test(hay)) suggested = 68
    else if (/rolex|lv|gucci|chanel/.test(hay)) suggested = 420
    else suggested = 36
  }
  const low = Math.round(suggested * 0.82 * 100) / 100
  const high = Math.round(suggested * 1.22 * 100) / 100
  const profit =
    cost != null ? Math.round((suggested - cost) * 100) / 100 : null

  return {
    suggestedPrice: suggested,
    lowPrice: low,
    highPrice: high,
    currency: "USD",
    rationale:
      cost != null
        ? `Anchored to your $${cost} cost with ~${Math.round(margin * 100)}% target margin, adjusted for typical secondary-market demand.`
        : "Estimated from category/brand heuristics. Add cost and richer details for sharper pricing.",
    estimatedProfit: profit,
  }
}

function buildWarnings(input: ListingInput, title: string): ListingWarning[] {
  const warnings: ListingWarning[] = [
    {
      field: "mode",
      severity: "info",
      message: "Demo mode is active (no OpenAI API key). Results are heuristic, not model-generated.",
      suggestion: "Set OPENAI_API_KEY in .env.local for production-quality AI listings.",
    },
  ]

  if (!input.brand) {
    warnings.push({
      field: "brand",
      severity: "warning",
      message: "Brand is missing — titles and search ranking will be weaker.",
      suggestion: "Add the brand from the label or authenticity marks.",
    })
  }
  if (!input.size && /clothing|shoe|jean|dress|hoodie/i.test(`${input.notes} ${input.categoryHint}`)) {
    warnings.push({
      field: "size",
      severity: "critical",
      message: "Size is missing for an apparel/footwear item.",
      suggestion: "Measure and add size before publishing.",
    })
  }
  if (!input.condition) {
    warnings.push({
      field: "condition",
      severity: "warning",
      message: "Condition was not specified.",
      suggestion: "Select an eBay-accurate condition to avoid returns.",
    })
  }
  if (!input.imageDataUrls?.length) {
    warnings.push({
      field: "photos",
      severity: "warning",
      message: "No photos uploaded — buyers convert far better with 6–8 clear images.",
      suggestion: "Add front, back, label, flaws, and detail shots.",
    })
  }
  if (!input.cost) {
    warnings.push({
      field: "cost",
      severity: "info",
      message: "No cost basis provided — profit estimate is unavailable.",
      suggestion: "Enter what you paid to track margin.",
    })
  }
  if (title.length < EBAY_TITLE_MIN || title.length > EBAY_TITLE_MAX) {
    warnings.push({
      field: "title",
      severity: "warning",
      message: `Title length is ${title.length} (target ${EBAY_TITLE_MIN}–${EBAY_TITLE_MAX}).`,
      suggestion: "Add brand, size, color, or material to enrich the title.",
    })
  }

  return warnings
}

/** Deterministic fallback used when OPENAI_API_KEY is not configured. */
export function generateDemoListing(input: ListingInput): ListingResult {
  const title = buildTitle(input)
  const description = buildDescription(input, title)
  const category = suggestCategoryFromText(
    `${input.brand} ${input.categoryHint} ${input.notes} ${title}`,
  )
  const itemSpecifics = buildSpecifics(input)
  const pricing = buildPricing(input)
  const keywords = Array.from(
    new Set([
      ...extractKeywordCandidates(`${title} ${input.notes} ${input.brand} ${input.color}`, 14),
      input.brand?.toLowerCase(),
      input.color?.toLowerCase(),
      input.size?.toLowerCase(),
    ].filter(Boolean) as string[]),
  ).slice(0, 16)

  const confidence = {
    title: titleLengthScore(title),
    description: input.notes ? 72 : 55,
    category: input.categoryHint ? 78 : 62,
    itemSpecifics: Object.keys(itemSpecifics).length >= 5 ? 70 : 52,
    pricing: input.cost != null ? 74 : 48,
    overall: 0,
  }
  confidence.overall = scoreOverall([
    confidence.title,
    confidence.description,
    confidence.category,
    confidence.itemSpecifics,
    confidence.pricing,
  ])

  return {
    title,
    description,
    category,
    itemSpecifics,
    keywords,
    pricing,
    confidence,
    warnings: buildWarnings(input, title),
    detectedAttributes: {
      brand: input.brand || undefined,
      color: input.color || undefined,
      size: input.size || undefined,
      material: input.material || undefined,
      style: inferItemType(input),
      department: itemSpecifics.Department,
    },
  }
}
