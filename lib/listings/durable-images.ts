/**
 * Persist full-resolution listing originals to Supabase Storage (direct from
 * the browser — bypasses Vercel’s 4.5MB body limit). Analysis copies are never
 * used here.
 */
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

  // Bake the phone-gallery visual into pixels for every photo before the
  // permanent Supabase original is stored. Do not strip EXIF without baking.
  try {
    const { normalizeImageOrientation } = await import(
      "@/lib/listings/image-orientation"
    )
    const oriented = await normalizeImageOrientation(uploadBlob, fileName)
    uploadBlob = oriented.blob
    contentType = oriented.contentType
    fileName = oriented.fileName
  } catch {
    /* keep source blob */
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

  const out: ListingImage[] = []
  for (const [index, image] of images.entries()) {
    if (
      isDurableHttpUrl(image.url) &&
      (image.storageStatus === "uploaded" || image.storageStatus === undefined)
    ) {
      out.push({
        ...image,
        storageStatus: "uploaded",
        storageError: undefined,
      })
      continue
    }

    const original = getOriginalPhoto(image.id)
    if (!original && isDurableHttpUrl(image.url)) {
      out.push({
        ...image,
        storageStatus: "uploaded",
        storageError: undefined,
      })
      continue
    }

    if (!original) {
      // No session original (e.g. reloaded draft without durable URL).
      out.push({
        ...image,
        storageStatus: image.storageStatus ?? "error",
        storageError:
          image.storageError ||
          "Photo is missing from storage. Re-upload this photo.",
      })
      continue
    }

    if (!isSupabaseConfigured()) {
      throw new Error(
        "Supabase Storage is not configured. Photos cannot be saved permanently."
      )
    }

    onProgress?.(
      `Saving original photo ${index + 1} of ${images.length} at full quality…`
    )

    const uploaded = await uploadListingOriginalToStorage({
      imageId: image.id,
      userId,
      blob: original.blob,
      fileName: original.fileName,
      contentType: original.contentType,
    })

    out.push({
      ...image,
      url: uploaded.url,
      storagePath: uploaded.storagePath,
      storageStatus: "uploaded",
      storageError: undefined,
    })
  }

  return out
}
