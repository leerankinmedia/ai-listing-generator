/**
 * In-memory full-resolution originals for the current browser session.
 * ListingImage.url may be a blob: object URL pointing at these blobs.
 * Analysis must create temporary compressed copies — never replace these.
 */

type OriginalPhotoEntry = {
  blob: Blob
  objectUrl: string
  fileName: string
  contentType: string
}

const originals = new Map<string, OriginalPhotoEntry>()

export function registerOriginalPhoto(
  id: string,
  file: Blob,
  fileName = "photo.jpg"
): string {
  const previous = originals.get(id)
  if (previous) URL.revokeObjectURL(previous.objectUrl)

  const contentType = file.type || "image/jpeg"
  const objectUrl = URL.createObjectURL(file)
  originals.set(id, {
    blob: file,
    objectUrl,
    fileName,
    contentType,
  })
  return objectUrl
}

export function getOriginalPhoto(id: string): OriginalPhotoEntry | null {
  return originals.get(id) ?? null
}

export function getOriginalPhotoBlob(id: string): Blob | null {
  return originals.get(id)?.blob ?? null
}

export function releaseOriginalPhoto(id: string) {
  const entry = originals.get(id)
  if (!entry) return
  URL.revokeObjectURL(entry.objectUrl)
  originals.delete(id)
}

export function releaseOriginalPhotos(ids: string[]) {
  for (const id of ids) releaseOriginalPhoto(id)
}
