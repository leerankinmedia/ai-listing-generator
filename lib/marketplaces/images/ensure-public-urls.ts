import { createClient } from "@supabase/supabase-js"
import { mapPool } from "@/lib/async/map-pool"
import { MarketplaceError } from "@/lib/marketplaces/adapters/types"
import { getAppBaseUrl } from "@/lib/marketplaces/connections/crypto"
import {
  putStagingImage,
  type StagingImage,
} from "@/lib/marketplaces/images/staging-store"
import { getServerAuthUser } from "@/lib/supabase/index"

function parseDataUrl(dataUrl: string): StagingImage {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl)
  if (!match) {
    throw new MarketplaceError(
      "Invalid data-URL image. Re-upload photos and try again.",
      "image_invalid",
      400
    )
  }
  return {
    contentType: match[1],
    buffer: Buffer.from(match[2], "base64"),
  }
}

/** Bucket created by supabase/migrations/003_production_schema.sql */
export const DEFAULT_LISTING_IMAGES_BUCKET = "listing-images"

function listingImagesBucket() {
  return (
    process.env.SUPABASE_STORAGE_BUCKET?.trim() || DEFAULT_LISTING_IMAGES_BUCKET
  )
}

function supabaseStorageConfigured() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  // Service role is required for reliable public publish uploads (bypasses RLS).
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  return Boolean(
    url &&
      serviceKey &&
      url !== "https://your-project.supabase.co"
  )
}

async function uploadBufferToSupabase(
  buffer: Buffer,
  contentType: string,
  index: number
): Promise<string> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()
  const bucket = listingImagesBucket()
  const ext = contentType.includes("png")
    ? "png"
    : contentType.includes("webp")
      ? "webp"
      : "jpg"

  // Prefer service role (bypasses storage RLS). With anon key, path must be {userId}/...
  const user = serviceKey ? null : await getServerAuthUser()
  if (!serviceKey && !user) {
    throw new MarketplaceError(
      "Supabase storage upload requires SUPABASE_SERVICE_ROLE_KEY (or an authenticated session with NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).",
      "storage_auth_required",
      401
    )
  }
  if (!serviceKey && !anonKey) {
    throw new MarketplaceError(
      "Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY for authenticated storage uploads.",
      "storage_auth_required",
      401
    )
  }

  const folder = serviceKey ? "publish" : `${user!.id}/publish`
  const path = `${folder}/${Date.now()}-${index}.${ext}`
  const supabase = createClient(url, serviceKey || anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error } = await supabase.storage.from(bucket).upload(path, buffer, {
    contentType,
    upsert: false,
  })
  if (error) {
    throw new MarketplaceError(
      `Failed to upload image to storage bucket "${bucket}": ${error.message}`,
      "storage_upload_failed",
      502
    )
  }
  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  if (!data.publicUrl) {
    throw new MarketplaceError(
      `Storage upload succeeded but no public URL was returned. Ensure the "${bucket}" bucket is public.`,
      "storage_public_url_missing",
      502
    )
  }
  return data.publicUrl
}

async function uploadToSupabase(dataUrl: string, index: number): Promise<string> {
  const parsed = parseDataUrl(dataUrl)
  return uploadBufferToSupabase(parsed.buffer, parsed.contentType, index)
}

function stagingOrThrow(contentType: string, buffer: Buffer): string {
  const appUrl = getAppBaseUrl()
  if (
    appUrl.includes("localhost") ||
    appUrl.includes("127.0.0.1") ||
    !process.env.NEXT_PUBLIC_APP_URL
  ) {
    throw new MarketplaceError(
      "Marketplace publishing needs publicly reachable image URLs. Set SUPABASE_SERVICE_ROLE_KEY on Vercel (uses existing bucket listing-images from migration 003; optional override SUPABASE_STORAGE_BUCKET).",
      "public_images_required",
      400
    )
  }
  const id = putStagingImage({ contentType, buffer })
  return `${appUrl}/api/media/staging/${id}`
}

/**
 * Upload already-baked image buffers (no data-URL round trip).
 */
export async function ensurePublicImageBuffers(
  images: Array<{ buffer: Buffer; contentType: string }>
): Promise<string[]> {
  const out = await mapPool(images, 1, async (image, i) => {
    if (supabaseStorageConfigured()) {
      return uploadBufferToSupabase(image.buffer, image.contentType, i)
    }
    return stagingOrThrow(image.contentType, image.buffer)
  })
  if (out.length === 0) {
    throw new MarketplaceError(
      "At least one listing photo is required.",
      "images_required",
      400
    )
  }
  return out
}

/**
 * Ensure listing images are publicly fetchable http(s) URLs for marketplaces
 * that cannot accept data URLs (Vinted, Whatnot, eBay, etc.).
 *
 * Resolution order for data URLs:
 * 1. Supabase Storage bucket `listing-images` (migration 003) when service role is set
 * 2. Short-lived local staging served at /api/media/staging/:id
 */
export async function ensurePublicImageUrls(urls: string[]): Promise<string[]> {
  const out = await mapPool(urls, 1, async (url, i) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      return url
    }
    if (!url.startsWith("data:")) {
      throw new MarketplaceError(
        "Unsupported image source. Use http(s) URLs or uploaded photo data URLs.",
        "image_unsupported",
        400
      )
    }

    if (supabaseStorageConfigured()) {
      return uploadToSupabase(url, i)
    }

    const parsed = parseDataUrl(url)
    return stagingOrThrow(parsed.contentType, parsed.buffer)
  })

  if (out.length === 0) {
    throw new MarketplaceError(
      "At least one listing photo is required.",
      "images_required",
      400
    )
  }
  return out
}
