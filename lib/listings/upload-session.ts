/**
 * Persist in-progress photo upload draft across page refresh.
 * Only durable https Supabase URLs are stored — never blob:/staging URLs.
 */
import type { ListingImage } from "@/lib/types"

const PREFIX = "listwise:upload-draft:v1:"

export type UploadSessionDraft = {
  images: ListingImage[]
  sellerNotes: string
  updatedAt: string
}

function storageKey(userId: string) {
  return `${PREFIX}${userId}`
}

function isDurableListingImageUrl(url: string): boolean {
  if (!/^https?:\/\//i.test(url)) return false
  if (/\/api\/media\/staging\//i.test(url)) return false
  return true
}

/** Keep only photos that already live in durable storage. */
export function durableImagesForSession(images: ListingImage[]): ListingImage[] {
  return images
    .filter(
      (img) =>
        (img.storageStatus === "uploaded" || img.storageStatus === undefined) &&
        isDurableListingImageUrl(img.url)
    )
    .map((img, index) => ({
      ...img,
      url: img.url,
      storagePath: img.storagePath,
      storageStatus: "uploaded" as const,
      storageError: undefined,
      sortOrder: index,
      isPrimary: index === 0,
    }))
}

export function readUploadSession(userId: string): UploadSessionDraft | null {
  if (typeof window === "undefined" || !userId) return null
  try {
    const raw = window.sessionStorage.getItem(storageKey(userId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as UploadSessionDraft
    if (!parsed || !Array.isArray(parsed.images)) return null
    const images = durableImagesForSession(parsed.images)
    if (images.length === 0) return null
    return {
      images,
      sellerNotes: typeof parsed.sellerNotes === "string" ? parsed.sellerNotes : "",
      updatedAt:
        typeof parsed.updatedAt === "string"
          ? parsed.updatedAt
          : new Date().toISOString(),
    }
  } catch {
    return null
  }
}

export function writeUploadSession(
  userId: string,
  draft: { images: ListingImage[]; sellerNotes?: string }
) {
  if (typeof window === "undefined" || !userId) return
  const images = durableImagesForSession(draft.images)
  if (images.length === 0) {
    clearUploadSession(userId)
    return
  }
  const payload: UploadSessionDraft = {
    images,
    sellerNotes: draft.sellerNotes ?? "",
    updatedAt: new Date().toISOString(),
  }
  try {
    window.sessionStorage.setItem(storageKey(userId), JSON.stringify(payload))
  } catch {
    // Quota / private mode — ignore; durable URLs still live in Supabase.
  }
}

export function clearUploadSession(userId: string) {
  if (typeof window === "undefined" || !userId) return
  try {
    window.sessionStorage.removeItem(storageKey(userId))
  } catch {
    /* ignore */
  }
}

/** Mark existing durable http(s) photos as uploaded (e.g. loaded from DB). */
export function normalizeListingImageStorage(
  images: ListingImage[]
): ListingImage[] {
  return images.map((img, index) => {
    if (isDurableListingImageUrl(img.url)) {
      return {
        ...img,
        storageStatus: "uploaded",
        storageError: undefined,
        sortOrder: img.sortOrder ?? index,
      }
    }
    return img
  })
}

export function allListingImagesUploaded(images: ListingImage[]): boolean {
  return (
    images.length > 0 &&
    images.every(
      (img) =>
        img.storageStatus === "uploaded" && isDurableListingImageUrl(img.url)
    )
  )
}

export function listingImagesStillUploading(images: ListingImage[]): boolean {
  return images.some(
    (img) =>
      img.storageStatus === "pending" || img.storageStatus === "uploading"
  )
}
