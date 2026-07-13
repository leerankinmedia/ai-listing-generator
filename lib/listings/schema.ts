import { z } from "zod"

export const MAX_LISTING_IMAGES = 24
/** Analyze every uploaded image; batch for Vision rate/token limits */
export const VISION_BATCH_SIZE = 4

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
    .describe("Brief evidence from the photo(s)"),
})

/** Per-image attribute detection */
export const imageDetectionSchema = z.object({
  brand: confidentStringSchema,
  category: confidentStringSchema.describe(
    "Marketplace category path, e.g. Women > Shoes > Sneakers"
  ),
  size: confidentStringSchema,
  color: confidentStringSchema,
  material: confidentStringSchema,
  style: confidentStringSchema,
  pattern: confidentStringSchema.describe(
    "Pattern such as solid, striped, floral, logo, colorblock"
  ),
  gender: confidentStringSchema.describe(
    "Men, Women, Unisex, Boys, Girls, or Unknown"
  ),
  condition: z.object({
    value: conditionEnum,
    confidence: z.number().min(0).max(1),
    rationale: z.string(),
  }),
  flaws: confidentStringSchema.describe(
    "Visible flaws, wear, stains, repairs — or None visible"
  ),
  imageSummary: z
    .string()
    .describe("One-sentence description of what this photo shows"),
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
      .describe("SEO-optimized title under 80 characters"),
    confidence: z.number().min(0).max(1),
    rationale: z.string(),
  }),
  description: z.object({
    value: z
      .string()
      .describe(
        "Professional multi-paragraph marketplace description including features, fit, condition, and flaws"
      ),
    confidence: z.number().min(0).max(1),
    rationale: z.string(),
  }),
  keywords: z.object({
    value: z.array(z.string()).min(5).max(24),
    confidence: z.number().min(0).max(1),
    rationale: z.string(),
  }),
  category: confidentStringSchema,
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
    .describe("Why this price fits recent sold comparable items"),
  comparableSummary: z
    .string()
    .describe(
      "Summary of the sold comps considered (brands, conditions, price bands)"
    ),
  sampleSize: z
    .number()
    .int()
    .min(1)
    .describe("Approximate number of sold comps considered in the estimate"),
})

export type ImageDetection = z.infer<typeof imageDetectionSchema>
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
