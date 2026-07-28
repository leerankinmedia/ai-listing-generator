/**
 * Client helper: build temporary analysis copies, upload them individually,
 * then analyze by URL list. Full-resolution listing originals are untouched.
 */
import { readApiJsonResponse } from "@/lib/api/read-json-response"
import { createAnalyzeCopyFromListingImage } from "@/lib/listings/images"
import type { ListingImage } from "@/lib/types"

export type AnalyzeUploadResult = {
  url: string
  path?: string
  bytes?: number
  storage?: string
  index: number
}

const UPLOAD_CONCURRENCY = 3

async function uploadOneAnalyzeCopy(input: {
  image: ListingImage
  index: number
  total: number
  onProgress?: (label: string) => void
}): Promise<AnalyzeUploadResult> {
  input.onProgress?.(
    `Preparing analysis copy ${input.index + 1} of ${input.total}…`
  )

  // Temporary compressed copy only — original listing photo is not modified.
  const { blob, bytes } = await createAnalyzeCopyFromListingImage(input.image)

  input.onProgress?.(
    `Uploading analysis copy ${input.index + 1} of ${input.total} (${Math.round(bytes / 1024)}KB)…`
  )

  const formData = new FormData()
  formData.append("image", blob, `analyze-${input.index + 1}.jpg`)
  formData.append("index", String(input.index))

  try {
    const response = await fetch("/api/media/analyze-upload", {
      method: "POST",
      body: formData,
      credentials: "same-origin",
    })
    const parsed = await readApiJsonResponse<{
      error?: string
      url?: string
      path?: string
      bytes?: number
      storage?: string
      index?: number
    }>(response)
    if (!parsed.ok) {
      throw new Error(
        `Photo ${input.index + 1} analysis upload failed: ${parsed.error}`
      )
    }
    if (!parsed.data.url) {
      throw new Error(`Photo ${input.index + 1} analysis upload returned no URL.`)
    }
    return {
      url: parsed.data.url,
      path: parsed.data.path,
      bytes: parsed.data.bytes ?? bytes,
      storage: parsed.data.storage,
      index: input.index,
    }
  } finally {
    // Drop the temporary analysis blob reference ASAP (original stays in listing).
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
 * replaces originals). Returns analysis URLs in original order.
 */
export async function uploadAnalyzeImagesIndividually(input: {
  images: ListingImage[]
  /** @deprecated use `images` — kept for transition */
  dataUrls?: string[]
  onProgress?: (label: string) => void
}): Promise<string[]> {
  const images =
    input.images?.length > 0
      ? input.images
      : (input.dataUrls || []).map((url, index) => ({
          id: `tmp-${index}`,
          url,
          sortOrder: index,
          isPrimary: index === 0,
        }))

  if (images.length === 0) {
    throw new Error("Upload at least one product photo.")
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
        onProgress: (label) => {
          input.onProgress?.(
            `${label} (${completed}/${images.length} done)`
          )
        },
      })
      completed += 1
      input.onProgress?.(
        `Uploaded ${completed} of ${images.length} analysis copies…`
      )
      return result
    }
  )

  return uploaded.map((row) => row.url)
}
