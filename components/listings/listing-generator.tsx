"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Sparkles, Save } from "lucide-react"
import { ImageUploader } from "@/components/listings/image-uploader"
import { ListingEditorForm } from "@/components/listings/listing-editor-form"
import { OneClickPublishBar } from "@/components/listings/one-click-publish-bar"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/components/auth/auth-provider"
import { dataUrlToBlob } from "@/lib/listings/images"
import { createEmptyListing, withImages } from "@/lib/listings/local-db"
import { mapDraftToListingFields, getPersistenceMode } from "@/lib/listings/map-draft"
import { persistListing } from "@/lib/listings/repository"
import { listingIsReadyToPublish } from "@/lib/listings/publish"
import type { GeneratedListingOutput } from "@/lib/listings/schema"
import type { Listing, ListingImage } from "@/lib/types"

type Step = "upload" | "review"

export function ListingGenerator() {
  const { user } = useAuth()
  const router = useRouter()
  const [step, setStep] = useState<Step>("upload")
  const [images, setImages] = useState<ListingImage[]>([])
  const [listing, setListing] = useState<Listing | null>(null)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [model, setModel] = useState<string | null>(null)
  const persistence = getPersistenceMode()

  async function handleGenerate() {
    if (!user || images.length === 0) return
    setError(null)
    setGenerating(true)
    setProgress(
      `Uploading & analyzing all ${images.length} photo${images.length === 1 ? "" : "s"}…`
    )

    try {
      const formData = new FormData()
      for (const [index, image] of images.entries()) {
        const blob = dataUrlToBlob(image.url)
        formData.append("images", blob, `photo-${index + 1}.jpg`)
      }

      const response = await fetch("/api/listings/generate", {
        method: "POST",
        body: formData,
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || "Generation failed")
      }

      const draft = payload.draft as GeneratedListingOutput
      setModel(payload.model ?? "gpt-4o")

      const mapped = mapDraftToListingFields(draft)

      const base = createEmptyListing(user.id)
      const next = withImages(base, images, {
        title: mapped.title,
        description: mapped.description,
        price: mapped.price,
        currency: mapped.currency,
        keywords: mapped.keywords,
        specifics: mapped.specifics,
        fieldConfidence: mapped.fieldConfidence,
        comps: mapped.comps,
        aiGenerated: true,
        status: "draft",
        analysisMeta: {
          imagesAnalyzed: payload.imagesAnalyzed ?? images.length,
          model: payload.model ?? "gpt-4o",
          analyzedAt: new Date().toISOString(),
        },
      })

      if (!next.title.trim()) {
        throw new Error("Mapped listing title was empty after AI analysis.")
      }

      setListing(next)
      setStep("review")
      setProgress(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed")
      setProgress(null)
    } finally {
      setGenerating(false)
    }
  }

  async function handleSave(status: Listing["status"] = "ready") {
    if (!listing || !user) return
    setSaving(true)
    setError(null)
    try {
      const toSave: Listing = {
        ...listing,
        images,
        title: listing.title.trim(),
        status: listingIsReadyToPublish({ ...listing, images })
          ? status
          : "draft",
        updatedAt: new Date().toISOString(),
      }
      if (!toSave.title) {
        throw new Error("Title is required before saving.")
      }
      const saved = await persistListing(toSave)
      router.push(`/dashboard/listings/${saved.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save listing")
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-accent">Production listing engine</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            {step === "upload" ? "Upload photos" : "Review & edit"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {step === "upload"
              ? "Every photo is uploaded to the server and analyzed with OpenAI Vision."
              : "Edit any field, check confidence scores, then save or one-click publish."}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span
            className={
              step === "upload" ? "font-semibold text-foreground" : undefined
            }
          >
            1. Analyze
          </span>
          <span aria-hidden>→</span>
          <span
            className={
              step === "review" ? "font-semibold text-foreground" : undefined
            }
          >
            2. Edit & publish
          </span>
        </div>
      </div>

      <p className="rounded-lg border border-border bg-card/50 px-3 py-2 text-xs text-muted-foreground">
        Storage:{" "}
        <span className="font-medium text-foreground">
          {persistence === "supabase"
            ? "Supabase"
            : "Browser IndexedDB (local only — Supabase not configured)"}
        </span>
      </p>

      {step === "upload" && (
        <div className="animate-rise space-y-5">
          <ImageUploader
            images={images}
            onChange={setImages}
            disabled={generating}
          />
          {progress && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-accent" />
              {progress}
            </p>
          )}
          {error && (
            <p
              className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
              role="alert"
            >
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <Button
              variant="accent"
              size="lg"
              disabled={images.length === 0 || generating}
              onClick={() => void handleGenerate()}
            >
              {generating ? (
                <>
                  <Loader2 className="animate-spin" />
                  Running Vision engine…
                </>
              ) : (
                <>
                  <Sparkles />
                  Analyze {images.length || ""} photo
                  {images.length === 1 ? "" : "s"}
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {step === "review" && listing && (
        <div className="animate-rise space-y-6">
          {listing.analysisMeta && (
            <p className="rounded-xl border border-border bg-card/60 px-4 py-3 text-sm text-muted-foreground">
              Analyzed {listing.analysisMeta.imagesAnalyzed} photo
              {listing.analysisMeta.imagesAnalyzed === 1 ? "" : "s"} with{" "}
              <span className="font-medium text-foreground">
                {model ?? listing.analysisMeta.model}
              </span>
              . Title:{" "}
              <span className="font-medium text-foreground">{listing.title}</span>
            </p>
          )}

          <ImageUploader
            images={images}
            onChange={(next) => {
              setImages(next)
              setListing({ ...listing, images: next })
            }}
            disabled={saving}
          />
          <ListingEditorForm
            listing={{ ...listing, images }}
            onChange={setListing}
            disabled={saving}
          />
          <OneClickPublishBar listing={{ ...listing, images }} disabled={saving} />
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <div className="sticky bottom-3 z-20 flex flex-wrap gap-3 rounded-2xl border border-border bg-background/90 p-3 backdrop-blur-xl sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
            <Button
              variant="outline"
              disabled={saving || generating}
              onClick={() => {
                setStep("upload")
                setError(null)
              }}
            >
              Back to photos
            </Button>
            <Button
              variant="secondary"
              disabled={saving}
              onClick={() => void handleSave("draft")}
            >
              {saving ? <Loader2 className="animate-spin" /> : <Save />}
              Save draft
            </Button>
            <Button
              variant="accent"
              disabled={saving}
              onClick={() => void handleSave("ready")}
            >
              {saving ? <Loader2 className="animate-spin" /> : <Save />}
              Save listing
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
