"use client"

import { useCallback, useRef, useState } from "react"
import { ImagePlus, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

const MAX_FILES = 6
const MAX_BYTES = 4 * 1024 * 1024

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export function PhotoUploader({
  value,
  onChange,
  disabled,
}: {
  value: string[]
  onChange: (next: string[]) => void
  disabled?: boolean
}) {
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

      const remaining = MAX_FILES - value.length
      if (remaining <= 0) {
        setError(`You can upload up to ${MAX_FILES} photos.`)
        return
      }

      const slice = list.slice(0, remaining)
      const next: string[] = []
      for (const file of slice) {
        if (file.size > MAX_BYTES) {
          setError(`"${file.name}" is over 4MB. Compress and retry.`)
          continue
        }
        next.push(await fileToDataUrl(file))
      }
      if (next.length) onChange([...value, ...next])
    },
    [onChange, value],
  )

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          if (!disabled) void addFiles(e.dataTransfer.files)
        }}
        className={cn(
          "relative flex min-h-[140px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-4 py-8 text-center transition-all",
          dragOver
            ? "border-[var(--accent)] bg-[var(--accent-soft)]"
            : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]/60 hover:bg-[var(--muted)]/40",
          disabled && "pointer-events-none opacity-60",
        )}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click()
        }}
      >
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--muted)] text-[var(--foreground)]">
          <ImagePlus className="h-5 w-5" />
        </div>
        <p className="text-sm font-medium text-[var(--foreground)]">
          Drop product photos or click to upload
        </p>
        <p className="mt-1 max-w-sm text-xs text-[var(--muted-foreground)]">
          Up to {MAX_FILES} images · JPG/PNG/WEBP · 4MB each. Vision analyzes the
          first photos when AI is enabled.
        </p>
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

      {error && (
        <p className="text-sm text-rose-700" role="alert">
          {error}
        </p>
      )}

      {value.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {value.map((src, i) => (
            <li key={i} className="group relative aspect-square overflow-hidden rounded-lg bg-[var(--muted)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={`Product ${i + 1}`} className="h-full w-full object-cover" />
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="absolute right-1 top-1 h-7 w-7 opacity-90 shadow"
                disabled={disabled}
                onClick={(e) => {
                  e.stopPropagation()
                  onChange(value.filter((_, idx) => idx !== i))
                }}
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
