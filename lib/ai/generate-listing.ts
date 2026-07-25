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
  getListingModel,
  addTokenUsage,
  emptyTokenUsage,
  type TokenUsage,
} from "@/lib/ai/pricing"
import { usageFromResult } from "@/lib/ai/token-usage"
import {
  colorIsBlackFamily,
  colorIsGrayFamily,
} from "@/lib/marketplaces/adapters/ebay/aspect-normalize"
import {
  appendConditionNotesSection,
  sanitizeDetectedFlaws,
} from "@/lib/listings/condition-details"
import type { DetectedFieldKey, FieldConfidence } from "@/lib/types"

type OpenAIClient = ReturnType<typeof createOpenAI>

/** Prefer Chat Completions so usage is returned as prompt_tokens/completion_tokens. */
function listingModel(openai: OpenAIClient) {
  return openai.chat(getListingModel())
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
- Flaws: ONLY report defects with strong, unambiguous visual evidence (clear stains, holes, tears,
  missing buttons, obvious repairs). If unsure, return "None visible".
  NEVER invent or assume wrinkles, fading, stains, holes, wear, odor, or damage from lighting,
  folds, or normal pre-owned appearance.
- Gender/department should reflect labeled/cut cues, otherwise Unisex or Unknown.
- Category should map to eBay clothing taxonomy when possible.
- Color: prefer detailed shade wording when visible (e.g. Dark Gray/Charcoal, Heather Gray).
  Do not default to Black when the garment looks charcoal, slate, or dark gray — especially in
  uneven lighting. Reserve Black for clearly jet-black fabric with no gray/charcoal evidence.`

const COPY_SYSTEM = `You are ListWise Copy, an expert eBay clothing listing writer.
Write conversion-focused, accurate eBay titles and descriptions from verified attributes and photo evidence.

Apparel eBay title rules (strict priority order — omit unknown parts, do not reorder):
1. Brand / franchise
2. Collection, event, character, team, or graphic keywords
3. Gender / department (e.g. Men's, Women's)
4. Size
5. Exact normalized search color (e.g. Gray — not shade compounds like Dark Gray/Charcoal)
6. Item type / style (e.g. Graphic T-Shirt)
7. One strong search keyword (e.g. Wrestling Tee)
- Under 80 characters
- No keyword stuffing or ALL CAPS
- Do NOT put material percentages or commodity fabric callouts in the title
  (e.g. never "100% Cotton", "Cotton Blend", "Polyester") unless the material itself
  is a rare major selling feature (e.g. cashmere, leather, silk, wool coat).
  Put everyday materials like 100% Cotton in the description and item specifics only.
Example title shape:
WWE WrestleMania Legends Men's XL Gray Graphic T-Shirt Wrestling Tee

Description rules:
- Clear paragraphs + bullet details
- Use a positive neutral condition line for normal pre-owned items with no verified flaws
- ONLY mention flaws that appear in the verified attributes.flaws field with strong evidence
- Never invent wrinkles, fading, stains, holes, wear, or damage
- If verified flaws exist, put them under a final section titled "Condition notes"
- Mention materials (including 100% Cotton when known), fit/style, and department
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
Return one analysis object per photo in the same order. Cover brand, category, size, color, material, style, pattern, gender, condition, and flaws for every image.
For flaws: use "None visible" unless a defect is clearly and strongly evidenced in that photo. Do not invent wrinkles or fading.`,
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
    model: listingModel(openai),
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

function colorDetailScore(value: string): number {
  const v = value.trim()
  let score = 0
  if (v.includes("/")) score += 2
  if (/\s/.test(v)) score += 1
  if (colorIsGrayFamily(v) && !colorIsBlackFamily(v)) score += 1
  return score
}

/**
 * Merge color across all uploaded photos.
 * When black vs gray-family is uncertain, keep the detailed gray wording for
 * review — never let a later Black vote automatically overwrite it.
 */
function pickBestColor(
  fields: Array<{ value: string; confidence: number; rationale: string }>
): FieldConfidence {
  const known = fields.filter(
    (f) => f.value?.trim() && f.value.trim().toLowerCase() !== "unknown"
  )
  if (known.length === 0) return pickBest(fields)

  const grayVotes = known.filter((f) => colorIsGrayFamily(f.value))
  const blackVotes = known.filter(
    (f) => colorIsBlackFamily(f.value) && !colorIsGrayFamily(f.value)
  )

  const rankDetailed = (
    votes: Array<{ value: string; confidence: number; rationale: string }>
  ) =>
    [...votes].sort((a, b) => {
      const detail = colorDetailScore(b.value) - colorDetailScore(a.value)
      if (detail !== 0) return detail
      return b.confidence - a.confidence
    })

  // Mixed black + gray evidence → preserve detailed gray-family for review.
  if (grayVotes.length > 0 && blackVotes.length > 0) {
    const chosen = rankDetailed(grayVotes)[0]
    const avgGray =
      grayVotes.reduce((sum, v) => sum + v.confidence, 0) / grayVotes.length
    return {
      value: chosen.value,
      confidence: Number(
        Math.min(1, Math.max(chosen.confidence, avgGray)).toFixed(3)
      ),
      rationale: `Combined ${known.length} photos: preserved gray-family "${chosen.value}" over Black under black/gray uncertainty. ${chosen.rationale}`,
    }
  }

  if (grayVotes.length > 0) {
    const chosen = rankDetailed(grayVotes)[0]
    const agreements = grayVotes.filter((f) =>
      colorIsGrayFamily(f.value)
    ).length
    return {
      value: chosen.value,
      confidence: Number(
        Math.min(
          1,
          chosen.confidence + (agreements > 1 ? 0.05 * (agreements - 1) : 0)
        ).toFixed(3)
      ),
      rationale:
        agreements > 1
          ? `Combined ${agreements} gray-family photo detections. ${chosen.rationale}`
          : chosen.rationale,
    }
  }

  return pickBest(known)
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
    const votes = detections.map((d) => d[key])
    fields[key] = key === "color" ? pickBestColor(votes) : pickBest(votes)
  }

  // Never keep low-confidence / speculative wear as the listing flaw value.
  const sanitizedFlaws = sanitizeDetectedFlaws(
    fields.flaws.value,
    fields.flaws.confidence
  )
  fields.flaws = {
    ...fields.flaws,
    value: sanitizedFlaws,
    rationale:
      sanitizedFlaws === "None visible"
        ? "No strongly verified visual flaws across photos."
        : fields.flaws.rationale,
  }

  const perImage = detections.map((d, index) => ({
    index,
    summary: d.imageSummary,
    flaws: sanitizeDetectedFlaws(d.flaws.value, d.flaws.confidence),
  }))

  return { fields, perImage }
}

/** Search color for titles only — does not change detected attributes. */
function titleSearchColor(detectedColor: string | undefined): string | undefined {
  const raw = detectedColor?.trim()
  if (!raw || raw.toLowerCase() === "unknown") return undefined
  if (colorIsGrayFamily(raw)) return "Gray"
  // Prefer the primary token before slash compounds (Navy/Blue → Navy).
  const primary = raw.split(/[/,|]/)[0]?.trim()
  return primary || raw
}

/**
 * Strip commodity material percentages from apparel titles.
 * Keeps materials in description/specifics; does not alter detected attributes.
 */
function sanitizeApparelTitle(title: string): string {
  const next = title
    // "100% Cotton", "60% Polyester" — one fiber token only (do not eat "Graphic")
    .replace(/\b\d{1,3}\s*%\s*[A-Za-z][A-Za-z]*\b/gi, " ")
    // "Cotton 100%"
    .replace(
      /\b(?:cotton|polyester|poly|rayon|spandex|elastane|nylon|acrylic|viscose)\s+\d{1,3}\s*%\b/gi,
      " "
    )
    .replace(/\b(?:cotton|polyester)\s+blend\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
  return next || title.slice(0, 80)
}

async function generateCopy(
  openai: OpenAIClient,
  fields: Record<string, FieldConfidence>,
  sampleImages: VisionImage[],
  totalImages: number
): Promise<{ copy: ListingCopy; usage: TokenUsage }> {
  const searchColor = titleSearchColor(fields.color?.value)
  const content: ContentPart[] = [
    {
      type: "text",
      text: `Create an eBay SEO title, eBay-ready description, keywords, and eBay category suggestion for this clothing item.

Title must follow this apparel priority (omit unknowns; keep under 80 chars):
Brand/franchise → collection/event/character/team/graphic → gender/department → size → normalized color → item type/style → strong search keyword.

Title color to use (normalized for search only): ${searchColor || "omit if unknown"}
Do not use shade compounds like "Dark Gray/Charcoal" in the title when a normalized color is provided.
Do not put material percentages such as "100% Cotton" in the title — keep those in description and item specifics only.

Example shape: WWE WrestleMania Legends Men's XL Gray Graphic T-Shirt Wrestling Tee

Verified attributes (with confidence) — leave these attribute values unchanged.
The title may use the normalized search color above, but must NOT rewrite specifics/fieldConfidence color
(e.g. keep Dark Gray/Charcoal in attributes even if the title says Gray).
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
    model: listingModel(openai),
    schema: listingCopySchema,
    system: COPY_SYSTEM,
    messages: [{ role: "user", content }],
  })
  const copy = result.object
  copy.title.value = sanitizeApparelTitle(copy.title.value)
  copy.description.value = appendConditionNotesSection(
    copy.description.value,
    fields.flaws?.value,
    fields.flaws?.confidence
  )
  return { copy, usage: usageFromResult(result) }
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
    model: listingModel(openai),
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
  const model = getListingModel()
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
