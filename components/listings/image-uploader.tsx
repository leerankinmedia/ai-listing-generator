"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { AlertCircle, Check, GripVertical, ImagePlus, Loader2, Star, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { uploadListingOriginalToStorage } from "@/lib/listings/durable-images"
import { MAX_LISTING_IMAGES } from "@/lib/listings/schema"
import {
  createListingImageFromFile,
  removeListingImageOriginal,
} from "@/lib/listings/images"
import type { ListingImage } from "@/lib/types"

interface ImageUploaderProps {
  images: ListingImage[]
  onChange: (images: ListingImage[]) => void
  disabled?: boolean
  /** Required for durable Supabase uploads */
  userId?: string | null
}

function normalizeImages(images: ListingImage[]): ListingImage[] {
  return images.map((img, index) => ({
    ...img,
    sortOrder: index,
    isPrimary: index === 0,
  }))
}

function storageBadge(image: ListingImage): {
  label: string
  className: string
  icon: "loading" | "ok" | "error" | "pending"
} {
  switch (image.storageStatus) {
    case "uploaded":
      return {
        label: "Saved",
        className: "bg-emerald-600/90 text-white",
        icon: "ok",
      }
    case "uploading":
      return {
        label: "Uploading…",
        className: "bg-foreground/85 text-background",
        icon: "loading",
      }
    case "error":
      return {
        label: "Upload failed",
        className: "bg-destructive/95 text-destructive-foreground",
        icon: "error",
      }
    case "pending":
    default:
      return {
        label: "Waiting…",
        className: "bg-foreground/70 text-background",
        icon: "pending",
      }
  }
}

function SortablePhoto({
  image,
  index,
  disabled,
  onSetCover,
  onRemove,
  onRetry,
}: {
  image: ListingImage
  index: number
  disabled?: boolean
  onSetCover: (id: string) => void
  onRemove: (id: string) => void
  onRetry: (id: string) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: image.id,
    disabled,
  })

  const isCover = Boolean(image.isPrimary) || index === 0
  const badge = storageBadge(image)
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        // No touch-none on the card — vertical swipes must scroll the page
        "relative aspect-square overflow-hidden rounded-xl border bg-secondary",
        isCover ? "border-accent ring-1 ring-accent/40" : "border-border",
        image.storageStatus === "error" && "border-destructive/60",
        isDragging && "z-20 opacity-40"
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image.url}
        alt={`Product photo ${index + 1}`}
        className="pointer-events-none h-full w-full object-cover"
        draggable={false}
      />
      <span
        className={cn(
          "pointer-events-none absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
          badge.className
        )}
      >
        {badge.icon === "loading" && (
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        )}
        {badge.icon === "ok" && <Check className="h-3 w-3" aria-hidden />}
        {badge.icon === "error" && (
          <AlertCircle className="h-3 w-3" aria-hidden />
        )}
        {badge.label}
      </span>
      {isCover && (
        <span className="pointer-events-none absolute right-12 top-1.5 rounded-md bg-foreground/85 px-1.5 py-0.5 text-[10px] font-semibold text-background">
          Cover
        </span>
      )}
      {image.storageStatus === "error" && (
        <button
          type="button"
          className="absolute inset-x-2 top-1/2 z-10 -translate-y-1/2 rounded-md bg-background/95 px-2 py-1.5 text-[11px] font-semibold text-foreground shadow"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation()
            onRetry(image.id)
          }}
        >
          Retry upload
        </button>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/70 to-transparent p-1.5 pt-6">
        <button
          type="button"
          ref={setActivatorNodeRef}
          aria-label={`Hold and drag to reorder photo ${index + 1}`}
          disabled={disabled}
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-md bg-background/90 text-foreground",
            !disabled && "cursor-grab active:cursor-grabbing",
            disabled && "opacity-40"
          )}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-5 w-5" aria-hidden />
        </button>
        <button
          type="button"
          aria-label={
            isCover
              ? `Photo ${index + 1} is cover`
              : `Set photo ${index + 1} as cover`
          }
          disabled={disabled || isCover}
          className="flex h-11 w-11 items-center justify-center rounded-md bg-background/90 text-foreground disabled:opacity-40"
          onClick={(e) => {
            e.stopPropagation()
            onSetCover(image.id)
          }}
        >
          <Star
            className={cn("h-4 w-4", isCover && "fill-accent text-accent")}
          />
        </button>
        <span className="h-11 w-11" aria-hidden />
      </div>
      <button
        type="button"
        aria-label={`Remove photo ${index + 1}`}
        disabled={disabled}
        className="absolute right-1.5 top-1.5 flex h-11 w-11 items-center justify-center rounded-md bg-background/90 text-foreground"
        onClick={(e) => {
          e.stopPropagation()
          onRemove(image.id)
        }}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function PhotoPreview({
  image,
  index,
}: {
  image: ListingImage
  index: number
}) {
  const isCover = Boolean(image.isPrimary) || index === 0
  return (
    <div
      className={cn(
        "relative aspect-square overflow-hidden rounded-xl border bg-secondary shadow-lg",
        isCover ? "border-accent ring-1 ring-accent/40" : "border-border"
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image.url}
        alt={`Dragging photo ${index + 1}`}
        className="h-full w-full object-cover"
        draggable={false}
      />
      {isCover && (
        <span className="absolute left-1.5 top-1.5 rounded-md bg-foreground/85 px-1.5 py-0.5 text-[10px] font-semibold text-background">
          Cover
        </span>
      )}
    </div>
  )
}

const UPLOAD_CONCURRENCY = 3

async function mapPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let next = 0
  const runners = Array.from(
    { length: Math.min(concurrency, Math.max(1, items.length)) },
    async () => {
      while (next < items.length) {
        const index = next
        next += 1
        await worker(items[index])
      }
    }
  )
  await Promise.all(runners)
}

