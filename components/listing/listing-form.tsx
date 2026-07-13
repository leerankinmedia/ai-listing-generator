"use client"

import { useMemo, useState } from "react"
import { Loader2, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { PhotoUploader } from "@/components/listing/photo-uploader"
import { CONDITIONS, type ListingInput, type ListingResult } from "@/types/listing"
import { cn } from "@/lib/utils"

const initialForm = {
  notes: "",
  brand: "",
  categoryHint: "",
  condition: "" as string,
  size: "",
  color: "",
  material: "",
  cost: "",
  targetMarginPercent: "55",
}

export function ListingForm({
  onResult,
  onError,
  onGeneratingChange,
}: {
  onResult: (result: ListingResult, meta: { mode: "live" | "demo"; model?: string }) => void
  onError: (message: string) => void
  onGeneratingChange?: (busy: boolean) => void
}) {
  const [form, setForm] = useState(initialForm)
  const [images, setImages] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const canSubmit = useMemo(() => {
    return Boolean(form.notes.trim() || form.brand.trim() || images.length)
  }, [form.brand, form.notes, images.length])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit || busy) return

    setBusy(true)
    onGeneratingChange?.(true)
    onError("")

    const payload: ListingInput = {
      notes: form.notes.trim(),
      brand: form.brand.trim(),
      categoryHint: form.categoryHint.trim(),
      size: form.size.trim(),
      color: form.color.trim(),
      material: form.material.trim(),
      marketplace: "ebay",
      targetMarginPercent: Number(form.targetMarginPercent) || 55,
      imageDataUrls: images,
      ...(form.condition
        ? { condition: form.condition as ListingInput["condition"] }
        : {}),
      ...(form.cost !== "" ? { cost: Number(form.cost) } : {}),
    }

    try {
      const res = await fetch("/api/generate-listing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json?.error?.message || "Generation failed")
      }
      onResult(json.data, {
        mode: json.meta?.mode ?? "live",
        model: json.meta?.model,
      })
    } catch (err) {
      onError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setBusy(false)
      onGeneratingChange?.(false)
    }
  }

  function setField<K extends keyof typeof initialForm>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PhotoUploader value={images} onChange={setImages} disabled={busy} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Brand">
          <Input
            value={form.brand}
            onChange={(e) => setField("brand", e.target.value)}
            placeholder="Nike, Levi's, Coach…"
            disabled={busy}
          />
        </Field>
        <Field label="Category hint">
          <Input
            value={form.categoryHint}
            onChange={(e) => setField("categoryHint", e.target.value)}
            placeholder="Athletic Shoes, Jeans, Handbag…"
            disabled={busy}
          />
        </Field>
        <Field label="Condition">
          <select
            className={cn(
              "flex h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3.5 text-sm shadow-sm focus-visible:border-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/25 disabled:opacity-50",
            )}
            value={form.condition}
            onChange={(e) => setField("condition", e.target.value)}
            disabled={busy}
          >
            <option value="">Select condition</option>
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Size">
          <Input
            value={form.size}
            onChange={(e) => setField("size", e.target.value)}
            placeholder="M, 32x30, 10…"
            disabled={busy}
          />
        </Field>
        <Field label="Color">
          <Input
            value={form.color}
            onChange={(e) => setField("color", e.target.value)}
            placeholder="Black, Navy, Floral…"
            disabled={busy}
          />
        </Field>
        <Field label="Material">
          <Input
            value={form.material}
            onChange={(e) => setField("material", e.target.value)}
            placeholder="Leather, Cotton, Wool…"
            disabled={busy}
          />
        </Field>
        <Field label="Your cost (USD)">
          <Input
            type="number"
            min={0}
            step="0.01"
            value={form.cost}
            onChange={(e) => setField("cost", e.target.value)}
            placeholder="0.00"
            disabled={busy}
          />
        </Field>
        <Field label="Target margin %">
          <Input
            type="number"
            min={0}
            max={95}
            value={form.targetMarginPercent}
            onChange={(e) => setField("targetMarginPercent", e.target.value)}
            disabled={busy}
          />
        </Field>
      </div>

      <Field label="Seller notes">
        <Textarea
          value={form.notes}
          onChange={(e) => setField("notes", e.target.value)}
          placeholder="What is it? Flaws? Measurements? Box/tags? Anything a buyer would ask…"
          disabled={busy}
          rows={5}
        />
      </Field>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-[var(--muted-foreground)]">
          Tip: brand + size + clear photos produce the strongest titles and confidence.
        </p>
        <Button type="submit" size="lg" disabled={!canSubmit || busy} className="min-w-[200px]">
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Generate listing
            </>
          )}
        </Button>
      </div>
    </form>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  )
}
