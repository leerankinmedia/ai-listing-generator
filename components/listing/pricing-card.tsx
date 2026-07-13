"use client"

import { TrendingUp } from "lucide-react"

import type { PricingSuggestion } from "@/lib/types/listing"
import { formatCurrency } from "@/lib/utils"

interface PricingCardProps {
  pricing: PricingSuggestion
  costBasis?: number | null
}

export function PricingCard({ pricing, costBasis }: PricingCardProps) {
  const margin =
    typeof costBasis === "number" && costBasis > 0
      ? pricing.suggestedPrice - costBasis
      : null

  return (
    <div className="rounded-2xl border border-border/70 bg-card/80 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Pricing suggestion
          </p>
          <p className="mt-1 font-display text-3xl font-semibold tracking-tight text-foreground">
            {formatCurrency(pricing.suggestedPrice, pricing.currency)}
          </p>
        </div>
        <div className="flex size-10 items-center justify-center rounded-xl bg-accent/20 text-accent-foreground">
          <TrendingUp className="size-5" />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-xl bg-muted/70 px-3 py-2.5">
          <p className="text-xs text-muted-foreground">Quick sale</p>
          <p className="font-medium">{formatCurrency(pricing.priceLow, pricing.currency)}</p>
        </div>
        <div className="rounded-xl bg-muted/70 px-3 py-2.5">
          <p className="text-xs text-muted-foreground">Stretch</p>
          <p className="font-medium">{formatCurrency(pricing.priceHigh, pricing.currency)}</p>
        </div>
      </div>

      {margin !== null ? (
        <p className="mt-3 text-sm">
          <span className="text-muted-foreground">Est. gross margin vs cost: </span>
          <span className="font-medium text-foreground">{formatCurrency(margin)}</span>
        </p>
      ) : null}

      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{pricing.rationale}</p>
      <p className="mt-2 text-xs text-muted-foreground">
        Price confidence {Math.round(pricing.confidence)}/100
      </p>
    </div>
  )
}
