import { NextResponse } from "next/server"
import { applyListingImagesStorageMigration007 } from "@/lib/listings/apply-storage-migration-007"

export const runtime = "nodejs"
export const maxDuration = 30

/**
 * Apply + verify migration 007 (listing-images 50MB + HEIC) on production.
 * Idempotent. Uses SUPABASE_SERVICE_ROLE_KEY already configured on Vercel.
 */
export async function POST() {
  try {
    const result = await applyListingImagesStorageMigration007()
    console.info("[storage-migration-007]", result)
    return NextResponse.json(
      {
        migration: "007_listing_images_full_resolution",
        ...result,
        ready: result.ok,
      },
      { status: result.ok ? 200 : 500 }
    )
  } catch (error) {
    console.error("[storage-migration-007] failed", error)
    return NextResponse.json(
      {
        migration: "007_listing_images_full_resolution",
        ok: false,
        ready: false,
        error:
          error instanceof Error ? error.message : "Migration apply failed.",
      },
      { status: 500 }
    )
  }
}

export async function GET() {
  return POST()
}
