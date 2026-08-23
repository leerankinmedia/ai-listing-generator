import { NextResponse } from "next/server"

export const runtime = "nodejs"

/**
 * Public deploy identity for verifying which git commit production is serving.
 * Vercel injects VERCEL_GIT_COMMIT_SHA on every deployment.
 */
export async function GET() {
  const commit =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
    null

  let sharp: { ok: true; versions: unknown } | { ok: false; error: string }
  try {
    const { default: sharpModule } = await import("sharp")
    sharp = { ok: true, versions: sharpModule.versions }
  } catch {
    sharp = {
      ok: false,
      error: "sharp native module failed to load",
    }
  }

  return NextResponse.json(
    {
      commit,
      shortSha: commit ? commit.slice(0, 7) : null,
      runtime: "nodejs",
      platform: process.platform,
      arch: process.arch,
      sharp,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  )
}
