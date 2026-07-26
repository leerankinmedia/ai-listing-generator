"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import {
  Check,
  Flame,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Target,
} from "lucide-react"
import type { ChallengeView } from "@/lib/challenge/progress"
import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

function timezoneOfBrowser() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    return "UTC"
  }
}

export function ListingChallengeCard() {
  const [challenge, setChallenge] = useState<ChallengeView | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDays, setShowDays] = useState(false)

  const refresh = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch("/api/challenge", {
        method: "GET",
        cache: "no-store",
        headers: { "Cache-Control": "no-store" },
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || "Could not load challenge.")
      }
      setChallenge(data.challenge as ChallengeView)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load challenge.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function runAction(action: "start" | "pause" | "resume" | "restart") {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, timezone: timezoneOfBrowser() }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || "Could not update challenge.")
      }
      setChallenge(data.challenge as ChallengeView)
      if (action === "start" || action === "restart") setShowDays(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update challenge.")
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <section
        id="challenge"
        className="scroll-mt-24 rounded-xl border border-border bg-card/80 p-4 backdrop-blur-sm sm:p-5"
      >
        <p className="text-sm text-muted-foreground">Loading challenge…</p>
      </section>
    )
  }

  if (!challenge) {
    return (
      <section
        id="challenge"
        className="scroll-mt-24 rounded-xl border border-border bg-card/80 p-4 backdrop-blur-sm sm:p-5"
      >
        <p className="text-sm text-destructive" role="alert">
          {error || "Challenge unavailable."}
        </p>
      </section>
    )
  }

  const inactive = challenge.status === "inactive"
  const paused = challenge.status === "paused"
  const completed = challenge.status === "completed"
  const progressPct = Math.round(challenge.progress * 100)
  const goalLabel =
    challenge.day.type === "rest"
      ? "Rest day"
      : challenge.day.type === "relist"
        ? `Relist ${challenge.dailyGoal}`
        : `List ${challenge.dailyGoal}`
  const countLabel =
    challenge.day.type === "rest"
      ? challenge.day.completed
        ? "Complete"
        : "Auto-completes today"
      : `${challenge.completedCount} / ${challenge.dailyGoal}`

  return (
    <section
      id="challenge"
      className="animate-rise scroll-mt-24 rounded-xl border border-border bg-card/80 p-4 backdrop-blur-sm sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-accent">
            10-Day Listing Challenge
          </p>
          <h2 className="mt-1 font-display text-xl font-semibold tracking-tight sm:text-2xl">
            {inactive
              ? "Build listing momentum"
              : completed
                ? "Challenge complete"
                : `Day ${challenge.currentDay} · ${challenge.day.title}`}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {inactive
              ? "List and relist on a proven 10-day cadence. Progress syncs to your account."
              : challenge.day.description}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-secondary/40 px-2.5 py-1.5 text-xs font-semibold">
          <Flame className="h-3.5 w-3.5 text-accent" aria-hidden />
          <span>{challenge.streak} day streak</span>
        </div>
      </div>

      {!inactive && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Daily goal
              </p>
              <p className="mt-0.5 text-sm font-semibold">{goalLabel}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Completed
              </p>
              <p className="mt-0.5 text-sm font-semibold">{countLabel}</p>
            </div>
          </div>

          <div
            className="h-2.5 overflow-hidden rounded-full bg-secondary"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPct}
            aria-label="Daily challenge progress"
          >
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          {paused && (
            <p className="text-xs text-muted-foreground">
              Challenge paused — the day timer is frozen until you resume.
            </p>
          )}
        </div>
      )}

      {error && (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {inactive ? (
          <Button
            variant="accent"
            className="w-full sm:w-auto"
            disabled={busy}
            onClick={() => void runAction("start")}
          >
            {busy ? <Loader2 className="animate-spin" /> : <Play />}
            Start challenge
          </Button>
        ) : (
          <>
            {paused ? (
              <Button
                variant="accent"
                className="w-full sm:w-auto"
                disabled={busy}
                onClick={() => void runAction("resume")}
              >
                {busy ? <Loader2 className="animate-spin" /> : <Play />}
                Resume challenge
              </Button>
            ) : (
              <Link
                href={challenge.continueHref}
                className={cn(
                  buttonVariants({ variant: "accent" }),
                  "w-full sm:w-auto"
                )}
              >
                <Target className="h-4 w-4" />
                {challenge.continueLabel}
              </Link>
            )}
            {challenge.status === "active" && (
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                disabled={busy}
                onClick={() => void runAction("pause")}
              >
                <Pause />
                Pause
              </Button>
            )}
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              disabled={busy}
              onClick={() => void runAction("restart")}
            >
              <RotateCcw />
              Restart
            </Button>
          </>
        )}
        <Button
          variant="ghost"
          className="w-full sm:w-auto"
          onClick={() => setShowDays((open) => !open)}
        >
          {showDays ? "Hide 10 days" : "View all 10 days"}
        </Button>
      </div>

      {showDays && (
        <ol className="mt-4 space-y-2 border-t border-border pt-4">
          {challenge.days.map((day) => (
            <li
              key={day.day}
              className={cn(
                "flex items-start gap-3 rounded-lg px-3 py-2.5",
                day.isCurrent
                  ? "border border-accent/30 bg-accent/10"
                  : "border border-transparent bg-secondary/30"
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  day.completed
                    ? "bg-accent text-accent-foreground"
                    : "border border-border text-muted-foreground"
                )}
              >
                {day.completed ? <Check className="h-3.5 w-3.5" /> : day.day}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">
                    Day {day.day}: {day.title}
                    {day.isCurrent ? (
                      <span className="ml-2 text-xs font-medium text-accent">
                        Today
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {day.type === "rest"
                      ? day.completed
                        ? "Done"
                        : "Auto"
                      : `${day.count}/${day.goal}`}
                  </p>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {day.description}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
