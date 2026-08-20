import { NextResponse } from "next/server"
import { runStorageHealthCheck } from "@/lib/listings/storage-health"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Read-only deploy check for Analyze Photos storage.
 * Reports env presence and whether the listing-images bucket exists.
 * Never returns secret values.
 */
export async function GET() {
  const commit =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
    null
  const report = await runStorageHealthCheck()

  return NextResponse.json(
    {
      ok: report.ok,
      ready: report.ready,
      vercelEnv: process.env.VERCEL_ENV || null,
      commit: commit ? commit.slice(0, 7) : null,
      config: {
        hasUrl: report.config.hasUrl,
        hasPublishableKey: report.config.hasPublishableKey,
        hasServiceRoleKey: report.config.hasServiceRoleKey,
        urlHost: report.config.urlHost,
        bucket: report.config.bucket,
        missing: report.config.missing,
      },
      bucketExists: report.bucketExists,
      bucketPublic: report.bucketPublic,
      error: report.error,
    },
    {
      status: report.ok ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    }
  )
}
