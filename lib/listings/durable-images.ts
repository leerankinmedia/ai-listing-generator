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
    if (/^https?:\/\//i.test(image.url)) {
      out.push(image)
      continue
    }

    const original = getOriginalPhoto(image.id)
    if (!original) {
      // No session original (e.g. reloaded draft) — keep existing url as-is.
      out.push(image)
      continue
    }

    if (!isSupabaseConfigured()) {
      // IndexedDB mode: keep blob: URL for this session only.
      out.push(image)
      continue
    }

    onProgress?.(
      `Saving original photo ${index + 1} of ${images.length} at full quality…`
    )

    const supabase = createClient()
    const ext = extensionFor(original.contentType, original.fileName)
    const path = `${userId}/originals/${image.id}.${ext}`
    const bucket = listingImagesBucket()

    const { error } = await supabase.storage.from(bucket).upload(path, original.blob, {
      contentType: original.contentType || "image/jpeg",
      upsert: true,
    })
    if (error) {
      throw new Error(
        `Could not save full-resolution photo ${index + 1}: ${error.message}`
      )
    }

    const { data } = supabase.storage.from(bucket).getPublicUrl(path)
    if (!data.publicUrl) {
      throw new Error(
        `Full-resolution photo ${index + 1} uploaded but no public URL was returned.`
      )
    }

    out.push({
      ...image,
      url: data.publicUrl,
      storagePath: path,
    })
  }

  return out
}
