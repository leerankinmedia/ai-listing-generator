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
  splitPrimaryColorAndDetails,
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
  /** 1-based photo number for logging */
  index?: number
  sourceUrl?: string
}

export type FailedVisionImage = {
  index: number
  sourceUrl?: string
  error: string
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
- Color: use a single primary garment color only (White, Black, Red, Blue, Gray, Green, Brown, Pink, Purple, Yellow, Orange).
  Put accent details (red stitching, contrast trim, logos) in pattern, style, or description — never in Color.
  Example: Color "White" and note "red stitching" elsewhere — not "White with red stitch".
  Do not default to Black when the garment looks charcoal, slate, or dark gray — especially in
  uneven lighting. Reserve Black for clearly jet-black fabric with no gray/charcoal evidence.
- Seller context (when provided) is HIGH PRIORITY guidance for ambiguous attributes
  (women's/men's, size, brand, flaws, item type). Use it to fill gaps and disambiguate.
  NEVER overwrite attributes that are clearly contradicted by strong, visible photo evidence.`

function sellerContextBlock(sellerNotes?: string): string {
  const notes = sellerNotes?.trim()
  if (!notes) return ""
  return `

HIGH-PRIORITY SELLER CONTEXT (from the seller — guide the result, do not invent):
"""
${notes.slice(0, 2000)}
"""
Use this to clarify ambiguous details (department, size, brand, flaws, item type, etc.).
If this conflicts with clear visual evidence in the photos, prefer the photos.`
}

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
- Color accents (stitching, trim, logos) belong in description bullets — not the Color specific.
Example title shape:
WWE WrestleMania Legends Men's XL Gray Graphic T-Shirt Wrestling Tee

Description rules:
- Clear paragraphs + bullet details
- Use a positive neutral condition line for normal pre-owned items with no verified flaws
- ONLY mention flaws that appear in the verified attributes.flaws field with strong evidence
- Never invent wrinkles, fading, stains, holes, wear, or damage
- If verified flaws exist, put them under a final section titled "Condition notes"
- Mention materials (including 100% Cotton when known), fit/style, and department
- Preserve accent details (e.g. red stitching) in the description when Color is a primary value
- Plain text only (no HTML)`

const COMPS_SYSTEM = `You are ListWise Pricing, a secondary-market comps analyst for clothing on eBay sold listings.
Estimate sold-comparable pricing in USD for the identified clothing item using recent eBay sold knowledge
(and similar fashion resale comps when helpful).
Be conservative. Prefer realistic sold ranges over aspirational retail.
Explain the comps band clearly for the specific brand/style/condition/size when known.`

async function detectSingleImage(
  openai: OpenAIClient,
  image: VisionImage,
  photoNumber: number,
  totalImages: number,
  sellerNotes?: string
): Promise<{ detection: ImageDetection; usage: TokenUsage }> {
  const content: ContentPart[] = [
    {
      type: "text",
      text: `Analyze photo ${photoNumber} of ${totalImages} individually.
Return exactly one analysis object for this photo covering brand, category, size, color, material, style, pattern, gender, condition, and flaws.
For flaws: use "None visible" unless a defect is clearly and strongly evidenced in this photo. Do not invent wrinkles or fading.${sellerContextBlock(sellerNotes)}`,
    },
    {
      type: "image",
      image: image.data,
      mediaType: image.mediaType,
    },
  ]

  const result = await generateObject({
    model: listingModel(openai),
    schema: imageBatchDetectionSchema,
    system: DETECT_SYSTEM,
    messages: [{ role: "user", content }],
  })

  const detection = result.object.images[0]
  if (!detection) {
    throw new ListingEngineError(
      `Vision returned no detection for photo ${photoNumber}.`,
      502
    )
  }

  return {
    detection,
    usage: usageFromResult(result),
  }
}

async function detectBatch(
  openai: OpenAIClient,
  batch: VisionImage[],
  batchIndex: number,
  totalImages: number,
  startIndex: number,
  sellerNotes?: string
): Promise<{
  images: ImageDetection[]
  usage: TokenUsage
  failed: FailedVisionImage[]
}> {
  const content: ContentPart[] = [
    {
      type: "text",
      text: `Batch ${batchIndex + 1}: analyze EACH of these ${batch.length} photos individually (photos ${startIndex + 1}–${startIndex + batch.length} of ${totalImages}).
Return one analysis object per photo in the same order. Cover brand, category, size, color, material, style, pattern, gender, condition, and flaws for every image.
For flaws: use "None visible" unless a defect is clearly and strongly evidenced in that photo. Do not invent wrinkles or fading.${sellerContextBlock(sellerNotes)}`,
    },
  ]
  for (const image of batch) {
    content.push({
      type: "image",
      image: image.data,
      mediaType: image.mediaType,
    })
  }

  try {
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
      failed: [],
    }
  } catch (batchError) {
    const batchMessage =
      batchError instanceof Error ? batchError.message : "Vision batch failed"
    console.warn("[listing engine] batch vision failed — retrying per photo", {
      batchIndex: batchIndex + 1,
      startIndex: startIndex + 1,
      count: batch.length,
      error: batchMessage,
      photos: batch.map((img, offset) => ({
        index: img.index ?? startIndex + offset + 1,
        sourceUrl: img.sourceUrl,
        mediaType: img.mediaType,
        bytes:
          typeof img.data === "string"
            ? img.data.length
            : (img.data as Buffer).byteLength,
      })),
    })

    // Tolerate one (or more) bad images: analyze survivors individually.
    const images: ImageDetection[] = []
    const failed: FailedVisionImage[] = []
    let usage = emptyTokenUsage()

    for (const [offset, image] of batch.entries()) {
      const photoNumber = image.index ?? startIndex + offset + 1
      try {
        const single = await detectSingleImage(
          openai,
          image,
          photoNumber,
          totalImages,
          sellerNotes
        )
        images.push(single.detection)
        usage = addTokenUsage(usage, single.usage)
      } catch (photoError) {
        const message =
          photoError instanceof Error ? photoError.message : "Vision failed"
        console.error("[listing engine] photo analysis failed", {
          index: photoNumber,
          sourceUrl: image.sourceUrl,
          mediaType: image.mediaType,
          bytes:
            typeof image.data === "string"
              ? image.data.length
              : (image.data as Buffer).byteLength,
          error: message,
        })
        failed.push({
          index: photoNumber,
          sourceUrl: image.sourceUrl,
          error: message,
        })
      }
    }

    return { images, usage, failed }
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
  const split = splitPrimaryColorAndDetails(raw)
  if (split.primaryLabel) return split.primaryLabel
  // Prefer the primary token before slash compounds (Navy/Blue → Navy).
  const primary = raw.split(/[/,|]/)[0]?.trim()
  return primary || raw
}

/**
 * Keep Color as an eBay primary value; move accent wording into pattern/style/description.
 * Example: "White with red stitch" → color White, detail preserved elsewhere.
 */
function applyPrimaryColorSplit(args: {
  color?: FieldConfidence
  pattern?: FieldConfidence
  style?: FieldConfidence
  description: string
}): {
  color?: FieldConfidence
  pattern?: FieldConfidence
  style?: FieldConfidence
  description: string
} {
  const color = args.color
  if (!color?.value?.trim()) return args
  const split = splitPrimaryColorAndDetails(color.value)
  if (!split.primaryLabel) return args

  const nextColor: FieldConfidence = {
    ...color,
    value: split.primaryLabel,
    rationale:
      split.detail && split.detail !== color.value
        ? `${color.rationale || ""} Primary color ${split.primaryLabel}; accent "${split.detail}" moved out of Color.`.trim()
        : color.rationale,
  }

  let pattern = args.pattern
  let style = args.style
  let description = args.description
  const detail = split.detail?.trim()
  if (detail) {
    const patternEmpty =
      !pattern?.value?.trim() || pattern.value.trim().toLowerCase() === "unknown"
    const styleEmpty =
      !style?.value?.trim() || style.value.trim().toLowerCase() === "unknown"
    if (
      patternEmpty &&
      /\b(stripe|striped|plaid|floral|print|graphic|logo|dot|camo)\b/i.test(detail)
    ) {
      pattern = {
        value: detail,
        confidence: color.confidence,
        rationale: `Accent detail from color wording: ${detail}`,
      }
    } else if (
      styleEmpty &&
      /\b(stitch|embroidery|trim|piping|contrast)\b/i.test(detail)
    ) {
      style = {
        value: detail,
        confidence: color.confidence,
        rationale: `Accent detail from color wording: ${detail}`,
      }
    }
    if (!description.toLowerCase().includes(detail.toLowerCase())) {
      description = `${description.trim()}\n\nDetails: ${detail}.`.trim()
    }
  }

  return { color: nextColor, pattern, style, description }
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
  totalImages: number,
  sellerNotes?: string
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

Verified attributes (with confidence) — Color is already a primary eBay color when possible.
Keep accent details (stitching, trim) in description/pattern/style, not in Color.
${JSON.stringify(fields, null, 2)}
Total photos in listing: ${totalImages}. Sample photos attached for visual context.${sellerContextBlock(sellerNotes)}`,
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
 * Tolerates individual photo failures and continues with remaining photos.
 */
export async function generateListingFromImages(
  images: VisionImage[],
  options?: {
    compsProvider?: CompsProvider
    sellerNotes?: string
  }
): Promise<{
  draft: GeneratedListingOutput
  model: string
  usage: TokenUsage
  imagesAnalyzed: number
  imagesFailed: FailedVisionImage[]
  warnings: string[]
  partial: boolean
}> {
  if (images.length === 0) {
    throw new ListingEngineError("At least one image is required.", 400)
  }

  const openai = getOpenAI()
  const model = getListingModel()
  const sellerNotes = options?.sellerNotes?.trim() || undefined
  let usage = emptyTokenUsage()

  const batches: VisionImage[][] = []
  for (let i = 0; i < images.length; i += VISION_BATCH_SIZE) {
    batches.push(images.slice(i, i + VISION_BATCH_SIZE))
  }

  // Analyze every image in parallel batches (bounded concurrency).
  // If a batch fails (e.g. one corrupt/oversized photo), fall back per-image.
  const detections: ImageDetection[] = []
  const imagesFailed: FailedVisionImage[] = []
  const concurrency = 2
  for (let i = 0; i < batches.length; i += concurrency) {
    const slice = batches.slice(i, i + concurrency)
    const results = await Promise.all(
      slice.map((batch, offset) => {
        const batchIndex = i + offset
        const startIndex = batchIndex * VISION_BATCH_SIZE
        return detectBatch(
          openai,
          batch,
          batchIndex,
          images.length,
          startIndex,
          sellerNotes
        )
      })
    )
    for (const batchResult of results) {
      detections.push(...batchResult.images)
      imagesFailed.push(...batchResult.failed)
      usage = addTokenUsage(usage, batchResult.usage)
    }
  }

  if (detections.length === 0) {
    const failedSummary = imagesFailed
      .map((f) => `photo ${f.index}${f.sourceUrl ? ` (${f.sourceUrl})` : ""}`)
      .join(", ")
    throw new ListingEngineError(
      `Could not analyze any photos.${failedSummary ? ` Failed: ${failedSummary}.` : ""}`,
      502
    )
  }

  const warnings: string[] = []
  if (imagesFailed.length > 0) {
    const labels = imagesFailed
      .map((f) => `photo ${f.index}`)
      .join(", ")
    warnings.push(
      `Partial analysis: ${labels} could not be read. Listing was built from the remaining ${detections.length} photo${detections.length === 1 ? "" : "s"}.`
    )
    console.warn("[listing engine] partial analysis", {
      analyzed: detections.length,
      failed: imagesFailed,
    })
  }

  const { fields: mergedFields, perImage } = mergeDetections(detections)
  // Primary eBay color only — move "with red stitch" accents out of Color early.
  const colorSplit = applyPrimaryColorSplit({
    color: mergedFields.color,
    pattern: mergedFields.pattern,
    style: mergedFields.style,
    description: "",
  })
  const fields = {
    ...mergedFields,
    color: colorSplit.color || mergedFields.color,
    pattern: colorSplit.pattern || mergedFields.pattern,
    style: colorSplit.style || mergedFields.style,
  }
  const accentDetailNote = colorSplit.description.trim()

  const survivingImages = images.filter(
    (img, idx) =>
      !imagesFailed.some(
        (f) => f.index === (img.index ?? idx + 1)
      )
  )

  const [copyResult, comps] = await Promise.all([
    generateCopy(
      openai,
      fields,
      survivingImages.length > 0 ? survivingImages : images,
      detections.length,
      sellerNotes
    ),
    (options?.compsProvider ?? createAiCompsProvider(openai)).estimate(fields),
  ])
  usage = addTokenUsage(usage, copyResult.usage)
  usage = addTokenUsage(usage, comps.usage)
  const copy = copyResult.copy
  if (
    accentDetailNote &&
    !copy.description.value.toLowerCase().includes(
      accentDetailNote.replace(/^details:\s*/i, "").toLowerCase()
    )
  ) {
    copy.description.value = `${copy.description.value.trim()}\n\n${accentDetailNote}`.trim()
  }

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

  return {
    draft,
    model,
    usage,
    imagesAnalyzed: detections.length,
    imagesFailed,
    warnings,
    partial: imagesFailed.length > 0,
  }
}
