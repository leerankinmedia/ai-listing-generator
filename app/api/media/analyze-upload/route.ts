import { NextResponse } from "next/server"
import {
  ANALYZE_SINGLE_UPLOAD_MAX_BYTES,
  storeAnalyzeImage,
} from "@/lib/listings/analyze-upload"
import { MAX_LISTING_IMAGES } from "@/lib/listings/schema"
import {
  getServerAuthUser,
  isSupabaseConfigured,
} from "@/lib/supabase/index"

export const runtime = "nodejs"
export const maxDuration = 60

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
            : status === 400
              ? "bad_request"
              : "analyze_upload_failed",
      ...extra,
    },
    {
      status,
      headers: { "content-type": "application/json; charset=utf-8" },
    }
  )
}

/**
 * Upload a single Analyze Photos image.
 * Client uploads 1..N photos via repeated calls, then POSTs only URLs to
 * /api/listings/generate — never a multi-image binary body.
 */
export async function POST(request: Request) {
  try {
    const user = await getServerAuthUser()
    if (isSupabaseConfigured() && !user?.id) {
      return jsonError("Sign in required to upload photos for analysis.", 401)
    }
    if (!user?.id) {
      return jsonError("Sign in required to upload photos for analysis.", 401)
    }

    const contentLength = Number(request.headers.get("content-length") || NaN)
    if (
      Number.isFinite(contentLength) &&
      contentLength > Math.floor(4.5 * 1024 * 1024)
    ) {
      return jsonError(
        "Request entity too large. Upload one compressed photo at a time.",
        413,
        { limitBytes: Math.floor(4.5 * 1024 * 1024), contentLength }
      )
    }

    let formData: FormData
    try {
      formData = await request.formData()
    } catch (error) {
      return jsonError(
        error instanceof Error
          ? `Could not read upload: ${error.message}`
          : "Could not read photo upload.",
        400
      )
    }

    const file = formData.get("image")
    if (!(file instanceof File) || file.size <= 0) {
      return jsonError('Expected a single "image" file field.', 400)
    }
    if (file.size > ANALYZE_SINGLE_UPLOAD_MAX_BYTES) {
      return jsonError(
        `Each photo must be under ${Math.floor(ANALYZE_SINGLE_UPLOAD_MAX_BYTES / (1024 * 1024))}MB after compression.`,
        413,
        { bytes: file.size, limitBytes: ANALYZE_SINGLE_UPLOAD_MAX_BYTES }
      )
    }

    const indexRaw = formData.get("index")
    const index =
      typeof indexRaw === "string" && Number.isFinite(Number(indexRaw))
        ? Math.max(0, Math.floor(Number(indexRaw)))
        : 0
    if (index >= MAX_LISTING_IMAGES) {
      return jsonError(
        `You can upload up to ${MAX_LISTING_IMAGES} photos.`,
        400
      )
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const stored = await storeAnalyzeImage({
      buffer,
      contentType: file.type || "image/jpeg",
      userId: user.id,
      index,
    })

    return NextResponse.json({
      ok: true,
      url: stored.url,
      path: stored.path,
      contentType: stored.contentType,
      bytes: stored.bytes,
      storage: stored.storage,
      index,
    })
  } catch (error) {
    console.error("[analyze-upload]", error)
    return jsonError(
      error instanceof Error ? error.message : "Photo upload failed.",
      500
    )
  }
}
