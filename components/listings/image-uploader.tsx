"use client"

import { useCallback, useRef, useState } from "react"
import { ChevronLeft, ChevronRight, ImagePlus, Star, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { MAX_LISTING_IMAGES } from "@/lib/listings/schema"
import { createImageId, fileToCompressedDataUrl } from "@/lib/listings/images"
import type { ListingImage } from "@/lib/types"

interface ImageUploaderProps {
  images: ListingImage[]
  onChange: (images: ListingImage[]) => void
  disabled?: boolean
}

function normalizeImages(images: ListingImage[]): ListingImage[] {
  return images.map((img, index) => ({
    ...img,
    sortOrder: index,
    isPrimary: index === 0,
  }))
}

export function ImageUploader({ images, onChange, disabled }: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ordered = [...images].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
  )

  const addFiles = useCallback(
    async (fileList: FileList | File[]) => {
      setError(null)
      const incoming = Array.from(fileList).filter((f) => f.type.startsWith("image/"))
      if (incoming.length === 0) {
        setError("Please drop image files only.")
        return
      }

      const remaining = MAX_LISTING_IMAGES - ordered.length
      if (remaining <= 0) {
        setError(`Maximum of ${MAX_LISTING_IMAGES} photos reached.`)
        return
      }

      const selected = incoming.slice(0, remaining)
      setBusy(true)
      try {
        const next: ListingImage[] = []
        for (const [index, file] of selected.entries()) {
          const url = await fileToCompressedDataUrl(file)
          next.push({
            id: createImageId(),
            url,
            sortOrder: ordered.length + index,
            isPrimary: ordered.length === 0 && index === 0,
          })
        }
        onChange(normalizeImages([...ordered, ...next]))
        if (incoming.length > remaining) {
          setError(`Only ${remaining} more photo${remaining === 1 ? "" : "s"} could be added.`)
        }
      } catch {
        setError("Could not process one or more images.")
      } finally {
        setBusy(false)
      }
    },
    [ordered, onChange]
  )

  function removeImage(id: string) {
    onChange(normalizeImages(ordered.filter((img) => img.id !== id)))
  }

  function setCover(id: string) {
    const target = ordered.find((img) => img.id === id)
    if (!target) return
    onChange(normalizeImages([target, ...ordered.filter((img) => img.id !== id)]))
  }

  function moveImage(id: string, direction: -1 | 1) {
    const index = ordered.findIndex((img) => img.id === id)
    if (index < 0) return
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= ordered.length) return
    const copy = [...ordered]
    const [item] = copy.splice(index, 1)
    copy.splice(nextIndex, 0, item)
    onChange(normalizeImages(copy))
  }

  return (
    <div className="space-y-3">
      <div
        onDragEnter={(e) => {
          e.preventDefault()
          if (!disabled) setDragging(true)
        }}
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled) setDragging(true)
        }}
        onDragLeave={(e) => {
          e.preventDefault()
          setDragging(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          if (!disabled) void addFiles(e.dataTransfer.files)
        }}
        className={cn(
          "relative flex min-h-[180px] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-4 py-8 text-center transition-colors",
          dragging
            ? "border-accent bg-accent/10"
            : "border-border bg-card/50 hover:border-accent/50 hover:bg-card/80",
          disabled && "pointer-events-none opacity-60"
        )}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click()
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          disabled={disabled || busy}
          onChange={(e) => {
            if (e.target.files) void addFiles(e.target.files)
            e.target.value = ""
          }}
        />
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-accent/15 text-accent">
          <ImagePlus className="h-5 w-5" />
        </div>
        <p className="font-display text-base font-semibold">
          {busy ? "Processing photos…" : "Drop photos here"}
        </p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Drag and drop 1–{MAX_LISTING_IMAGES} clothing photos, or tap to browse.
          Set a cover, reorder, or delete before saving.
        </p>
        <p className="mt-3 text-xs font-medium text-muted-foreground">
          {ordered.length} / {MAX_LISTING_IMAGES} uploaded
        </p>
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {ordered.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Tap ★ for cover · use arrows to reorder · ✕ to delete
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {ordered.map((image, index) => {
              const isCover = Boolean(image.isPrimary) || index === 0
              return (
                <div
                  key={image.id}
                  className={cn(
                    "relative aspect-square overflow-hidden rounded-xl border bg-secondary",
                    isCover ? "border-accent ring-1 ring-accent/40" : "border-border"
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.url}
                    alt={`Product photo ${index + 1}`}
                    className="h-full w-full object-cover"
                  />
                  {isCover && (
                    <span className="absolute left-1.5 top-1.5 rounded-md bg-foreground/85 px-1.5 py-0.5 text-[10px] font-semibold text-background">
                      Cover
                    </span>
                  )}
                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/70 to-transparent p-1.5 pt-6">
                    <button
                      type="button"
                      aria-label={`Move photo ${index + 1} left`}
                      disabled={disabled || index === 0}
                      className="flex h-8 w-8 items-center justify-center rounded-md bg-background/90 text-foreground disabled:opacity-30"
                      onClick={(e) => {
                        e.stopPropagation()
                        moveImage(image.id, -1)
                      }}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={
                        isCover
                          ? `Photo ${index + 1} is cover`
                          : `Set photo ${index + 1} as cover`
                      }
                      disabled={disabled || isCover}
                      className="flex h-8 w-8 items-center justify-center rounded-md bg-background/90 text-foreground disabled:opacity-40"
                      onClick={(e) => {
                        e.stopPropagation()
                        setCover(image.id)
                      }}
                    >
                      <Star
                        className={cn(
                          "h-4 w-4",
                          isCover && "fill-accent text-accent"
                        )}
                      />
                    </button>
                    <button
                      type="button"
                      aria-label={`Move photo ${index + 1} right`}
                      disabled={disabled || index === ordered.length - 1}
                      className="flex h-8 w-8 items-center justify-center rounded-md bg-background/90 text-foreground disabled:opacity-30"
                      onClick={(e) => {
                        e.stopPropagation()
                        moveImage(image.id, 1)
                      }}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove photo ${index + 1}`}
                    disabled={disabled}
                    className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-md bg-background/90 text-foreground"
                    onClick={(e) => {
                      e.stopPropagation()
                      removeImage(image.id)
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
