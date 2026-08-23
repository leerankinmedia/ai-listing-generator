/**
 * Persist full-resolution listing originals to Supabase Storage (direct from
 * the browser — bypasses Vercel’s 4.5MB body limit). Analysis copies are never
 * used here.
 */
import { mapPool } from "@/lib/async/map-pool"
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client"
import { getOriginalPhoto } from "@/lib/listings/original-photos"
import type { ListingImage } from "@/lib/types"

const DEFAULT_BUCKET = "listing-images"

function listingImagesBucket() {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET?.trim() ||
    process.env.SUPABASE_STORAGE_BUCKET?.trim() ||
    DEFAULT_BUCKET
  )
}

function extensionFor(contentType: string, fileName: string): string {
  const lower = fileName.toLowerCase()
  if (lower.endsWith(".png") || contentType.includes("png")) return "png"
  if (lower.endsWith(".webp") || contentType.includes("webp")) return "webp"
  if (lower.endsWith(".heic") || contentType.includes("heic")) return "heic"
  if (lower.endsWith(".heif") || contentType.includes("heif")) return "heif"
  return "jpg"
}

function isDurableHttpUrl(url: string): boolean {
  return (
    /^https?:\/\//i.test(url) && !/\/api\/media\/staging\//i.test(url)
  )
}

/**
 * Upload one full-resolution original to Supabase Storage and return its
 * permanent public URL. Call this immediately on photo select — before Analyze.
 */
export async function uploadListingOriginalToStorage(input: {
  imageId: string
  userId: string
  blob?: Blob
  fileName?: string
  contentType?: string
}): Promise<{ url: string; storagePath: string }> {
  if (!input.userId.trim()) {
    throw new Error("Sign in required to save photos to storage.")
  }
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase Storage is not configured. Photos cannot be saved permanently."
    )
  }

  const original = getOriginalPhoto(input.imageId)
  let uploadBlob = input.blob ?? original?.blob
  let contentType =
    input.contentType || original?.contentType || "image/jpeg"
  let fileName = input.fileName || original?.fileName || "photo.jpg"

  if (!uploadBlob) {
    throw new Error("No photo data available to upload.")
  }

  const supabase = createClient()
  const ext = extensionFor(contentType, fileName)
  const path = `${input.userId}/originals/${input.imageId}.${ext}`
  const bucket = listingImagesBucket()

  const { error } = await supabase.storage.from(bucket).upload(path, uploadBlob, {
    contentType,
    upsert: true,
  })
  if (error) {
    throw new Error(`Could not save full-resolution photo: ${error.message}`)
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  if (!data.publicUrl) {
    throw new Error(
      "Full-resolution photo uploaded but no public URL was returned."
    )
  }

  return { url: data.publicUrl, storagePath: path }
}

/**
 * Ensure listing images have durable http(s) URLs backed by full-resolution
 * originals when available. Leaves already-remote URLs untouched.
 */
export async function ensureDurableOriginalImageUrls(
  images: ListingImage[],
  userId: string,
  onProgress?: (label: string) => void
): Promise<ListingImage[]> {
  if (images.length === 0) return images

  const pending = images.filter((image) => {
    if (
      isDurableHttpUrl(image.url) &&
      (image.storageStatus === "uploaded" || image.storageStatus === undefined)
    ) {
      return false
    }
    const original = getOriginalPhoto(image.id)
    if (!original && isDurableHttpUrl(image.url)) return false
    return Boolean(original)
  })
  if (pending.length > 0) {
    onProgress?.(
      `Saving ${pending.length} original photo${pending.length === 1 ? "" : "s"} at full quality…`
    )
  }

  return mapPool(images, 3, async (image) => {
    if (
      isDurableHttpUrl(image.url) &&
      (image.storageStatus === "uploaded" || image.storageStatus === undefined)
    ) {
      return {
        ...image,
        storageStatus: "uploaded" as const,
        storageError: undefined,
      }
    }

    const original = getOriginalPhoto(image.id)
    if (!original && isDurableHttpUrl(image.url)) {
      return {
        ...image,
        storageStatus: "uploaded" as const,
        storageError: undefined,
      }
    }

    if (!original) {
      return {
        ...image,
        storageStatus: image.storageStatus ?? "error",
        storageError:
          image.storageError ||
          "Photo is missing from storage. Re-upload this photo.",
      }
    }

    if (!isSupabaseConfigured()) {
      throw new Error(
        "Supabase Storage is not configured. Photos cannot be saved permanently."
      )
    }

    const uploaded = await uploadListingOriginalToStorage({
      imageId: image.id,
      userId,
      blob: original.blob,
      fileName: original.fileName,
      contentType: original.contentType,
    })

    return {
      ...image,
      url: uploaded.url,
      storagePath: uploaded.storagePath,
      storageStatus: "uploaded" as const,
      storageError: undefined,
    }
  })
}
