import { generateObject } from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import {
  compsEstimateSchema,
  imageBatchDetectionSchema,
  listingCopySchema,
  VISION_BATCH_SIZE,
  type CompsEstimate,
  type GeneratedListingOutput,
  type ImageDetection,
  type ListingCopy,
} from "@/lib/listings/schema"
import {
  DEFAULT_LISTING_MODEL,
  addTokenUsage,
  emptyTokenUsage,
  type TokenUsage,
} from "@/lib/ai/pricing"
import type { DetectedFieldKey, FieldConfidence } from "@/lib/types"

type OpenAIClient = ReturnType<typeof createOpenAI>

function usageFromResult(result: {
  usage?: {
    inputTokens?: number | undefined
    outputTokens?: number | undefined
    totalTokens?: number | undefined
    promptTokens?: number | undefined
    completionTokens?: number | undefined
  }
}): TokenUsage {
  const u = result.usage
  if (!u) return emptyTokenUsage()
  const inputTokens = u.inputTokens ?? u.promptTokens ?? 0
  const outputTokens = u.outputTokens ?? u.completionTokens ?? 0
  return {
    inputTokens,
    outputTokens,
    totalTokens: u.totalTokens ?? inputTokens + outputTokens,
  }
}

export class ListingEngineError extends Error {
  status: number
  constructor(message: string, status = 500) {
    super(message)
    this.name = "ListingEngineError"
    this.status = status
  }
}

export function isOpenAIConfigured() {
  return Boolean(
    process.env.OPENAI_API_KEY &&
      process.env.OPENAI_API_KEY !== "sk-..." &&
      process.env.OPENAI_API_KEY.length > 20
  )
}

