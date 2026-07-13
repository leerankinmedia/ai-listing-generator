import { z } from "zod"

export const listingSpecificsSchema = z.object({
  brand: z.string().describe("Brand or manufacturer if identifiable, else Unknown"),
  size: z.string().describe("Size label if visible, else Unknown"),
  color: z.string().describe("Primary color(s)"),
  material: z.string().describe("Likely material or fabric"),
  style: z.string().describe("Style or silhouette (e.g. bomber, slim fit, vintage)"),
  condition: z
    .enum([
      "New with tags",
      "New without tags",
      "Excellent",
      "Good",
      "Fair",
      "Poor",
    ])
    .describe("Estimated condition from photos"),
  category: z
    .string()
    .describe("Marketplace-friendly category path, e.g. Men > Outerwear > Jackets"),
})

export const generatedListingSchema = z.object({
  title: z
    .string()
    .describe(
      "SEO-optimized marketplace title under 80 characters including brand, item, key attributes"
    ),
  description: z
    .string()
    .describe(
      "Full multi-paragraph selling description with features, fit, condition notes, and shipping-ready tone"
    ),
  price: z
    .number()
    .describe("Suggested retail resale price in USD as a number"),
  currency: z.literal("USD"),
  keywords: z
    .array(z.string())
    .min(5)
    .max(20)
    .describe("Search keywords and tags for marketplace discovery"),
  specifics: listingSpecificsSchema,
})

export type GeneratedListingOutput = z.infer<typeof generatedListingSchema>

export const MAX_LISTING_IMAGES = 24
export const MAX_VISION_IMAGES = 8
