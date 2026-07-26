"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { Flame, Loader2 } from "lucide-react"
import type { ChallengeView } from "@/lib/challenge/progress"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * Compact horizontal challenge strip for Overview.
 * Continue always opens the dedicated Challenge page.
 */
export function ChallengeSummary() {
  const [challenge, setChallenge] = useState<ChallengeView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch("/api/challenge", {
        method: "GET",
        cache: "no-store",
        headers: { "Cache-Control": "no-store" },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Could not load challenge.")
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

  if (loading) {
    return (
      <section className="rounded-xl border border-border bg-card/80 px-3 py-2.5">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading challenge…
        </p>
      </section>
    )
  }

  if (!challenge) {
    return (
      <section className="rounded-xl border border-border bg-card/80 px-3 py-2.5">
        <p className="text-sm text-destructive" role="alert">
          {error || "Challenge unavailable."}
        </p>
      </section>
    )
  }

  const inactive = challenge.status === "inactive"
  const progressPct = Math.round(challenge.progress * 100)
  const goalLabel =
    challenge.day.type === "rest"
      ? "Rest"
      : challenge.day.type === "relist"
        ? `Relist ${challenge.dailyGoal}`
        : `List ${challenge.dailyGoal}`
  const progressLabel =
    challenge.day.type === "rest"
      ? challenge.day.completed
        ? "Done"
        : "Auto"
      : `${challenge.completedCount}/${challenge.dailyGoal}`

  return (
    <section
      id="challenge"
      className="animate-rise rounded-xl border border-border bg-card/80 px-3 py-2.5 sm:px-4 sm:py-3"
    >
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="text-sm font-semibold">
              {inactive
                ? "10-Day Challenge"
                : `Day ${challenge.currentDay}`}
              {!inactive && (
                <span className="font-normal text-muted-foreground">
                  {" "}
                  · {goalLabel}
                </span>
              )}
            </p>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <Flame className="h-3.5 w-3.5 text-accent" aria-hidden />
              {challenge.streak} streak
            </span>
            {!inactive && (
              <span className="text-xs text-muted-foreground">
                {progressLabel}
              </span>
            )}
          </div>
          {!inactive && (
            <div
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary"
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
          )}
          {inactive && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Start the cadence — progress syncs across devices.
            </p>
          )}
        </div>
        <Link
          href="/dashboard/challenge"
          className={cn(
            buttonVariants({ variant: "accent", size: "sm" }),
            "w-full shrink-0 sm:w-auto"
          )}
        >
          {inactive ? "Start" : "Continue"}
        </Link>
      </div>
    </section>
  )
}
