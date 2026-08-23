import { generateObject } from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import {
  compsEstimateSchema,
  imageBatchDetectionSchema,
  identitySecondPassSchema,
  listingCopySchema,
  VISION_BATCH_SIZE,
  type CompsEstimate,
  type GeneratedListingOutput,
  type ImageDetection,
  type IdentitySecondPassResult,
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
import { createStageTimer, type StageTimings } from "@/lib/observability/stage-timer"
import type { FieldConfidence, Listing } from "@/lib/types"

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
Analyze ONLY what is visible in the provided clothing photo(s). Use ALL visual evidence: garment body, tags, labels, embroidery, patches, logos, and graphics.

Identity rules (critical):
- Detect licensed characters, franchises, logos, embroidery, patches, and graphic details.
  Examples: Looney Tunes + Tweety Bird embroidery; Disney + Mickey; sports team logos.
- photoKind must reflect the photo: garment | tag | label | graphic | detail | other.
- Read EVERY visible tag/label with OCR-level care for brand, size, material, country, style number, gender, waist, inseam, care, model, product line, and identifiers.
- Clothing construction: when visible, fill fit, rise, closure, pocket type, fabric wash, fabric type, size type, and accents. Use Unknown when not clearly evidenced.
- Never invent brands, sizes, labels, MPNs, UPCs, models, or product lines you cannot see.
- MPN: only if the tag is labeled MPN / Manufacturer Part Number. Never copy a style number into MPN. Otherwise Unknown.
- UPC: only if a barcode/UPC is readable. Otherwise Unknown.
- Season: Unknown unless labeled. Do not default to All Seasons.
- Never leave brand as Unknown when a licensed property or recognizable brand label is visible.
- When a tag says Looney Tunes (or shows an official Looney Tunes label), brand AND licensedProperty = "Looney Tunes".
- When Tweety (or Tweety Bird) is embroidered/printed/labeled, character = "Tweety Bird".
- Theme example when cartoon IP is present: "Cartoon, Looney Tunes".
- itemType must be specific (e.g. Women's sleeveless button-front shirt/blouse), not a vague "top".
- features: list visible construction/graphic details (embroidered chest graphic, chest pocket, collared, sleeveless, button-front…).
- Never invent brands, sizes, or labels you cannot see or reasonably infer from marks.
- Never leave brand as Unknown when a licensed property or recognizable brand label is visible.
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
  For black-and-white gingham/check, Color may be Black or White (pick dominant) and pattern = gingham/check.
  Do not default to Black when the garment looks charcoal, slate, or dark gray — especially in
  uneven lighting. Reserve Black for clearly jet-black fabric with no gray/charcoal evidence.
- Seller context (when provided) is HIGH PRIORITY guidance for ambiguous attributes
  (women's/men's, size, brand, flaws, item type). Use it to fill gaps and disambiguate.
  NEVER overwrite attributes that are clearly contradicted by strong, visible photo evidence.`

const IDENTITY_SECOND_PASS_SYSTEM = `You are ListWise Identity Vision — a second-pass specialist.
Your ONLY job is to inspect logos, characters, embroidery, patches, graphics, brand marks, and every readable tag/label across ALL photos together.
Do not treat the item as a generic garment. Name franchises and characters when visually clear (e.g. Looney Tunes / Tweety Bird).
Tag text overrides guesses from cover shots for brand, size, material, country, style number, waist, inseam, care, gender, model, product line, MPN, and UPC.
MPN/UPC must stay Unknown unless the tag/barcode actually shows them. Never invent identifiers.
If an official Looney Tunes label/tag is visible, brand and licensedProperty must be "Looney Tunes".
Return Unknown only when truly not visible.`

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
1. Brand / franchise (e.g. Looney Tunes)
2. Character, collection, event, team, or graphic keywords (e.g. Tweety Bird)
3. Gender / department (e.g. Women's, Men's)
4. Pattern when searchable (e.g. Gingham) OR normalized color
5. Exact item type / style words (e.g. Sleeveless Button Shirt)
6. Size (e.g. 22W)
7. Optional: Vintage when clearly vintage, or one strong material search term (cashmere, leather, silk, wool)
- Target near 80 characters when attributes support it — do not leave valuable title space unused
- Do not add filler words, keyword stuffing, or ALL CAPS
- Do NOT put commodity fabric callouts like "100% Cotton" or "Cotton Blend" in the title
  unless the material itself is a rare major selling feature (cashmere, leather, silk, wool coat)
- Color accents (stitching, trim, logos) belong in description bullets — not the Color specific
Example titles:
Vintage Looney Tunes Tweety Bird Women's Gingham Sleeveless Button Shirt 22W
WWE WrestleMania Legends Men's XL Gray Graphic T-Shirt Wrestling Tee

Description rules:
- Clear paragraphs + bullet details
- Call out character, franchise, embroidery/graphics, pattern, and construction features
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
Classify photoKind (garment/tag/label/graphic/detail/other).
Return brand, licensedProperty, character, theme, features, itemType, category, size, color, material, style, styleNumber, countryOfOrigin, waistSize, inseam, fit, rise, closure, fabricWash, pocketType, fabricType, garmentCare, sizeType, season, accents, model, productLine, mpn, upc, pattern, gender, condition, and flaws.
Prioritize readable tags for brand/size/material/country/style number/waist/inseam/care/gender.
MPN and UPC stay Unknown unless the tag/barcode is explicitly labeled and readable — never invent identifiers.
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
Return one analysis object per photo in the same order.
For every image: photoKind, brand, licensedProperty, character, theme, features, itemType, category, size, color, material, style, styleNumber, countryOfOrigin, waistSize, inseam, fit, rise, closure, fabricWash, pocketType, fabricType, garmentCare, sizeType, season, accents, model, productLine, mpn, upc, pattern, gender, condition, and flaws.
Read tags carefully; detect characters/franchises/logos/embroidery/patches.
MPN/UPC stay Unknown unless explicitly labeled and readable — never invent.
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
  const unk = {
    value: "Unknown",
    confidence: 0,
    rationale: "Not returned",
  }
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
    waistSize: result.waistSize || unk,
    inseam: result.inseam || unk,
    fit: result.fit || unk,
    rise: result.rise || unk,
    closure: result.closure || unk,
    fabricWash: result.fabricWash || unk,
    pocketType: result.pocketType || unk,
    fabricType: result.fabricType || unk,
    garmentCare: result.garmentCare || unk,
    sizeType: result.sizeType || unk,
    season: result.season || unk,
    accents: result.accents || unk,
    model: result.model || unk,
    productLine: result.productLine || unk,
    mpn: result.mpn || unk,
    upc: result.upc || unk,
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
  sellerNotes?: string
): Promise<{ identity: IdentitySecondPass; usage: TokenUsage }> {
  const content: ContentPart[] = [
    {
      type: "text",
      text: `SECOND PASS — identity only. Inspect EVERY photo together for:
- Licensed franchises / brands on tags and marks
- Characters (embroidery, prints, patches)
- Logos, graphic details, text on garment
- Full tag OCR: brand, size, material, country, style number, waist, inseam, care, gender, model, product line
- MPN only if labeled MPN; UPC only if barcode is readable — never invent identifiers
- Construction when visible: fit, rise, closure, pocket type, fabric wash, fabric type, size type, accents

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
    waistSize: firstPass.waistSize,
    fit: firstPass.fit,
    rise: firstPass.rise,
    closure: firstPass.closure,
    mpn: firstPass.mpn,
    upc: firstPass.upc,
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
    model: listingModel(openai),
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
  timings: StageTimings
}> {
  if (images.length === 0) {
    throw new ListingEngineError("At least one image is required.", 400)
  }

  const openai = getOpenAI()
  const model = getListingModel()
  const sellerNotes = options?.sellerNotes?.trim() || undefined
  let usage = emptyTokenUsage()
  const timer = createStageTimer("generate_ai")

  const batches: VisionImage[][] = []
  for (let i = 0; i < images.length; i += VISION_BATCH_SIZE) {
    batches.push(images.slice(i, i + VISION_BATCH_SIZE))
  }

  // Analyze every image in parallel batches (bounded concurrency).
  // If a batch fails (e.g. one corrupt/oversized photo), fall back per-image.
  const detections: ImageDetection[] = []
  const imagesFailed: FailedVisionImage[] = []
  const concurrency = 2
  await timer.stage("openai_vision", async () => {
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
  })

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
  let fields: IdentityFields = {
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
  const visionImages =
    survivingImages.length > 0 ? survivingImages : images

  // Second pass when brand/character identity confidence is low.
  if (needsIdentitySecondPass(fields, detections)) {
    try {
      const second = await timer.stage("identity_second_pass", () =>
        recognizeIdentitySecondPass(
          openai,
          visionImages,
          fields,
          sellerNotes
        )
      )
      usage = addTokenUsage(usage, second.usage)
      fields = mergeIdentitySecondPass(fields, second.identity)
      warnings.push(
        "Identity second pass ran to inspect logos, characters, embroidery, and tags across all photos."
      )
      console.info("[listing engine] identity second pass", {
        brand: fields.brand.value,
        character: fields.character.value,
        licensedProperty: fields.licensedProperty.value,
        logoSummary: second.identity.logoAndGraphicSummary,
        tagSummary: second.identity.tagTextSummary,
      })
    } catch (secondPassError) {
      const message =
        secondPassError instanceof Error
          ? secondPassError.message
          : "Identity second pass failed"
      console.warn("[listing engine] identity second pass failed", { message })
      warnings.push(
        "Identity second pass could not complete; listing uses first-pass garment analysis."
      )
    }
  }

  // Ensure style carries item type when style is vague.
  if (
    isUnknownValue(fields.style.value) &&
    isKnownValue(fields.itemType.value)
  ) {
    fields.style = {
      ...fields.itemType,
      rationale: `Item type used as style: ${fields.itemType.rationale || ""}`.trim(),
    }
  }

  const extras = identityExtrasFromFields(fields)
  const identityConfidence = identityFieldConfidence(fields)

  const [copyResult, comps] = await timer.stage("copy_and_comps", () =>
    Promise.all([
    generateCopy(
      openai,
      {
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
        waistSize: fields.waistSize,
        inseam: fields.inseam,
        fit: fields.fit,
        rise: fields.rise,
        closure: fields.closure,
        fabricWash: fields.fabricWash,
        pocketType: fields.pocketType,
        fabricType: fields.fabricType,
        garmentCare: fields.garmentCare,
        sizeType: fields.sizeType,
        accents: fields.accents,
        model: fields.model,
        productLine: fields.productLine,
      },
      visionImages,
      detections.length,
      sellerNotes
    ),
    (options?.compsProvider ?? createAiCompsProvider(openai)).estimate({
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
      itemType: fields.itemType,
    }),
    ])
  )
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

  // Inject identity bullets when description omitted them.
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
    if (
      needle &&
      !copy.description.value.toLowerCase().includes(needle)
    ) {
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
    licensedProperty: fields.licensedProperty,
    styleNumber: fields.styleNumber,
    countryOfOrigin: fields.countryOfOrigin,
    waistSize: fields.waistSize,
    inseam: fields.inseam,
    fit: fields.fit,
    rise: fields.rise,
    closure: fields.closure,
    fabricWash: fields.fabricWash,
    pocketType: fields.pocketType,
    fabricType: fields.fabricType,
    garmentCare: fields.garmentCare,
    sizeType: fields.sizeType,
    season: fields.season,
    accents: fields.accents,
    model: fields.model,
    productLine: fields.productLine,
    mpn: fields.mpn,
    upc: fields.upc,
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

  return {
    draft,
    model,
    usage,
    imagesAnalyzed: detections.length,
    imagesFailed,
    warnings,
    partial: imagesFailed.length > 0,
    timings: timer.done(),
  }
}
