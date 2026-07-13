import { z } from "zod"

export const listingConditionSchema = z.enum([
  "New with tags",
  "New without tags",
  "New with defects",
  "Pre-owned - Excellent",
  "Pre-owned - Good",
  "Pre-owned - Fair",
])

export const generatedListingSchema = z.object({
  title: z
    .string()
    .describe(
      "eBay SEO title, ideally 70-80 characters. Brand + item type + key attributes + size. No ALL CAPS spam, no promotional filler.",
    ),
  description: z
    .string()
    .describe(
      "Professional marketplace description with short paragraphs and bullet specifics. Honest condition notes. No hashtag walls.",
    ),
  category: z.object({
    primary: z.string().describe("Primary category name, e.g. Men's Athletic Shoes"),
    path: z.array(z.string()).describe("Category breadcrumb from root to leaf"),
    ebayCategoryHint: z
      .string()
      .describe("Best-guess eBay category path string for seller review"),
  }),
  itemSpecifics: z
    .array(
      z.object({
        name: z.string(),
        value: z.string(),
      }),
    )
    .describe(
      "Complete eBay-style item specifics: Brand, Size, Color, Department, Style, Material, Pattern, Type, Features, etc.",
    ),
  keywords: z
    .array(z.string())
    .describe("8-15 searchable keywords and long-tail phrases buyers would type"),
  condition: listingConditionSchema,
  brand: z.string().nullable(),
  color: z.string().nullable(),
  size: z.string().nullable(),
  material: z.string().nullable(),
  pricing: z.object({
    suggestedPrice: z.number().describe("Recommended list price in USD"),
    priceLow: z.number().describe("Conservative quick-sale price"),
    priceHigh: z.number().describe("Optimistic retail-adjacent price"),
    currency: z.literal("USD"),
    rationale: z.string().describe("1-2 sentence pricing rationale"),
    confidence: z.number().min(0).max(100),
  }),
  confidenceScore: z
    .number()
    .min(0)
    .max(100)
    .describe("Overall confidence that the listing is accurate and sellable"),
  confidenceBreakdown: z.object({
    identification: z.number().min(0).max(100),
    titleSeo: z.number().min(0).max(100),
    specificsCompleteness: z.number().min(0).max(100),
    pricing: z.number().min(0).max(100),
  }),
  missingInformation: z
    .array(
      z.object({
        field: z.string(),
        severity: z.enum(["low", "medium", "high"]),
        message: z.string(),
        suggestion: z.string(),
      }),
    )
    .describe("Warnings for missing or uncertain fields the seller should verify"),
  detectedAttributes: z.object({
    itemType: z.string(),
    style: z.string().nullable(),
    gender: z.string().nullable(),
    season: z.string().nullable(),
    pattern: z.string().nullable(),
  }),
})

export type GeneratedListingSchema = z.infer<typeof generatedListingSchema>
