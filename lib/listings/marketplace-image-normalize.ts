/**
 * Server-side marketplace image normalization.
 *
 * Reads EXIF orientation, physically rotates/flips pixels into the visual
 * orientation the seller saw in ListWise, then encodes with orientation=1
 * (no remaining EXIF orientation dependency). Applied to every listing photo,
 * not just the cover.
 */
import sharp from "sharp"
import {
  readJpegExifOrientation,
  type ExifOrientation,
} from "@/lib/listings/exif-orientation"

export type NormalizedMarketplaceImage = {
  buffer: Buffer
  contentType: string
  changed: boolean
  orientationWas: ExifOrientation | 1
  width: number
  height: number
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

/**
 * Normalize one photo. Orientation 1 / missing EXIF is returned unchanged
 * to avoid a needless quality generation. Every other EXIF tag is baked
 * into pixels. Cover and additional photos use this same path.
 */
export async function normalizeMarketplaceImage(
  input: Buffer,
  contentType = "image/jpeg"
): Promise<NormalizedMarketplaceImage> {
  const jpegOrientation = readJpegExifOrientation(input)

  let meta: sharp.Metadata
  try {
    meta = await sharp(input, { failOn: "none" }).metadata()
  } catch {
    return {
      buffer: input,
      contentType,
      changed: false,
      orientationWas: jpegOrientation ?? 1,
      width: 0,
      height: 0,
    }
  }

  const orientationWas: ExifOrientation | 1 =
    jpegOrientation ??
    (meta.orientation && meta.orientation >= 1 && meta.orientation <= 8
      ? (meta.orientation as ExifOrientation)
      : 1)

  if (orientationWas === 1) {
    return {
      buffer: input,
      contentType: contentTypeForFormat(meta.format, contentType),
      changed: false,
      orientationWas,
      width: meta.width || 0,
      height: meta.height || 0,
    }
  }

  // sharp.rotate() with no args applies EXIF and strips the orientation tag.
  const preferPng = contentType.includes("png") || meta.format === "png"
  const rotated = sharp(input, { failOn: "none", sequentialRead: true }).rotate()
  const outBuffer = preferPng
    ? await rotated.png({ compressionLevel: 6 }).toBuffer()
    : await rotated
        .jpeg({
          quality: 95,
          chromaSubsampling: "4:4:4",
          mozjpeg: true,
        })
        .toBuffer()

  const outMeta = await sharp(outBuffer, { failOn: "none" }).metadata()
  return {
    buffer: outBuffer,
    contentType: preferPng ? "image/png" : "image/jpeg",
    changed: true,
    orientationWas,
    width: outMeta.width || 0,
    height: outMeta.height || 0,
  }
}

/** Same normalizer for every index — cover is not a special case. */
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
