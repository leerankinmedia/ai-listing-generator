import { z } from "zod"

/** Phase 4 workflow: 1–12 clothing photos per listing */
export const MAX_LISTING_IMAGES = 12
export const MIN_LISTING_IMAGES = 1
/** Analyze every uploaded image; batch for Vision rate/token limits */
export const VISION_BATCH_SIZE = 4
/**
 * Stay under Vercel’s 4.5MB serverless request body limit for each
 * temporary analysis-copy upload. Generate receives only imageUrls JSON.
 * Full-resolution listing originals are stored separately and never sent
 * through the Analyze Photos AI upload path.
 */
export const ANALYZE_UPLOAD_MAX_BYTES = 4 * 1024 * 1024
/** Preferred analysis copy size band (high-quality JPEG ~1600–2000px). */
export const ANALYZE_COPY_TARGET_MAX_BYTES = 1024 * 1024
export const ANALYZE_COPY_TARGET_MIN_BYTES = 500 * 1024

export const conditionEnum = z.enum([
  "New with tags",
  "New without tags",
  "Excellent",
  "Good",
  "Fair",
  "Poor",
])

export const confidentStringSchema = z.object({
  value: z
    .string()
    .describe("Detected value, or Unknown when not observable"),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("Model confidence from 0 to 1"),
  rationale: z
    .string()
    .describe("Short visual evidence only (max ~12 words). No essays."),
})

export const photoKindEnum = z.enum([
  "garment",
  "tag",
  "label",
  "graphic",
  "detail",
  "other",
])

/** Per-image attribute detection */
export const imageDetectionSchema = z.object({
  photoKind: photoKindEnum.describe(
    "What this photo primarily shows: garment overview, care/brand tag, sewn-in label, close-up of graphic/embroidery/logo/character, construction detail, or other"
  ),
  brand: confidentStringSchema.describe(
    "Apparel brand OR licensed property printed on a tag/label (e.g. Looney Tunes, Disney, Nike). Never leave Unknown when a licensed label or franchise mark is readable."
  ),
  licensedProperty: confidentStringSchema.describe(
    "Licensed franchise/IP when visible (e.g. Looney Tunes, Disney, Marvel). Unknown if none."
  ),
  character: confidentStringSchema.describe(
    "Named character when visibly depicted or labeled (e.g. Tweety Bird, Mickey Mouse). Unknown if none."
  ),
  theme: confidentStringSchema.describe(
    "Theme for item specifics, e.g. Cartoon, Looney Tunes or Sports. Unknown if none."
  ),
  features: confidentStringSchema.describe(
    "Comma-separated visible features: embroidered chest graphic, chest pocket, collared, sleeveless, button-front, patches, etc."
  ),
  itemType: confidentStringSchema.describe(
    "Specific garment type, e.g. Women's sleeveless button-front shirt/blouse — not a vague top"
  ),
  category: confidentStringSchema.describe(
    "Marketplace category path, e.g. Women > Clothing > Tops > Blouses"
  ),
  size: confidentStringSchema.describe(
    "Size from tag when visible (e.g. 22W, XL). Tag OCR overrides guesses."
  ),
  color: confidentStringSchema,
  material: confidentStringSchema.describe(
    "Fabric from care tag when readable (e.g. 100% Cotton)"
  ),
  style: confidentStringSchema,
  styleNumber: confidentStringSchema.describe(
    "Style/RN/SKU number from tag when readable, else Unknown"
  ),
  countryOfOrigin: confidentStringSchema.describe(
    "Country of origin from tag when readable, else Unknown"
  ),
  pattern: confidentStringSchema.describe(
    "Pattern such as solid, striped, floral, gingham/check, logo, colorblock"
  ),
  gender: confidentStringSchema.describe(
    "Men, Women, Unisex, Boys, Girls, or Unknown — prefer tag gender when present"
  ),
  condition: z.object({
    value: conditionEnum,
    confidence: z.number().min(0).max(1),
    rationale: z.string(),
  }),
  flaws: confidentStringSchema.describe(
    "Only strongly evidenced visible defects (stains, holes, tears, missing parts). Use None visible when unsure. Never invent wrinkles, fading, or wear."
  ),
  imageSummary: z
    .string()
    .describe("One-sentence description of what this photo shows"),
})

/** Second-pass: logos, characters, embroidery, labels, and readable tag text across all photos */
export const identitySecondPassSchema = z.object({
  brand: confidentStringSchema.describe(
    "Brand or licensed property from tags/labels/marks. Use Looney Tunes when that label is visible."
  ),
  licensedProperty: confidentStringSchema,
  character: confidentStringSchema.describe(
    "Named character from embroidery, print, or label (e.g. Tweety Bird)"
  ),
  theme: confidentStringSchema.describe(
    "e.g. Cartoon, Looney Tunes"
  ),
  features: confidentStringSchema,
  itemType: confidentStringSchema,
  size: confidentStringSchema,
  gender: confidentStringSchema,
  material: confidentStringSchema,
  styleNumber: confidentStringSchema,
  countryOfOrigin: confidentStringSchema,
  pattern: confidentStringSchema,
  logoAndGraphicSummary: z
    .string()
    .describe("What logos, characters, embroidery, patches, or graphics are visible across the photos"),
  tagTextSummary: z
    .string()
    .describe("All readable tag/label text combined (brand, size, material, country, style #, gender)"),
})

/** Batch response: one detection object per photo, in order */
export const imageBatchDetectionSchema = z.object({
  images: z
    .array(imageDetectionSchema)
    .describe("One analysis object per photo, same order as uploaded"),
})

