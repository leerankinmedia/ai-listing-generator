/**
 * Client helper: upload each photo individually, then analyze by URL list.
 */
import { readApiJsonResponse } from "@/lib/api/read-json-response"
import { compressDataUrlForAnalyzeUpload } from "@/lib/listings/images"

export type AnalyzeUploadResult = {
  url: string
  path?: string
  bytes?: number
  storage?: string
  index: number
}

const UPLOAD_CONCURRENCY = 3

async function uploadOneAnalyzeImage(input: {
  dataUrl: string
  index: number
  total: number
  onProgress?: (label: string) => void
}): Promise<AnalyzeUploadResult> {
  input.onProgress?.(
    `Compressing photo ${input.index + 1} of ${input.total}…`
  )
  const { blob, bytes } = await compressDataUrlForAnalyzeUpload(input.dataUrl)
  input.onProgress?.(
    `Uploading photo ${input.index + 1} of ${input.total} (${Math.round(bytes / 1024)}KB)…`
  )

  const formData = new FormData()
  formData.append("image", blob, `photo-${input.index + 1}.jpg`)
  formData.append("index", String(input.index))

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
      `Photo ${input.index + 1} upload failed: ${parsed.error}`
    )
  }
  if (!parsed.data.url) {
    throw new Error(`Photo ${input.index + 1} upload returned no URL.`)
  }
  return {
    url: parsed.data.url,
    path: parsed.data.path,
    bytes: parsed.data.bytes,
    storage: parsed.data.storage,
    index: input.index,
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
 * Upload every photo (never drop) via /api/media/analyze-upload.
 * Returns URLs in the original order for /api/listings/generate.
 */
export async function uploadAnalyzeImagesIndividually(input: {
  dataUrls: string[]
  onProgress?: (label: string) => void
}): Promise<string[]> {
  if (input.dataUrls.length === 0) {
    throw new Error("Upload at least one product photo.")
  }

  let completed = 0
  const uploaded = await mapPool(
    input.dataUrls,
    UPLOAD_CONCURRENCY,
    async (dataUrl, index) => {
      const result = await uploadOneAnalyzeImage({
        dataUrl,
        index,
        total: input.dataUrls.length,
        onProgress: (label) => {
          input.onProgress?.(
            `${label} (${completed}/${input.dataUrls.length} done)`
          )
        },
      })
      completed += 1
      input.onProgress?.(
        `Uploaded ${completed} of ${input.dataUrls.length} photos…`
      )
      return result
    }
  )

  return uploaded.map((row) => row.url)
}
