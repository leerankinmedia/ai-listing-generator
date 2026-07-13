"use client"

import { useCallback, useRef, useState } from "react"
import { ImagePlus, X, Camera } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

const MAX_PHOTOS = 6

type PhotoUploaderProps = {
  files: File[]
  onChange: (files: File[]) => void
  disabled?: boolean
}

export function PhotoUploader({
  files,
  onChange,
  disabled,
}: PhotoUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [previews, setPreviews] = useState<string[]>([])
  const [dragOver, setDragOver] = useState(false)

  const syncPreviews = useCallback((next: File[]) => {
    setPreviews((prev) => {
      prev.forEach((url) => URL.revokeObjectURL(url))
      return next.map((file) => URL.createObjectURL(file))
    })
  }, [])

  const addFiles = useCallback(
    (incoming: FileList | File[]) => {
      const list = Array.from(incoming).filter((f) =>
        f.type.startsWith("image/")
      )
      const merged = [...files, ...list].slice(0, MAX_PHOTOS)
      onChange(merged)
      syncPreviews(merged)
    },
    [files, onChange, syncPreviews]
  )

  const removeAt = (index: number) => {
    const merged = files.filter((_, i) => i !== index)
    onChange(merged)
    syncPreviews(merged)
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
            addFiles(e.dataTransfer.files)
          }
        }}
        className={cn(
          "relative overflow-hidden rounded-2xl border border-dashed transition-all",
          "bg-[var(--surface-elevated)]/60 backdrop-blur-sm",
          dragOver
            ? "border-[var(--accent)] bg-[var(--accent-soft)] scale-[1.01]"
            : "border-[var(--border-strong)] hover:border-[var(--accent)]/60",
          disabled && "opacity-60 pointer-events-none"
        )}
      >
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center justify-center gap-3 px-4 py-10 text-center sm:py-12"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)] shadow-inner">
            <ImagePlus className="h-7 w-7" strokeWidth={1.75} />
          </span>
          <div>
            <p className="font-[family-name:var(--font-display)] text-base font-semibold tracking-tight text-[var(--foreground)]">
              Drop product photos
            </p>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              or tap to browse · up to {MAX_PHOTOS} images · JPG, PNG, WEBP
            </p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-lg bg-[var(--foreground)] px-3 py-1.5 text-xs font-medium text-[var(--background)] sm:hidden">
            <Camera className="h-3.5 w-3.5" />
            Use camera
          </span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          capture="environment"
          className="hidden"
          disabled={disabled}
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files)
            e.target.value = ""
          }}
        />
      </div>

      {previews.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {previews.map((src, i) => (
            <li
              key={`${src}-${i}`}
              className="group relative aspect-square overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--muted)] animate-in-fade"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={`Product photo ${i + 1}`}
                className="h-full w-full object-cover"
              />
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="absolute right-1 top-1 h-7 w-7 rounded-full bg-black/55 text-white opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                onClick={() => removeAt(i)}
                aria-label={`Remove photo ${i + 1}`}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
