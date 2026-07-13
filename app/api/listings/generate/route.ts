import { NextResponse } from "next/server"
import {
  generateListingFromImages,
  isOpenAIConfigured,
} from "@/lib/ai/generate-listing"
import { MAX_LISTING_IMAGES, MAX_VISION_IMAGES } from "@/lib/listings/schema"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const files = formData
      .getAll("images")
      .filter((value): value is File => value instanceof File && value.size > 0)

    if (files.length === 0) {
      return NextResponse.json(
        { error: "Upload at least one product photo." },
        { status: 400 }
      )
    }

    if (files.length > MAX_LISTING_IMAGES) {
      return NextResponse.json(
        { error: `You can upload up to ${MAX_LISTING_IMAGES} photos.` },
        { status: 400 }
      )
    }

    const visionFiles = files.slice(0, MAX_VISION_IMAGES)
    const images = await Promise.all(
      visionFiles.map(async (file) => {
        const buffer = Buffer.from(await file.arrayBuffer())
        return {
          mediaType: file.type || "image/jpeg",
          data: buffer,
        }
      })
    )

    const { draft, mode } = await generateListingFromImages(images)

    return NextResponse.json({
      draft,
      mode,
      analyzedCount: visionFiles.length,
      uploadedCount: files.length,
      openaiConfigured: isOpenAIConfigured(),
    })
  } catch (error) {
    console.error("[generate listing]", error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate listing. Please try again.",
      },
      { status: 500 }
    )
  }
}
