"use client"

import { useState, useTransition } from "react"
import { Loader2, Sparkles, Wand2 } from "lucide-react"

import { PhotoUploader } from "@/components/photo-uploader"
import { ResultSection } from "@/components/result-section"
import { Button } from "@/components/ui/button"
import {
  CONDITION_LABELS,
  type GenerateListingResponse,
  type ListingInput,
} from "@/lib/types/listing"

const CONDITIONS = Object.entries(CONDITION_LABELS) as [
  NonNullable<ListingInput["condition"]>,
  string,
][]

export function ListingForm() {
  const [photos, setPhotos] = useState<File[]>([])
  const [brand, setBrand] = useState("")
  const [categoryHint, setCategoryHint] = useState("")
  const [condition, setCondition] = useState<string>("")
  const [cost, setCost] = useState("")
  const [notes, setNotes] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<GenerateListingResponse | null>(null)
  const [isPending, startTransition] = useTransition()

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (photos.length === 0) {
      setError("Add at least one product photo to generate a listing.")
      return
    }

    startTransition(async () => {
      try {
        const form = new FormData()
        photos.forEach((file) => form.append("photos", file))
        if (brand.trim()) form.append("brand", brand.trim())
        if (categoryHint.trim()) form.append("categoryHint", categoryHint.trim())
        if (condition) form.append("condition", condition)
        if (cost.trim()) form.append("cost", cost.trim())
        if (notes.trim()) form.append("notes", notes.trim())

        const res = await fetch("/api/generate-listing", {
          method: "POST",
          body: form,
        })

        const json = await res.json()
        if (!res.ok) {
          throw new Error(json?.error?.message || "Generation failed.")
        }

        setResult(json.data as GenerateListingResponse)
      } catch (err) {
        setResult(null)
        setError(err instanceof Error ? err.message : "Something went wrong.")
      }
    })
  }

  return (
    <div className="space-y-8">
      <form onSubmit={onSubmit} className="space-y-5">
        <PhotoUploader
          files={photos}
          onChange={setPhotos}
          disabled={isPending}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="field">
            <span className="field-label">Brand (optional)</span>
            <input
              className="field-input"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="e.g. Nike, Coach, Sony"
              disabled={isPending}
              maxLength={120}
            />
          </label>

          <label className="field">
            <span className="field-label">Category hint</span>
            <input
              className="field-input"
              value={categoryHint}
              onChange={(e) => setCategoryHint(e.target.value)}
              placeholder="e.g. Women's sneakers"
              disabled={isPending}
              maxLength={200}
            />
          </label>

          <label className="field">
            <span className="field-label">Condition</span>
            <select
              className="field-input"
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              disabled={isPending}
            >
              <option value="">Detect from photos / notes</option>
              {CONDITIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field-label">Your cost (USD)</span>
            <input
              className="field-input"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder="0.00"
              disabled={isPending}
            />
          </label>
        </div>

        <label className="field">
          <span className="field-label">Seller notes</span>
          <textarea
            className="field-input min-h-[110px] resize-y"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Size, flaws, authenticity details, measurements, what’s included…"
            disabled={isPending}
            maxLength={2000}
          />
        </label>

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-[var(--destructive)]/30 bg-[var(--destructive-soft)] px-4 py-3 text-sm text-[var(--destructive)]"
          >
            {error}
          </div>
        )}

        <Button
          type="submit"
          size="lg"
          className="w-full sm:w-auto"
          disabled={isPending}
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating listing…
            </>
          ) : (
            <>
              <Wand2 className="h-4 w-4" />
              Generate eBay listing
            </>
          )}
        </Button>

        {isPending && (
          <p className="flex items-center gap-2 text-sm text-[var(--muted-foreground)] animate-pulse-soft">
            <Sparkles className="h-4 w-4 text-[var(--accent)]" />
            Reading photos, writing SEO titles, and filling item specifics…
          </p>
        )}
      </form>

      {result && <ResultSection result={result} />}
    </div>
  )
}
