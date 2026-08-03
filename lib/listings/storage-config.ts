/**
 * Shared Supabase Storage configuration diagnostics for Analyze Photos.
 * Safe to import from client or server — never exposes secret values.
 */

export const DEFAULT_LISTING_IMAGES_BUCKET = "listing-images"
const PLACEHOLDER_URL = "https://your-project.supabase.co"

export type StorageConfigDiagnosis = {
  ok: boolean
  bucket: string
  hasUrl: boolean
  hasPublishableKey: boolean
  hasServiceRoleKey: boolean
  urlHost: string | null
  missing: string[]
  /** Human-readable summary of what is wrong (empty when ok). */
  reason: string | null
}

function trimEnv(value: string | undefined | null): string {
  return typeof value === "string" ? value.trim() : ""
}

export function listingImagesBucketName(): string {
  return (
    trimEnv(process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET) ||
    trimEnv(process.env.SUPABASE_STORAGE_BUCKET) ||
    DEFAULT_LISTING_IMAGES_BUCKET
  )
}

export function diagnoseSupabaseStorageConfig(options?: {
  /** When true, require SUPABASE_SERVICE_ROLE_KEY (server analyze-upload / health). */
  requireServiceRole?: boolean
}): StorageConfigDiagnosis {
  const requireServiceRole = options?.requireServiceRole !== false
  const url = trimEnv(process.env.NEXT_PUBLIC_SUPABASE_URL)
  const publishable = trimEnv(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  const serviceKey = trimEnv(process.env.SUPABASE_SERVICE_ROLE_KEY)
  const bucket = listingImagesBucketName()

  const hasUrl = Boolean(url && url !== PLACEHOLDER_URL)
  const hasPublishableKey = Boolean(publishable && publishable !== "your-publishable-key")
  const hasServiceRoleKey = Boolean(
    serviceKey &&
      serviceKey !== "your-secret-or-service-role-key" &&
      serviceKey.length > 20
  )

  const missing: string[] = []
  if (!hasUrl) missing.push("NEXT_PUBLIC_SUPABASE_URL")
  if (!hasPublishableKey) missing.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
  if (requireServiceRole && !hasServiceRoleKey) {
    missing.push("SUPABASE_SERVICE_ROLE_KEY")
  }

  let urlHost: string | null = null
  if (hasUrl) {
    try {
      urlHost = new URL(url).host
    } catch {
      missing.push("NEXT_PUBLIC_SUPABASE_URL (invalid URL)")
      urlHost = null
    }
  }

  const ok = missing.length === 0
  return {
    ok,
    bucket,
    hasUrl: hasUrl && urlHost !== null,
    hasPublishableKey,
    hasServiceRoleKey,
    urlHost,
    missing,
    reason: ok
      ? null
      : `Missing or invalid env: ${missing.join(", ")}. Bucket target: "${bucket}".`,
  }
}

/** Client Analyze path only needs URL + publishable key (RLS upload as signed-in user). */
export function diagnoseBrowserStorageConfig(): StorageConfigDiagnosis {
  return diagnoseSupabaseStorageConfig({ requireServiceRole: false })
}
