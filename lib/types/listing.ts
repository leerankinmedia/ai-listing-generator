import { z } from "zod"

export const listingInputSchema = z.object({
  notes: z.string().max(2000).optional(),
  brand: z.string().max(120).optional(),
  categoryHint: z.string().max(200).optional(),
  condition: z
    .enum([
      "new_with_tags",
      "new_without_tags",
      "like_new",
      "good",
      "fair",
      "for_parts",
    ])
    .optional(),
  cost: z.number().nonnegative().optional(),
  targetMarketplace: z.literal("ebay").optional(),
})

export type ListingInput = z.infer<typeof listingInputSchema>

export const pricingSchema = z.object({
  suggestedPrice: z.number().nonnegative(),
  priceLow: z.number().nonnegative(),
  priceHigh: z.number().nonnegative(),
  currency: z.string().describe("ISO currency code, usually USD"),
  rationale: z.string(),
  estimatedDaysToSell: z.number().int().positive().nullable().optional(),
})

export const confidenceSchema = z.object({
  overall: z.number().min(0).max(100),
  title: z.number().min(0).max(100),
  category: z.number().min(0).max(100),
  itemSpecifics: z.number().min(0).max(100),
  pricing: z.number().min(0).max(100),
  description: z.number().min(0).max(100),
})

export const missingInfoSchema = z.object({
  field: z.string(),
  severity: z.enum(["critical", "recommended", "optional"]),
  message: z.string(),
  suggestion: z.string().optional(),
})

export const generatedListingSchema = z.object({
  title: z
    .string()
    .describe("eBay SEO title, ideally 70-80 characters"),
  titleAlternates: z
    .array(z.string())
    .min(1)
    .max(3)
    .describe("2-3 alternate title options"),
  description: z
    .string()
    .describe("Buyer-ready HTML-safe plain text description with line breaks"),
  category: z.object({
    primary: z.string(),
    breadcrumb: z.string(),
    ebayCategoryIdHint: z.string().optional(),
    alternatives: z.array(z.string()).max(3).optional(),
  }),
  condition: z.string(),
  itemSpecifics: z
    .array(
      z.object({
        name: z.string().describe("eBay item specific name, e.g. Brand"),
        value: z.string().describe("Item specific value"),
      })
    )
    .min(3)
    .describe("Complete eBay item specifics as name/value pairs"),
  keywords: z.array(z.string()).min(5).max(25),
  pricing: pricingSchema,
  confidence: confidenceSchema,
  missingInformation: z.array(missingInfoSchema),
  identifiedItem: z.object({
    brand: z.string().optional(),
    productName: z.string().optional(),
    model: z.string().optional(),
    color: z.string().optional(),
    size: z.string().optional(),
    material: z.string().optional(),
    summary: z.string(),
  }),
})

export type GeneratedListing = z.infer<typeof generatedListingSchema>

/** API response shape after refining item specifics into a record. */
export type GenerateListingResponse = {
  listing: Omit<GeneratedListing, "itemSpecifics"> & {
    itemSpecifics: Record<string, string>
  }
  meta: {
    model: string
    titleLength: number
    titleInOptimalRange: boolean
    generatedAt: string
  }
}

export const CONDITION_LABELS: Record<
  NonNullable<ListingInput["condition"]>,
  string
> = {
  new_with_tags: "New with tags",
  new_without_tags: "New without tags",
  like_new: "Like new / Excellent",
  good: "Good",
  fair: "Fair / Acceptable",
  for_parts: "For parts or not working",
}
