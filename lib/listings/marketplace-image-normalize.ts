/**
 * Marketplace image path: pass the selected photo through unchanged.
 *
 * No rotate(), autoOrient(), EXIF bake, or EXIF strip. Cover and additional
 * photos share this path. Display matches the phone/file picker because the
 * original bytes (including any Orientation tag) are preserved.
 *
 * Sharp is loaded lazily and only for optional width/height metadata. A
 * missing native sharp binary must not fail the /api/listings/publish module
 * graph (that previously returned a Next.js HTML 500 page).
 */
import {
  readJpegExifOrientation,
  readJpegStoredSize,
  type ExifOrientation,
} from "@/lib/listings/exif-orientation"

export type NormalizedMarketplaceImage = {
  buffer: Buffer
  contentType: string
  changed: boolean
  orientationWas: ExifOrientation | 1
  width: number
  height: number
  strategy: "passthrough"
}

function contentTypeForFormat(
  format: string | undefined,
  fallback: string
): string {
  if (format === "png") return "image/png"
  if (format === "webp") return "image/webp"
  if (format === "jpeg" || format === "jpg") return "image/jpeg"
  return fallback.startsWith("image/") ? fallback : "image/jpeg"
}

export async function normalizeMarketplaceImage(
  input: Buffer,
  contentType = "image/jpeg"
): Promise<NormalizedMarketplaceImage> {
  const jpegOrientation = readJpegExifOrientation(input)
  const jpegSize = readJpegStoredSize(input)

  let width = jpegSize?.width || 0
  let height = jpegSize?.height || 0
  let format: string | undefined
  try {
    const { default: sharp } = await import("sharp")
    const meta = await sharp(input, { failOn: "none", autoOrient: false }).metadata()
    width = width || meta.width || 0
    height = height || meta.height || 0
    format = meta.format
  } catch {
    /* keep JPEG SOF size — never fail publish because sharp is unavailable */
  }

  return {
    buffer: input,
    contentType: contentTypeForFormat(format, contentType),
    changed: false,
    orientationWas: jpegOrientation ?? 1,
    width,
    height,
    strategy: "passthrough",
  }
}

export async function normalizeMarketplaceImages(
  images: Array<{ buffer: Buffer; contentType?: string }>
): Promise<NormalizedMarketplaceImage[]> {
  const out: NormalizedMarketplaceImage[] = []
  for (const image of images) {
    out.push(
      await normalizeMarketplaceImage(
        image.buffer,
        image.contentType || "image/jpeg"
      )
    )
  }
  return out
}

export function marketplaceImageToDataUrl(
  image: NormalizedMarketplaceImage
): string {
  return `data:${image.contentType};base64,${image.buffer.toString("base64")}`
}
