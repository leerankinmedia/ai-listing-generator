import { generateObject } from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import {
  generatedListingSchema,
  MAX_VISION_IMAGES,
  type GeneratedListingOutput,
} from "@/lib/listings/schema"

const SYSTEM_PROMPT = `You are ListWise, an expert multi-marketplace listing copywriter for resale sellers.
Analyze product photos carefully and produce accurate, conversion-focused listing data.
Rules:
- Prefer observable facts from the images over guesses.
- If brand/size/material cannot be determined, use "Unknown" rather than inventing logos.
- Titles must be SEO-friendly, scannable, and under 80 characters.
- Descriptions should be helpful, specific, and ready to paste onto eBay/Poshmark/Mercari-style marketplaces.
- Suggest a realistic USD resale price for the secondary market.
- Keywords should mix brand, category, style, color, and intent terms.`

export function isOpenAIConfigured() {
  return Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== "sk-...")
}

export async function generateListingFromImages(
  images: Array<{ mediaType: string; data: Uint8Array | Buffer | string }>
): Promise<{ draft: GeneratedListingOutput; mode: "openai" | "demo" }> {
  const selected = images.slice(0, MAX_VISION_IMAGES)

  if (!isOpenAIConfigured()) {
    return { draft: buildDemoDraft(selected.length), mode: "demo" }
  }

  const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const content: Array<
    | { type: "text"; text: string }
    | { type: "image"; image: Uint8Array | Buffer | string; mediaType?: string }
  > = [
    {
      type: "text",
      text: `Analyze these ${selected.length} product photo(s) and generate a complete resale listing.`,
    },
  ]

  for (const image of selected) {
    content.push({
      type: "image",
      image: image.data,
      mediaType: image.mediaType,
    })
  }

  const { object } = await generateObject({
    model: openai("gpt-4o"),
    schema: generatedListingSchema,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content }],
  })

  return { draft: object, mode: "openai" }
}

function buildDemoDraft(imageCount: number): GeneratedListingOutput {
  return {
    title: "Vintage Nike Windbreaker Jacket — Teal Colorblock, Size M",
    description: [
      "Clean vintage Nike windbreaker with a bold teal colorblock design.",
      "",
      "Details",
      "• Brand: Nike",
      "• Size: Medium (tagged)",
      "• Color: Teal / navy colorblock",
      "• Material: Lightweight nylon shell",
      "• Style: Classic 90s windbreaker",
      "• Condition: Excellent — no major stains or tears visible in photos",
      "",
      "Great layering piece for streetwear or casual wear. Smoke-free storage.",
      "",
      `Generated from ${imageCount} uploaded photo${imageCount === 1 ? "" : "s"} in ListWise demo mode. Connect OPENAI_API_KEY for live Vision analysis.`,
    ].join("\n"),
    price: 68,
    currency: "USD",
    keywords: [
      "nike",
      "windbreaker",
      "vintage",
      "colorblock",
      "teal",
      "jacket",
      "streetwear",
      "90s",
      "mens",
      "outerwear",
    ],
    specifics: {
      brand: "Nike",
      size: "M",
      color: "Teal / Navy",
      material: "Nylon",
      style: "Windbreaker",
      condition: "Excellent",
      category: "Men > Outerwear > Jackets & Coats",
    },
  }
}