function getOpenAI(): OpenAIClient {
  if (!isOpenAIConfigured()) {
    throw new ListingEngineError(
      "OPENAI_API_KEY is required for the production listing engine.",
      503
    )
  }
  return createOpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

type VisionImage = {
  mediaType: string
  data: Uint8Array | Buffer | string
}

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image"; image: Uint8Array | Buffer | string; mediaType?: string }

const DETECT_SYSTEM = `You are ListWise Vision, a production clothing identification engine for eBay resale listings.
Analyze ONLY what is visible in the provided clothing photo(s).
Rules:
- Never invent brands, sizes, or labels you cannot see or reasonably infer.
- Use "Unknown" when evidence is insufficient; keep confidence low.
- Confidence must reflect visual certainty (logos, tags, fabric grain, wear).
- Call out flaws honestly: stains, pills, tears, fading, missing buttons, stretched seams, odor indicators if visible, etc.
- Gender/department should reflect labeled/cut cues, otherwise Unisex or Unknown.
- Category should map to eBay clothing taxonomy when possible.`

const COPY_SYSTEM = `You are ListWise Copy, an expert eBay clothing listing writer.
Write conversion-focused, accurate eBay titles and descriptions from verified attributes and photo evidence.
eBay title rules:
- Under 80 characters
- Lead with brand when known, then item type, then size/color/style keywords buyers search
- No keyword stuffing or ALL CAPS
Description rules:
- Clear paragraphs + bullet details
- Include condition and flaws honestly
- Mention materials, fit/style, and department when known
- Plain text only (no HTML)`

const COMPS_SYSTEM = `You are ListWise Pricing, a secondary-market comps analyst for clothing on eBay sold listings.
Estimate sold-comparable pricing in USD for the identified clothing item using recent eBay sold knowledge
(and similar fashion resale comps when helpful).
Be conservative. Prefer realistic sold ranges over aspirational retail.
Explain the comps band clearly for the specific brand/style/condition/size when known.`

async function detectBatch(
  openai: OpenAIClient,
  batch: VisionImage[],
  batchIndex: number,
  totalImages: number,
  startIndex: number
): Promise<{ images: ImageDetection[]; usage: TokenUsage }> {
  const content: ContentPart[] = [
    {
      type: "text",
      text: `Batch ${batchIndex + 1}: analyze EACH of these ${batch.length} photos individually (photos ${startIndex + 1}–${startIndex + batch.length} of ${totalImages}).
Return one analysis object per photo in the same order. Cover brand, category, size, color, material, style, pattern, gender, condition, and flaws for every image.`,
    },
  ]
  for (const image of batch) {
    content.push({
      type: "image",
      image: image.data,
      mediaType: image.mediaType,
    })
  }

  const result = await generateObject({
    model: openai(DEFAULT_LISTING_MODEL),
    schema: imageBatchDetectionSchema,
    system: DETECT_SYSTEM,
    messages: [{ role: "user", content }],
  })

  if (!result.object.images.length) {
    throw new ListingEngineError(
      `Vision returned no detections for batch ${batchIndex + 1}.`,
      502
    )
  }

  return {
    images: result.object.images,
    usage: usageFromResult(result),
  }
}

function pickBest(
  fields: Array<{ value: string; confidence: number; rationale: string }>
): FieldConfidence {
  const ranked = [...fields].sort((a, b) => b.confidence - a.confidence)
  const best = ranked[0]
  const known = ranked.filter(
    (f) => f.value && f.value.toLowerCase() !== "unknown"
  )
  const chosen = known[0] ?? best
  // Boost slightly when multiple batches agree
  const agreements = known.filter(
    (f) => f.value.toLowerCase() === chosen.value.toLowerCase()
  ).length
  const confidence = Math.min(
    1,
    chosen.confidence + (agreements > 1 ? 0.05 * (agreements - 1) : 0)
  )
  return {
    value: chosen.value,
    confidence: Number(confidence.toFixed(3)),
    rationale: chosen.rationale,
  }
}

function mergeDetections(detections: ImageDetection[]): {
  fields: Record<
    Exclude<DetectedFieldKey, "title" | "description" | "price" | "keywords">,
    FieldConfidence
  >
  perImage: GeneratedListingOutput["perImage"]
} {
  const keys = [
    "brand",
    "category",
    "size",
    "color",
    "material",
    "style",
    "pattern",
    "gender",
    "condition",
    "flaws",
  ] as const

  const fields = {} as Record<
    (typeof keys)[number],
    FieldConfidence
  >

  for (const key of keys) {
    fields[key] = pickBest(detections.map((d) => d[key]))
  }

  const perImage = detections.map((d, index) => ({
    index,
    summary: d.imageSummary,
    flaws: d.flaws.value,
  }))

  return { fields, perImage }
}

async function generateCopy(
  openai: OpenAIClient,
  fields: Record<string, FieldConfidence>,
  sampleImages: VisionImage[],
  totalImages: number
): Promise<{ copy: ListingCopy; usage: TokenUsage }> {
  const content: ContentPart[] = [
    {
      type: "text",
      text: `Create an eBay SEO title, eBay-ready description, keywords, and eBay category suggestion for this clothing item.
Verified attributes (with confidence):
${JSON.stringify(fields, null, 2)}
Total photos in listing: ${totalImages}. Sample photos attached for visual context.`,
    },
  ]
  for (const image of sampleImages.slice(0, 4)) {
    content.push({
      type: "image",
      image: image.data,
      mediaType: image.mediaType,
    })
  }

  const result = await generateObject({
    model: openai(DEFAULT_LISTING_MODEL),
    schema: listingCopySchema,
    system: COPY_SYSTEM,
    messages: [{ role: "user", content }],
  })
  return { copy: result.object, usage: usageFromResult(result) }
}

/**
 * Sold-comps pricing engine.
 * Uses AI market comps grounded in the detected SKU/attributes.
 * Swap in eBay Browse/Finding sold APIs via CompsProvider later without UI changes.
 */
export async function estimateSoldComps(
  openai: OpenAIClient,
  fields: Record<string, FieldConfidence>
): Promise<{ comps: CompsEstimate; usage: TokenUsage }> {
  const result = await generateObject({
    model: openai(DEFAULT_LISTING_MODEL),
    schema: compsEstimateSchema,
    system: COMPS_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Estimate eBay sold comps and a suggested list price for this clothing item:
${JSON.stringify(fields, null, 2)}

Return a realistic USD sold range and suggested list price for a typical 7–21 day eBay sale.`,
      },
    ],
  })
  return { comps: result.object, usage: usageFromResult(result) }
}

export interface CompsProvider {
  estimate(fields: Record<string, FieldConfidence>): Promise<{
    suggestedPrice: number
    lowPrice: number
    highPrice: number
    currency: "USD"
    confidence: number
    method: "ai_market_comps" | "ebay_sold_api"
    rationale: string
    comparableSummary: string
    sampleSize: number
    usage: TokenUsage
  }>
}

export function createAiCompsProvider(openai: OpenAIClient): CompsProvider {
  return {
    async estimate(fields) {
      const { comps, usage } = await estimateSoldComps(openai, fields)
      return {
        ...comps,
        currency: "USD",
        method: "ai_market_comps",
        usage,
      }
    },
  }
}

/**
 * Production listing engine: analyzes every image, merges detections,
 * writes copy, and prices from sold comps.
 */
export async function generateListingFromImages(
  images: VisionImage[],
  options?: { compsProvider?: CompsProvider }
): Promise<{ draft: GeneratedListingOutput; model: string; usage: TokenUsage }> {
  if (images.length === 0) {
    throw new ListingEngineError("At least one image is required.", 400)
  }

  const openai = getOpenAI()
  const model = DEFAULT_LISTING_MODEL
  let usage = emptyTokenUsage()

  const batches: VisionImage[][] = []
  for (let i = 0; i < images.length; i += VISION_BATCH_SIZE) {
    batches.push(images.slice(i, i + VISION_BATCH_SIZE))
  }

  // Analyze every image in parallel batches (bounded concurrency)
  const detections: ImageDetection[] = []
  const concurrency = 2
  for (let i = 0; i < batches.length; i += concurrency) {
    const slice = batches.slice(i, i + concurrency)
    const results = await Promise.all(
      slice.map((batch, offset) => {
        const batchIndex = i + offset
        const startIndex = batchIndex * VISION_BATCH_SIZE
        return detectBatch(openai, batch, batchIndex, images.length, startIndex)
      })
    )
    for (const batchResult of results) {
      detections.push(...batchResult.images)
      usage = addTokenUsage(usage, batchResult.usage)
    }
  }

  const { fields, perImage } = mergeDetections(detections)

  const [copyResult, comps] = await Promise.all([
    generateCopy(openai, fields, images, images.length),
    (options?.compsProvider ?? createAiCompsProvider(openai)).estimate(fields),
  ])
  usage = addTokenUsage(usage, copyResult.usage)
  usage = addTokenUsage(usage, comps.usage)
  const copy = copyResult.copy

  const fieldConfidence: GeneratedListingOutput["fieldConfidence"] = {
    brand: fields.brand,
    category: copy.category,
    size: fields.size,
    color: fields.color,
    material: fields.material,
    style: fields.style,
    pattern: fields.pattern,
    gender: fields.gender,
    condition: fields.condition,
    flaws: fields.flaws,
    title: {
      value: copy.title.value,
      confidence: copy.title.confidence,
      rationale: copy.title.rationale,
    },
    description: {
      value: copy.description.value,
      confidence: copy.description.confidence,
      rationale: copy.description.rationale,
    },
    keywords: {
      value: copy.keywords.value.join(", "),
      confidence: copy.keywords.confidence,
      rationale: copy.keywords.rationale,
    },
    price: {
      value: String(comps.suggestedPrice),
      confidence: comps.confidence,
      rationale: comps.rationale,
    },
  }

  const draft: GeneratedListingOutput = {
    title: copy.title.value,
    description: copy.description.value,
    price: comps.suggestedPrice,
    currency: "USD",
    keywords: copy.keywords.value,
    specifics: {
      brand: fields.brand.value,
      size: fields.size.value,
      color: fields.color.value,
      material: fields.material.value,
      style: fields.style.value,
      pattern: fields.pattern.value,
      gender: fields.gender.value,
      condition: fields.condition.value,
      category: copy.category.value,
      flaws: fields.flaws.value,
    },
    fieldConfidence,
    comps: {
      suggestedPrice: comps.suggestedPrice,
      lowPrice: comps.lowPrice,
      highPrice: comps.highPrice,
      currency: "USD",
      confidence: comps.confidence,
      method: "ai_market_comps",
      rationale: comps.rationale,
      comparableSummary: comps.comparableSummary,
      sampleSize: comps.sampleSize,
    },
    perImage,
  }

  return { draft, model, usage }
}
