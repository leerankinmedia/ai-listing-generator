"use client"

import { AlertTriangle } from "lucide-react"

import type { MissingInfoWarning } from "@/lib/types/listing"
import { cn } from "@/lib/utils"

const severityStyles: Record<MissingInfoWarning["severity"], string> = {
  high: "border-destructive/30 bg-destructive/5 text-destructive",
  medium: "border-[color-mix(in_oklch,var(--warning)_35%,transparent)] bg-[color-mix(in_oklch,var(--warning)_10%,transparent)] text-[color-mix(in_oklch,var(--warning)_80%,var(--foreground))]",
  low: "border-border bg-muted/60 text-muted-foreground",
}

interface MissingInfoWarningsProps {
  warnings: MissingInfoWarning[]
}

export function MissingInfoWarnings({ warnings }: MissingInfoWarningsProps) {
  if (!warnings.length) {
    return (
      <div className="rounded-xl border border-[color-mix(in_oklch,var(--success)_30%,transparent)] bg-[color-mix(in_oklch,var(--success)_8%,transparent)] px-4 py-3 text-sm text-[color-mix(in_oklch,var(--success)_85%,var(--foreground))]">
        No critical gaps detected. Still review size, brand, and flaws before publishing.
      </div>
    )
  }

  const sorted = [...warnings].sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 }
    return order[a.severity] - order[b.severity]
  })

  return (
    <ul className="space-y-2">
      {sorted.map((warning) => (
        <li
          key={`${warning.field}-${warning.message}`}
          className={cn(
            "flex gap-3 rounded-xl border px-3.5 py-3 text-sm animate-rise",
            severityStyles[warning.severity],
          )}
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 opacity-80" />
          <div className="min-w-0 space-y-1">
            <p className="font-medium capitalize text-foreground">
              {warning.field.replace(/_/g, " ")}
              <span className="ml-2 text-[10px] font-semibold uppercase tracking-wider opacity-70">
                {warning.severity}
              </span>
            </p>
            <p className="text-foreground/85">{warning.message}</p>
            <p className="text-xs text-muted-foreground">{warning.suggestion}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}
