/**
 * Client helper: build temporary analysis copies, upload them individually,
 * then analyze by URL list. Full-resolution listing originals are untouched.
 *
 * Prefer browser → Supabase Storage (same auth/RLS path as originals) so Analyze
 * does not depend on SUPABASE_SERVICE_ROLE_KEY. Fall back to the server
 * /api/media/analyze-upload route when needed.
 */
import { readApiJsonResponse } from "@/lib/api/read-json-response"
import { createAnalyzeCopyFromListingImage } from "@/lib/listings/images"
import {
  diagnoseBrowserStorageConfig,
  listingImagesBucketName,
} from "@/lib/listings/storage-config"
import { allListingImagesUploaded } from "@/lib/listings/upload-session"
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client"
import type { ListingImage } from "@/lib/types"

export type AnalyzeUploadResult = {
  url: string
  path: string
  bytes?: number
  storage: "supabase" | "staging" | string
  index: number
  via: "browser" | "api"
}

const UPLOAD_CONCURRENCY = 6

function randomToken(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 12)
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

async function uploadAnalyzeCopyViaBrowser(input: {
  blob: Blob
  bytes: number
  userId: string
  index: number
}): Promise<AnalyzeUploadResult> {
  const diagnosis = diagnoseBrowserStorageConfig()
  if (!diagnosis.ok || !isSupabaseConfigured()) {
    throw new Error(
      diagnosis.reason ||
        "Browser Supabase Storage is not configured (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)."
    )
  }

  const bucket = listingImagesBucketName()
  const path = `${input.userId}/analyze/${Date.now()}-${input.index}-${randomToken()}.jpg`
  const supabase = createClient()
  const { error } = await supabase.storage.from(bucket).upload(path, input.blob, {
    contentType: "image/jpeg",
    upsert: false,
  })
  if (error) {
    console.error("[analyze-client] browser upload failed", {
      bucket,
      path,
      bytes: input.bytes,
      message: error.message,
      name: error.name,
    })
    throw new Error(
      `Browser upload to "${bucket}/${path}" failed: ${error.message}`
    )
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  if (!data.publicUrl) {
    throw new Error(
      `Browser upload succeeded but no public URL for "${bucket}/${path}".`
    )
  }

  console.info("[analyze-client] stored via browser", {
    path,
    url: data.publicUrl,
    bytes: input.bytes,
  })

  return {
    url: data.publicUrl,
    path,
    bytes: input.bytes,
    storage: "supabase",
    index: input.index,
    via: "browser",
  }
}

async function uploadAnalyzeCopyViaApi(input: {
  blob: Blob
  bytes: number
  index: number
}): Promise<AnalyzeUploadResult> {
  const formData = new FormData()
  formData.append("image", input.blob, `analyze-${input.index + 1}.jpg`)
  formData.append("index", String(input.index))

  const response = await fetch("/api/media/analyze-upload", {
    method: "POST",
    body: formData,
    credentials: "same-origin",
  })
  const parsed = await readApiJsonResponse<{
    error?: string
    code?: string
    url?: string
    path?: string
    bytes?: number
    storage?: string
    index?: number
    diagnosis?: unknown
  }>(response)
  if (!parsed.ok) {
    console.error("[analyze-client] API analyze-upload failed", {
      index: input.index,
      error: parsed.error,
      status: response.status,
    })
    throw new Error(
      `API analyze-upload failed: ${parsed.error}`
    )
  }
  if (!parsed.data.url || !parsed.data.path) {
    throw new Error(
      `API analyze-upload returned incomplete result (url=${Boolean(parsed.data.url)} path=${Boolean(parsed.data.path)}).`
    )
  }
  if (parsed.data.storage === "staging") {
    throw new Error(
      `API stored photo in temporary server memory (staging). Durable Supabase Storage is required — ${
        typeof parsed.data.diagnosis === "object" && parsed.data.diagnosis
          ? JSON.stringify(parsed.data.diagnosis)
          : "check SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL"
      }.`
    )
  }

  console.info("[analyze-client] stored via API", {
    path: parsed.data.path,
    url: parsed.data.url,
    bytes: parsed.data.bytes ?? input.bytes,
    storage: parsed.data.storage,
  })

  return {
    url: parsed.data.url,
    path: parsed.data.path,
    bytes: parsed.data.bytes ?? input.bytes,
    storage: parsed.data.storage || "supabase",
    index: input.index,
    via: "api",
  }
}

async function uploadOneAnalyzeCopy(input: {
  image: ListingImage
  index: number
  total: number
  userId: string
  onProgress?: (label: string) => void
}): Promise<AnalyzeUploadResult> {
  if (
    input.image.storageStatus !== "uploaded" ||
    !/^https?:\/\//i.test(input.image.url) ||
    /\/api\/media\/staging\//i.test(input.image.url)
  ) {
    throw new Error(
      `Photo ${input.index + 1} is not saved to cloud storage yet. Wait for Saved status, then analyze again.`
    )
  }

  input.onProgress?.(
    `Preparing analysis copy ${input.index + 1} of ${input.total}…`
  )

  // Temporary compressed copy only — original listing photo is not modified.
  const { blob, bytes } = await createAnalyzeCopyFromListingImage(input.image)

  input.onProgress?.(
    `Uploading analysis copy ${input.index + 1} of ${input.total} (${Math.round(bytes / 1024)}KB)…`
  )

  // Prefer browser → Supabase (same path as full-res originals). Fall back to API.
  try {
    return await uploadAnalyzeCopyViaBrowser({
      blob,
      bytes,
      userId: input.userId,
      index: input.index,
    })
  } catch (browserError) {
    const browserMessage =
      browserError instanceof Error ? browserError.message : "Browser upload failed"
    console.warn("[analyze-client] browser upload failed — trying API", {
      index: input.index,
      error: browserMessage,
    })
    try {
      return await uploadAnalyzeCopyViaApi({
        blob,
        bytes,
        index: input.index,
      })
    } catch (apiError) {
      const apiMessage =
        apiError instanceof Error ? apiError.message : "API upload failed"
      console.error("[analyze-client] both upload paths failed", {
        index: input.index,
        browserMessage,
        apiMessage,
      })
      throw new Error(
        `Photo ${input.index + 1} analysis upload failed. Browser: ${browserMessage}. API: ${apiMessage}`
      )
    }
  }
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const runners = Array.from(
    { length: Math.min(concurrency, Math.max(1, items.length)) },
    async () => {
      while (next < items.length) {
        const index = next
        next += 1
        results[index] = await worker(items[index], index)
      }
    }
  )
  await Promise.all(runners)
  return results
}

/**
 * Upload temporary analysis copies for every listing photo (never drops / never
 * replaces originals). Returns URL + path for each image in original order.
 * Does not call OpenAI — Analyze must wait until every row has a durable URL.
 */
export async function uploadAnalyzeImagesIndividually(input: {
  images: ListingImage[]
  userId: string
  /** @deprecated use `images` — kept for transition */
  dataUrls?: string[]
  onProgress?: (label: string) => void
}): Promise<AnalyzeUploadResult[]> {
  if (!input.userId?.trim()) {
    throw new Error("Sign in required to upload analysis copies.")
  }

  const images =
    input.images?.length > 0
      ? input.images
      : (input.dataUrls || []).map((url, index) => ({
          id: `tmp-${index}`,
          url,
          sortOrder: index,
          isPrimary: index === 0,
          storageStatus: /^https?:\/\//i.test(url)
            ? ("uploaded" as const)
            : ("pending" as const),
        }))

  if (images.length === 0) {
    throw new Error("Upload at least one product photo.")
  }

  if (!allListingImagesUploaded(images)) {
    throw new Error(
      "Every photo must finish uploading to cloud storage (Saved) before Analyze Photos can run."
    )
  }

  let completed = 0
  const uploaded = await mapPool(
    images,
    UPLOAD_CONCURRENCY,
    async (image, index) => {
      const result = await uploadOneAnalyzeCopy({
        image,
        index,
        total: images.length,
        userId: input.userId,
        onProgress: (label) => {
          input.onProgress?.(
            `${label} (${completed}/${images.length} done)`
          )
        },
      })
      if (!result.url || !result.path) {
        throw new Error(
          `Photo ${index + 1} upload returned no URL/path (url=${Boolean(result.url)} path=${Boolean(result.path)}).`
        )
      }
      completed += 1
      input.onProgress?.(
        `Uploaded ${completed} of ${images.length} analysis copies…`
      )
      return result
    }
  )

  console.info(
    "[analyze-client] all analysis copies ready",
    uploaded.map((row) => ({
      index: row.index,
      path: row.path,
      via: row.via,
      bytes: row.bytes,
      url: row.url,
    }))
  )

  return uploaded
}
