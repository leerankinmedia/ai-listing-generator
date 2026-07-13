"use client"

import { AlertTriangle, Info, OctagonAlert } from "lucide-react"
import type { ListingWarning } from "@/types/listing"
import { cn } from "@/lib/utils"

export function WarningsPanel({ warnings }: { warnings: ListingWarning[] }) {
  if (!warnings.length) {
    return (
      <p className="text-sm text-[var(--muted-foreground)]">
        No missing-information warnings — looking solid.
      </p>
    )
  }

  return (
    <ul className="space-y-2.5">
      {warnings.map((w, i) => (
        <li
          key={`${w.field}-${i}`}
          className={cn(
            "rounded-lg border px-3.5 py-3",
            w.severity === "critical" && "border-rose-200 bg-rose-50",
            w.severity === "warning" && "border-amber-200 bg-amber-50",
            w.severity === "info" && "border-[var(--border)] bg-[var(--muted)]/50",
          )}
        >
          <div className="flex gap-2.5">
            <span className="mt-0.5 shrink-0">
              {w.severity === "critical" ? (
                <OctagonAlert className="h-4 w-4 text-rose-700" />
              ) : w.severity === "warning" ? (
                <AlertTriangle className="h-4 w-4 text-amber-700" />
              ) : (
                <Info className="h-4 w-4 text-[var(--muted-foreground)]" />
              )}
            </span>
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-medium text-[var(--foreground)]">
                <span className="uppercase tracking-wide text-[10px] text-[var(--muted-foreground)]">
                  {w.field}
                </span>
                <span className="mx-1.5 text-[var(--border)]">·</span>
                {w.message}
              </p>
              {w.suggestion && (
                <p className="text-xs text-[var(--muted-foreground)]">{w.suggestion}</p>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}
