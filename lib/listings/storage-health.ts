import "server-only"
import { createServiceRoleClient } from "@/lib/supabase/index"
import {
  diagnoseSupabaseStorageConfig,
  listingImagesBucketName,
  type StorageConfigDiagnosis,
} from "@/lib/listings/storage-config"

export type StorageHealthReport = {
  ok: boolean
  ready: boolean
  config: StorageConfigDiagnosis
  bucketExists: boolean | null
  bucketPublic: boolean | null
  error: string | null
}

/**
 * Read-only storage health: env presence + existing listing-images bucket.
 * Does not create buckets, upload, or delete objects.
 */
export async function runStorageHealthCheck(): Promise<StorageHealthReport> {
  const config = diagnoseSupabaseStorageConfig({ requireServiceRole: true })
  if (!config.ok) {
    return {
      ok: false,
      ready: false,
      config,
      bucketExists: null,
      bucketPublic: null,
      error: config.reason,
    }
  }

  const admin = createServiceRoleClient()
  if (!admin) {
    return {
      ok: false,
      ready: false,
      config,
      bucketExists: null,
      bucketPublic: null,
      error: "SUPABASE_SERVICE_ROLE_KEY is not usable on this host.",
    }
  }

  const bucket = listingImagesBucketName()
  const { data, error } = await admin.storage.getBucket(bucket)
  if (error || !data) {
    return {
      ok: false,
      ready: false,
      config,
      bucketExists: false,
      bucketPublic: null,
      error: error?.message || `Bucket "${bucket}" was not found.`,
    }
  }

  return {
    ok: true,
    ready: true,
    config,
    bucketExists: true,
    bucketPublic: data.public === true,
    error: null,
  }
}