export const listingCopySchema = z.object({
  title: z.object({
    value: z
      .string()
      .describe(
        "eBay apparel SEO title under 80 chars in this order: Brand/franchise, collection/event/character/team/graphic, gender, size, normalized color, item type/style, strong search keyword. No material percentages (e.g. 100% Cotton). No ALL CAPS spam."
      ),
    confidence: z.number().min(0).max(1),
    rationale: z.string(),
  }),
  description: z.object({
    value: z
      .string()
      .describe(
        "eBay-ready HTML-free description with short paragraphs and bullet details for features, materials (including 100% Cotton when known), measurements if known, and condition. Mention flaws only when verified; put them under a final Condition notes section. Never invent wrinkles, fading, stains, or damage."
      ),
    confidence: z.number().min(0).max(1),
    rationale: z.string(),
  }),
  keywords: z.object({
    value: z.array(z.string()).min(5).max(24),
    confidence: z.number().min(0).max(1),
    rationale: z.string(),
  }),
  category: confidentStringSchema.describe(
    "eBay-style category path, e.g. Clothing, Shoes & Accessories > Men > Men's Clothing > Jeans"
  ),
})

export const compsEstimateSchema = z.object({
  suggestedPrice: z
    .number()
    .describe("Recommended list price in USD based on recent sold comps"),
  lowPrice: z.number().describe("Low end of sold comp range USD"),
  highPrice: z.number().describe("High end of sold comp range USD"),
  confidence: z.number().min(0).max(1),
  rationale: z
    .string()
    .describe("One short sentence on comps fit"),
  comparableSummary: z
    .string()
    .describe(
      "Brief sold comps summary (brands, conditions, price bands)"
    ),
  sampleSize: z
    .number()
    .int()
    .min(1)
    .describe("Approximate number of sold comps considered in the estimate"),
})

/**
 * Stage 1 — combined product identity across ALL photos in one response.
 * Prefer tag/label evidence; never invent brand/gender/size/material/style.
 */
export const productIdentitySchema = z.object({
  brand: confidentStringSchema.describe(
    "Brand or licensed property from tags/logos only. Unknown if not visible — never invent."
  ),
  licensedProperty: confidentStringSchema.describe(
    "Franchise/IP when visible (Looney Tunes, Disney…). Unknown if none."
  ),
  character: confidentStringSchema.describe(
    "Named character when visibly depicted/labeled. Unknown if none."
  ),
  theme: confidentStringSchema.describe(
    "Theme e.g. Cartoon, Looney Tunes. Unknown if none."
  ),
  features: confidentStringSchema.describe(
    "Comma-separated visible features only"
  ),
  itemType: confidentStringSchema.describe(
    "Specific garment type e.g. Women's sleeveless button shirt — not vague top"
  ),
  category: confidentStringSchema.describe(
    "Likely eBay path e.g. Women > Clothing > Tops > Blouses"
  ),
  size: confidentStringSchema.describe(
    "Size from tag OCR when readable. Unknown if not on a tag."
  ),
  color: confidentStringSchema.describe(
    "Single primary color only (White, Black, Gray, Blue…)"
  ),
  material: confidentStringSchema.describe(
    "Fabric from care tag when readable. Unknown if not visible."
  ),
  style: confidentStringSchema.describe(
    "Style words from evidence only. Unknown if unsure."
  ),
  styleNumber: confidentStringSchema.describe(
    "Style/RN from tag when readable, else Unknown"
  ),
  countryOfOrigin: confidentStringSchema.describe(
    "Country from tag when readable, else Unknown"
  ),
  pattern: confidentStringSchema,
  gender: confidentStringSchema.describe(
    "Men, Women, Unisex, Boys, Girls, or Unknown — prefer tag"
  ),
  condition: z.object({
    value: conditionEnum,
    confidence: z.number().min(0).max(1),
    rationale: z.string().describe("Short visual evidence only"),
  }),
  flaws: confidentStringSchema.describe(
    "Only clear defects. Use None visible when unsure. Never invent wear."
  ),
  tagEvidence: z
    .string()
    .describe("Readable tag/label text combined (short)"),
  logoEvidence: z
    .string()
    .describe("Logos/characters/graphics summary (short)"),
  photos: z
    .array(
      z.object({
        index: z.number().int().min(1),
        photoKind: photoKindEnum,
        summary: z.string().describe("One short sentence"),
      })
    )
    .describe("One entry per photo, same order as input"),
})

export type ImageDetection = z.infer<typeof imageDetectionSchema>
export type IdentitySecondPassResult = z.infer<typeof identitySecondPassSchema>
export type ProductIdentity = z.infer<typeof productIdentitySchema>
export type ListingCopy = z.infer<typeof listingCopySchema>
export type CompsEstimate = z.infer<typeof compsEstimateSchema>

export type GeneratedListingOutput = {
  title: string
  description: string
  price: number
  currency: "USD"
  keywords: string[]
  specifics: {
    brand: string
    size: string
    color: string
    material: string
    style: string
    pattern: string
    gender: string
    condition: string
    category: string
    flaws: string
    extras?: Record<string, string>
  }
  fieldConfidence: Record<
    string,
    { value: string; confidence: number; rationale?: string }
  >
  comps: {
    suggestedPrice: number
    lowPrice: number
    highPrice: number
    currency: "USD"
    confidence: number
    method: "ai_market_comps"
    rationale: string
    comparableSummary: string
    sampleSize: number
  }
  perImage: Array<{
    index: number
    summary: string
    flaws: string
  }>
}
