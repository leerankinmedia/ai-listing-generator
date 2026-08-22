/**
 * Browser orientation bake-in at initial upload.
 *
 * The phone gallery is the source of truth: it applies EXIF Orientation once.
 * ListWise preview must show those same pixels. The previous
 * keep-pixels-strip-exif path dropped the tag and left sensor pixels, so
 * jeans/tag photos appeared sideways immediately after upload.
 *
 * Cover and additional photos share this exact path.
 */
import {
  applyExifOrientationToCanvas,
  jpegNeedsOrientationBake,
  readJpegExifOrientation,
  readJpegStoredSize,
  visualPixelStrategy,
  visualSizeForOrientation,
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

async function tryCreateBitmap(
  source: Blob,
  imageOrientation?: "none" | "from-image"
): Promise<ImageBitmap | null> {
  if (typeof createImageBitmap !== "function") return null
  try {
    if (imageOrientation) {
      return await createImageBitmap(source, { imageOrientation })
    }
    return await createImageBitmap(source)
  } catch {
    return null
  }
}

function loadHtmlImage(source: Blob): Promise<HTMLImageElement | null> {
  if (typeof document === "undefined" || typeof Image === "undefined") {
    return Promise.resolve(null)
  }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(source)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    img.src = url
  })
}

function fingerprintCanvas(
  source: CanvasImageSource,
  width: number,
  height: number
): string {
  const canvas = document.createElement("canvas")
  canvas.width = 8
  canvas.height = 8
  const ctx = canvas.getContext("2d")
  if (!ctx) return ""
  ctx.drawImage(source, 0, 0, width, height, 0, 0, 8, 8)
  return canvas.toDataURL()
}

function drawDisplayPixels(
  source: CanvasImageSource,
  width: number,
  height: number
): HTMLCanvasElement {
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, width)
  canvas.height = Math.max(1, height)
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Could not create canvas for photo orientation")
  ctx.drawImage(source, 0, 0)
  return canvas
}

function drawApplyingExifOnce(
  source: CanvasImageSource,
  storedWidth: number,
  storedHeight: number,
  orientation: number
): HTMLCanvasElement {
  const visual = visualSizeForOrientation(storedWidth, storedHeight, orientation)
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, visual.width)
  canvas.height = Math.max(1, visual.height)
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Could not create canvas for photo orientation")
  if (orientation > 1) {
    applyExifOrientationToCanvas(ctx, storedWidth, storedHeight, orientation)
  }
  ctx.drawImage(source, 0, 0)
  return canvas
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

  if (typeof document === "undefined") {
    return passthrough
  }

  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await source.arrayBuffer())
  } catch {
    return passthrough
  }

  const jpegOrientation = readJpegExifOrientation(bytes) || 1
  const jpegSize = readJpegStoredSize(bytes)
  const isHeicLike =
    /heic|heif|avif/i.test(source.type || "") ||
    /\.hei[cf]$/i.test(fileName)

  const htmlImage = await loadHtmlImage(source)
  const raw = await tryCreateBitmap(source, "none")
  const fromImage =
    (await tryCreateBitmap(source, "from-image")) ||
    (await tryCreateBitmap(source))

  const decodedIgnoringExif = raw
    ? { width: raw.width, height: raw.height }
    : jpegSize
  const decodedAsHtmlImage = htmlImage
    ? { width: htmlImage.naturalWidth, height: htmlImage.naturalHeight }
    : fromImage
      ? { width: fromImage.width, height: fromImage.height }
      : null

  let displayPixelsDifferFromRaw = false
  if (
    jpegOrientation > 1 &&
    jpegOrientation <= 4 &&
    raw &&
    (fromImage || htmlImage) &&
    decodedIgnoringExif &&
    decodedAsHtmlImage &&
    decodedIgnoringExif.width === decodedAsHtmlImage.width &&
    decodedIgnoringExif.height === decodedAsHtmlImage.height
  ) {
    const rawFp = fingerprintCanvas(raw, raw.width, raw.height)
    const displayFp = htmlImage
      ? fingerprintCanvas(
          htmlImage,
          htmlImage.naturalWidth,
          htmlImage.naturalHeight
        )
      : fromImage
        ? fingerprintCanvas(fromImage, fromImage.width, fromImage.height)
        : rawFp
    displayPixelsDifferFromRaw = Boolean(rawFp && displayFp && rawFp !== displayFp)
  }

  const strategy = visualPixelStrategy({
    orientation: jpegOrientation,
    stored: jpegSize,
    decodedIgnoringExif,
    decodedAsHtmlImage,
    displayPixelsDifferFromRaw,
  })

  try {
    if (strategy.action === "passthrough" && !isHeicLike) {
      closeBitmap(raw)
      closeBitmap(fromImage)
      return passthrough
    }

    if (strategy.action === "apply-exif-once") {
      const storedWidth = raw?.width || jpegSize?.width || 0
      const storedHeight = raw?.height || jpegSize?.height || 0
      const rawSource = raw || fromImage || htmlImage
      if (!rawSource || !storedWidth || !storedHeight) {
        closeBitmap(raw)
        closeBitmap(fromImage)
        return passthrough
      }
      const canvas = drawApplyingExifOnce(
        rawSource,
        storedWidth,
        storedHeight,
        jpegOrientation
      )
      const blob = await encodeCanvas(canvas, preferPng)
      closeBitmap(raw)
      closeBitmap(fromImage)
      return {
        blob,
        contentType: preferPng ? "image/png" : "image/jpeg",
        fileName: listingFileName(fileName, preferPng),
      }
    }

    const displaySource = htmlImage || fromImage || raw
    const displayWidth =
      decodedAsHtmlImage?.width || fromImage?.width || raw?.width || 0
    const displayHeight =
      decodedAsHtmlImage?.height || fromImage?.height || raw?.height || 0
    if (!displaySource || !displayWidth || !displayHeight) {
      closeBitmap(raw)
      closeBitmap(fromImage)
      return passthrough
    }

    const canvas = drawDisplayPixels(displaySource, displayWidth, displayHeight)
    const blob = await encodeCanvas(canvas, preferPng)
    closeBitmap(raw)
    closeBitmap(fromImage)
    return {
      blob,
      contentType: preferPng ? "image/png" : "image/jpeg",
      fileName: listingFileName(fileName, preferPng),
    }
  } catch {
    closeBitmap(raw)
    closeBitmap(fromImage)
    if (jpegNeedsOrientationBake(bytes) && jpegSize) {
      const rawSource = raw || fromImage || htmlImage
      if (rawSource) {
        try {
          const canvas = drawApplyingExifOnce(
            rawSource,
            jpegSize.width,
            jpegSize.height,
            jpegOrientation
          )
          const blob = await encodeCanvas(canvas, preferPng)
          return {
            blob,
            contentType: preferPng ? "image/png" : "image/jpeg",
            fileName: listingFileName(fileName, preferPng),
          }
        } catch {
          /* fall through */
        }
      }
    }
    return passthrough
  }
}
