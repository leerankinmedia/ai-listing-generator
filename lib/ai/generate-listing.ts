import { generateObject } from "ai"
import { createOpenAI } from "@ai-sdk/openai"

import { buildListingSystemPrompt, buildListingUserPrompt } from "@/lib/ai/prompts"
import {
  generatedListingSchema,
  type GeneratedListing,
  type ListingInput,
} from "@/lib/types/listing"
import { isOptimalTitleLength, optimizeTitleLength } from "@/lib/utils"

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export type RefinedListing = Omit<GeneratedListing, "itemSpecifics"> & {
  itemSpecifics: Record<string, string>
}

function toItemSpecificsRecord(
  pairs: GeneratedListing["itemSpecifics"]
): Record<string, string> {
  const record: Record<string, string> = {}
  for (const { name, value } of pairs) {
    const key = name.trim()
    const val = value.trim()
    if (key && val) record[key] = val
  }
  return record
}

function refineListing(listing: GeneratedListing): RefinedListing {
  const title = optimizeTitleLength(listing.title)
  const titleAlternates = listing.titleAlternates.map(optimizeTitleLength)
  const itemSpecifics = toItemSpecificsRecord(listing.itemSpecifics)

  const missingInformation = [...listing.missingInformation]

  if (!isOptimalTitleLength(title)) {
    missingInformation.unshift({
      field: "title",
      severity: "recommended",
      message: `Title is ${title.length} characters; eBay SEO performs best at 70–80.`,
      suggestion:
        "Add a searchable attribute (size, color, material, or model) or trim filler words.",
    })
  }

  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)))
  const confidence = {
    overall: clamp(listing.confidence.overall),
    title: clamp(
      isOptimalTitleLength(title)
        ? Math.max(listing.confidence.title, 70)
        : Math.min(listing.confidence.title, 65)
    ),
    category: clamp(listing.confidence.category),
    itemSpecifics: clamp(listing.confidence.itemSpecifics),
    pricing: clamp(listing.confidence.pricing),
    description: clamp(listing.confidence.description),
  }

  return {
    ...listing,
    title,
    titleAlternates,
    itemSpecifics,
    missingInformation,
    confidence,
  }
}

export async function generateEbayListing(params: {
  input: ListingInput
  imageDataUrls: string[]
}) {
  const modelName = process.env.OPENAI_MODEL || "gpt-4o"

  const imageParts = params.imageDataUrls.map((url) => ({
    type: "image" as const,
    image: url,
  }))

  const { object } = await generateObject({
    model: openai(modelName),
    schema: generatedListingSchema,
    system: buildListingSystemPrompt(),
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: buildListingUserPrompt(params.input) },
          ...imageParts,
        ],
      },
    ],
    temperature: 0.4,
  })

  const listing = refineListing(object)

  return {
    listing,
    meta: {
      model: modelName,
      titleLength: listing.title.length,
      titleInOptimalRange: isOptimalTitleLength(listing.title),
      generatedAt: new Date().toISOString(),
    },
  }
}
