"use client"

import { Loader2, Sparkles, Wand2 } from "lucide-react"
import { useState, useTransition } from "react"

import { PhotoUploader } from "@/components/listing/photo-uploader"
import { ResultSection } from "@/components/listing/result-section"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { GeneratedListing, ListingCondition } from "@/lib/types/listing"

const CONDITIONS: Array<ListingCondition | ""> = [
  "",
  "New with tags",
  "New without tags",
  "New with defects",
  "Pre-owned - Excellent",
  "Pre-owned - Good",
  "Pre-owned - Fair",
]

export function ListingForm() {
  const [photos, setPhotos] = useState<string[]>([])
  const [notes, setNotes] = useState("")
  const [conditionHint, setConditionHint] = useState<ListingCondition | "">("")
  const [costBasis, setCostBasis] = useState("")
  const [listing, setListing] = useState<GeneratedListing | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const parsedCost = costBasis.trim() === "" ? null : Number(costBasis)

  const onGenerate = () => {
    setError(null)
    if (!photos.length) {
      setError("Add at least one product photo to generate a listing.")
      return
    }
    if (parsedCost !== null && (!Number.isFinite(parsedCost) || parsedCost < 0)) {
      setError("Cost basis must be a valid non-negative number.")
      return
    }

    startTransition(async () => {
      try {
        const response = await fetch("/api/generate-listing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            images: photos,
            notes,
            conditionHint: conditionHint || null,
            costBasis: parsedCost,
            targetMarketplace: "ebay",
          }),
        })

        const payload = await response.json()
        if (!response.ok || payload.error) {
          throw new Error(payload?.error?.message || "Generation failed")
        }

        setListing(payload.data as GeneratedListing)
      } catch (err) {
        setListing(null)
        setError(err instanceof Error ? err.message : "Something went wrong")
      }
    })
  }

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-border/70 bg-card/75 p-4 shadow-[0_20px_50px_-40px_rgba(20,40,50,0.45)] backdrop-blur-sm sm:p-6">
        <div className="mb-5 flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Wand2 className="size-5" />
          </div>
          <div>
            <h2 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
              AI Listing Generator
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload photos. Get an eBay-optimized title, description, category, specifics,
              keywords, pricing, and confidence score.
            </p>
          </div>
        </div>

        <div className="space-y-5">
          <PhotoUploader photos={photos} onChange={setPhotos} disabled={isPending} />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="condition">Condition hint (optional)</Label>
              <select
                id="condition"
                value={conditionHint}
                disabled={isPending}
                onChange={(e) => setConditionHint(e.target.value as ListingCondition | "")}
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="">Let AI infer</option>
                {CONDITIONS.filter(Boolean).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cost">Cost basis USD (optional)</Label>
              <Input
                id="cost"
                inputMode="decimal"
                placeholder="e.g. 12.50"
                value={costBasis}
                disabled={isPending}
                onChange={(e) => setCostBasis(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Seller notes (optional)</Label>
            <Textarea
              id="notes"
              placeholder="Brand confirmed Nike, size M, small stain on hem, thrift find…"
              value={notes}
              disabled={isPending}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-24"
            />
          </div>

          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Couldn’t generate listing</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Phase 1 · eBay-first output · {photos.length}/{8} photos
            </p>
            <Button
              type="button"
              size="lg"
              disabled={isPending || photos.length === 0}
              onClick={onGenerate}
              className="min-w-[180px]"
            >
              {isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Analyzing…
                </>
              ) : (
                <>
                  <Sparkles className="size-4" />
                  Generate listing
                </>
              )}
            </Button>
          </div>

          {isPending ? (
            <div className="rounded-2xl border border-border/60 bg-muted/40 px-4 py-3 text-sm text-muted-foreground animate-pulse-soft">
              Reading photos, drafting SEO title, filling item specifics, and scoring confidence…
            </div>
          ) : null}
        </div>
      </section>

      {listing ? <ResultSection listing={listing} costBasis={parsedCost} /> : null}
    </div>
  )
}
