import type { ListingInput, ListingResult, ListingWarning } from "@/types/listing"
import type { AiListingOutput } from "@/lib/ai/listing-schema"
import {
  EBAY_TITLE_MAX,
  EBAY_TITLE_MIN,
  fitEbayTitle,
  scoreOverall,
  titleLengthScore,
} from "@/lib/ebay/title"

function ensureSpecifics(
  specifics: Record<string, string>,
  input: ListingInput,
): Record<string, string> {
  const next = { ...specifics }
  if (input.brand && !next.Brand) next.Brand = input.brand
  if (input.size && !next.Size) next.Size = input.size
  if (input.color && !next.Color) next.Color = input.color
  if (input.material && !next.Material) next.Material = input.material
  if (input.condition && !next.Condition) next.Condition = input.condition
  return next
}

function mergeWarnings(
  modelWarnings: ListingWarning[],
  input: ListingInput,
  title: string,
): ListingWarning[] {
  const warnings = [...modelWarnings]
  const has = (field: string) => warnings.some((w) => w.field === field)

  if (!input.brand && !has("brand")) {
    warnings.push({
      field: "brand",
      severity: "warning",
      message: "Brand was not provided and may be uncertain.",
      suggestion: "Confirm brand from the care label or authenticity marks.",
    })
  }
  if (!input.size && !has("size")) {
    warnings.push({
      field: "size",
      severity: "warning",
      message: "Size may be incomplete — apparel and footwear need accurate sizing.",
      suggestion: "Add size or flat measurements before publishing.",
    })
  }
  if (!input.imageDataUrls?.length && !has("photos")) {
    warnings.push({
      field: "photos",
      severity: "info",
      message: "No photos were analyzed for this generation.",
      suggestion: "Upload clear photos to improve category, specifics, and confidence.",
    })
  }
  if ((title.length < EBAY_TITLE_MIN || title.length > EBAY_TITLE_MAX) && !has("title")) {
    warnings.push({
      field: "title",
      severity: "warning",
      message: `Title length is ${title.length}; eBay SEO target is ${EBAY_TITLE_MIN}–${EBAY_TITLE_MAX}.`,
    })
  }
  if (input.cost == null && !has("cost")) {
    warnings.push({
      field: "cost",
      severity: "info",
      message: "No cost basis — profit estimate may be omitted.",
      suggestion: "Add your purchase cost for margin tracking.",
    })
  }
  return warnings
}

/** Normalize model output: title length, specifics merge, confidence recompute, profit. */
export function postProcessListing(
  raw: AiListingOutput,
  input: ListingInput,
): ListingResult {
  const title = fitEbayTitle(raw.title)
  const itemSpecifics = ensureSpecifics(raw.itemSpecifics ?? {}, input)
  const keywords = Array.from(
    new Set((raw.keywords ?? []).map((k) => k.trim()).filter(Boolean)),
  ).slice(0, 20)

  const pricing = {
    ...raw.pricing,
    currency: raw.pricing.currency || "USD",
    estimatedProfit:
      input.cost != null
        ? Math.round((raw.pricing.suggestedPrice - input.cost) * 100) / 100
        : null,
  }

  const confidence = {
    title: Math.round((raw.confidence.title + titleLengthScore(title)) / 2),
    description: raw.confidence.description,
    category: raw.confidence.category,
    itemSpecifics: raw.confidence.itemSpecifics,
    pricing: input.cost != null ? Math.max(raw.confidence.pricing, 70) : raw.confidence.pricing,
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
    description: raw.description.trim(),
    category: raw.category,
    itemSpecifics,
    keywords,
    pricing,
    confidence,
    warnings: mergeWarnings(raw.warnings ?? [], input, title),
    detectedAttributes: raw.detectedAttributes,
  }
}
