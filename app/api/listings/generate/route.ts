import { NextResponse } from "next/server"
import {
  generateListingFromImages,
  isOpenAIConfigured,
  ListingEngineError,
} from "@/lib/ai/generate-listing"
import { DEFAULT_LISTING_MODEL, emptyTokenUsage } from "@/lib/ai/pricing"
import { recordAiUsage } from "@/lib/ai/usage"
import { checkSubscriptionAccess } from "@/lib/billing/access"
import { MAX_LISTING_IMAGES } from "@/lib/listings/schema"
import { getServerAuthUser } from "@/lib/supabase/index"

export const runtime = "nodejs"
export const maxDuration = 300

export async function POST(request: Request) {
  const user = await getServerAuthUser()

  const access = await checkSubscriptionAccess(user?.id)
  if (!access.allowed) {
    return NextResponse.json(
      {
        error:
          "Subscription required. Start your trial or renew to unlock ListWise.",
        code: "subscription_required",
      },
      { status: 402 }
    )
  }

  let imagesAnalyzed = 0
  let listingId: string | null = null

  try {
    const formData = await request.formData()
    const listingIdRaw = formData.get("listingId")
    if (typeof listingIdRaw === "string" && listingIdRaw.trim()) {
      listingId = listingIdRaw.trim()
    }

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
    imagesAnalyzed = images.length

    const { draft, model, usage } = await generateListingFromImages(images)

    if (user) {
      await recordAiUsage({
        userId: user.id,
        listingId,
        model,
        imagesAnalyzed,
        usage,
        status: "succeeded",
        draft,
      })
    }

    return NextResponse.json({
      draft,
      model,
      imagesAnalyzed,
      openaiConfigured: true,
    })
  } catch (error) {
    console.error("[listing engine]", error)
    if (user) {
      await recordAiUsage({
        userId: user.id,
        listingId,
        model: DEFAULT_LISTING_MODEL,
        imagesAnalyzed,
        usage: emptyTokenUsage(),
        status: "failed",
        errorMessage:
          error instanceof Error ? error.message : "Listing engine failed.",
        draft: {},
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
