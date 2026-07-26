import {
  CHALLENGE_DAY_MS,
  CHALLENGE_SCHEDULE,
  CHALLENGE_TOTAL_DAYS,
  getChallengeDayDefinition,
  type ChallengeDayDefinition,
} from "@/lib/challenge/schedule"
import { countChallengeActivity } from "@/lib/challenge/activity"
import type { Listing } from "@/lib/types"

export type ChallengeStatus = "inactive" | "active" | "paused" | "completed"

export interface ChallengeDayState {
  completed: boolean
  count: number
  completedAt?: string | null
}

export type ChallengeDayStates = Record<string, ChallengeDayState>

export interface ChallengeRow {
  id: string
  user_id: string
  status: ChallengeStatus
  current_day: number
  started_at: string | null
  paused_at: string | null
  completed_at: string | null
  accumulated_pause_ms: number
  timezone: string
  streak: number
  longest_streak: number
  day_states: ChallengeDayStates
  created_at: string
  updated_at: string
}

export interface ChallengeDayView extends ChallengeDayDefinition {
  count: number
  completed: boolean
  isCurrent: boolean
  progress: number
  windowStart: string | null
  windowEnd: string | null
}

export interface ChallengeView {
  status: ChallengeStatus
  currentDay: number
  streak: number
  longestStreak: number
  startedAt: string | null
  pausedAt: string | null
  completedAt: string | null
  timezone: string
  dailyGoal: number
  completedCount: number
  progress: number
  day: ChallengeDayView
  days: ChallengeDayView[]
  continueHref: string
  continueLabel: string
}

function clampDay(day: number) {
  return Math.min(CHALLENGE_TOTAL_DAYS, Math.max(1, Math.floor(day)))
}

/** Effective active elapsed ms, excluding pause time. */
export function effectiveElapsedMs(
  row: Pick<ChallengeRow, "started_at" | "paused_at" | "accumulated_pause_ms">,
  nowMs: number
) {
  if (!row.started_at) return 0
  const started = new Date(row.started_at).getTime()
  if (!Number.isFinite(started)) return 0
  let paused = Number(row.accumulated_pause_ms) || 0
  if (row.paused_at) {
    const pauseStarted = new Date(row.paused_at).getTime()
    if (Number.isFinite(pauseStarted) && pauseStarted <= nowMs) {
      paused += nowMs - pauseStarted
    }
  }
  return Math.max(0, nowMs - started - paused)
}

export function resolveCurrentDay(
  row: Pick<
    ChallengeRow,
    "status" | "started_at" | "paused_at" | "accumulated_pause_ms" | "current_day"
  >,
  nowMs: number
) {
  if (row.status === "inactive" || !row.started_at) return 1
  if (row.status === "completed") return CHALLENGE_TOTAL_DAYS
  const elapsed = effectiveElapsedMs(row, nowMs)
  return clampDay(Math.floor(elapsed / CHALLENGE_DAY_MS) + 1)
}

export function dayWindow(
  row: Pick<ChallengeRow, "started_at" | "paused_at" | "accumulated_pause_ms">,
  day: number,
  nowMs: number
) {
  if (!row.started_at) {
    return { startMs: null as number | null, endMs: null as number | null }
  }
  const started = new Date(row.started_at).getTime()
  const pauseOffset = Number(row.accumulated_pause_ms) || 0
  // Day windows follow active time from start; while paused the clock freezes
  // so the current day's end is pushed out by the active pause.
  let activePause = 0
  if (row.paused_at) {
    const pauseStarted = new Date(row.paused_at).getTime()
    if (Number.isFinite(pauseStarted) && pauseStarted <= nowMs) {
      activePause = nowMs - pauseStarted
    }
  }
  const startMs = started + pauseOffset + activePause + (day - 1) * CHALLENGE_DAY_MS
  const endMs = startMs + CHALLENGE_DAY_MS
  return { startMs, endMs }
}

function computeStreak(dayStates: ChallengeDayStates, currentDay: number) {
  let streak = 0
  for (let day = 1; day <= currentDay; day += 1) {
    const state = dayStates[String(day)]
    const def = getChallengeDayDefinition(day)
    const done =
      Boolean(state?.completed) ||
      def.type === "rest" ||
      (typeof state?.count === "number" && state.count >= def.goal && def.goal > 0)
    if (done) streak += 1
    else if (day < currentDay) streak = 0
  }
  return streak
}

