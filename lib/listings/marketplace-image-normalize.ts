/**
 * Server-side marketplace image normalization.
 *
 * ListWise already shows the seller the stored pixels via `<img>`. The previous
 * `sharp.rotate()` pass applied EXIF *again* on publish, which rotated photos
 * that were already visually correct (stale Orientation tags on iOS JPEGs,
 * HEIC irot + EXIF, or a browser bake that left the tag).
 *
 * This path never rotates from EXIF and never rotates from width/height.
 * It only strips the Orientation tag so eBay displays the same pixels
 * ListWise showed. Cover and additional photos share this exact path.
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
  strategy: "passthrough" | "keep-pixels-strip-exif" | "use-display-pixels"
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

async function storedSize(
  input: Buffer,
  meta: sharp.Metadata
): Promise<{ width: number; height: number }> {
  const jpegSize = readJpegStoredSize(input)
  return {
    width: jpegSize?.width || meta.width || 0,
    height: jpegSize?.height || meta.height || 0,
  }
}

/**
 * Normalize one photo for eBay. Does not apply EXIF to pixels — that second
 * transform is what rotated the gallery relative to ListWise.
 */
export async function normalizeMarketplaceImage(
  input: Buffer,
  contentType = "image/jpeg"
): Promise<NormalizedMarketplaceImage> {
  const jpegOrientation = readJpegExifOrientation(input)

  let meta: sharp.Metadata
  try {
    meta = await sharp(input, { failOn: "none", autoOrient: false }).metadata()
  } catch {
    return {
      buffer: input,
      contentType,
      changed: false,
      orientationWas: jpegOrientation ?? 1,
      width: 0,
      height: 0,
      strategy: "passthrough",
    }
  }

  const size = await storedSize(input, meta)
  const orientationWas: ExifOrientation | 1 =
    jpegOrientation ??
    (meta.orientation && meta.orientation >= 1 && meta.orientation <= 8
      ? (meta.orientation as ExifOrientation)
      : 1)

  const strategy = visualPixelStrategy({
    orientation: orientationWas,
    stored: size,
    // Publish-time sharp is not the ListWise <img> decoder. Treat stored
    // pixels as already visual unless the client already baked a display
    // bitmap (orientation 1 / no EXIF).
    decodedIgnoringExif: size,
    decodedAsHtmlImage: size,
  })

  if (strategy.action === "passthrough") {
    return {
      buffer: input,
      contentType: contentTypeForFormat(meta.format, contentType),
      changed: false,
      orientationWas,
      width: size.width,
      height: size.height,
      strategy: strategy.action,
    }
  }

  if (meta.format === "jpeg" || meta.format === "jpg" || jpegOrientation) {
    const stripped = Buffer.from(stripJpegExifKeepPixels(input))
    return {
      buffer: stripped,
      contentType: "image/jpeg",
      changed: true,
      orientationWas,
      width: size.width,
      height: size.height,
      strategy: "keep-pixels-strip-exif",
    }
  }

  // Non-JPEG with a leftover orientation tag: re-encode pixels as stored
  // (autoOrient: false) so the tag cannot follow the file to eBay.
  const preferPng = contentType.includes("png") || meta.format === "png"
  const encoded = preferPng
    ? await sharp(input, { failOn: "none", autoOrient: false })
        .rotate(0)
        .png({ compressionLevel: 6 })
        .toBuffer()
    : await sharp(input, { failOn: "none", autoOrient: false })
        .rotate(0)
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
    width: outMeta.width || size.width,
    height: outMeta.height || size.height,
    strategy: "keep-pixels-strip-exif",
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
