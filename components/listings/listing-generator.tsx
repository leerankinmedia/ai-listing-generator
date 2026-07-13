"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Sparkles, Save } from "lucide-react"
import { ImageUploader } from "@/components/listings/image-uploader"
import { ListingEditorForm } from "@/components/listings/listing-editor-form"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/components/auth/auth-provider"
import { dataUrlToBlob } from "@/lib/listings/images"
import {
  createEmptyListing,
  withImages,
} from "@/lib/listings/local-db"
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
  const [mode, setMode] = useState<"openai" | "demo" | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleGenerate() {
    if (!user || images.length === 0) return
    setError(null)
    setGenerating(true)

    try {
      const formData = new FormData()
      // Send up to 8 compressed images for Vision; keep all in the listing
      const forVision = images.slice(0, 8)
      for (const [index, image] of forVision.entries()) {
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
      setMode(payload.mode)

      const base = createEmptyListing(user.id)
      const next = withImages(base, images, {
        title: draft.title,
        description: draft.description,
        price: draft.price,
        currency: draft.currency,
        keywords: draft.keywords,
        specifics: draft.specifics,
        aiGenerated: true,
        status: "draft",
      })
      setListing(next)
      setStep("review")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed")
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
        status: listingIsReadyToPublish({ ...listing, images })
          ? status
          : "draft",
        updatedAt: new Date().toISOString(),
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
          <p className="text-sm font-medium text-accent">AI Listing Generator</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            {step === "upload" ? "Upload photos" : "Review & edit"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {step === "upload"
              ? "Drop product photos and let ListWise draft a marketplace-ready listing."
              : "Tune the AI draft, then save. Publishing to marketplaces comes next."}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span
            className={
              step === "upload" ? "font-semibold text-foreground" : undefined
            }
          >
            1. Photos
          </span>
          <span aria-hidden>→</span>
          <span
            className={
              step === "review" ? "font-semibold text-foreground" : undefined
            }
          >
            2. Edit & save
          </span>
        </div>
      </div>

      {mode === "demo" && step === "review" && (
        <p className="rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm">
          Demo Vision mode — add <code className="text-xs">OPENAI_API_KEY</code>{" "}
          for live image analysis. You can still edit and save this draft.
        </p>
      )}

      {step === "upload" && (
        <div className="animate-rise space-y-5">
          <ImageUploader
            images={images}
            onChange={setImages}
            disabled={generating}
          />
          {error && (
            <p className="text-sm text-destructive" role="alert">
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
                  Analyzing photos…
                </>
              ) : (
                <>
                  <Sparkles />
                  Generate listing
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {step === "review" && listing && (
        <div className="animate-rise space-y-6">
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
