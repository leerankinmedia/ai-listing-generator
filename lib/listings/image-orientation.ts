/**
 * Browser orientation bake-in for listing originals.
 *
 * ListWise previews photos with HTML `<img>`. Capture THAT painted result
 * (or the stored pixels when `<img>` does not change them) and persist it
 * with orientation=1. Never apply an extra EXIF canvas matrix on top of
 * createImageBitmap({ imageOrientation: 'from-image' }) — that second
 * transform is what rotated already-correct photos on eBay.
 *
 * Cover and additional photos share this exact path.
 */
import {
  jpegNeedsOrientationBake,
  readJpegExifOrientation,
  readJpegStoredSize,
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

function jpegBlobFromBytes(bytes: Uint8Array, fileName: string) {
  const copy = new Uint8Array(bytes)
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

  if (typeof document === "undefined") {
    return passthrough
  }

  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await source.arrayBuffer())
  } catch {
    return passthrough
  }

  const jpegOrientation = readJpegExifOrientation(bytes)
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

  const strategy = visualPixelStrategy({
    orientation: jpegOrientation || 1,
    stored: jpegSize,
    decodedIgnoringExif,
    decodedAsHtmlImage,
  })

  try {
    if (strategy.action === "passthrough" && !isHeicLike) {
      closeBitmap(raw)
      closeBitmap(fromImage)
      return passthrough
    }

    if (strategy.action === "keep-pixels-strip-exif" && jpegSize) {
      closeBitmap(raw)
      closeBitmap(fromImage)
      const stripped = stripJpegExifKeepPixels(bytes)
      return jpegBlobFromBytes(stripped, fileName)
    }

    // Display decoder already applied EXIF (size changed) OR HEIC: paint
    // the HTMLImageElement / from-image bitmap 1:1. No extra EXIF matrix.
    const displayWidth =
      decodedAsHtmlImage?.width || fromImage?.width || raw?.width || 0
    const displayHeight =
      decodedAsHtmlImage?.height || fromImage?.height || raw?.height || 0
    if (!displayWidth || !displayHeight) {
      closeBitmap(raw)
      closeBitmap(fromImage)
      return passthrough
    }

    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, displayWidth)
    canvas.height = Math.max(1, displayHeight)
    const ctx = canvas.getContext("2d")
    if (!ctx) {
      closeBitmap(raw)
      closeBitmap(fromImage)
      return passthrough
    }
    if (htmlImage) {
      ctx.drawImage(htmlImage, 0, 0)
    } else if (fromImage) {
      ctx.drawImage(fromImage, 0, 0)
    } else if (raw) {
      ctx.drawImage(raw, 0, 0)
    } else {
      closeBitmap(raw)
      closeBitmap(fromImage)
      return passthrough
    }
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
    if (jpegNeedsOrientationBake(bytes)) {
      const stripped = stripJpegExifKeepPixels(bytes)
      return jpegBlobFromBytes(stripped, fileName)
    }
    return passthrough
  }
}
