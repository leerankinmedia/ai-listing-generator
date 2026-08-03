import { NextResponse } from "next/server"
import {
  generateListingFromImages,
  isOpenAIConfigured,
  ListingEngineError,
} from "@/lib/ai/generate-listing"
import { getListingModel, emptyTokenUsage } from "@/lib/ai/pricing"
import { resolvePipelineMode } from "@/lib/ai/pipeline-mode"
import { recordAiUsage } from "@/lib/ai/usage"
import { checkSubscriptionAccess } from "@/lib/billing/access"
import {
  assertListingCreditAvailable,
  creditPeriodStartFromSubscription,
} from "@/lib/billing/credits"
import { ensureEbayUserAccessToken } from "@/lib/insights/ebay-auth"
import {
  cleanupAnalyzeStagingUrls,
  resolveAnalyzeImageUrls,
} from "@/lib/listings/analyze-upload"
import { isKnownValue } from "@/lib/listings/clothing-identity"
import { MAX_LISTING_IMAGES } from "@/lib/listings/schema"
import {
  buildCategorySuggestionQuery,
  getEbayCategorySuggestions,
} from "@/lib/marketplaces/adapters/ebay/taxonomy"
import {
  getServerAuthUser,
  isSupabaseConfigured,
} from "@/lib/supabase/index"

export const runtime = "nodejs"
export const maxDuration = 300

function jsonError(
  error: string,
  status: number,
  extra?: Record<string, unknown>
) {
  return NextResponse.json(
    {
      error,
      code:
        status === 413
          ? "payload_too_large"
          : status === 401
            ? "unauthorized"
            : status === 402
              ? "subscription_required"
              : status === 400
                ? "bad_request"
                : "listing_generate_failed",
      ...extra,
    },
    {
      status,
      headers: {
        "content-type": "application/json; charset=utf-8",
      },
    }
  )
}

type GenerateBody = {
  imageUrls?: unknown
  listingId?: unknown
  sellerNotes?: unknown
  pipelineMode?: unknown
  uploadMs?: unknown
}

