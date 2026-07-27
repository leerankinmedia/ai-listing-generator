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
import { ANALYZE_UPLOAD_MAX_BYTES, MAX_LISTING_IMAGES } from "@/lib/listings/schema"
import {
  getServerAuthUser,
  isSupabaseConfigured,
} from "@/lib/supabase/index"

export const runtime = "nodejs"
export const maxDuration = 300

/** Vercel serverless request body limit — exceeded responses never reach this route as JSON. */
const VERCEL_BODY_LIMIT_BYTES = Math.floor(4.5 * 1024 * 1024)

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

function isPayloadTooLargeError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || "")
  return /entity too large|body.*too large|payload.*too large|413|request.?entity/i.test(
    message
  )
}

async function handleGenerate(request: Request) {
  const user = await getServerAuthUser()

  // Usage rows require auth.users FK — always require a signed-in user when
  // Supabase is configured so every successful generation can be recorded.
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

  // One completed AI listing = 1 customer credit (not per internal OpenAI call).
  // No-op while BILLING_ENFORCEMENT=false — does not lock test users.
  // Permanent Owner always bypasses credit limits.
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

  const contentLengthHeader = request.headers.get("content-length")
  const contentLength = contentLengthHeader
    ? Number(contentLengthHeader)
    : NaN
  if (
    Number.isFinite(contentLength) &&
    contentLength > VERCEL_BODY_LIMIT_BYTES
  ) {
    return jsonError(
      `Request entity too large (${Math.ceil(contentLength / (1024 * 1024))}MB). Vercel limits Analyze Photos uploads to 4.5MB. Photos were not dropped — recompress and retry, or use fewer megapixels.`,
      413,
      {
        code: "payload_too_large",
        limitBytes: VERCEL_BODY_LIMIT_BYTES,
        contentLength,
        maxSupportedUploadBytes: ANALYZE_UPLOAD_MAX_BYTES,
      }
    )
  }

  let imagesAnalyzed = 0
  let listingId: string | null = null

  try {
    let formData: FormData
    try {
      formData = await request.formData()
    } catch (error) {
      if (isPayloadTooLargeError(error)) {
        return jsonError(
          "Request entity too large. The photo upload exceeded the platform body limit before analysis could start. All photos are still in your uploader — retry after automatic recompression.",
          413,
          { code: "payload_too_large" }
        )
      }
      return jsonError(
        error instanceof Error
          ? `Could not read upload: ${error.message}`
          : "Could not read photo upload.",
        400
      )
    }

    const listingIdRaw = formData.get("listingId")
    if (typeof listingIdRaw === "string" && listingIdRaw.trim()) {
      listingId = listingIdRaw.trim()
    }

    const files = formData
      .getAll("images")
      .filter((value): value is File => value instanceof File && value.size > 0)

    if (files.length === 0) {
      return jsonError("Upload at least one product photo.", 400)
    }

    if (files.length > MAX_LISTING_IMAGES) {
      return jsonError(
        `You can upload up to ${MAX_LISTING_IMAGES} photos.`,
        400,
        { receivedImages: files.length }
      )
    }

    const uploadBytes = files.reduce((sum, file) => sum + file.size, 0)
    if (uploadBytes > VERCEL_BODY_LIMIT_BYTES) {
      return jsonError(
        `Request entity too large (${Math.ceil(uploadBytes / (1024 * 1024))}MB across ${files.length} photos). Keep all photos and recompress under 4.5MB total.`,
        413,
        {
          code: "payload_too_large",
          receivedImages: files.length,
          uploadBytes,
          limitBytes: VERCEL_BODY_LIMIT_BYTES,
        }
      )
    }

    if (!isOpenAIConfigured()) {
      return jsonError(
        "OPENAI_API_KEY is required. Add it to your environment to run the production listing engine.",
        503,
        { receivedImages: files.length }
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
    if (isPayloadTooLargeError(error)) {
      return jsonError(
        "Request entity too large. Photo upload exceeded the platform body limit.",
        413,
        { code: "payload_too_large", imagesAnalyzed }
      )
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
    if (isPayloadTooLargeError(error)) {
      return jsonError(
        "Request entity too large. Photo upload exceeded the platform body limit.",
        413,
        { code: "payload_too_large" }
      )
    }
    return jsonError(
      error instanceof Error
        ? error.message
        : "Listing engine failed. Please try again.",
      500
    )
  }
}
