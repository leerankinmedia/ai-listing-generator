"use client"

import { ImagePlus, X } from "lucide-react"
import { useCallback, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const MAX_PHOTOS = 8
const MAX_FILE_BYTES = 4 * 1024 * 1024

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error("Failed to read image"))
    reader.readAsDataURL(file)
  })
}

interface PhotoUploaderProps {
  photos: string[]
  onChange: (photos: string[]) => void
  disabled?: boolean
}

export function PhotoUploader({ photos, onChange, disabled }: PhotoUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      setError(null)
      const list = Array.from(files).filter((f) => f.type.startsWith("image/"))
      if (!list.length) {
        setError("Please choose image files (JPG, PNG, WEBP).")
        return
      }

      const remaining = MAX_PHOTOS - photos.length
      if (remaining <= 0) {
        setError(`Maximum ${MAX_PHOTOS} photos.`)
        return
      }

      const accepted = list.slice(0, remaining)
      const oversized = accepted.find((f) => f.size > MAX_FILE_BYTES)
      if (oversized) {
        setError("Each photo must be under 4MB.")
        return
      }

      try {
        const dataUrls = await Promise.all(accepted.map(fileToDataUrl))
        onChange([...photos, ...dataUrls])
        if (list.length > remaining) {
          setError(`Only ${MAX_PHOTOS} photos allowed — extras were skipped.`)
        }
      } catch {
        setError("Could not process one of the images.")
      }
    },
    [onChange, photos],
  )

  const removeAt = (index: number) => {
    onChange(photos.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled) setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          if (!disabled && e.dataTransfer.files?.length) {
            void addFiles(e.dataTransfer.files)
          }
        }}
        className={cn(
          "relative overflow-hidden rounded-2xl border border-dashed border-border/80 bg-card/70 p-6 transition-all duration-300",
          dragOver && "border-primary bg-primary/5 scale-[1.01]",
          disabled && "opacity-60 pointer-events-none",
        )}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,color-mix(in_oklch,var(--primary)_8%,transparent),transparent_55%)]" />
        <div className="relative flex flex-col items-center gap-3 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <ImagePlus className="size-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Drop product photos here</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Up to {MAX_PHOTOS} images · JPG, PNG, WEBP · max 4MB each
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
          >
            Choose photos
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            disabled={disabled}
            onChange={(e) => {
              if (e.target.files) void addFiles(e.target.files)
              e.target.value = ""
            }}
          />
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {photos.length > 0 ? (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.map((src, index) => (
            <li
              key={`${index}-${src.slice(0, 32)}`}
              className="group relative aspect-square overflow-hidden rounded-xl border border-border/70 bg-muted animate-fade-in"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={`Product photo ${index + 1}`} className="size-full object-cover" />
              <button
                type="button"
                aria-label={`Remove photo ${index + 1}`}
                disabled={disabled}
                onClick={() => removeAt(index)}
                className="absolute top-1.5 right-1.5 flex size-7 items-center justify-center rounded-full bg-ink-deep/80 text-white opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100"
                style={{ background: "var(--ink-deep)" }}
              >
                <X className="size-3.5" />
              </button>
              {index === 0 ? (
                <span className="absolute bottom-1.5 left-1.5 rounded-md bg-background/90 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-foreground">
                  Primary
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