async function handleGenerate(request: Request) {
  const user = await getServerAuthUser()

  if (isSupabaseConfigured() && !user?.id) {
    return jsonError("Sign in required to generate listings.", 401)
  }

  const access = await checkSubscriptionAccess(user?.id, user?.email)
  if (!access.allowed) {
    return jsonError(
      "Start your 7-day free trial to unlock this feature.",
      402,
      { code: "subscription_required" }
    )
  }

  if (user?.id && !access.entitlement.ownerOverride) {
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
      email: user.email,
      ownerOverride: access.entitlement.ownerOverride,
    })
    if (!creditCheck.ok) {
      return jsonError(
        "AI listing credit limit reached for this billing cycle. Upgrade or wait for renewal.",
        402,
        {
          code: "listing_credits_exhausted",
          allowance: creditCheck.summary.allowance,
          used: creditCheck.summary.used,
        }
      )
    }
  }

  let imagesAnalyzed = 0
  let listingId: string | null = null
  let imageUrls: string[] = []

  try {
    const contentType = (request.headers.get("content-type") || "").toLowerCase()
    if (!contentType.includes("application/json")) {
      return jsonError(
        "Analyze Photos expects JSON with imageUrls only. Upload each photo to /api/media/analyze-upload first — do not send image binaries to this endpoint.",
        415,
        { code: "unsupported_media_type" }
      )
    }

    let body: GenerateBody
    try {
      body = (await request.json()) as GenerateBody
    } catch {
      return jsonError("Invalid JSON body.", 400)
    }

    if (typeof body.listingId === "string" && body.listingId.trim()) {
      listingId = body.listingId.trim()
    }

    if (!Array.isArray(body.imageUrls)) {
      return jsonError(
        "imageUrls must be an array of previously uploaded photo URLs.",
        400
      )
    }

    imageUrls = body.imageUrls
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter(Boolean)

    if (imageUrls.length === 0) {
      return jsonError("Upload at least one product photo.", 400)
    }
    if (imageUrls.length > MAX_LISTING_IMAGES) {
      return jsonError(
        `You can analyze up to ${MAX_LISTING_IMAGES} photos.`,
        400,
        { receivedImages: imageUrls.length }
      )
    }
    if (imageUrls.length !== body.imageUrls.length) {
      return jsonError("imageUrls must contain only non-empty strings.", 400)
    }

    const sellerNotes =
      typeof body.sellerNotes === "string" ? body.sellerNotes.trim() : ""

    const pipelineMode = resolvePipelineMode(body.pipelineMode, {
      isOwner: Boolean(access.entitlement.ownerOverride),
      envDefault: process.env.LISTWISE_PIPELINE_MODE,
    })
    const uploadMs =
      typeof body.uploadMs === "number" && Number.isFinite(body.uploadMs)
        ? Math.max(0, Math.round(body.uploadMs))
        : undefined

    if (!isOpenAIConfigured()) {
      return jsonError(
        "OPENAI_API_KEY is required. Add it to your environment to run the production listing engine.",
        503,
        { receivedImages: imageUrls.length }
      )
    }

    let categorySuggestions: Array<{
      categoryId: string
      categoryName: string
      categoryPath: string
    }> = []

    const images = await resolveAnalyzeImageUrls(imageUrls)
    const {
      draft,
      model,
      identityModel,
      copyModel,
      pipelineMode: usedMode,
      usage,
      imagesAnalyzed: analyzedCount,
      imagesFailed,
      warnings,
      partial,
      timings,
    } = await generateListingFromImages(images, {
      sellerNotes: sellerNotes || undefined,
      pipelineMode,
      onIdentityReady: async (fields) => {
        // Start Taxonomy suggestions as soon as item type + department exist.
        if (
          !isKnownValue(fields.itemType.value) &&
          !isKnownValue(fields.gender.value)
        ) {
          return
        }
        try {
          const token = await ensureEbayUserAccessToken()
          if (!token.ok) return
          const q = buildCategorySuggestionQuery({
            title: [
              fields.brand.value,
              fields.gender.value,
              fields.itemType.value,
            ]
              .filter((v) => isKnownValue(v))
              .join(" "),
            itemType: fields.itemType.value,
            department: fields.gender.value,
            brand: fields.brand.value,
          })
          if (!q) return
          const suggested = await getEbayCategorySuggestions(
            token.accessToken,
            q,
            { limit: 6 }
          )
          categorySuggestions = suggested.suggestions.map((s) => ({
            categoryId: s.categoryId,
            categoryName: s.categoryName,
            categoryPath: s.categoryPath,
          }))
        } catch (err) {
          console.warn("[listing engine] early category suggest failed", err)
        }
      },
    })
    imagesAnalyzed = analyzedCount

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

    // Best-effort cleanup for ephemeral staging URLs.
    void cleanupAnalyzeStagingUrls(imageUrls)

    const fullTimings = {
      ...timings,
      uploadMs,
      totalMs:
        typeof uploadMs === "number"
          ? timings.totalMs + uploadMs
          : timings.totalMs,
    }

    console.info("[listing engine] analysis timings", {
      pipelineMode: usedMode,
      identityModel,
      copyModel,
      ...fullTimings,
      ownerTest: Boolean(access.entitlement.ownerOverride),
    })

    return NextResponse.json({
      draft,
      model,
      identityModel,
      copyModel,
      pipelineMode: usedMode,
      timings: fullTimings,
      categorySuggestions,
      imagesAnalyzed,
      imagesFailed,
      warnings,
      partial,
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
      return jsonError(error.message, error.status, { imagesAnalyzed })
    }
    return jsonError(
      error instanceof Error
        ? error.message
        : "Listing engine failed. Please try again.",
      500,
      { imagesAnalyzed }
    )
  }
}

export async function POST(request: Request) {
  try {
    return await handleGenerate(request)
  } catch (error) {
    console.error("[listing engine] unhandled", error)
    return jsonError(
      error instanceof Error
        ? error.message
        : "Listing engine failed. Please try again.",
      500
    )
  }
}
