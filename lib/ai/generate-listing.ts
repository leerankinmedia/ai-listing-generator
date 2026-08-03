import { generateObject } from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import {
  compsEstimateSchema,
  imageBatchDetectionSchema,
  identitySecondPassSchema,
  listingCopySchema,
  productIdentitySchema,
  VISION_BATCH_SIZE,
  type CompsEstimate,
  type GeneratedListingOutput,
  type ImageDetection,
  type IdentitySecondPassResult,
  type ListingCopy,
  type ProductIdentity,
} from "@/lib/listings/schema"
import {
  addTokenUsage,
  emptyTokenUsage,
  getListingModel,
  type TokenUsage,
} from "@/lib/ai/pricing"
import {
  modelsForPipeline,
  type AnalysisTimings,
  type ListingPipelineMode,
} from "@/lib/ai/pipeline-mode"
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
import { enrichEbayTitleTowardLimit } from "@/lib/listings/ebay-title"
import {
  applyLicensedBrandFallback,
  identityExtrasFromFields,
  identityFieldConfidence,
  isKnownValue,
  isUnknownValue,
  mergeClothingDetections,
  mergeIdentitySecondPass,
  needsIdentitySecondPass,
  type IdentityFields,
  type IdentitySecondPass,
} from "@/lib/listings/clothing-identity"
import type { FieldConfidence, Listing } from "@/lib/types"

type OpenAIClient = ReturnType<typeof createOpenAI>

