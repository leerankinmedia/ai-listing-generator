import "server-only"
import { randomBytes } from "crypto"
import {
  diagnoseSupabaseStorageConfig,
  listingImagesBucketName,
  type StorageConfigDiagnosis,
} from "@/lib/listings/storage-config"
import { createServiceRoleClient } from "@/lib/supabase/index"

export type StorageHealthStep = {
  step: "config" | "bucket" | "upload" | "read" | "delete"
  ok: boolean
  detail: string
  ms: number
}

export type StorageHealthReport = {
  ok: boolean
  config: StorageConfigDiagnosis
  steps: StorageHealthStep[]
  uploadedPath: string | null
  publicUrl: string | null
  error: string | null
  totalMs: number
}

async function ensureListingImagesBucket(
  admin: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  bucket: string
): Promise<{ ok: boolean; detail: string; created: boolean }> {
  const { data: existing, error: getError } = await admin.storage.getBucket(bucket)
  if (existing && !getError) {
    const isPublic = existing.public === true
    if (!isPublic) {
      const { error: updateError } = await admin.storage.updateBucket(bucket, {
        public: true,
      })
      if (updateError) {
        return {
          ok: false,
          created: false,
          detail: `Bucket "${bucket}" exists but is not public and could not be updated: ${updateError.message}`,
        }
      }
      return {
        ok: true,
        created: false,
        detail: `Bucket "${bucket}" exists; set public=true for Analyze Photos reads.`,
      }
    }
    return {
      ok: true,
      created: false,
      detail: `Bucket "${bucket}" exists (public=${String(existing.public)}).`,
    }
  }

  const { error: createError } = await admin.storage.createBucket(bucket, {
    public: true,
    fileSizeLimit: 52_428_800,
    allowedMimeTypes: [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "image/gif",
      "image/heic",
      "image/heif",
    ],
  })
  if (createError) {
    return {
      ok: false,
      created: false,
      detail:
        getError?.message ||
        createError.message ||
        `Bucket "${bucket}" not found and create failed.`,
    }
  }
  return {
    ok: true,
    created: true,
    detail: `Created public bucket "${bucket}".`,
  }
}

/**
 * Founder/ops Storage Health Check: verify env, bucket, upload, public read, delete.
 */
