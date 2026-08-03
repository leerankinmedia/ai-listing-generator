import "server-only"
import { createClient } from "@supabase/supabase-js"
import { randomBytes } from "crypto"
import { getAppBaseUrl } from "@/lib/app-url"
import { isAllowedAnalyzeImageUrl } from "@/lib/listings/analyze-url"
import {
  diagnoseSupabaseStorageConfig,
  listingImagesBucketName,
} from "@/lib/listings/storage-config"
import { ensureAnalyzeStorageReady } from "@/lib/listings/storage-health"
import {
  deleteStagingImage,
  getStagingImage,
  putStagingImage,
} from "@/lib/marketplaces/images/staging-store"
import { ANALYZE_UPLOAD_MAX_BYTES } from "@/lib/listings/schema"

export { isAllowedAnalyzeImageUrl } from "@/lib/listings/analyze-url"
export {
  DEFAULT_LISTING_IMAGES_BUCKET,
  diagnoseSupabaseStorageConfig,
  listingImagesBucketName,
} from "@/lib/listings/storage-config"

export const ANALYZE_SINGLE_UPLOAD_MAX_BYTES = ANALYZE_UPLOAD_MAX_BYTES

function listingImagesBucket() {
  return listingImagesBucketName()
}

export type AnalyzeUploadedImage = {
  url: string
  path: string
  contentType: string
  bytes: number
  storage: "supabase" | "staging"
}

/**
 * Persist one Analyze Photos image. Prefer durable Supabase Storage so
 * generate can run on a different Vercel instance than the uploader.
 */
export async function storeAnalyzeImage(input: {
  buffer: Buffer
  contentType: string
  userId: string
  index?: number
}): Promise<AnalyzeUploadedImage> {
  if (input.buffer.byteLength === 0) {
    throw new Error("Empty image upload.")
  }
  if (input.buffer.byteLength > ANALYZE_SINGLE_UPLOAD_MAX_BYTES) {
    throw new Error(
      `Each photo must be under ${Math.floor(ANALYZE_SINGLE_UPLOAD_MAX_BYTES / (1024 * 1024))}MB after compression.`
    )
  }

  const contentType = input.contentType || "image/jpeg"
  const ext = contentType.includes("png")
    ? "png"
    : contentType.includes("webp")
      ? "webp"
      : "jpg"

  const diagnosis = diagnoseSupabaseStorageConfig({ requireServiceRole: true })
  if (diagnosis.ok) {
    const ready = await ensureAnalyzeStorageReady()
    if (!ready.ok) {
      console.error("[analyze-upload] storage not ready", ready)
      throw new Error(
        ready.error ||
          `Supabase Storage bucket "${ready.bucket}" is not ready for Analyze Photos.`
      )
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!.trim()
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!.trim()
    const bucket = listingImagesBucket()
    const path = `${input.userId}/analyze/${Date.now()}-${input.index ?? 0}-${randomBytes(6).toString("hex")}.${ext}`
    const supabase = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { error } = await supabase.storage.from(bucket).upload(path, input.buffer, {
      contentType,
      upsert: false,
    })
    if (error) {
      console.error("[analyze-upload] supabase upload failed", {
        bucket,
        path,
        bytes: input.buffer.byteLength,
        contentType,
        message: error.message,
        name: error.name,
        // Supabase StorageError may include statusCode / error
        ...(error as unknown as Record<string, unknown>),
      })
      throw new Error(
        `Failed to store analyze photo in "${bucket}" at "${path}": ${error.message}`
      )
    }
    const { data } = supabase.storage.from(bucket).getPublicUrl(path)
    if (!data.publicUrl) {
      throw new Error(
        `Storage upload succeeded but no public URL was returned for bucket "${bucket}" path "${path}".`
      )
    }
    console.info("[analyze-upload] stored", {
      storage: "supabase",
      bucket,
      path,
      bytes: input.buffer.byteLength,
      url: data.publicUrl,
    })
    return {
      url: data.publicUrl,
      path,
      contentType,
      bytes: input.buffer.byteLength,
      storage: "supabase",
    }
  }

  console.error("[analyze-upload] supabase storage not configured", diagnosis)

  // Never use in-memory staging on Vercel — isolates do not share memory.
  if (process.env.VERCEL || process.env.NODE_ENV === "production") {
    throw new Error(
      diagnosis.reason ||
        "Supabase Storage is required for Analyze Photos. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
    )
  }

  // Local/dev fallback only — in-memory staging (not durable across isolates).
  const id = putStagingImage({ contentType, buffer: input.buffer })
  const appUrl = getAppBaseUrl()
  return {
    url: `${appUrl}/api/media/staging/${id}`,
    path: id,
    contentType,
    bytes: input.buffer.byteLength,
    storage: "staging",
  }
}

export type VisionImagePayload = {
  mediaType: string
  data: Buffer
  /** 1-based photo number for failure logging */
  index: number
  sourceUrl: string
}

const FETCH_IMAGE_MAX_BYTES = 5 * 1024 * 1024

/**
 * Resolve Analyze Photos URLs into Vision buffers.
 * Supports Supabase public URLs and local staging ids.
 */
export async function resolveAnalyzeImageUrls(
  urls: string[]
): Promise<VisionImagePayload[]> {
  const out: VisionImagePayload[] = []
  for (const [index, url] of urls.entries()) {
    const photoNumber = index + 1
    if (!isAllowedAnalyzeImageUrl(url)) {
      throw new Error(
        `Photo ${photoNumber} URL is not an allowed analyze upload URL.`
      )
    }

    const stagingMatch = url.match(/\/api\/media\/staging\/([a-f0-9]{32})$/i)
    if (stagingMatch) {
      const staged = getStagingImage(stagingMatch[1])
      if (!staged) {
        throw new Error(
          `Photo ${photoNumber} expired or was uploaded on a different server instance. Re-upload and analyze again (Supabase Storage is required on Vercel).`
        )
      }
      out.push({
        mediaType: staged.contentType,
        data: staged.buffer,
        index: photoNumber,
        sourceUrl: url,
      })
      continue
    }

    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "image/*" },
    })
    if (!response.ok) {
      throw new Error(
        `Photo ${photoNumber} could not be fetched (HTTP ${response.status}) from ${url}.`
      )
    }
    const contentType =
      response.headers.get("content-type")?.split(";")[0]?.trim() ||
      "image/jpeg"
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.byteLength === 0) {
      throw new Error(`Photo ${photoNumber} fetched empty from ${url}.`)
    }
    if (buffer.byteLength > FETCH_IMAGE_MAX_BYTES) {
      throw new Error(
        `Photo ${photoNumber} is too large after upload (${Math.ceil(buffer.byteLength / (1024 * 1024))}MB).`
      )
    }
    out.push({
      mediaType: contentType,
      data: buffer,
      index: photoNumber,
      sourceUrl: url,
    })
  }
  return out
}

export async function cleanupAnalyzeStagingUrls(urls: string[]) {
  for (const url of urls) {
    const stagingMatch = url.match(/\/api\/media\/staging\/([a-f0-9]{32})$/i)
    if (stagingMatch) deleteStagingImage(stagingMatch[1])
  }
}
