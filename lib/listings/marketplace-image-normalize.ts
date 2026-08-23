/**
 * eBay/marketplace derivative only. ListWise originals are never mutated.
 *
 * Bake the pixels that ListWise already displays (browser honors EXIF) into
 * a fresh JPEG/PNG with Orientation 1 and no leftover orientation metadata,
 * so eBay cannot rotate the photo again. Do not guess 90/180/270 from
 * width/height — sharp.rotate() with no angle applies the file's EXIF the
 * same way an <img> does.
 *
 * Sharp is loaded lazily so a missing native binary cannot 500 the publish
 * route at module init.
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
  strategy: "passthrough" | "bake-display-pixels"
}

function orientationOf(
  jpegOrientation: ExifOrientation | null,
  metaOrientation: number | undefined
): ExifOrientation | 1 {
  if (jpegOrientation && jpegOrientation >= 1 && jpegOrientation <= 8) {
    return jpegOrientation
  }
  if (
    metaOrientation &&
    Number.isInteger(metaOrientation) &&
    metaOrientation >= 1 &&
    metaOrientation <= 8
  ) {
    return metaOrientation as ExifOrientation
  }
  return 1
}

export async function normalizeMarketplaceImage(
  input: Buffer,
  contentType = "image/jpeg"
): Promise<NormalizedMarketplaceImage> {
  const jpegOrientation = readJpegExifOrientation(input)
  const jpegSize = readJpegStoredSize(input)
  const fallback: NormalizedMarketplaceImage = {
    buffer: input,
    contentType,
    changed: false,
    orientationWas: jpegOrientation ?? 1,
    width: jpegSize?.width || 0,
    height: jpegSize?.height || 0,
    strategy: "passthrough",
  }

  try {
    const { default: sharp } = await import("sharp")
    const meta = await sharp(input, {
      failOn: "none",
      autoOrient: false,
    }).metadata()
    const orientationWas = orientationOf(jpegOrientation, meta.orientation)
    const preferPng = contentType.includes("png") || meta.format === "png"

    // No-argument rotate() applies EXIF like ListWise <img>, then the encode
    // drops metadata so eBay sees baked pixels with orientation 1.
    const bakeOptions = { failOn: "none" as const, autoOrient: false }
    const baked = preferPng
      ? await sharp(input, bakeOptions).rotate().png().toBuffer()
      : await sharp(input, bakeOptions)
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
      width: outMeta.width || jpegSize?.width || 0,
      height: outMeta.height || jpegSize?.height || 0,
      strategy: "bake-display-pixels",
    }
  } catch (error) {
    if ((jpegOrientation ?? 1) > 1) {
      const reason = error instanceof Error ? error.message : "bake failed"
      throw new Error(
        `Could not bake ListWise-preview pixels for eBay (${reason}).`
      )
    }
    return fallback
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