export async function runStorageHealthCheck(input?: {
  userId?: string
}): Promise<StorageHealthReport> {
  const started = Date.now()
  const steps: StorageHealthStep[] = []
  const config = diagnoseSupabaseStorageConfig({ requireServiceRole: true })
  const bucket = listingImagesBucketName()

  {
    const t0 = Date.now()
    steps.push({
      step: "config",
      ok: config.ok,
      detail: config.ok
        ? `URL host ${config.urlHost}; service role present; bucket "${bucket}".`
        : config.reason || "Storage env incomplete.",
      ms: Date.now() - t0,
    })
  }

  if (!config.ok) {
    return {
      ok: false,
      config,
      steps,
      uploadedPath: null,
      publicUrl: null,
      error: config.reason,
      totalMs: Date.now() - started,
    }
  }

  const admin = createServiceRoleClient()
  if (!admin) {
    const detail =
      "createServiceRoleClient() returned null despite env diagnosis ok — check SUPABASE_SERVICE_ROLE_KEY."
    steps.push({
      step: "bucket",
      ok: false,
      detail,
      ms: 0,
    })
    return {
      ok: false,
      config,
      steps,
      uploadedPath: null,
      publicUrl: null,
      error: detail,
      totalMs: Date.now() - started,
    }
  }

  {
    const t0 = Date.now()
    const ensured = await ensureListingImagesBucket(admin, bucket)
    steps.push({
      step: "bucket",
      ok: ensured.ok,
      detail: ensured.detail,
      ms: Date.now() - t0,
    })
    if (!ensured.ok) {
      return {
        ok: false,
        config,
        steps,
        uploadedPath: null,
        publicUrl: null,
        error: ensured.detail,
        totalMs: Date.now() - started,
      }
    }
  }

  const folder = input?.userId?.trim() || "health-check"
  const path = `${folder}/health-check/${Date.now()}-${randomBytes(4).toString("hex")}.txt`
  const payload = Buffer.from(
    `listwise-storage-health ${new Date().toISOString()}`,
    "utf8"
  )
  let publicUrl: string | null = null

  {
    const t0 = Date.now()
    const { error } = await admin.storage.from(bucket).upload(path, payload, {
      contentType: "text/plain",
      upsert: true,
    })
    if (error) {
      const detail = `Upload failed for "${bucket}/${path}": ${error.message}`
      steps.push({ step: "upload", ok: false, detail, ms: Date.now() - t0 })
      return {
        ok: false,
        config,
        steps,
        uploadedPath: path,
        publicUrl: null,
        error: detail,
        totalMs: Date.now() - started,
      }
    }
    const { data } = admin.storage.from(bucket).getPublicUrl(path)
    publicUrl = data.publicUrl || null
    steps.push({
      step: "upload",
      ok: true,
      detail: publicUrl
        ? `Uploaded "${path}" → ${publicUrl}`
        : `Uploaded "${path}" but public URL was empty.`,
      ms: Date.now() - t0,
    })
    if (!publicUrl) {
      return {
        ok: false,
        config,
        steps,
        uploadedPath: path,
        publicUrl: null,
        error: `Upload succeeded but getPublicUrl returned empty for bucket "${bucket}".`,
        totalMs: Date.now() - started,
      }
    }
  }

  {
    const t0 = Date.now()
    try {
      const response = await fetch(publicUrl, {
        method: "GET",
        cache: "no-store",
      })
      if (!response.ok) {
        const detail = `Public read failed HTTP ${response.status} for ${publicUrl}`
        steps.push({ step: "read", ok: false, detail, ms: Date.now() - t0 })
        // Still try delete below.
        const del = await admin.storage.from(bucket).remove([path])
        steps.push({
          step: "delete",
          ok: !del.error,
          detail: del.error
            ? `Cleanup delete failed: ${del.error.message}`
            : `Deleted health-check object "${path}".`,
          ms: 0,
        })
        return {
          ok: false,
          config,
          steps,
          uploadedPath: path,
          publicUrl,
          error: detail,
          totalMs: Date.now() - started,
        }
      }
      const body = await response.text()
      steps.push({
        step: "read",
        ok: body.includes("listwise-storage-health"),
        detail: body.includes("listwise-storage-health")
          ? `Public read OK (${body.length} bytes).`
          : `Public read returned unexpected body (${body.length} bytes).`,
        ms: Date.now() - t0,
      })
    } catch (err) {
      const detail =
        err instanceof Error
          ? `Public read threw: ${err.message}`
          : "Public read threw."
      steps.push({ step: "read", ok: false, detail, ms: Date.now() - t0 })
      await admin.storage.from(bucket).remove([path])
      return {
        ok: false,
        config,
        steps,
        uploadedPath: path,
        publicUrl,
        error: detail,
        totalMs: Date.now() - started,
      }
    }
  }

  {
    const t0 = Date.now()
    const { error } = await admin.storage.from(bucket).remove([path])
    const detail = error
      ? `Delete failed for "${path}": ${error.message}`
      : `Deleted health-check object "${path}".`
    steps.push({
      step: "delete",
      ok: !error,
      detail,
      ms: Date.now() - t0,
    })
    if (error) {
      return {
        ok: false,
        config,
        steps,
        uploadedPath: path,
        publicUrl,
        error: detail,
        totalMs: Date.now() - started,
      }
    }
  }

  return {
    ok: steps.every((s) => s.ok),
    config,
    steps,
    uploadedPath: path,
    publicUrl,
    error: null,
    totalMs: Date.now() - started,
  }
}

/** Ensure the listing-images bucket exists before analyze uploads (service role). */
export async function ensureAnalyzeStorageReady(): Promise<{
  ok: boolean
  bucket: string
  error?: string
  config: StorageConfigDiagnosis
}> {
  const config = diagnoseSupabaseStorageConfig({ requireServiceRole: true })
  const bucket = listingImagesBucketName()
  if (!config.ok) {
    return { ok: false, bucket, error: config.reason || undefined, config }
  }
  const admin = createServiceRoleClient()
  if (!admin) {
    return {
      ok: false,
      bucket,
      error: "SUPABASE_SERVICE_ROLE_KEY client could not be created.",
      config,
    }
  }
  const ensured = await ensureListingImagesBucket(admin, bucket)
  return {
    ok: ensured.ok,
    bucket,
    error: ensured.ok ? undefined : ensured.detail,
    config,
  }
}
