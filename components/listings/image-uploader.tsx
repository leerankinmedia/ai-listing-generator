"use client"

import { useCallback, useRef, useState } from "react"
import { ImagePlus, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { MAX_LISTING_IMAGES } from "@/lib/listings/schema"
import { createImageId, fileToCompressedDataUrl } from "@/lib/listings/images"
import type { ListingImage } from "@/lib/types"

interface ImageUploaderProps {
  images: ListingImage[]
  onChange: (images: ListingImage[]) => void
  disabled?: boolean
}

export function ImageUploader({ images, onChange, disabled }: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const addFiles = useCallback(
    async (fileList: FileList | File[]) => {
      setError(null)
      const incoming = Array.from(fileList).filter((f) => f.type.startsWith("image/"))
      if (incoming.length === 0) {
        setError("Please drop image files only.")
        return
      }

      const remaining = MAX_LISTING_IMAGES - images.length
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
            sortOrder: images.length + index,
            isPrimary: images.length === 0 && index === 0,
          })
        }
        onChange([...images, ...next])
        if (incoming.length > remaining) {
          setError(`Only ${remaining} more photo${remaining === 1 ? "" : "s"} could be added.`)
        }
      } catch {
        setError("Could not process one or more images.")
      } finally {
        setBusy(false)
      }
    },
    [images, onChange]
  )

  function removeImage(id: string) {
    const next = images
      .filter((img) => img.id !== id)
      .map((img, index) => ({
        ...img,
        sortOrder: index,
        isPrimary: index === 0,
      }))
    onChange(next)
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
          Every photo is analyzed with OpenAI Vision.
        </p>
        <p className="mt-3 text-xs font-medium text-muted-foreground">
          {images.length} / {MAX_LISTING_IMAGES} uploaded
        </p>
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
          {images.map((image, index) => (
            <div
              key={image.id}
              className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-secondary"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.url}
                alt={`Product photo ${index + 1}`}
                className="h-full w-full object-cover"
              />
              {index === 0 && (
                <span className="absolute left-1.5 top-1.5 rounded-md bg-foreground/85 px-1.5 py-0.5 text-[10px] font-semibold text-background">
                  Cover
                </span>
              )}
              <button
                type="button"
                aria-label={`Remove photo ${index + 1}`}
                className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-md bg-background/90 text-foreground opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation()
                  removeImage(image.id)
                }}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
