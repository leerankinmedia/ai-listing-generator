import "server-only"
import { createServiceRoleClient } from "@/lib/supabase/index"

export const LISTING_IMAGES_BUCKET = "listing-images"
/** 50MB — full-resolution phone photos for ListWise / eBay originals. */
export const LISTING_IMAGES_FILE_SIZE_LIMIT = 52_428_800
export const LISTING_IMAGES_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
] as const

export type StorageMigration007Result = {
  ok: boolean
  applied: boolean
  alreadyCurrent: boolean
  bucket: string
  before: {
    fileSizeLimit: number | null
    allowedMimeTypes: string[] | null
    public: boolean | null
  } | null
  after: {
    fileSizeLimit: number | null
    allowedMimeTypes: string[] | null
    public: boolean | null
  } | null
  error?: string
}

function mimeReady(types: string[] | null | undefined): boolean {
  if (!types || types.length === 0) return false
  const set = new Set(types.map((t) => t.toLowerCase()))
  return (
    set.has("image/jpeg") &&
    set.has("image/png") &&
    set.has("image/webp") &&
    set.has("image/heic") &&
    set.has("image/heif")
  )
}

function limitReady(limit: number | string | null | undefined): boolean {
  if (limit == null) return false
  const n = typeof limit === "number" ? limit : Number(limit)
  return Number.isFinite(n) && n >= LISTING_IMAGES_FILE_SIZE_LIMIT
}

/**
 * Apply migration 007 against production Supabase Storage (idempotent).
 * Equivalent to supabase/migrations/007_listing_images_full_resolution.sql
 * using the Storage management API + service role.
 */
export async function applyListingImagesStorageMigration007(): Promise<StorageMigration007Result> {
  const admin = createServiceRoleClient()
  if (!admin) {
    return {
      ok: false,
      applied: false,
      alreadyCurrent: false,
      bucket: LISTING_IMAGES_BUCKET,
      before: null,
      after: null,
      error: "SUPABASE_SERVICE_ROLE_KEY is not configured on this deployment.",
    }
  }

  const { data: before, error: getError } = await admin.storage.getBucket(
    LISTING_IMAGES_BUCKET
  )
  if (getError || !before) {
    return {
      ok: false,
      applied: false,
      alreadyCurrent: false,
      bucket: LISTING_IMAGES_BUCKET,
      before: null,
      after: null,
      error: getError?.message || "listing-images bucket not found.",
    }
  }

  const beforeView = {
    fileSizeLimit:
      before.file_size_limit == null ? null : Number(before.file_size_limit),
    allowedMimeTypes: before.allowed_mime_types ?? null,
    public: before.public ?? null,
  }

  if (limitReady(before.file_size_limit) && mimeReady(before.allowed_mime_types)) {
    return {
      ok: true,
      applied: false,
      alreadyCurrent: true,
      bucket: LISTING_IMAGES_BUCKET,
      before: beforeView,
      after: beforeView,
    }
  }

  const { error: updateError } = await admin.storage.updateBucket(
    LISTING_IMAGES_BUCKET,
    {
      public: true,
      fileSizeLimit: LISTING_IMAGES_FILE_SIZE_LIMIT,
      allowedMimeTypes: [...LISTING_IMAGES_ALLOWED_MIME_TYPES],
    }
  )
  if (updateError) {
    return {
      ok: false,
      applied: false,
      alreadyCurrent: false,
      bucket: LISTING_IMAGES_BUCKET,
      before: beforeView,
      after: null,
      error: updateError.message,
    }
  }

  const { data: after, error: verifyError } = await admin.storage.getBucket(
    LISTING_IMAGES_BUCKET
  )
  if (verifyError || !after) {
    return {
      ok: false,
      applied: true,
      alreadyCurrent: false,
      bucket: LISTING_IMAGES_BUCKET,
      before: beforeView,
      after: null,
      error:
        verifyError?.message ||
        "Bucket updated but verification read failed.",
    }
  }

  const afterView = {
    fileSizeLimit:
      after.file_size_limit == null ? null : Number(after.file_size_limit),
    allowedMimeTypes: after.allowed_mime_types ?? null,
    public: after.public ?? null,
  }

  const verified =
    limitReady(after.file_size_limit) && mimeReady(after.allowed_mime_types)

  return {
    ok: verified,
    applied: true,
    alreadyCurrent: false,
    bucket: LISTING_IMAGES_BUCKET,
    before: beforeView,
    after: afterView,
    error: verified
      ? undefined
      : "Bucket update did not reach the expected 50MB / HEIC-ready settings.",
  }
}
