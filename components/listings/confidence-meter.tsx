"use client"

import { cn } from "@/lib/utils"

export function ConfidenceMeter({
  confidence,
  className,
  showLabel = true,
}: {
  confidence?: number
  className?: string
  showLabel?: boolean
}) {
  if (confidence == null || Number.isNaN(confidence)) return null
  const pct = Math.round(Math.max(0, Math.min(1, confidence)) * 100)
  const tone =
    pct >= 80 ? "bg-accent" : pct >= 55 ? "bg-amber-500" : "bg-rose-500"

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-secondary sm:w-20">
        <div
          className={cn("h-full rounded-full transition-all", tone)}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">
          {pct}%
        </span>
      )}
    </div>
  )
}
