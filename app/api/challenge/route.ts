import { NextResponse } from "next/server"
import {
  getChallengeForUser,
  mutateChallenge,
  type ChallengeAction,
} from "@/lib/challenge/store"
import { getServerAuthUser, isSupabaseConfigured } from "@/lib/supabase/index"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const user = await getServerAuthUser()
    if (!user?.id) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 })
    }
    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { error: "Supabase is not configured." },
        { status: 503 }
      )
    }

    const { view } = await getChallengeForUser(user.id)
    return NextResponse.json(
      { challenge: view },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (error) {
    console.error("[challenge] GET", error)
    const message =
      error instanceof Error ? error.message : "Could not load challenge."
    const missingTable =
      /listing_challenges|schema cache|does not exist/i.test(message)
    return NextResponse.json(
      {
        error: missingTable
          ? "Challenge table is missing. Run supabase/migrations/006_listing_challenge.sql."
          : message,
        code: missingTable ? "migration_required" : "challenge_error",
      },
      { status: missingTable ? 503 : 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const user = await getServerAuthUser()
    if (!user?.id) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 })
    }
    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { error: "Supabase is not configured." },
        { status: 503 }
      )
    }

    const body = (await request.json().catch(() => ({}))) as {
      action?: ChallengeAction
      timezone?: string
    }
    const action = body.action
    if (
      action !== "start" &&
      action !== "pause" &&
      action !== "resume" &&
      action !== "restart"
    ) {
      return NextResponse.json(
        { error: "action must be start, pause, resume, or restart." },
        { status: 400 }
      )
    }

    const timezone =
      typeof body.timezone === "string" && body.timezone.trim()
        ? body.timezone.trim()
        : "UTC"

    const view = await mutateChallenge(user.id, action, timezone)
    return NextResponse.json(
      { challenge: view },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (error) {
    console.error("[challenge] POST", error)
    const message =
      error instanceof Error ? error.message : "Could not update challenge."
    const missingTable =
      /listing_challenges|schema cache|does not exist/i.test(message)
    return NextResponse.json(
      {
        error: missingTable
          ? "Challenge table is missing. Run supabase/migrations/006_listing_challenge.sql."
          : message,
        code: missingTable ? "migration_required" : "challenge_error",
      },
      { status: missingTable ? 503 : 400 }
    )
  }
}
