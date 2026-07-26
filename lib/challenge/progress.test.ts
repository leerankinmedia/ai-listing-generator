import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  buildChallengeView,
  effectiveElapsedMs,
  resolveCurrentDay,
  type ChallengeRow,
} from "@/lib/challenge/progress"
import { CHALLENGE_DAY_MS } from "@/lib/challenge/schedule"

function row(partial: Partial<ChallengeRow> = {}): ChallengeRow {
  return {
    id: "c1",
    user_id: "u1",
    status: "active",
    current_day: 1,
    started_at: "2026-07-01T00:00:00.000Z",
    paused_at: null,
    completed_at: null,
    accumulated_pause_ms: 0,
    timezone: "UTC",
    streak: 0,
    longest_streak: 0,
    day_states: {},
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    ...partial,
  }
}

describe("challenge progress", () => {
  it("advances current day by active elapsed time", () => {
    const started = Date.parse("2026-07-01T00:00:00.000Z")
    const now = started + CHALLENGE_DAY_MS * 2 + 1000
    assert.equal(resolveCurrentDay(row(), now), 3)
  })

  it("freezes the clock while paused", () => {
    const started = Date.parse("2026-07-01T00:00:00.000Z")
    const pausedAt = started + CHALLENGE_DAY_MS / 2
    const now = pausedAt + CHALLENGE_DAY_MS * 5
    const elapsed = effectiveElapsedMs(
      row({ paused_at: new Date(pausedAt).toISOString() }),
      now
    )
    assert.ok(elapsed < CHALLENGE_DAY_MS)
    assert.equal(
      resolveCurrentDay(
        row({ status: "paused", paused_at: new Date(pausedAt).toISOString() }),
        now
      ),
      1
    )
  })

  it("auto-completes rest day when reached", () => {
    const started = Date.parse("2026-07-01T00:00:00.000Z")
    const now = started + CHALLENGE_DAY_MS * 9 + 1000
    const view = buildChallengeView(row(), [], now)
    assert.equal(view.currentDay, 10)
    assert.equal(view.day.type, "rest")
    assert.equal(view.day.completed, true)
    assert.equal(view.days[9].completed, true)
  })

  it("exposes the full 10-day schedule", () => {
    const view = buildChallengeView(null, [])
    assert.equal(view.days.length, 10)
    assert.equal(view.days[0].goal, 3)
    assert.equal(view.days[5].type, "relist")
    assert.equal(view.days[5].goal, 6)
    assert.equal(view.days[8].goal, 10)
    assert.equal(view.days[9].type, "rest")
  })
})
