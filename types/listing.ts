import { z } from "zod"

export const conditionSchema = z.enum([
  "New with tags",
  "New without tags",
  "New with defects",
  "Pre-owned - Excellent",
  "Pre-owned - Good",
  "Pre-owned - Fair",
])

export const listingInputSchema = z.object({
  notes: z.string().max(2000).optional().default(""),
  brand: z.string().max(120).optional().default(""),
  categoryHint: z.string().max(120).optional().default(""),
  condition: conditionSchema.optional(),
  size: z.string().max(60).optional().default(""),
  color: z.string().max(60).optional().default(""),
  material: z.string().max(80).optional().default(""),
  cost: z.number().nonnegative().optional(),
  targetMarginPercent: z.number().min(0).max(95).optional().default(55),
  marketplace: z.literal("ebay").default("ebay"),
  imageDataUrls: z.array(z.string()).max(8).optional().default([]),
})

export type ListingInput = z.infer<typeof listingInputSchema>
export type ItemCondition = z.infer<typeof conditionSchema>

export const pricingSchema = z.object({
  suggestedPrice: z.number(),
  lowPrice: z.number(),
  highPrice: z.number(),
  currency: z.string().default("USD"),
  rationale: z.string(),
  estimatedProfit: z.number().nullable().optional(),
})

export const confidenceSchema = z.object({
  overall: z.number().min(0).max(100),
  title: z.number().min(0).max(100),
  description: z.number().min(0).max(100),
  category: z.number().min(0).max(100),
  itemSpecifics: z.number().min(0).max(100),
  pricing: z.number().min(0).max(100),
})

export const warningSchema = z.object({
  field: z.string(),
  severity: z.enum(["info", "warning", "critical"]),
  message: z.string(),
  suggestion: z.string().optional(),
})

export const listingResultSchema = z.object({
  title: z.string().min(1).max(80),
  description: z.string().min(1),
  category: z.object({
    name: z.string(),
    path: z.string(),
    ebayCategoryId: z.string().optional(),
  }),
  itemSpecifics: z.record(z.string(), z.string()),
  keywords: z.array(z.string()).min(1).max(25),
  pricing: pricingSchema,
  confidence: confidenceSchema,
  warnings: z.array(warningSchema),
  detectedAttributes: z
    .object({
      brand: z.string().optional(),
      color: z.string().optional(),
      size: z.string().optional(),
      material: z.string().optional(),
      pattern: z.string().optional(),
      style: z.string().optional(),
      gender: z.string().optional(),
      department: z.string().optional(),
    })
    .optional(),
})

export type ListingResult = z.infer<typeof listingResultSchema>
export type ListingWarning = z.infer<typeof warningSchema>
export type ListingConfidence = z.infer<typeof confidenceSchema>
export type ListingPricing = z.infer<typeof pricingSchema>

export const CONDITIONS = conditionSchema.options
