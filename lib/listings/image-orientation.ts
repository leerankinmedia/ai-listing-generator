/**
 * Normalize EXIF orientation by decoding via createImageBitmap (applies
 * orientation in modern browsers) and re-encoding so eBay/gallery never
 * shows sideways photos.
 */

export async function normalizeImageOrientation(
  source: Blob,
  fileName = "photo.jpg"
): Promise<{ blob: Blob; contentType: string; fileName: string }> {
  if (typeof createImageBitmap !== "function") {
    return {
      blob: source,
      contentType: source.type || "image/jpeg",
      fileName,
    }
  }

  let bitmap: ImageBitmap
  try {
    // imageOrientation: 'from-image' is default in Chromium — applies EXIF.
    bitmap = await createImageBitmap(source)
  } catch {
    return {
      blob: source,
      contentType: source.type || "image/jpeg",
      fileName,
    }
  }

  try {
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, bitmap.width)
    canvas.height = Math.max(1, bitmap.height)
    const ctx = canvas.getContext("2d")
    if (!ctx) {
      bitmap.close()
      return {
        blob: source,
        contentType: source.type || "image/jpeg",
        fileName,
      }
    }
    ctx.drawImage(bitmap, 0, 0)
    bitmap.close()

    const preferPng = (source.type || "").includes("png")
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("orientation encode failed"))),
        preferPng ? "image/png" : "image/jpeg",
        preferPng ? undefined : 0.95
      )
    })

    const ext = preferPng ? "png" : "jpg"
    const base = fileName.replace(/\.[^.]+$/, "") || "photo"
    return {
      blob,
      contentType: preferPng ? "image/png" : "image/jpeg",
      fileName: `${base}.${ext}`,
    }
  } catch {
    try {
      bitmap.close()
    } catch {
      /* ignore */
    }
    return {
      blob: source,
      contentType: source.type || "image/jpeg",
      fileName,
    }
  }
}
