import { NextResponse } from "next/server"
import { z } from "zod"

import { generateListingFromImages } from "@/lib/ai/generate-listing"
import { listingConditionSchema } from "@/lib/ai/schemas"
import type { ApiErrorResponse, ApiSuccessResponse, GeneratedListing } from "@/lib/types/listing"

const requestSchema = z.object({
  images: z
    .array(z.string().min(1))
    .min(1, "Upload at least one photo")
    .max(8, "Maximum 8 photos per generation"),
  notes: z.string().max(2000).optional().default(""),
  conditionHint: listingConditionSchema.nullable().optional().default(null),
  costBasis: z.number().nonnegative().nullable().optional().default(null),
  targetMarketplace: z.literal("ebay").optional().default("ebay"),
})

function errorResponse(code: string, message: string, status: number) {
  const body: ApiErrorResponse = {
    data: null,
    error: { code, message },
    meta: { phase: "1" },
  }
  return NextResponse.json(body, { status })
}

export async function handleGenerateListingPOST(req: Request) {
  try {
    const json = await req.json()
    const parsed = requestSchema.safeParse(json)

    if (!parsed.success) {
      return errorResponse(
        "VALIDATION_ERROR",
        parsed.error.issues.map((i) => i.message).join("; ") || "Invalid request",
        400,
      )
    }

    const totalChars = parsed.data.images.reduce((sum, img) => sum + img.length, 0)
    if (totalChars > 12_000_000) {
      return errorResponse(
        "PAYLOAD_TOO_LARGE",
        "Image payload is too large. Use fewer or smaller photos (max ~8MB combined).",
        413,
      )
    }

    for (const image of parsed.data.images) {
      const ok =
        image.startsWith("data:image/") ||
        image.startsWith("http://") ||
        image.startsWith("https://")
      if (!ok) {
        return errorResponse(
          "INVALID_IMAGE",
          "Each image must be a data URL or http(s) URL.",
          400,
        )
      }
    }

    const { listing, model } = await generateListingFromImages({
      images: parsed.data.images,
      notes: parsed.data.notes,
      conditionHint: parsed.data.conditionHint,
      costBasis: parsed.data.costBasis,
      targetMarketplace: parsed.data.targetMarketplace,
    })

    const body: ApiSuccessResponse<GeneratedListing> = {
      data: listing,
      error: null,
      meta: {
        model,
        generatedAt: new Date().toISOString(),
        phase: "1",
      },
    }

    return NextResponse.json(body)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error"

    if (message.includes("OPENAI_API_KEY")) {
      return errorResponse(
        "CONFIG_ERROR",
        "OpenAI is not configured. Set OPENAI_API_KEY in your environment.",
        503,
      )
    }

    console.error("[generate-listing]", error)
    return errorResponse("GENERATION_FAILED", message, 500)
  }
}

export function handleGenerateListingGET() {
  return NextResponse.json({
    name: "Listora AI Listing Generator",
    version: "1.0.0",
    phase: 1,
    method: "POST",
    accepts: {
      images: "string[] (1–8 data URLs or image URLs)",
      notes: "string (optional)",
      conditionHint: "ListingCondition | null (optional)",
      costBasis: "number | null (optional)",
      targetMarketplace: '"ebay" (default)',
    },
    returns: {
      title: "70–80 char SEO title",
      description: "string",
      category: "object",
      itemSpecifics: "array",
      keywords: "string[]",
      pricing: "object",
      confidenceScore: "0–100",
      missingInformation: "warnings[]",
    },
  })
}
