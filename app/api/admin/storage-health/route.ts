import { NextResponse } from "next/server"
import { checkSubscriptionAccess } from "@/lib/billing/access"
import { runStorageHealthCheck } from "@/lib/listings/storage-health"
import { getServerAuthUser } from "@/lib/supabase/index"

export const runtime = "nodejs"
export const maxDuration = 30

/**
 * Founder Storage Health Check — upload, public read, delete against
 * the listing-images bucket. Uses SUPABASE_SERVICE_ROLE_KEY.
 */
export async function GET() {
  const user = await getServerAuthUser()
  if (!user?.id) {
    return NextResponse.json({ error: "Sign in required.", ok: false }, { status: 401 })
  }

  const access = await checkSubscriptionAccess(user.id, user.email)
  if (!access.entitlement.ownerOverride) {
    return NextResponse.json(
      { error: "Founder access required.", ok: false },
      { status: 403 }
    )
  }

  try {
    const report = await runStorageHealthCheck({ userId: user.id })
    console.info("[storage-health]", {
      ok: report.ok,
      totalMs: report.totalMs,
      steps: report.steps.map((s) => ({ step: s.step, ok: s.ok, detail: s.detail })),
      error: report.error,
      config: {
        hasUrl: report.config.hasUrl,
        hasServiceRoleKey: report.config.hasServiceRoleKey,
        hasPublishableKey: report.config.hasPublishableKey,
        bucket: report.config.bucket,
        urlHost: report.config.urlHost,
        missing: report.config.missing,
      },
    })
    return NextResponse.json(
      {
        ready: report.ok,
        ok: report.ok,
        config: report.config,
        steps: report.steps,
        uploadedPath: report.uploadedPath,
        publicUrl: report.publicUrl,
        error: report.error,
        totalMs: report.totalMs,
      },
      { status: report.ok ? 200 : 503 }
    )
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Storage health check failed."
    console.error("[storage-health] failed", error)
    return NextResponse.json(
      { ok: false, ready: false, error: message },
      { status: 500 }
    )
  }
}

export async function POST() {
  return GET()
}
