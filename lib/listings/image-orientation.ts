/**
 * Preserve the selected File's visual orientation at upload.
 *
 * The phone-gallery File is authoritative. Strip leftover EXIF without
 * rotating pixels. Never apply an orientation matrix, never honor EXIF via
 * HTMLImage / createImageBitmap from-image, never call sharp.rotate(),
 * never rotate from width/height.
 *
 * HEIC/HEIF still need a JPEG encode: decode stored pixels 1:1
 * (imageOrientation: none) and draw without a transform.
 */
import {
  readJpegExifOrientation,
  stripJpegExifKeepPixels,
  visualPixelStrategy,
} from "@/lib/listings/exif-orientation"

function listingFileName(fileName: string, preferPng: boolean) {
  const ext = preferPng ? "png" : "jpg"
  const base = fileName.replace(/\.[^.]+$/, "") || "photo"
  return `${base}.${ext}`
}

async function encodeCanvas(
  canvas: HTMLCanvasElement,
  preferPng: boolean
): Promise<Blob> {
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("orientation encode failed"))),
      preferPng ? "image/png" : "image/jpeg",
      preferPng ? undefined : 0.95
    )
  })
}

function closeBitmap(bitmap: ImageBitmap | null | undefined) {
  if (!bitmap) return
  try {
    bitmap.close()
  } catch {
    /* ignore */
  }
}

async function tryCreateBitmapIgnoringExif(
  source: Blob
): Promise<ImageBitmap | null> {
  if (typeof createImageBitmap !== "function") return null
  try {
    return await createImageBitmap(source, { imageOrientation: "none" })
  } catch {
    try {
      return await createImageBitmap(source)
    } catch {
      return null
    }
  }
}

function drawStoredPixels(
  source: CanvasImageSource,
  width: number,
  height: number
): HTMLCanvasElement {
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, width)
  canvas.height = Math.max(1, height)
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Could not create canvas for photo encode")
  ctx.drawImage(source, 0, 0)
  return canvas
}

function jpegBlobFromStrippedPixels(
  bytes: Uint8Array,
  fileName: string
): { blob: Blob; contentType: string; fileName: string } {
  const stripped = stripJpegExifKeepPixels(bytes)
  const copy = new Uint8Array(stripped.byteLength)
  copy.set(stripped)
  return {
    blob: new Blob([copy], { type: "image/jpeg" }),
    contentType: "image/jpeg",
    fileName: listingFileName(fileName, false),
  }
}

export async function normalizeImageOrientation(
  source: Blob,
  fileName = "photo.jpg"
): Promise<{ blob: Blob; contentType: string; fileName: string }> {
  const preferPng = (source.type || "").includes("png")
  const passthrough = {
    blob: source,
    contentType: source.type || (preferPng ? "image/png" : "image/jpeg"),
    fileName,
  }

  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await source.arrayBuffer())
  } catch {
    return passthrough
  }

  const jpegOrientation = readJpegExifOrientation(bytes) || 1
  const isHeicLike =
    /heic|heif|avif/i.test(source.type || "") ||
    /\.hei[cf]$/i.test(fileName)

  const strategy = visualPixelStrategy({
    orientation: jpegOrientation,
  })

  if (!isHeicLike && strategy.action === "passthrough") {
    return passthrough
  }

  if (!isHeicLike && strategy.action === "strip-exif-keep-pixels") {
    return jpegBlobFromStrippedPixels(bytes, fileName)
  }

  if (typeof document === "undefined") {
    if (strategy.action === "strip-exif-keep-pixels") {
      return jpegBlobFromStrippedPixels(bytes, fileName)
    }
    return passthrough
  }

  // Format conversion only (HEIC/HEIF/AVIF). Do not apply EXIF.
  const bitmap = await tryCreateBitmapIgnoringExif(source)
  if (!bitmap) return passthrough
  try {
    const canvas = drawStoredPixels(bitmap, bitmap.width, bitmap.height)
    const blob = await encodeCanvas(canvas, preferPng)
    return {
      blob,
      contentType: preferPng ? "image/png" : "image/jpeg",
      fileName: listingFileName(fileName, preferPng),
    }
  } catch {
    return passthrough
  } finally {
    closeBitmap(bitmap)
  }
}
