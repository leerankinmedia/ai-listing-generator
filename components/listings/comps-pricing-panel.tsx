"use client"

import { ConfidenceMeter } from "@/components/listings/confidence-meter"
import { Label } from "@/components/ui/label"
import { NullableNumberInput } from "@/components/ui/nullable-number-input"
import type { Listing, SoldCompsEstimate } from "@/lib/types"
import { cn } from "@/lib/utils"

export function CompsPricingPanel({
  comps,
  listing,
  onListingChange,
  disabled,
}: {
  comps?: SoldCompsEstimate
  listing: Listing
  onListingChange: (listing: Listing) => void
  disabled?: boolean
}) {
  const price = listing.price
  const quantity = Number(listing.specifics.extras?.quantity ?? 1)
  const allowOffers = listing.specifics.allowOffers === true

  function patch(partial: Partial<Listing> & { specifics?: Listing["specifics"] }) {
    onListingChange({
      ...listing,
      ...partial,
      specifics: partial.specifics
        ? { ...listing.specifics, ...partial.specifics }
        : listing.specifics,
      updatedAt: new Date().toISOString(),
    })
  }

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

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="list-price">Your list price (USD)</Label>
              <NullableNumberInput
                id="list-price"
                min={0}
                step="0.01"
                disabled={disabled}
                value={price > 0 ? price : null}
                placeholder="e.g. 24.99"
                onValueChange={(n) => {
                  const nextPrice = n == null ? 0 : n
                  const prev = listing.fieldConfidence?.price
                  patch({
                    price: nextPrice,
                    fieldConfidence: {
                      ...listing.fieldConfidence,
                      price: {
                        value: String(nextPrice),
                        confidence:
                          prev?.confidence ?? listing.comps?.confidence ?? 1,
                        rationale: prev?.rationale ?? "Edited manually",
                      },
                    },
                  })
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="list-qty">Quantity</Label>
              <NullableNumberInput
                id="list-qty"
                integer
                min={1}
                disabled={disabled}
                value={Number.isFinite(quantity) && quantity > 0 ? quantity : null}
                placeholder="e.g. 1"
                onValueChange={(n) =>
                  patch({
                    specifics: {
                      ...listing.specifics,
                      extras: {
                        ...(listing.specifics.extras || {}),
                        quantity: String(n == null ? 1 : Math.max(1, n)),
                      },
                    },
                  })
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Allow offers</Label>
            <div className="flex gap-2">
              {([true, false] as const).map((yes) => {
                const active = allowOffers === yes
                return (
                  <button
                    key={yes ? "yes" : "no"}
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      patch({
                        specifics: {
                          ...listing.specifics,
                          allowOffers: yes,
                        },
                      })
                    }
                    className={cn(
                      "h-10 flex-1 rounded-lg border text-sm font-medium transition-colors",
                      active
                        ? "border-accent/50 bg-accent/15"
                        : "border-border bg-card hover:border-accent/30"
                    )}
                  >
                    {yes ? "Yes" : "No"}
                  </button>
                )
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              Sends eBay Best Offer on/off with this listing — no need to edit on eBay later.
            </p>
          </div>

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
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="list-price-empty">Your list price (USD)</Label>
              <NullableNumberInput
                id="list-price-empty"
                min={0}
                step="0.01"
                disabled={disabled}
                value={price > 0 ? price : null}
                placeholder="e.g. 24.99"
                onValueChange={(n) => patch({ price: n == null ? 0 : n })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="list-qty-empty">Quantity</Label>
              <NullableNumberInput
                id="list-qty-empty"
                integer
                min={1}
                disabled={disabled}
                value={Number.isFinite(quantity) && quantity > 0 ? quantity : null}
                placeholder="e.g. 1"
                onValueChange={(n) =>
                  patch({
                    specifics: {
                      ...listing.specifics,
                      extras: {
                        ...(listing.specifics.extras || {}),
                        quantity: String(n == null ? 1 : Math.max(1, n)),
                      },
                    },
                  })
                }
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Allow offers</Label>
            <div className="flex gap-2">
              {([true, false] as const).map((yes) => {
                const active = allowOffers === yes
                return (
                  <button
                    key={yes ? "yes" : "no"}
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      patch({
                        specifics: {
                          ...listing.specifics,
                          allowOffers: yes,
                        },
                      })
                    }
                    className={cn(
                      "h-10 flex-1 rounded-lg border text-sm font-medium transition-colors",
                      active
                        ? "border-accent/50 bg-accent/15"
                        : "border-border bg-card hover:border-accent/30"
                    )}
                  >
                    {yes ? "Yes" : "No"}
                  </button>
                )
              })}
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Run Analyze Photos to generate a comps-based price suggestion.
          </p>
        </div>
      )}
    </section>
  )
}
