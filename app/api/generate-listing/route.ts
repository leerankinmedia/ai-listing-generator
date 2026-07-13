import { NextResponse } from "next/server"

import { generateEbayListing } from "@/lib/ai/generate-listing"
import { listingInputSchema } from "@/lib/types/listing"

export const runtime = "nodejs"
export const maxDuration = 60

const MAX_IMAGES = 6
const MAX_IMAGE_BYTES = 4.5 * 1024 * 1024 // ~4.5MB per image (base64 overhead aside)

function badRequest(message: string, details?: unknown) {
  return NextResponse.json(
    { error: { message, details } },
    { status: 400 }
  )
}

export async function POST(request: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        {
          error: {
            message:
              "OPENAI_API_KEY is not configured. Add it to your environment to generate listings.",
          },
        },
        { status: 503 }
      )
    }

    const contentType = request.headers.get("content-type") || ""
    if (!contentType.includes("multipart/form-data")) {
      return badRequest("Expected multipart/form-data with photos and fields.")
    }

    const form = await request.formData()
    const notes = String(form.get("notes") || "")
    const brand = String(form.get("brand") || "")
    const categoryHint = String(form.get("categoryHint") || "")
    const conditionRaw = String(form.get("condition") || "")
    const costRaw = String(form.get("cost") || "")

    const parsed = listingInputSchema.safeParse({
      notes: notes || undefined,
      brand: brand || undefined,
      categoryHint: categoryHint || undefined,
      condition: conditionRaw || undefined,
      cost: costRaw ? Number(costRaw) : undefined,
      targetMarketplace: "ebay",
    })

    if (!parsed.success) {
      return badRequest("Invalid listing input.", parsed.error.flatten())
    }

    const files = form
      .getAll("photos")
      .filter((entry): entry is File => entry instanceof File && entry.size > 0)

    if (files.length === 0) {
      return badRequest("Upload at least one product photo.")
    }

    if (files.length > MAX_IMAGES) {
      return badRequest(`Maximum ${MAX_IMAGES} photos per generation.`)
    }

    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        return badRequest(`Unsupported file type: ${file.type || file.name}`)
      }
      if (file.size > MAX_IMAGE_BYTES) {
        return badRequest(
          `Image "${file.name}" is too large. Keep each photo under ~4.5MB.`
        )
      }
    }

    const imageDataUrls = await Promise.all(
      files.map(async (file) => {
        const buffer = Buffer.from(await file.arrayBuffer())
        const base64 = buffer.toString("base64")
        return `data:${file.type};base64,${base64}`
      })
    )

    const result = await generateEbayListing({
      input: parsed.data,
      imageDataUrls,
    })

    return NextResponse.json({ data: result })
  } catch (error) {
    console.error("[generate-listing]", error)
    const message =
      error instanceof Error ? error.message : "Failed to generate listing."
    return NextResponse.json(
      { error: { message } },
      { status: 500 }
    )
  }
}
