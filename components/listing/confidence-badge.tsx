"use client"

import { cn } from "@/lib/utils"

interface ConfidenceBadgeProps {
  score: number
  breakdown?: {
    identification: number
    titleSeo: number
    specificsCompleteness: number
    pricing: number
  }
  className?: string
}

function scoreLabel(score: number) {
  if (score >= 85) return "High confidence"
  if (score >= 65) return "Good — review recommended"
  if (score >= 45) return "Needs verification"
  return "Low confidence"
}

function scoreColor(score: number) {
  if (score >= 85) return "var(--success)"
  if (score >= 65) return "var(--primary)"
  if (score >= 45) return "var(--warning)"
  return "var(--danger)"
}

export function ConfidenceBadge({ score, breakdown, className }: ConfidenceBadgeProps) {
  const color = scoreColor(score)

  return (
    <div className={cn("rounded-2xl border border-border/70 bg-card/80 p-4", className)}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Confidence
          </p>
          <p className="mt-1 font-display text-3xl font-semibold tracking-tight" style={{ color }}>
            {Math.round(score)}
            <span className="text-lg text-muted-foreground">/100</span>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{scoreLabel(score)}</p>
        </div>
        <div
          className="relative size-16 shrink-0"
          role="img"
          aria-label={`Confidence score ${Math.round(score)} out of 100`}
        >
          <svg viewBox="0 0 36 36" className="size-full -rotate-90">
            <circle
              cx="18"
              cy="18"
              r="15.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              className="text-muted"
            />
            <circle
              cx="18"
              cy="18"
              r="15.5"
              fill="none"
              stroke={color}
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={`${(score / 100) * 97.4} 97.4`}
              className="transition-all duration-700"
            />
          </svg>
        </div>
      </div>

      {breakdown ? (
        <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
          {(
            [
              ["ID", breakdown.identification],
              ["Title SEO", breakdown.titleSeo],
              ["Specifics", breakdown.specificsCompleteness],
              ["Pricing", breakdown.pricing],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="rounded-lg bg-muted/70 px-2.5 py-2">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="mt-0.5 font-medium text-foreground">{Math.round(value)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  )
}
