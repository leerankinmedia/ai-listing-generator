import "server-only"
import {
  buildChallengeView,
  challengePersistencePatch,
  type ChallengeRow,
  type ChallengeStatus,
  type ChallengeView,
} from "@/lib/challenge/progress"
import { listSupabaseListingsServer } from "@/lib/listings/supabase-repo"
import {
  createServerSupabase,
  createServiceRoleClient,
  isSupabaseConfigured,
} from "@/lib/supabase/index"

type SupabaseLike = {
  from: (table: string) => any
}

function emptyRow(userId: string, timezone = "UTC"): ChallengeRow {
  const now = new Date().toISOString()
  return {
    id: "",
    user_id: userId,
    status: "inactive",
    current_day: 1,
    started_at: null,
    paused_at: null,
    completed_at: null,
    accumulated_pause_ms: 0,
    timezone,
    streak: 0,
    longest_streak: 0,
    day_states: {},
    created_at: now,
    updated_at: now,
  }
}

function normalizeRow(data: Record<string, unknown>, userId: string): ChallengeRow {
  return {
    id: String(data.id || ""),
    user_id: String(data.user_id || userId),
    status: (data.status as ChallengeStatus) || "inactive",
    current_day: Number(data.current_day) || 1,
    started_at: (data.started_at as string | null) ?? null,
    paused_at: (data.paused_at as string | null) ?? null,
    completed_at: (data.completed_at as string | null) ?? null,
    accumulated_pause_ms: Number(data.accumulated_pause_ms) || 0,
    timezone: String(data.timezone || "UTC"),
    streak: Number(data.streak) || 0,
    longest_streak: Number(data.longest_streak) || 0,
    day_states:
      data.day_states && typeof data.day_states === "object"
        ? (data.day_states as ChallengeRow["day_states"])
        : {},
    created_at: String(data.created_at || new Date().toISOString()),
    updated_at: String(data.updated_at || new Date().toISOString()),
  }
}

async function readRow(
  supabase: SupabaseLike,
  userId: string
): Promise<ChallengeRow | null> {
  const { data, error } = await supabase
    .from("listing_challenges")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return normalizeRow(data as Record<string, unknown>, userId)
}

async function writeRow(
  supabase: SupabaseLike,
  userId: string,
  patch: Partial<ChallengeRow>
): Promise<ChallengeRow> {
  const payload: Record<string, unknown> = {
    user_id: userId,
    ...patch,
    updated_at: new Date().toISOString(),
  }
  if (!payload.id) delete payload.id
  const { data, error } = await supabase
    .from("listing_challenges")
    .upsert(payload, { onConflict: "user_id" })
    .select("*")
    .single()
  if (error) throw error
  return normalizeRow(data as Record<string, unknown>, userId)
}

async function loadListings(userId: string) {
  if (!isSupabaseConfigured()) return []
  try {
    const supabase = await createServerSupabase()
    return await listSupabaseListingsServer(supabase, userId)
  } catch (error) {
    console.error("[challenge] listings load failed", error)
    // Fall back to service role read if cookie client fails.
    const admin = createServiceRoleClient()
    if (!admin) return []
    return await listSupabaseListingsServer(admin, userId)
  }
}

export async function getChallengeForUser(
  userId: string,
  nowMs = Date.now()
): Promise<{ view: ChallengeView; row: ChallengeRow | null }> {
  if (!isSupabaseConfigured()) {
    return { view: buildChallengeView(null, [], nowMs), row: null }
  }
  const supabase = await createServerSupabase()
  let row = await readRow(supabase, userId)
  const listings = await loadListings(userId)
  const view = buildChallengeView(row, listings, nowMs)

  if (row && (row.status === "active" || row.status === "paused" || row.status === "completed")) {
    const patch = challengePersistencePatch(row, view, nowMs)
    const changed =
      patch.current_day !== row.current_day ||
      patch.streak !== row.streak ||
      patch.status !== row.status ||
      JSON.stringify(patch.day_states) !== JSON.stringify(row.day_states)
    if (changed) {
      row = await writeRow(supabase, userId, patch)
    }
  }

  return { view: buildChallengeView(row, listings, nowMs), row }
}

export type ChallengeAction = "start" | "pause" | "resume" | "restart"

export async function mutateChallenge(
  userId: string,
  action: ChallengeAction,
  timezone = "UTC",
  nowMs = Date.now()
): Promise<ChallengeView> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured.")
  }
  const supabase = await createServerSupabase()
  const existing = (await readRow(supabase, userId)) || emptyRow(userId, timezone)
  const nowIso = new Date(nowMs).toISOString()

  let next: Partial<ChallengeRow> = {}

  if (action === "start" || action === "restart") {
    next = {
      status: "active",
      current_day: 1,
      started_at: nowIso,
      paused_at: null,
      completed_at: null,
      accumulated_pause_ms: 0,
      timezone: timezone || existing.timezone || "UTC",
      streak: 0,
      longest_streak: action === "restart" ? existing.longest_streak : 0,
      day_states: {},
    }
  } else if (action === "pause") {
    if (existing.status !== "active") {
      throw new Error("Challenge is not active.")
    }
    next = {
      status: "paused",
      paused_at: nowIso,
    }
  } else if (action === "resume") {
    if (existing.status !== "paused") {
      throw new Error("Challenge is not paused.")
    }
    const pauseStarted = existing.paused_at
      ? new Date(existing.paused_at).getTime()
      : nowMs
    const added = Math.max(0, nowMs - pauseStarted)
    next = {
      status: "active",
      paused_at: null,
      accumulated_pause_ms: (existing.accumulated_pause_ms || 0) + added,
    }
  } else {
    throw new Error("Unknown challenge action.")
  }

  const saved = await writeRow(supabase, userId, {
    ...existing,
    ...next,
    id: existing.id || undefined,
  } as Partial<ChallengeRow>)

  const listings = await loadListings(userId)
  const view = buildChallengeView(saved, listings, nowMs)
  const patch = challengePersistencePatch(saved, view, nowMs)
  const synced = await writeRow(supabase, userId, patch)
  return buildChallengeView(synced, listings, nowMs)
}