export function ImageUploader({
  images,
  onChange,
  disabled,
  userId,
}: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const imagesRef = useRef(images)
  imagesRef.current = images
  const [fileDragging, setFileDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)

  const ordered = useMemo(
    () => [...images].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [images]
  )

  const uploadedCount = ordered.filter(
    (img) => img.storageStatus === "uploaded"
  ).length

  // Drag only starts from the handle; long-press on touch avoids scroll fights
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 400, tolerance: 10 },
    })
  )

  // While a photo drag is active, lock page scroll so reorder stays intentional
  useEffect(() => {
    if (!activeId) return
    const body = document.body
    const html = document.documentElement
    const prevBodyOverflow = body.style.overflow
    const prevHtmlOverflow = html.style.overflow
    const prevTouchAction = body.style.touchAction
    body.style.overflow = "hidden"
    html.style.overflow = "hidden"
    body.style.touchAction = "none"
    return () => {
      body.style.overflow = prevBodyOverflow
      html.style.overflow = prevHtmlOverflow
      body.style.touchAction = prevTouchAction
    }
  }, [activeId])

  const patchImages = useCallback(
    (mutate: (current: ListingImage[]) => ListingImage[]) => {
      const next = normalizeImages(mutate(imagesRef.current))
      imagesRef.current = next
      onChange(next)
    },
    [onChange]
  )

  const persistOriginal = useCallback(
    async (imageId: string) => {
      if (!userId) {
        patchImages((current) =>
          current.map((img) =>
            img.id === imageId
              ? {
                  ...img,
                  storageStatus: "error",
                  storageError: "Sign in required to save photos.",
                }
              : img
          )
        )
        return
      }

      patchImages((current) =>
        current.map((img) =>
          img.id === imageId
            ? {
                ...img,
                storageStatus: "uploading",
                storageError: undefined,
              }
            : img
        )
      )

      try {
        const uploaded = await uploadListingOriginalToStorage({
          imageId,
          userId,
        })
        patchImages((current) =>
          current.map((img) => {
            if (img.id !== imageId) return img
            // Drop temporary blob: preview — durable Supabase URL is source of truth.
            if (img.url.startsWith("blob:")) {
              try {
                URL.revokeObjectURL(img.url)
              } catch {
                /* ignore */
              }
            }
            return {
              ...img,
              url: uploaded.url,
              storagePath: uploaded.storagePath,
              storageStatus: "uploaded",
              storageError: undefined,
            }
          })
        )
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Could not save photo to storage."
        patchImages((current) =>
          current.map((img) =>
            img.id === imageId
              ? {
                  ...img,
                  storageStatus: "error",
                  storageError: message,
                }
              : img
          )
        )
        setError(message)
      }
    },
    [userId, patchImages]
  )

  const addFiles = useCallback(
    async (fileList: FileList | File[]) => {
      setError(null)
      const incoming = Array.from(fileList).filter((f) =>
        f.type.startsWith("image/")
      )
      if (incoming.length === 0) {
        setError("Please drop image files only.")
        return
      }

      if (!userId) {
        setError("Sign in required before uploading photos.")
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
          // Keep full-resolution originals for ListWise / eBay.
          // Analysis creates separate temporary compressed copies later.
          const image = await createListingImageFromFile(
            file,
            ordered.length + index,
            ordered.length === 0 && index === 0
          )
          next.push(image)
        }
        const merged = normalizeImages([...ordered, ...next])
        imagesRef.current = merged
        onChange(merged)
        if (incoming.length > remaining) {
          setError(
            `Only ${remaining} more photo${remaining === 1 ? "" : "s"} could be added.`
          )
        }

        // Immediately persist every original to Supabase Storage.
        await mapPool(next, UPLOAD_CONCURRENCY, async (image) => {
          await persistOriginal(image.id)
        })
      } catch {
        setError("Could not process one or more images.")
      } finally {
        setBusy(false)
      }
    },
    [ordered, onChange, userId, persistOriginal]
  )

  function removeImage(id: string) {
    removeListingImageOriginal(id)
    const current = imagesRef.current.find((img) => img.id === id)
    if (current?.url.startsWith("blob:")) {
      try {
        URL.revokeObjectURL(current.url)
      } catch {
        /* ignore */
      }
    }
    patchImages((imgs) => imgs.filter((img) => img.id !== id))
  }

  function setCover(id: string) {
    const current = imagesRef.current
    const target = current.find((img) => img.id === id)
    if (!target) return
    patchImages(() => [target, ...current.filter((img) => img.id !== id)])
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id))
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveId(null)
    if (!over || active.id === over.id) return

    const current = imagesRef.current
    const oldIndex = current.findIndex((img) => img.id === active.id)
    const newIndex = current.findIndex((img) => img.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return

    patchImages(() => arrayMove(current, oldIndex, newIndex))
  }

  function handleDragCancel() {
    setActiveId(null)
  }

  const activeImage = activeId
    ? ordered.find((img) => img.id === activeId) ?? null
    : null
  const activeIndex = activeImage
    ? ordered.findIndex((img) => img.id === activeImage.id)
    : -1

  return (
    <div className="space-y-3">
      <div
        onDragEnter={(e) => {
          e.preventDefault()
          if (!disabled) setFileDragging(true)
        }}
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled) setFileDragging(true)
        }}
        onDragLeave={(e) => {
          e.preventDefault()
          setFileDragging(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          setFileDragging(false)
          if (!disabled) void addFiles(e.dataTransfer.files)
        }}
        className={cn(
          "relative flex min-h-[180px] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-4 py-8 text-center transition-colors",
          fileDragging
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
          {busy ? "Saving photos to storage…" : "Drop photos here"}
        </p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Drag and drop 1–{MAX_LISTING_IMAGES} clothing photos, or tap to browse.
          Each photo is saved to cloud storage immediately at full resolution.
        </p>
        <p className="mt-3 text-xs font-medium text-muted-foreground">
          {uploadedCount} / {ordered.length || 0} saved · {ordered.length} /{" "}
          {MAX_LISTING_IMAGES} selected
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
            Swipe anywhere to scroll · hold ⋮⋮ handle ~0.4s to drag · ★ cover · ✕
            delete
          </p>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <SortableContext
              items={ordered.map((img) => img.id)}
              strategy={rectSortingStrategy}
            >
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                {ordered.map((image, index) => (
                  <SortablePhoto
                    key={image.id}
                    image={image}
                    index={index}
                    disabled={disabled}
                    onSetCover={setCover}
                    onRemove={removeImage}
                    onRetry={(id) => void persistOriginal(id)}
                  />
                ))}
              </div>
            </SortableContext>
            <DragOverlay adjustScale={false}>
              {activeImage ? (
                <div className="w-[min(42vw,160px)] scale-105 opacity-95">
                  <PhotoPreview image={activeImage} index={activeIndex} />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>
      )}
    </div>
  )
}
