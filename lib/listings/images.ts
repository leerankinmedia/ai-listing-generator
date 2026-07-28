import { ANALYZE_UPLOAD_MAX_BYTES } from "@/lib/listings/schema"

/** Display / save compression — keep decent quality in the UI. */
const MAX_DIMENSION = 1600
const JPEG_QUALITY = 0.82

/**
 * Per-photo Analyze upload budget (under Vercel’s 4.5MB single-request limit).
 * Photos are uploaded one at a time; generate only receives URLs.
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
 * Compress one photo for a single Analyze upload request.
 * Never drops the photo — steps down quality/size until under the per-request budget.
 */
export async function compressDataUrlForAnalyzeUpload(
  dataUrl: string,
  maxBytes: number = ANALYZE_UPLOAD_MAX_BYTES
): Promise<{ blob: Blob; bytes: number; presetIndex: number }> {
  const bitmap = await dataUrlToBitmap(dataUrl)
  try {
    let lastBlob: Blob | null = null
    let lastPreset = 0
    for (let presetIndex = 0; presetIndex < ANALYZE_PRESETS.length; presetIndex++) {
      const preset = ANALYZE_PRESETS[presetIndex]
      const blob = await compressBitmapToJpegBlob(
        bitmap,
        preset.maxDimension,
        preset.quality
      )
      lastBlob = blob
      lastPreset = presetIndex
      if (blob.size <= maxBytes) {
        return { blob, bytes: blob.size, presetIndex }
      }
    }
    throw new Error(
      `Photo is still too large after compression (${Math.ceil((lastBlob?.size || 0) / (1024 * 1024))}MB; limit ${Math.floor(maxBytes / (1024 * 1024))}MB).`
    )
  } finally {
    bitmap.close()
  }
}

/**
 * @deprecated Prefer compressDataUrlForAnalyzeUpload + per-image uploads.
 * Kept for any callers that still batch-compress; does not drop images.
 */
export async function buildAnalyzeUploadBlobs(
  dataUrls: string[],
  maxBytesPerImage: number = ANALYZE_UPLOAD_MAX_BYTES
): Promise<{ blobs: Blob[]; totalBytes: number; presetIndex: number }> {
  if (dataUrls.length === 0) {
    throw new Error("Upload at least one product photo.")
  }
  const results = []
  let maxPreset = 0
  for (const url of dataUrls) {
    const result = await compressDataUrlForAnalyzeUpload(url, maxBytesPerImage)
    results.push(result)
    maxPreset = Math.max(maxPreset, result.presetIndex)
  }
  const blobs = results.map((r) => r.blob)
  const totalBytes = blobs.reduce((sum, blob) => sum + blob.size, 0)
  return { blobs, totalBytes, presetIndex: maxPreset }
}

export function createImageId() {
  return `img_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}
