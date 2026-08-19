"use client"

import { Sparkles } from "lucide-react"

export const GENERATION_PROGRESS_MESSAGES = [
  "Analyzing your photos",
  "Identifying your item",
  "Finding the right category",
  "Adding item details",
  "Writing your title",
  "Preparing your draft",
] as const

export function GenerationProgressScreen({
  percent,
  message,
  photoCount,
}: {
  percent: number
  message: string
  photoCount?: number
}) {
  const width = Math.max(6, Math.min(100, percent))
  return (
    <div
      className="flex min-h-[min(70vh,560px)] flex-col items-center justify-center px-5 py-10 text-center"
      role="status"
      aria-live="polite"
    >
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-accent/15 text-accent">
        <Sparkles className="h-7 w-7 animate-pulse" aria-hidden />
      </div>
      <p className="font-display text-[1.65rem] font-semibold leading-tight tracking-tight">
        Creating your listing
      </p>
      <p className="mt-2 max-w-xs text-sm text-muted-foreground">
        {photoCount
          ? `Reading ${photoCount} photo${photoCount === 1 ? "" : "s"} and filling eBay details.`
          : "Reading your photos and filling eBay details."}
      </p>
      <div className="mt-8 h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
          style={{ width: `${width}%` }}
        />
      </div>
      <p className="mt-5 min-h-6 text-base font-medium text-foreground">
        {message}
      </p>
    </div>
  )
}
