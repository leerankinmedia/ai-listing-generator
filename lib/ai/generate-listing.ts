import { createOpenAI } from "@ai-sdk/openai"
import { generateText, Output } from "ai"

import { buildListingUserPrompt, LISTING_SYSTEM_PROMPT } from "@/lib/ai/prompts"
import { generatedListingSchema } from "@/lib/ai/schemas"
import type { GenerateListingRequest, GeneratedListing } from "@/lib/types/listing"
import { clampTitleLength } from "@/lib/utils"

const MODEL_ID = "gpt-4o"

function normalizeListing(raw: GeneratedListing): GeneratedListing {
  const title = clampTitleLength(raw.title, 70, 80)
  const warnings = [...raw.missingInformation]

  if (title.length < 70) {
    warnings.push({
      field: "title",
      severity: "medium",
      message: `Title is ${title.length} characters (target 70–80).`,
      suggestion:
        "Add size, color, material, or a high-intent style keyword to strengthen SEO without keyword stuffing.",
    })
  }

  if (!raw.brand) {
    const hasBrandWarning = warnings.some((w) => w.field.toLowerCase() === "brand")
    if (!hasBrandWarning) {
      warnings.push({
        field: "brand",
        severity: "high",
        message: "Brand could not be confirmed from the photos.",
        suggestion: "Check neck/waist/care tags or packaging and update the title + Brand specific.",
      })
    }
  }

  if (!raw.size) {
    const hasSizeWarning = warnings.some((w) => w.field.toLowerCase() === "size")
    if (!hasSizeWarning) {
      warnings.push({
        field: "size",
        severity: "high",
        message: "Size is missing or unreadable.",
        suggestion: "Photograph the size tag clearly or enter the size manually before publishing.",
      })
    }
  }

  const requiredSpecificNames = ["Brand", "Color", "Size"]
  for (const name of requiredSpecificNames) {
    const present = raw.itemSpecifics.some(
      (s) => s.name.toLowerCase() === name.toLowerCase() && s.value.trim().length > 0,
    )
    if (!present) {
      warnings.push({
        field: name.toLowerCase(),
        severity: "medium",
        message: `Item specific "${name}" is incomplete.`,
        suggestion: `Add a clear ${name} value before listing to improve search rank and filters.`,
      })
    }
  }

  // Deduplicate warnings by field+message
  const seen = new Set<string>()
  const missingInformation = warnings.filter((w) => {
    const key = `${w.field}:${w.message}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return {
    ...raw,
    title,
    titleCharacterCount: title.length,
    missingInformation,
    keywords: raw.keywords.map((k) => k.trim()).filter(Boolean).slice(0, 15),
    itemSpecifics: raw.itemSpecifics
      .map((s) => ({ name: s.name.trim(), value: s.value.trim() }))
      .filter((s) => s.name && s.value),
  }
}

export async function generateListingFromImages(
  input: GenerateListingRequest,
): Promise<{ listing: GeneratedListing; model: string }> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured")
  }

  const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const imageParts = input.images.map((image) => ({
    type: "image" as const,
    image,
  }))

  const result = await generateText({
    model: openai(MODEL_ID),
    system: LISTING_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: buildListingUserPrompt({
              notes: input.notes,
              conditionHint: input.conditionHint,
              costBasis: input.costBasis,
              imageCount: input.images.length,
            }),
          },
          ...imageParts,
        ],
      },
    ],
    output: Output.object({
      schema: generatedListingSchema,
    }),
  })

  if (!result.output) {
    throw new Error("Model returned empty listing output")
  }

  const listing = normalizeListing({
    ...result.output,
    titleCharacterCount: result.output.title.length,
  })

  return { listing, model: MODEL_ID }
}
