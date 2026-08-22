/**
 * Server-side bake of the phone-gallery visual, used when a JPEG still has
 * an Orientation tag (client bake skipped). After a successful upload bake,
 * orientation is 1 and this is a no-op — Generate/eBay must not rotate again.
 *
 * Phone galleries apply EXIF once. sharp.rotate() with no angle does the
 * same thing. We never rotate from width/height, and we never apply EXIF
 * twice (orientation 1 is passed through).
 */
import sharp from "sharp"
import {
  readJpegExifOrientation,
  readJpegStoredSize,
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
  strategy: "passthrough" | "apply-exif-once" | "use-display-pixels"
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
 * Bake phone-gallery pixels for one photo. Same path for cover and extras.
 */
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
    // Server has no HTML <img>. If the tag is still present, pixels are the
    // stored buffer and we apply EXIF once (phone gallery). If the client
    // already baked, orientation is 1 and we passthrough.
    decodedAsHtmlImage: stored,
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

  const preferPng = contentType.includes("png") || meta.format === "png"
  // apply-exif-once: sharp.rotate() with no angle = phone-gallery EXIF bake.
  const baked = preferPng
    ? await sharp(input, { failOn: "none", autoOrient: false })
        .rotate()
        .png({ compressionLevel: 6 })
        .toBuffer()
    : await sharp(input, { failOn: "none", autoOrient: false })
        .rotate()
        .jpeg({
          quality: 95,
          chromaSubsampling: "4:4:4",
          mozjpeg: true,
        })
        .toBuffer()

  const outMeta = await sharp(baked, {
    failOn: "none",
    autoOrient: false,
  }).metadata()
  return {
    buffer: baked,
    contentType: preferPng ? "image/png" : "image/jpeg",
    changed: true,
    orientationWas,
    width: outMeta.width || stored.width,
    height: outMeta.height || stored.height,
    strategy: "apply-exif-once",
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
