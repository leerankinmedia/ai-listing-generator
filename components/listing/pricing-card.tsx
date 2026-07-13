"use client"

import type { ListingPricing } from "@/types/listing"
import { formatCurrency } from "@/lib/utils"

export function PricingCard({ pricing }: { pricing: ListingPricing }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <PriceTile label="Low" value={pricing.lowPrice} currency={pricing.currency} />
        <PriceTile
          label="Suggested"
          value={pricing.suggestedPrice}
          currency={pricing.currency}
          emphasize
        />
        <PriceTile label="High" value={pricing.highPrice} currency={pricing.currency} />
      </div>
      {pricing.estimatedProfit != null && (
        <p className="text-sm text-[var(--foreground)]">
          Est. profit at suggested:{" "}
          <span className="font-semibold text-emerald-800">
            {formatCurrency(pricing.estimatedProfit, pricing.currency)}
          </span>
        </p>
      )}
      <p className="text-sm leading-relaxed text-[var(--muted-foreground)]">
        {pricing.rationale}
      </p>
    </div>
  )
}

function PriceTile({
  label,
  value,
  currency,
  emphasize,
}: {
  label: string
  value: number
  currency: string
  emphasize?: boolean
}) {
  return (
    <div
      className={
        emphasize
          ? "rounded-xl bg-[var(--ink)] px-3 py-3 text-[var(--ink-foreground)]"
          : "rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-3"
      }
    >
      <p
        className={
          emphasize
            ? "text-[10px] font-semibold uppercase tracking-wider text-white/60"
            : "text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]"
        }
      >
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold tabular-nums tracking-tight">
        {formatCurrency(value, currency)}
      </p>
    </div>
  )
}
