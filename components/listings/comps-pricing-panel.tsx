"use client"

import { ConfidenceMeter } from "@/components/listings/confidence-meter"
import type { SoldCompsEstimate } from "@/lib/types"

export function CompsPricingPanel({
  comps,
  price,
  onPriceChange,
  disabled,
}: {
  comps?: SoldCompsEstimate
  price: number
  onPriceChange: (price: number) => void
  disabled?: boolean
}) {
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card/70 p-4 sm:p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold">Sold comps pricing</h2>
          <p className="text-sm text-muted-foreground">
            Suggested list price from secondary-market sold comparables.
          </p>
        </div>
        {comps && <ConfidenceMeter confidence={comps.confidence} />}
      </div>

      {comps ? (
        <>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className="rounded-xl bg-secondary/70 px-3 py-3">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Low
              </p>
              <p className="mt-1 font-display text-lg font-semibold">
                ${comps.lowPrice.toFixed(0)}
              </p>
            </div>
            <div className="rounded-xl border border-accent/40 bg-accent/10 px-3 py-3">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Suggested
              </p>
              <p className="mt-1 font-display text-lg font-semibold text-accent-foreground dark:text-accent">
                ${comps.suggestedPrice.toFixed(0)}
              </p>
            </div>
            <div className="rounded-xl bg-secondary/70 px-3 py-3">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                High
              </p>
              <p className="mt-1 font-display text-lg font-semibold">
                ${comps.highPrice.toFixed(0)}
              </p>
            </div>
          </div>

          <label className="block space-y-2">
            <span className="text-sm font-medium">Your list price (USD)</span>
            <input
              type="number"
              min={0}
              step="0.01"
              disabled={disabled}
              value={price || ""}
              onChange={(e) => onPriceChange(Number(e.target.value) || 0)}
              className="flex h-11 w-full rounded-lg border border-input bg-card px-3.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>

          <div className="space-y-1 text-sm text-muted-foreground">
            <p>{comps.comparableSummary}</p>
            <p className="text-xs">
              {comps.rationale}
              {comps.sampleSize
                ? ` · ~${comps.sampleSize} comps considered`
                : ""}
              {comps.method === "ai_market_comps"
                ? " · AI market comps"
                : " · eBay sold API"}
            </p>
          </div>
        </>
      ) : (
        <label className="block space-y-2">
          <span className="text-sm font-medium">List price (USD)</span>
          <input
            type="number"
            min={0}
            step="0.01"
            disabled={disabled}
            value={price || ""}
            onChange={(e) => onPriceChange(Number(e.target.value) || 0)}
            className="flex h-11 w-full rounded-lg border border-input bg-card px-3.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
      )}
    </section>
  )
}
