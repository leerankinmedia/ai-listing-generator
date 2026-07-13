"use client"

import { cn } from "@/lib/utils"
import type { ListingConfidence } from "@/types/listing"

export function ConfidenceMeter({
  confidence,
}: {
  confidence: ListingConfidence
}) {
  const entries: Array<{ key: keyof ListingConfidence; label: string }> = [
    { key: "overall", label: "Overall" },
    { key: "title", label: "Title" },
    { key: "description", label: "Description" },
    { key: "category", label: "Category" },
    { key: "itemSpecifics", label: "Specifics" },
    { key: "pricing", label: "Pricing" },
  ]

  return (
    <div className="space-y-3">
      {entries.map(({ key, label }) => {
        const value = confidence[key]
        return (
          <div key={key} className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-[var(--foreground)]">{label}</span>
              <span className="tabular-nums text-[var(--muted-foreground)]">{value}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[var(--muted)]">
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-700 ease-out",
                  value >= 80
                    ? "bg-emerald-600"
                    : value >= 60
                      ? "bg-[var(--accent)]"
                      : "bg-amber-500",
                )}
                style={{ width: `${value}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
