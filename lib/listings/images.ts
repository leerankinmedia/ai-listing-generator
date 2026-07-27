import { ANALYZE_UPLOAD_MAX_BYTES } from "@/lib/listings/schema"

/** Display / save compression — keep decent quality in the UI. */
const MAX_DIMENSION = 1600
const JPEG_QUALITY = 0.82

/**
 * Vercel serverless request body limit is 4.5MB. Stay under that for
 * multipart Analyze Photos uploads so the platform does not return plain-text
 * "Request Entity Too Large" before our route can respond with JSON.
 */
export { ANALYZE_UPLOAD_MAX_BYTES }

const ANALYZE_PRESETS: Array<{ maxDimension: number; quality: number }> = [
  { maxDimension: 1280, quality: 0.72 },
  { maxDimension: 1100, quality: 0.64 },
  { maxDimension: 960, quality: 0.56 },
  { maxDimension: 800, quality: 0.5 },
  { maxDimension: 720, quality: 0.44 },
]

export async function fileToCompressedDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Could not process image")
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  return canvas.toDataURL("image/jpeg", JPEG_QUALITY)
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, data] = dataUrl.split(",")
  const mime = /data:(.*?);base64/.exec(header)?.[1] ?? "image/jpeg"
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

async function dataUrlToBitmap(dataUrl: string): Promise<ImageBitmap> {
  const blob = dataUrlToBlob(dataUrl)
  return createImageBitmap(blob)
}

async function compressBitmapToJpegBlob(
  bitmap: ImageBitmap,
  maxDimension: number,
  quality: number
): Promise<Blob> {
  const scale = Math.min(
    1,
    maxDimension / Math.max(bitmap.width, bitmap.height)
  )
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Could not process image for analysis upload.")
  ctx.drawImage(bitmap, 0, 0, width, height)

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (!result) {
          reject(new Error("Could not compress photo for analysis upload."))
          return
        }
        resolve(result)
      },
      "image/jpeg",
      quality
    )
  })
  return blob
}

/**
 * Build JPEG blobs for Analyze Photos upload.
 * Keeps every photo (never drops). Recompresses all together until the total
 * multipart payload fits under Vercel's request body limit.
 */
export async function buildAnalyzeUploadBlobs(
  dataUrls: string[],
  maxTotalBytes: number = ANALYZE_UPLOAD_MAX_BYTES
): Promise<{ blobs: Blob[]; totalBytes: number; presetIndex: number }> {
  if (dataUrls.length === 0) {
    throw new Error("Upload at least one product photo.")
  }

  const bitmaps = await Promise.all(dataUrls.map((url) => dataUrlToBitmap(url)))
  try {
    let lastBlobs: Blob[] = []
    let lastTotal = Number.POSITIVE_INFINITY
    let lastPreset = 0

    for (let presetIndex = 0; presetIndex < ANALYZE_PRESETS.length; presetIndex++) {
      const preset = ANALYZE_PRESETS[presetIndex]
      const blobs = await Promise.all(
        bitmaps.map((bitmap) =>
          compressBitmapToJpegBlob(bitmap, preset.maxDimension, preset.quality)
        )
      )
      const totalBytes = blobs.reduce((sum, blob) => sum + blob.size, 0)
      lastBlobs = blobs
      lastTotal = totalBytes
      lastPreset = presetIndex
      if (totalBytes <= maxTotalBytes) {
        return { blobs, totalBytes, presetIndex }
      }
    }

    throw new Error(
      `Photos are still too large to analyze together (${Math.ceil(lastTotal / (1024 * 1024))}MB after compression; limit ~${Math.floor(maxTotalBytes / (1024 * 1024))}MB). Try slightly smaller source photos — all ${dataUrls.length} will still be kept.`
    )
  } finally {
    for (const bitmap of bitmaps) bitmap.close()
  }
}

export function createImageId() {
  return `img_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}
