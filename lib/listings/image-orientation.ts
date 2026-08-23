/**
 * Identity. The selected File is authoritative.
 *
 * ListWise must not rotate, auto-orient, strip EXIF, or otherwise change
 * how the phone/file picker already displayed the photo.
 */
export async function normalizeImageOrientation(
  source: Blob,
  fileName = "photo.jpg"
): Promise<{ blob: Blob; contentType: string; fileName: string }> {
  return {
    blob: source,
    contentType: source.type || "image/jpeg",
    fileName,
  }
}
