import { NextResponse } from "next/server"
import {
  generateListingFromImages,
  isOpenAIConfigured,
  ListingEngineError,
} from "@/lib/ai/generate-listing"
import { getListingModel, emptyTokenUsage } from "@/lib/ai/pricing"
import { recordAiUsage } from "@/lib/ai/usage"
import { checkSubscriptionAccess } from "@/lib/billing/access"
import {
  assertListingCreditAvailable,
  creditPeriodStartFromSubscription,
} from "@/lib/billing/credits"
import { MAX_LISTING_IMAGES } from "@/lib/listings/schema"
import {
  getServerAuthUser,
  isSupabaseConfigured,
} from "@/lib/supabase/index"

export const runtime = "nodejs"
export const maxDuration = 300

export async function POST(request: Request) {
  const user = await getServerAuthUser()

  // Usage rows require auth.users FK — always require a signed-in user when
  // Supabase is configured so every successful generation can be recorded.
  if (isSupabaseConfigured() && !user?.id) {
    return NextResponse.json(
      { error: "Sign in required to generate listings." },
      { status: 401 }
    )
  }

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

  // One completed AI listing = 1 customer credit (not per internal OpenAI call).
  // No-op while BILLING_ENFORCEMENT=false — does not lock test users.
  if (user?.id) {
    const periodStart = creditPeriodStartFromSubscription(
      access.subscription
        ? {
            status: access.subscription.status,
            trial_start: access.subscription.trial_start,
            current_period_end: access.subscription.current_period_end,
          }
        : null
    )
    const creditCheck = await assertListingCreditAvailable({
      userId: user.id,
      periodStartIso: periodStart,
    })
    if (!creditCheck.ok) {
      return NextResponse.json(
        {
          error:
            "AI listing credit limit reached for this billing cycle. Upgrade or wait for renewal.",
          code: "listing_credits_exhausted",
          allowance: creditCheck.summary.allowance,
          used: creditCheck.summary.used,
        },
        { status: 402 }
      )
    }
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

    let usageRecorded = false
    let usageRecordId: string | null = null
    let usageRecordError: string | undefined

    if (user?.id) {
      const recorded = await recordAiUsage({
        userId: user.id,
        listingId,
        model,
        imagesAnalyzed,
        usage,
        status: "succeeded",
        draft,
      })
      usageRecorded = recorded.recorded
      usageRecordId = recorded.id
      usageRecordError = recorded.error
      if (!recorded.recorded) {
        console.error(
          "[listing engine] succeeded but AI usage was not recorded",
          recorded.error
        )
      }
    } else {
      console.warn(
        "[listing engine] skipping AI usage record — no authenticated user"
      )
    }

    return NextResponse.json({
      draft,
      model,
      imagesAnalyzed,
      openaiConfigured: true,
      usageRecorded,
      usageRecordId,
      ...(usageRecordError ? { usageRecordError } : {}),
    })
  } catch (error) {
    console.error("[listing engine]", error)
    if (user?.id) {
      const recorded = await recordAiUsage({
        userId: user.id,
        listingId,
        model: getListingModel(),
        imagesAnalyzed,
        usage: emptyTokenUsage(),
        status: "failed",
        errorMessage:
          error instanceof Error ? error.message : "Listing engine failed.",
        draft: {},
      })
      if (!recorded.recorded) {
        console.error(
          "[listing engine] failed run also failed to record usage",
          recorded.error
        )
      }
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
