import {
  ANALYZE_COPY_TARGET_MAX_BYTES,
  ANALYZE_UPLOAD_MAX_BYTES,
} from "@/lib/listings/schema"
import {
  getOriginalPhotoBlob,
  registerOriginalPhoto,
  releaseOriginalPhoto,
} from "@/lib/listings/original-photos"
import type { ListingImage } from "@/lib/types"

/** Display / listing originals are never downscaled for AI. */
export { ANALYZE_UPLOAD_MAX_BYTES, ANALYZE_COPY_TARGET_MAX_BYTES }

/** Analysis copies: longest side 1600–2000px, high JPEG quality, ~0.5–1MB. */
export const ANALYZE_TARGET_MAX_BYTES = ANALYZE_COPY_TARGET_MAX_BYTES
export const ANALYZE_TARGET_MIN_BYTES = 500 * 1024

/**
 * High-quality analysis presets. Prefer shrinking dimensions before crushing quality.
 * Longest side stays in the 1600–2000px range whenever possible.
 */
const ANALYZE_COPY_PRESETS: Array<{ maxDimension: number; quality: number }> = [
  { maxDimension: 2000, quality: 0.92 },
  { maxDimension: 1900, quality: 0.9 },
  { maxDimension: 1800, quality: 0.88 },
  { maxDimension: 1700, quality: 0.86 },
  { maxDimension: 1600, quality: 0.85 },
  { maxDimension: 1600, quality: 0.8 },
  { maxDimension: 1600, quality: 0.74 },
  { maxDimension: 1600, quality: 0.68 },
]

export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, data] = dataUrl.split(",")
  const mime = /data:(.*?);base64/.exec(header)?.[1] ?? "image/jpeg"
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

async function blobFromImageSource(
  image: Pick<ListingImage, "id" | "url">
): Promise<Blob> {
  const original = getOriginalPhotoBlob(image.id)
  if (original) return original

  if (image.url.startsWith("blob:") || /^https?:\/\//i.test(image.url)) {
    const response = await fetch(image.url)
    if (!response.ok) {
      throw new Error("Could not read listing photo for analysis.")
    }
    return await response.blob()
  }
  if (image.url.startsWith("data:")) {
    return dataUrlToBlob(image.url)
  }
  throw new Error("Unsupported listing photo source.")
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
  if (!ctx) throw new Error("Could not process image for analysis copy.")
  ctx.drawImage(bitmap, 0, 0, width, height)

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (!result) {
          reject(new Error("Could not create analysis JPEG copy."))
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
 * Create a temporary analysis JPEG from a full-resolution source blob.
 * Preserves aspect ratio. Does not mutate or replace the original.
 * Caller should discard the returned blob after uploading to the AI path.
 */
export async function createAnalyzeCopyFromBlob(
  source: Blob,
  targetMaxBytes: number = ANALYZE_TARGET_MAX_BYTES
): Promise<{ blob: Blob; bytes: number; presetIndex: number; widthHint: number }> {
  const bitmap = await createImageBitmap(source)
  try {
    let lastBlob: Blob | null = null
    let lastPreset = 0
    let lastWidth = 0

    for (let presetIndex = 0; presetIndex < ANALYZE_COPY_PRESETS.length; presetIndex++) {
      const preset = ANALYZE_COPY_PRESETS[presetIndex]
      const blob = await compressBitmapToJpegBlob(
        bitmap,
        preset.maxDimension,
        preset.quality
      )
      const scale = Math.min(
        1,
        preset.maxDimension / Math.max(bitmap.width, bitmap.height)
      )
      lastBlob = blob
      lastPreset = presetIndex
      lastWidth = Math.max(1, Math.round(bitmap.width * scale))

      if (blob.size <= targetMaxBytes) {
        return {
          blob,
          bytes: blob.size,
          presetIndex,
          widthHint: lastWidth,
        }
      }
    }

    if (lastBlob && lastBlob.size <= ANALYZE_UPLOAD_MAX_BYTES) {
      return {
        blob: lastBlob,
        bytes: lastBlob.size,
        presetIndex: lastPreset,
        widthHint: lastWidth,
      }
    }

    throw new Error(
      `Analysis copy is still too large (${Math.ceil((lastBlob?.size || 0) / (1024 * 1024))}MB).`
    )
  } finally {
    bitmap.close()
  }
}

/** Build a temporary analysis copy from a listing image's full-resolution original. */
export async function createAnalyzeCopyFromListingImage(
  image: Pick<ListingImage, "id" | "url">
): Promise<{ blob: Blob; bytes: number; presetIndex: number }> {
  const source = await blobFromImageSource(image)
  const copy = await createAnalyzeCopyFromBlob(source)
  return {
    blob: copy.blob,
    bytes: copy.bytes,
    presetIndex: copy.presetIndex,
  }
}

/**
 * Keep the full-resolution phone photo as the listing image.
 * Does not resize for AI — analysis creates a separate temporary copy later.
 */
export async function createListingImageFromFile(
  file: File,
  sortOrder: number,
  isPrimary: boolean
): Promise<ListingImage> {
  if (!file.type.startsWith("image/") && file.type !== "") {
    throw new Error("Please choose image files only.")
  }
  const id = createImageId()
  const { normalizeImageOrientation } = await import(
    "@/lib/listings/image-orientation"
  )
  const oriented = await normalizeImageOrientation(file, file.name || "photo.jpg")
  const objectUrl = registerOriginalPhoto(
    id,
    oriented.blob,
    oriented.fileName
  )
  return {
    id,
    url: objectUrl,
    sortOrder,
    isPrimary,
    storageStatus: "pending",
  }
}

export function removeListingImageOriginal(id: string) {
  releaseOriginalPhoto(id)
}

/**
 * @deprecated Uploader no longer compresses listing originals.
 * Kept for any legacy callers — returns a high-quality analysis-sized JPEG data URL only.
 */
export async function fileToCompressedDataUrl(file: File): Promise<string> {
  const { blob } = await createAnalyzeCopyFromBlob(file)
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ""))
    reader.onerror = () => reject(new Error("Could not read compressed photo."))
    reader.readAsDataURL(blob)
  })
}

/** @deprecated Prefer createAnalyzeCopyFromListingImage */
export async function compressDataUrlForAnalyzeUpload(
  dataUrl: string,
  maxBytes: number = ANALYZE_TARGET_MAX_BYTES
): Promise<{ blob: Blob; bytes: number; presetIndex: number }> {
  return createAnalyzeCopyFromBlob(dataUrlToBlob(dataUrl), maxBytes)
}

export async function buildAnalyzeUploadBlobs(
  dataUrls: string[],
  maxBytesPerImage: number = ANALYZE_TARGET_MAX_BYTES
): Promise<{ blobs: Blob[]; totalBytes: number; presetIndex: number }> {
  if (dataUrls.length === 0) {
    throw new Error("Upload at least one product photo.")
  }
  const results = []
  let maxPreset = 0
  for (const url of dataUrls) {
    const result = await createAnalyzeCopyFromBlob(
      dataUrlToBlob(url),
      maxBytesPerImage
    )
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
