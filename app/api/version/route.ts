import { NextResponse } from "next/server"

/**
 * Public deploy identity for verifying which git commit production is serving.
 * Vercel injects VERCEL_GIT_COMMIT_SHA on every deployment.
 */
export async function GET() {
  const commit =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
    null

  return NextResponse.json(
    {
      commit,
      shortSha: commit ? commit.slice(0, 7) : null,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  )
}
