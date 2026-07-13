import { NextResponse } from "next/server"
import {
  generateListingFromImages,
  isOpenAIConfigured,
  ListingEngineError,
} from "@/lib/ai/generate-listing"
import { MAX_LISTING_IMAGES } from "@/lib/listings/schema"
import { getServerAuthUser, isSupabaseConfigured } from "@/lib/supabase/index"
import { createClient as createServerClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const maxDuration = 300

async function recordAiGeneration(params: {
  userId: string
  model: string
  imagesAnalyzed: number
  draft: unknown
  status: "succeeded" | "failed"
  errorMessage?: string
}) {
  if (!isSupabaseConfigured()) return
  try {
    const supabase = await createServerClient()
    await supabase.from("ai_generations").insert({
      user_id: params.userId,
      model: params.model,
      images_analyzed: params.imagesAnalyzed,
      draft: params.draft ?? {},
      status: params.status,
      error_message: params.errorMessage ?? null,
    })
  } catch (error) {
    console.error("[ai_generations] failed to persist", error)
  }
}

export async function POST(request: Request) {
  const user = await getServerAuthUser()

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

    if (!isOpenAIConfigured()) {
      return NextResponse.json(
        {
          error:
            "OPENAI_API_KEY is required. Add it to your environment to run the production listing engine.",
          receivedImages: files.length,
        },
        { status: 503 }
      )
    }

    const images = await Promise.all(
      files.map(async (file) => {
        const buffer = Buffer.from(await file.arrayBuffer())
        return {
          mediaType: file.type || "image/jpeg",
          data: buffer,
        }
      })
    )

    const { draft, model } = await generateListingFromImages(images)

    if (user) {
      await recordAiGeneration({
        userId: user.id,
        model,
        imagesAnalyzed: images.length,
        draft,
        status: "succeeded",
      })
    }

    return NextResponse.json({
      draft,
      model,
      imagesAnalyzed: images.length,
      openaiConfigured: true,
    })
  } catch (error) {
    console.error("[listing engine]", error)
    if (user) {
      await recordAiGeneration({
        userId: user.id,
        model: "unknown",
        imagesAnalyzed: 0,
        draft: {},
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Listing engine failed.",
      })
    }
    if (error instanceof ListingEngineError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Listing engine failed. Please try again.",
      },
      { status: 500 }
    )
  }
}
