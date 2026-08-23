/**
 * Preserve selected-photo pixels on the server.
 *
 * Never auto-orient. Never sharp.rotate(). If a leftover EXIF Orientation
 * tag would make eBay disagree with ListWise, strip the tag without
 * changing pixels. Cover and additional photos share this path.
 */
import sharp from "sharp"
import {
  readJpegExifOrientation,
  readJpegStoredSize,
  stripJpegExifKeepPixels,
  visualPixelStrategy,
  type ExifOrientation,
} from "@/lib/listings/exif-orientation"

export type NormalizedMarketplaceImage = {
  buffer: Buffer
  contentType: string
  changed: boolean
  orientationWas: ExifOrientation | 1
  width: number
  height: number
  strategy: "passthrough" | "strip-exif-keep-pixels"
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

  let meta: sharp.Metadata
  try {
    meta = await sharp(input, { failOn: "none", autoOrient: false }).metadata()
  } catch {
    return {
      buffer: input,
      contentType,
      changed: false,
      orientationWas: jpegOrientation ?? 1,
      width: jpegSize?.width || 0,
      height: jpegSize?.height || 0,
      strategy: "passthrough",
    }
  }

  const stored = {
    width: jpegSize?.width || meta.width || 0,
    height: jpegSize?.height || meta.height || 0,
  }
  const orientationWas: ExifOrientation | 1 =
    jpegOrientation ??
    (meta.orientation && meta.orientation >= 1 && meta.orientation <= 8
      ? (meta.orientation as ExifOrientation)
      : 1)

  const strategy = visualPixelStrategy({
    orientation: orientationWas,
    stored,
    decodedIgnoringExif: stored,
  })

  if (strategy.action === "passthrough") {
    return {
      buffer: input,
      contentType: contentTypeForFormat(meta.format, contentType),
      changed: false,
      orientationWas,
      width: stored.width,
      height: stored.height,
      strategy: "passthrough",
    }
  }

  if (meta.format === "jpeg" || meta.format === "jpg" || jpegOrientation) {
    const stripped = Buffer.from(stripJpegExifKeepPixels(input))
    return {
      buffer: stripped,
      contentType: "image/jpeg",
      changed: true,
      orientationWas,
      width: stored.width,
      height: stored.height,
      strategy: "strip-exif-keep-pixels",
    }
  }

  const preferPng = contentType.includes("png") || meta.format === "png"
  const encoded = preferPng
    ? await sharp(input, { failOn: "none", autoOrient: false })
        .png({ compressionLevel: 6 })
        .toBuffer()
    : await sharp(input, { failOn: "none", autoOrient: false })
        .jpeg({
          quality: 95,
          chromaSubsampling: "4:4:4",
          mozjpeg: true,
        })
        .toBuffer()
  const outMeta = await sharp(encoded, {
    failOn: "none",
    autoOrient: false,
  }).metadata()
  return {
    buffer: encoded,
    contentType: preferPng ? "image/png" : "image/jpeg",
    changed: true,
    orientationWas,
    width: outMeta.width || stored.width,
    height: outMeta.height || stored.height,
    strategy: "strip-exif-keep-pixels",
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