function chatModel(openai: OpenAIClient, modelId?: string) {
  return openai.chat(modelId || getListingModel())
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

const DETECT_SYSTEM = `You are ListWise Vision — Stage 1 product identification for eBay resale.
Analyze ALL provided clothing photos TOGETHER in one response. Return strict structured JSON only.

Priority (critical):
1. Tag and label photos — OCR every readable brand, size, material, country, style #, gender.
2. Logo / graphic / embroidery / character marks.
3. Front/back garment overview for type, color, pattern, condition.

Rules:
- Never invent brand, gender, size, material, or style. Use Unknown when not visible.
- Tag text overrides guesses from cover shots.
- Licensed labels (e.g. Looney Tunes) set brand AND licensedProperty.
- Named characters when clearly depicted (e.g. Tweety Bird).
- itemType must be specific (Women's sleeveless button shirt), not vague "top".
- Color: single primary only (White, Black, Gray, Blue…). Accents go in features/pattern.
- Flaws: only clear stains/holes/tears. Otherwise "None visible". Never invent wear.
- rationale/evidence fields: max ~12 words. No essays, no step-by-step narration.
- Seller notes (when provided) disambiguate gaps; never override clear photo evidence.`

const IDENTITY_COMBINED_SYSTEM = DETECT_SYSTEM

const IDENTITY_SECOND_PASS_SYSTEM = `You are ListWise Identity Vision — a second-pass specialist.
Your ONLY job is to inspect logos, characters, embroidery, patches, graphics, brand marks, and every readable tag/label across ALL photos together.
Do not treat the item as a generic garment. Name franchises and characters when visually clear (e.g. Looney Tunes / Tweety Bird).
Tag text overrides guesses from cover shots for brand, size, material, country, style number, and gender.
If an official Looney Tunes label/tag is visible, brand and licensedProperty must be "Looney Tunes".
Return Unknown only when truly not visible. Keep rationales under 12 words.`

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

const COPY_SYSTEM = `You are ListWise Copy — Stage 2 eBay listing writer.
You receive VERIFIED structured facts from Stage 1. Do NOT ask for photos. Do not invent attributes.
Write a strong natural eBay title targeting 75–80 characters (no keyword stuffing, no ALL CAPS).
Title order: Brand/franchise → character/graphic → gender → pattern or color → item type → size.
Keep materials like "100% Cotton" in the description, not the title (unless rare material: cashmere/leather/silk/wool).
Description: short paragraphs + bullets; mention flaws only if verified; plain text only.
Rationales: one short phrase each.`

const COMPS_SYSTEM = `You are ListWise Pricing. Estimate USD sold-comp pricing from the structured facts.
Be conservative. One-sentence rationale. No essays.`

async function detectSingleImage(
  openai: OpenAIClient,
  image: VisionImage,
  photoNumber: number,
  totalImages: number,
  identityModelId: string,
  sellerNotes?: string
): Promise<{ detection: ImageDetection; usage: TokenUsage }> {
  const content: ContentPart[] = [
    {
      type: "text",
      text: `Analyze photo ${photoNumber} of ${totalImages} individually.
Classify photoKind (garment/tag/label/graphic/detail/other).
Return brand, licensedProperty, character, theme, features, itemType, category, size, color, material, style, styleNumber, countryOfOrigin, pattern, gender, condition, and flaws.
Prioritize readable tags for brand/size/material/country/style number/gender.
Detect characters, franchises, logos, embroidery, and patches when visible.
For flaws: use "None visible" unless a defect is clearly and strongly evidenced in this photo. Do not invent wrinkles or fading.${sellerContextBlock(sellerNotes)}`,
    },
    {
      type: "image",
      image: image.data,
      mediaType: image.mediaType,
    },
  ]

  const result = await generateObject({
    model: chatModel(openai, identityModelId),
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
  identityModelId: string,
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
Return one analysis object per photo in the same order.
For every image: photoKind, brand, licensedProperty, character, theme, features, itemType, category, size, color, material, style, styleNumber, countryOfOrigin, pattern, gender, condition, and flaws.
Read tags carefully; detect characters/franchises/logos/embroidery/patches.
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
      model: chatModel(openai, identityModelId),
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
          identityModelId,
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

function colorDetailScore(value: string): number {
  const v = value.trim()
  let score = 0
  if (v.includes("/")) score += 2
  if (/\s/.test(v)) score += 1
  if (colorIsGrayFamily(v) && !colorIsBlackFamily(v)) score += 1
  return score
}

function pickBestColor(
  fields: Array<{ value: string; confidence: number; rationale: string }>
): FieldConfidence {
  const known = fields.filter(
    (f) => f.value?.trim() && f.value.trim().toLowerCase() !== "unknown"
  )
  if (known.length === 0) {
    const ranked = [...fields].sort((a, b) => b.confidence - a.confidence)
    const best = ranked[0] || {
      value: "Unknown",
      confidence: 0,
      rationale: "No color detections",
    }
    return {
      value: best.value,
      confidence: best.confidence,
      rationale: best.rationale,
    }
  }

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

  const ranked = [...known].sort((a, b) => b.confidence - a.confidence)
  const chosen = ranked[0]
  const agreements = known.filter(
    (f) => f.value.toLowerCase() === chosen.value.toLowerCase()
  ).length
  return {
    value: chosen.value,
    confidence: Number(
      Math.min(
        1,
        chosen.confidence + (agreements > 1 ? 0.05 * (agreements - 1) : 0)
      ).toFixed(3)
    ),
    rationale: chosen.rationale,
  }
}

function mergeDetections(detections: ImageDetection[]): {
  fields: IdentityFields
  perImage: GeneratedListingOutput["perImage"]
} {
  const { fields, perImage } = mergeClothingDetections(detections)

  // Color: keep specialized black/gray merge.
  const colorVotes = detections.map((d) => d.color)
  fields.color = pickBestColor(colorVotes)

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

  const licensed = applyLicensedBrandFallback(fields)
  Object.assign(fields, licensed)

  return {
    fields,
    perImage: perImage.map((p) => ({
      index: p.index,
      summary: p.summary,
      flaws: sanitizeDetectedFlaws(
        detections[p.index]?.flaws.value || p.flaws,
        detections[p.index]?.flaws.confidence ?? 0
      ),
    })),
  }
}

function toIdentitySecondPass(
  result: IdentitySecondPassResult
): IdentitySecondPass {
  return {
    brand: result.brand,
    licensedProperty: result.licensedProperty,
    character: result.character,
    theme: result.theme,
    features: result.features,
    itemType: result.itemType,
    size: result.size,
    gender: result.gender,
    material: result.material,
    styleNumber: result.styleNumber,
    countryOfOrigin: result.countryOfOrigin,
    pattern: result.pattern,
    logoAndGraphicSummary: result.logoAndGraphicSummary,
    tagTextSummary: result.tagTextSummary,
  }
}

/**
 * Second pass: inspect logos, characters, embroidery, labels, and tag text
 * across ALL photos together when first-pass identity confidence is low.
 */
async function recognizeIdentitySecondPass(
  openai: OpenAIClient,
  images: VisionImage[],
  firstPass: IdentityFields,
  identityModelId: string,
  sellerNotes?: string
): Promise<{ identity: IdentitySecondPass; usage: TokenUsage }> {
  const content: ContentPart[] = [
    {
      type: "text",
      text: `SECOND PASS — identity only. Inspect EVERY photo together for:
- Licensed franchises / brands on tags and marks
- Characters (embroidery, prints, patches)
- Logos, graphic details, text on garment
- Full tag OCR: brand, size, material, country, style number, gender

First-pass garment summary (may be incomplete — correct and enrich):
${JSON.stringify(
  {
    brand: firstPass.brand,
    licensedProperty: firstPass.licensedProperty,
    character: firstPass.character,
    theme: firstPass.theme,
    features: firstPass.features,
    itemType: firstPass.itemType,
    size: firstPass.size,
    pattern: firstPass.pattern,
  },
  null,
  2
)}

Merge evidence across all ${images.length} photos. Tag photos override cover guesses.
Never leave brand Unknown when a licensed label is readable.
Example: Looney Tunes tag + Tweety embroidery → brand/licensedProperty Looney Tunes, character Tweety Bird, theme "Cartoon, Looney Tunes".${sellerContextBlock(sellerNotes)}`,
    },
  ]
  for (const image of images) {
    content.push({
      type: "image",
      image: image.data,
      mediaType: image.mediaType,
    })
  }

  const result = await generateObject({
    model: chatModel(openai, identityModelId),
    schema: identitySecondPassSchema,
    system: IDENTITY_SECOND_PASS_SYSTEM,
    messages: [{ role: "user", content }],
  })

  return {
    identity: toIdentitySecondPass(result.object),
    usage: usageFromResult(result),
  }
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


/**
 * Stage 1 — one combined OpenAI vision call across all photos.
 * Tag/label evidence outweighs front/back overview shots.
 */
async function identifyProductCombined(
  openai: OpenAIClient,
  images: VisionImage[],
  identityModelId: string,
  sellerNotes?: string
): Promise<{ identity: ProductIdentity; usage: TokenUsage }> {
  const content: ContentPart[] = [
    {
      type: "text",
      text: `Identify this clothing item from ALL ${images.length} photos together.
Photos are numbered 1..${images.length} in order.
Prioritize tag/label photos for brand, size, material, gender, style number.
Return strict JSON only. Never invent brand/gender/size/material/style.
Keep each rationale under 12 words.${sellerContextBlock(sellerNotes)}`,
    },
  ]
  for (const [i, image] of images.entries()) {
    content.push({
      type: "text",
      text: `Photo ${image.index ?? i + 1}:`,
    })
    content.push({
      type: "image",
      image: image.data,
      mediaType: image.mediaType,
    })
  }

  const result = await generateObject({
    model: chatModel(openai, identityModelId),
    schema: productIdentitySchema,
    system: IDENTITY_COMBINED_SYSTEM,
    messages: [{ role: "user", content }],
  })
  return { identity: result.object, usage: usageFromResult(result) }
}

function identityFieldsFromCombined(identity: ProductIdentity): IdentityFields {
  const base: IdentityFields = {
    brand: identity.brand,
    licensedProperty: identity.licensedProperty,
    character: identity.character,
    theme: identity.theme,
    features: identity.features,
    itemType: identity.itemType,
    category: identity.category,
    size: identity.size,
    color: identity.color,
    material: identity.material,
    style: identity.style,
    pattern: identity.pattern,
    gender: identity.gender,
    condition: identity.condition,
    flaws: identity.flaws,
    styleNumber: identity.styleNumber,
    countryOfOrigin: identity.countryOfOrigin,
  }
  return {
    ...base,
    ...applyLicensedBrandFallback(base),
  }
}

async function generateCopy(
  openai: OpenAIClient,
  fields: Record<string, FieldConfidence>,
  totalImages: number,
  sellerNotes: string | undefined,
  copyModelId: string
): Promise<{ copy: ListingCopy; usage: TokenUsage }> {
  const searchColor = titleSearchColor(fields.color?.value)
  const content: ContentPart[] = [
    {
      type: "text",
      text: `Create an eBay SEO title, eBay-ready description, keywords, and eBay category suggestion for this clothing item.

Title must follow this apparel priority (omit unknowns; target near 80 chars):
Brand/franchise → character/collection/graphic → gender/department → pattern (when searchable, e.g. Gingham) or normalized color → item type/style → size.
Prefer character + franchise keywords over generic garment words.
Example: Vintage Looney Tunes Tweety Bird Women's Gingham Sleeveless Button Shirt 22W
Example: WWE WrestleMania Legends Men's XL Gray Graphic T-Shirt Wrestling Tee

Title color to use (normalized for search only): ${searchColor || "omit if unknown or when pattern (e.g. gingham) is the stronger search term"}
Do not use shade compounds like "Dark Gray/Charcoal" in the title when a normalized color is provided.
Do not put material percentages such as "100% Cotton" in the title — keep those in description and item specifics only.

Verified attributes (with confidence) — include character, theme, features, and itemType when present.
Keep accent details (stitching, trim) in description/pattern/style, not in Color.
${JSON.stringify(fields, null, 2)}
Photos analyzed in Stage 1: ${totalImages}. Use facts only — no images.${sellerContextBlock(sellerNotes)}`,
    },
  ]

  const result = await generateObject({
    model: chatModel(openai, copyModelId),
    schema: listingCopySchema,
    system: COPY_SYSTEM,
    messages: [{ role: "user", content }],
  })
  const copy = result.object
  copy.title.value = sanitizeApparelTitle(copy.title.value)
  // Prefer filling toward 80 chars with real attributes when the model undershot.
  {
    const extras: Record<string, string> = {}
    if (isKnownValue(fields.character?.value)) {
      extras.Character = fields.character!.value
    }
    if (isKnownValue(fields.theme?.value)) {
      extras.Theme = fields.theme!.value
    }
    if (isKnownValue(fields.features?.value)) {
      extras.Features = fields.features!.value
    }
    if (isKnownValue(fields.itemType?.value)) {
      extras.Type = fields.itemType!.value
    }
    const draftListing = {
      id: "draft",
      userId: "",
      title: copy.title.value,
      description: copy.description.value,
      price: 0,
      currency: "USD",
      keywords: copy.keywords.value,
      specifics: {
        brand: fields.brand?.value,
        size: fields.size?.value,
        color: fields.color?.value,
        material: fields.material?.value,
        style: fields.style?.value || fields.itemType?.value,
        pattern: fields.pattern?.value,
        gender: fields.gender?.value,
        category: copy.category.value,
        extras,
      },
      fieldConfidence: {
        character: fields.character,
        theme: fields.theme,
        features: fields.features,
        itemType: fields.itemType,
      },
      images: [],
      status: "draft" as const,
      marketplaceListings: [],
      targetMarketplaces: [],
      aiGenerated: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } satisfies Listing
    const enriched = enrichEbayTitleTowardLimit(copy.title.value, draftListing)
    if (enriched.length > copy.title.value.length) {
      copy.title.value = enriched
    }
  }
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
  fields: Record<string, FieldConfidence>,
  copyModelId?: string
): Promise<{ comps: CompsEstimate; usage: TokenUsage }> {
  const result = await generateObject({
    model: chatModel(openai, copyModelId),
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
 * Production listing engine — two-stage hybrid by default:
 * Stage 1: stronger vision model, all photos in one JSON identity call.
 * Stage 2: gpt-4.1-mini copy + comps from structured facts (no re-vision).
 */
export async function generateListingFromImages(
  images: VisionImage[],
  options?: {
    compsProvider?: CompsProvider
    sellerNotes?: string
    pipelineMode?: ListingPipelineMode
    /** Called as soon as Stage 1 yields itemType/department — for early eBay metadata. */
    onIdentityReady?: (fields: IdentityFields) => Promise<void> | void
  }
): Promise<{
  draft: GeneratedListingOutput
  model: string
  identityModel: string
  copyModel: string
  pipelineMode: ListingPipelineMode
  usage: TokenUsage
  imagesAnalyzed: number
  imagesFailed: FailedVisionImage[]
  warnings: string[]
  partial: boolean
  timings: AnalysisTimings
}> {
  if (images.length === 0) {
    throw new ListingEngineError("At least one image is required.", 400)
  }

  const totalStarted = Date.now()
  const openai = getOpenAI()
  const pipelineMode = options?.pipelineMode || "hybrid"
  const models = modelsForPipeline(pipelineMode)
  const sellerNotes = options?.sellerNotes?.trim() || undefined
  let usage = emptyTokenUsage()
  const warnings: string[] = []
  const imagesFailed: FailedVisionImage[] = []

  // --- Stage 1: combined product identity ---
  const identityStarted = Date.now()
  let fields: IdentityFields
  let perImage: GeneratedListingOutput["perImage"] = []
  let detectionsCount = images.length

  try {
    const combined = await identifyProductCombined(
      openai,
      images,
      models.identityModel,
      sellerNotes
    )
    usage = addTokenUsage(usage, combined.usage)
    fields = identityFieldsFromCombined(combined.identity)
    perImage = (combined.identity.photos || []).map((p) => ({
      index: p.index,
      summary: p.summary,
      flaws: fields.flaws.value,
    }))
    if (perImage.length === 0) {
      perImage = images.map((img, i) => ({
        index: img.index ?? i + 1,
        summary: "Analyzed in combined identity pass",
        flaws: fields.flaws.value,
      }))
    }
  } catch (combinedError) {
    const message =
      combinedError instanceof Error
        ? combinedError.message
        : "Combined identity failed"
    console.warn("[listing engine] combined identity failed — batch fallback", {
      message,
    })
    warnings.push("Combined identity fell back to batched vision.")

    const batches: VisionImage[][] = []
    for (let i = 0; i < images.length; i += VISION_BATCH_SIZE) {
      batches.push(images.slice(i, i + VISION_BATCH_SIZE))
    }
    const detections: ImageDetection[] = []
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
            models.identityModel,
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
      throw new ListingEngineError(
        `Could not analyze any photos.${message ? ` (${message})` : ""}`,
        502
      )
    }
    const merged = mergeDetections(detections)
    fields = merged.fields
    perImage = merged.perImage
    detectionsCount = detections.length

    if (needsIdentitySecondPass(fields, detections)) {
      try {
        const second = await recognizeIdentitySecondPass(
          openai,
          images,
          fields,
          models.identityModel,
          sellerNotes
        )
        usage = addTokenUsage(usage, second.usage)
        fields = mergeIdentitySecondPass(fields, second.identity)
      } catch {
        /* non-fatal */
      }
    }
  }

  const identityMs = Date.now() - identityStarted

  // Color split + style fallback
  const colorSplit = applyPrimaryColorSplit({
    color: fields.color,
    pattern: fields.pattern,
    style: fields.style,
    description: "",
  })
  fields = {
    ...fields,
    color: colorSplit.color || fields.color,
    pattern: colorSplit.pattern || fields.pattern,
    style: colorSplit.style || fields.style,
  }
  const accentDetailNote = colorSplit.description.trim()

  if (
    isUnknownValue(fields.style.value) &&
    isKnownValue(fields.itemType.value)
  ) {
    fields.style = {
      ...fields.itemType,
      rationale: `Item type used as style: ${fields.itemType.rationale || ""}`.trim(),
    }
  }

  // Early eBay metadata — do not wait for description.
  const ebayStarted = Date.now()
  let ebayMetadataMs = 0
  const ebayPrefetch = Promise.resolve()
    .then(async () => {
      if (options?.onIdentityReady) {
        await options.onIdentityReady(fields)
      }
    })
    .catch((err) => {
      console.warn("[listing engine] early ebay prefetch failed", err)
    })

  // --- Stage 2: copy + comps from facts only (parallel) ---
  const listingStarted = Date.now()
  const extras = identityExtrasFromFields(fields)
  const identityConfidence = identityFieldConfidence(fields)

  const fieldPayload: Record<string, FieldConfidence> = {
    brand: fields.brand,
    category: fields.category,
    size: fields.size,
    color: fields.color,
    material: fields.material,
    style: fields.style,
    pattern: fields.pattern,
    gender: fields.gender,
    condition: fields.condition,
    flaws: fields.flaws,
    character: fields.character,
    theme: fields.theme,
    features: fields.features,
    itemType: fields.itemType,
    licensedProperty: fields.licensedProperty,
  }

  const compsProvider =
    options?.compsProvider ??
    ({
      async estimate(f) {
        const { comps, usage: u } = await estimateSoldComps(
          openai,
          f,
          models.copyModel
        )
        return {
          ...comps,
          currency: "USD" as const,
          method: "ai_market_comps" as const,
          usage: u,
        }
      },
    } satisfies CompsProvider)

  const [copyResult, comps] = await Promise.all([
    generateCopy(
      openai,
      fieldPayload,
      detectionsCount,
      sellerNotes,
      models.copyModel
    ),
    compsProvider.estimate(fieldPayload),
    ebayPrefetch,
  ])
  ebayMetadataMs = Date.now() - ebayStarted
  const listingMs = Date.now() - listingStarted

  usage = addTokenUsage(usage, copyResult.usage)
  usage = addTokenUsage(usage, comps.usage)
  const copy = copyResult.copy

  if (
    accentDetailNote &&
    !copy.description.value
      .toLowerCase()
      .includes(accentDetailNote.replace(/^details:\s*/i, "").toLowerCase())
  ) {
    copy.description.value =
      `${copy.description.value.trim()}\n\n${accentDetailNote}`.trim()
  }

  const identityBits = [
    isKnownValue(fields.character.value)
      ? `Character: ${fields.character.value}`
      : "",
    isKnownValue(fields.licensedProperty.value)
      ? `Licensed property: ${fields.licensedProperty.value}`
      : "",
    isKnownValue(fields.features.value)
      ? `Features: ${fields.features.value}`
      : "",
  ].filter(Boolean)
  for (const bit of identityBits) {
    const needle = bit.split(":")[1]?.trim().toLowerCase()
    if (needle && !copy.description.value.toLowerCase().includes(needle)) {
      copy.description.value = `${copy.description.value.trim()}\n\n${bit}`.trim()
    }
  }

  const fieldConfidence: GeneratedListingOutput["fieldConfidence"] = {
    ...identityConfidence,
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
    character: fields.character,
    theme: fields.theme,
    features: fields.features,
    itemType: fields.itemType,
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
      extras,
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

  const timings: AnalysisTimings = {
    identityMs,
    listingMs,
    ebayMetadataMs,
    totalMs: Date.now() - totalStarted,
  }

  console.info("[listing engine] timings", {
    pipelineMode,
    identityModel: models.identityModel,
    copyModel: models.copyModel,
    ...timings,
  })

  return {
    draft,
    model: `${models.identityModel}+${models.copyModel}`,
    identityModel: models.identityModel,
    copyModel: models.copyModel,
    pipelineMode,
    usage,
    imagesAnalyzed: detectionsCount,
    imagesFailed,
    warnings,
    partial: imagesFailed.length > 0,
    timings,
  }
}
