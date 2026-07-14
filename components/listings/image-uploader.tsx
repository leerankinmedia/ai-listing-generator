"use client"

import { useCallback, useMemo, useRef, useState } from "react"
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
import { GripVertical, ImagePlus, Star, X } from "lucide-react"
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

function SortablePhoto({
  image,
  index,
  disabled,
  onSetCover,
  onRemove,
}: {
  image: ListingImage
  index: number
  disabled?: boolean
  onSetCover: (id: string) => void
  onRemove: (id: string) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: image.id,
    disabled,
  })

  const isCover = Boolean(image.isPrimary) || index === 0
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative aspect-square touch-none overflow-hidden rounded-xl border bg-secondary",
        isCover ? "border-accent ring-1 ring-accent/40" : "border-border",
        isDragging && "z-20 opacity-40",
        !disabled && "cursor-grab active:cursor-grabbing"
      )}
      {...attributes}
      {...listeners}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image.url}
        alt={`Product photo ${index + 1}`}
        className="pointer-events-none h-full w-full object-cover"
        draggable={false}
      />
      {isCover && (
        <span className="pointer-events-none absolute left-1.5 top-1.5 rounded-md bg-foreground/85 px-1.5 py-0.5 text-[10px] font-semibold text-background">
          Cover
        </span>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/70 to-transparent p-1.5 pt-6">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-background/80 text-foreground">
          <GripVertical className="h-4 w-4" aria-hidden />
        </span>
        <button
          type="button"
          aria-label={
            isCover
              ? `Photo ${index + 1} is cover`
              : `Set photo ${index + 1} as cover`
          }
          disabled={disabled || isCover}
          className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-md bg-background/90 text-foreground disabled:opacity-40"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onSetCover(image.id)
          }}
        >
          <Star
            className={cn("h-4 w-4", isCover && "fill-accent text-accent")}
          />
        </button>
        <span className="h-8 w-8" aria-hidden />
      </div>
      <button
        type="button"
        aria-label={`Remove photo ${index + 1}`}
        disabled={disabled}
        className="pointer-events-auto absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-md bg-background/90 text-foreground"
        onPointerDown={(e) => e.stopPropagation()}
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

export function ImageUploader({ images, onChange, disabled }: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileDragging, setFileDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)

  const ordered = useMemo(
    () => [...images].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [images]
  )

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      // Short press-and-hold so taps still hit cover/delete on phones
      activationConstraint: { delay: 160, tolerance: 8 },
    })
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
          setError(
            `Only ${remaining} more photo${remaining === 1 ? "" : "s"} could be added.`
          )
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
    onChange(
      normalizeImages([target, ...ordered.filter((img) => img.id !== id)])
    )
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id))
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveId(null)
    if (!over || active.id === over.id) return

    const oldIndex = ordered.findIndex((img) => img.id === active.id)
    const newIndex = ordered.findIndex((img) => img.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return

    onChange(normalizeImages(arrayMove(ordered, oldIndex, newIndex)))
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
          {busy ? "Processing photos…" : "Drop photos here"}
        </p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Drag and drop 1–{MAX_LISTING_IMAGES} clothing photos, or tap to browse.
          Press and drag photos to reorder before saving.
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
            Press and drag to reorder · tap ★ for cover · ✕ to delete
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
