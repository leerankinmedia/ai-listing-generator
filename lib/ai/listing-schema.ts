import { z } from "zod"

/** Schema passed to the AI SDK for structured generation. */
export const aiListingOutputSchema = z.object({
  title: z
    .string()
    .describe(
      "eBay SEO title, ideally 70-80 characters. Brand + item + key attributes + size/color. No promotional spam.",
    ),
  description: z
    .string()
    .describe(
      "Buyer-ready listing description with short paragraphs. Include condition details, measurements if known, materials, and a clear call to ask questions. Plain text with line breaks (no HTML tags).",
    ),
  category: z.object({
    name: z.string(),
    path: z.string().describe("Full eBay category breadcrumb path"),
    ebayCategoryId: z.string().optional(),
  }),
  itemSpecifics: z
    .record(z.string(), z.string())
    .describe(
      "Complete eBay item specifics as key-value pairs (Brand, Size, Color, Department, Style, Material, Pattern, Sleeve Length, Closure, etc. as applicable).",
    ),
  keywords: z
    .array(z.string())
    .describe("8-20 search keywords and long-tail phrases buyers use on eBay"),
  pricing: z.object({
    suggestedPrice: z.number().describe("Recommended list price in USD"),
    lowPrice: z.number().describe("Competitive floor / quick-sale price"),
    highPrice: z.number().describe("Optimistic ceiling for auction or scarce comps"),
    currency: z.string().default("USD"),
    rationale: z.string().describe("Brief market rationale for the price band"),
  }),
  confidence: z.object({
    overall: z.number().min(0).max(100),
    title: z.number().min(0).max(100),
    description: z.number().min(0).max(100),
    category: z.number().min(0).max(100),
    itemSpecifics: z.number().min(0).max(100),
    pricing: z.number().min(0).max(100),
  }),
  warnings: z.array(
    z.object({
      field: z.string(),
      severity: z.enum(["info", "warning", "critical"]),
      message: z.string(),
      suggestion: z.string().optional(),
    }),
  ),
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

export type AiListingOutput = z.infer<typeof aiListingOutputSchema>
