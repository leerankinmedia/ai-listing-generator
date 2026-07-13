"use client"

import { useState } from "react"
import { Loader2, Rocket } from "lucide-react"
import { Button } from "@/components/ui/button"
import { MARKETPLACES } from "@/lib/marketplaces"
import type { Listing, OneClickPublishResult } from "@/lib/types"
import { cn } from "@/lib/utils"

export function OneClickPublishBar({
  listing,
  disabled,
}: {
  listing: Listing
  disabled?: boolean
}) {
  const [publishing, setPublishing] = useState(false)
  const [results, setResults] = useState<OneClickPublishResult[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handlePublish() {
    setPublishing(true)
    setError(null)
    setResults(null)
    try {
      const response = await fetch("/api/listings/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listing,
          marketplaceIds: listing.targetMarketplaces,
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || "Publish failed")
      setResults(payload.results as OneClickPublishResult[])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publish failed")
    } finally {
      setPublishing(false)
    }
  }

  const targets = MARKETPLACES.filter((m) =>
    listing.targetMarketplaces.includes(m.id)
  )

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card/70 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold">One-click publish</h2>
          <p className="text-sm text-muted-foreground">
            Queue this listing to {targets.length} selected marketplace
            {targets.length === 1 ? "" : "s"}. Adapters fulfill jobs when connected.
          </p>
        </div>
        <Button
          variant="accent"
          disabled={disabled || publishing || targets.length === 0}
          onClick={() => void handlePublish()}
        >
          {publishing ? <Loader2 className="animate-spin" /> : <Rocket />}
          Publish now
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {targets.map((m) => (
          <span
            key={m.id}
            className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-2 py-1 text-xs font-medium"
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: m.color }}
            />
            {m.shortName}
          </span>
        ))}
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {results && (
        <ul className="space-y-2">
          {results.map((result) => (
            <li
              key={result.marketplaceId}
              className={cn(
                "rounded-lg border px-3 py-2 text-sm",
                result.ok
                  ? "border-accent/30 bg-accent/10"
                  : "border-destructive/30 bg-destructive/10"
              )}
            >
              <span className="font-medium capitalize">
                {result.marketplaceId.replaceAll("_", " ")}
              </span>
              <span className="text-muted-foreground"> — {result.message}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
