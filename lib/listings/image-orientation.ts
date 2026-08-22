/**
 * Browser EXIF orientation bake-in for listing originals.
 *
 * createImageBitmap's default imageOrientation is not consistent across
 * browsers (none vs from-image). We parse JPEG EXIF ourselves, rotate/flip
 * pixels to the visual orientation the seller sees in <img>, then re-encode
 * so eBay never depends on the Orientation tag.
 *
 * Cover and additional photos share this exact path.
 */
import {
  applyExifOrientationToCanvas,
  jpegNeedsOrientationBake,
  readJpegExifOrientation,
  readJpegStoredSize,
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

function drawVisualBitmap(
  bitmap: ImageBitmap,
  orientation: number,
  decoderAlreadyOriented: boolean
): HTMLCanvasElement {
  const storedWidth = bitmap.width
  const storedHeight = bitmap.height
  const visual = decoderAlreadyOriented
    ? { width: storedWidth, height: storedHeight }
    : visualSizeForOrientation(storedWidth, storedHeight, orientation)

  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, visual.width)
  canvas.height = Math.max(1, visual.height)
  const ctx = canvas.getContext("2d")
  if (!ctx) {
    throw new Error("Could not create canvas for photo orientation")
  }

  if (!decoderAlreadyOriented && orientation > 1) {
    applyExifOrientationToCanvas(ctx, storedWidth, storedHeight, orientation)
  }
  ctx.drawImage(bitmap, 0, 0)
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

  const jpegOrientation = readJpegExifOrientation(bytes)
  const jpegSize = readJpegStoredSize(bytes)
  const isJpeg = Boolean(jpegSize)
  const isHeicLike =
    /heic|heif|avif/i.test(source.type || "") ||
    /\.hei[cf]$/i.test(fileName)

  // JPEG that is already visual: keep original bytes (no quality loss).
  if (isJpeg && !jpegNeedsOrientationBake(bytes)) {
    return passthrough
  }

  const raw = await tryCreateBitmap(source, "none")
  const fromImage =
    (await tryCreateBitmap(source, "from-image")) ||
    (await tryCreateBitmap(source))
  const bitmap = fromImage || raw
  if (!bitmap) {
    return passthrough
  }

  try {
    const orientation = jpegOrientation || 1
    const decoderAppliesExif = Boolean(
      raw &&
        fromImage &&
        (raw.width !== fromImage.width || raw.height !== fromImage.height)
    )
    const matchesStored =
      jpegSize &&
      bitmap.width === jpegSize.width &&
      bitmap.height === jpegSize.height
    const alreadyOriented = decoderAppliesExif || (Boolean(fromImage) && !matchesStored)

    const sourceBitmap =
      alreadyOriented && fromImage
        ? fromImage
        : raw && matchesStored
          ? raw
          : bitmap

    const canvas = drawVisualBitmap(
      sourceBitmap,
      orientation,
      alreadyOriented || (orientation === 1 && !isHeicLike)
    )
    const blob = await encodeCanvas(canvas, preferPng)
    closeBitmap(raw)
    if (fromImage && fromImage !== raw) closeBitmap(fromImage)

    return {
      blob,
      contentType: preferPng ? "image/png" : "image/jpeg",
      fileName: listingFileName(fileName, preferPng),
    }
  } catch {
    closeBitmap(raw)
    closeBitmap(fromImage)
    return passthrough
  }
}