export function buildChallengeView(
  row: ChallengeRow | null,
  listings: Listing[],
  nowMs = Date.now()
): ChallengeView {
  if (!row || row.status === "inactive" || !row.started_at) {
    const days = CHALLENGE_SCHEDULE.map((def) => ({
      ...def,
      count: 0,
      completed: false,
      isCurrent: false,
      progress: 0,
      windowStart: null,
      windowEnd: null,
    }))
    return {
      status: "inactive",
      currentDay: 1,
      streak: 0,
      longestStreak: row?.longest_streak ?? 0,
      startedAt: null,
      pausedAt: null,
      completedAt: null,
      timezone: row?.timezone || "UTC",
      dailyGoal: CHALLENGE_SCHEDULE[0].goal,
      completedCount: 0,
      progress: 0,
      day: days[0],
      days,
      continueHref: "/dashboard/listings/new",
      continueLabel: "Start challenge",
    }
  }

  const currentDay = resolveCurrentDay(row, nowMs)
  const dayStates: ChallengeDayStates = { ...(row.day_states || {}) }

  const days: ChallengeDayView[] = CHALLENGE_SCHEDULE.map((def) => {
    const { startMs, endMs } = dayWindow(row, def.day, nowMs)
    const liveCount =
      startMs != null && endMs != null
        ? countChallengeActivity(listings, def.type, startMs, endMs)
        : 0
    const prev = dayStates[String(def.day)]
    const count = Math.max(liveCount, prev?.count ?? 0)
    const autoRest = def.type === "rest" && def.day <= currentDay
    const metGoal = def.type === "rest" ? autoRest : count >= def.goal
    const completed = Boolean(prev?.completed) || metGoal
    if (completed || count !== (prev?.count ?? 0)) {
      dayStates[String(def.day)] = {
        completed,
        count: def.type === "rest" && completed ? 0 : count,
        completedAt:
          completed
            ? prev?.completedAt || new Date(nowMs).toISOString()
            : prev?.completedAt ?? null,
      }
    }
    const progress =
      def.type === "rest"
        ? completed
          ? 1
          : 0
        : def.goal <= 0
          ? 0
          : Math.min(1, count / def.goal)

    return {
      ...def,
      count: def.type === "rest" ? (completed ? 1 : 0) : count,
      completed,
      isCurrent: def.day === currentDay,
      progress,
      windowStart: startMs != null ? new Date(startMs).toISOString() : null,
      windowEnd: endMs != null ? new Date(endMs).toISOString() : null,
    }
  })

  const streak = computeStreak(dayStates, currentDay)
  const longestStreak = Math.max(row.longest_streak || 0, streak)
  const current = days[currentDay - 1]
  const status: ChallengeStatus =
    row.status === "paused"
      ? "paused"
      : currentDay >= CHALLENGE_TOTAL_DAYS && current.completed
        ? "completed"
        : row.status === "completed"
          ? "completed"
          : "active"

  let continueHref = "/dashboard/listings/new"
  let continueLabel = "Continue challenge"
  if (status === "paused") {
    continueLabel = "Resume challenge"
    continueHref = "/dashboard"
  } else if (status === "completed") {
    continueLabel = "View challenge"
    continueHref = "/dashboard#challenge"
  } else if (current.type === "rest") {
    continueLabel = "Rest day"
    continueHref = "/dashboard#challenge"
  } else if (current.type === "relist") {
    continueHref = "/dashboard/listings"
    continueLabel = "Continue challenge"
  }

  return {
    status,
    currentDay,
    streak,
    longestStreak,
    startedAt: row.started_at,
    pausedAt: row.paused_at,
    completedAt:
      status === "completed"
        ? row.completed_at || new Date(nowMs).toISOString()
        : row.completed_at,
    timezone: row.timezone || "UTC",
    dailyGoal: current.goal,
    completedCount: current.type === "rest" ? (current.completed ? 1 : 0) : current.count,
    progress: current.progress,
    day: current,
    days,
    continueHref,
    continueLabel,
  }
}

/** Patch fields to persist after a progress sync. */
export function challengePersistencePatch(
  row: ChallengeRow,
  view: ChallengeView,
  nowMs = Date.now()
): Partial<ChallengeRow> {
  const dayStates: ChallengeDayStates = {}
  for (const day of view.days) {
    dayStates[String(day.day)] = {
      completed: day.completed,
      count: day.type === "rest" ? (day.completed ? 0 : 0) : day.count,
      completedAt: day.completed
        ? row.day_states?.[String(day.day)]?.completedAt ||
          new Date(nowMs).toISOString()
        : null,
    }
  }

  return {
    current_day: view.currentDay,
    streak: view.streak,
    longest_streak: view.longestStreak,
    day_states: dayStates,
    status: view.status,
    completed_at: view.completedAt,
    updated_at: new Date(nowMs).toISOString(),
  }
}
