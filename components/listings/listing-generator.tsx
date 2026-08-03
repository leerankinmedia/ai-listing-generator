"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Sparkles, Save, Camera } from "lucide-react"
import { ImageUploader } from "@/components/listings/image-uploader"
import { ListingEditorForm } from "@/components/listings/listing-editor-form"
import { OneClickPublishBar } from "@/components/listings/one-click-publish-bar"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/components/auth/auth-provider"
import { readApiJsonResponse } from "@/lib/api/read-json-response"
import { uploadAnalyzeImagesIndividually } from "@/lib/listings/analyze-client"
import { ensureDurableOriginalImageUrls } from "@/lib/listings/durable-images"
import { createEmptyListing, withImages } from "@/lib/listings/local-db"
import { mapDraftToListingFields } from "@/lib/listings/map-draft"
import { hydrateListingEbayAspects } from "@/lib/listings/hydrate-ebay-aspects"
import { persistListing } from "@/lib/listings/repository"
import { listingIsReadyToPublish } from "@/lib/listings/publish"
import { MAX_LISTING_IMAGES } from "@/lib/listings/schema"
import type { GeneratedListingOutput } from "@/lib/listings/schema"
import {
  allListingImagesUploaded,
  clearUploadSession,
  listingImagesStillUploading,
  readUploadSession,
  writeUploadSession,
} from "@/lib/listings/upload-session"
import {
  applyEbaySellerDefaultsToListing,
  ebaySellerDefaultsAreReady,
  normalizeEbaySellerDefaults,
} from "@/lib/seller/ebay-defaults"
import {
  readLocalEbaySellerDefaults,
} from "@/lib/seller/ebay-defaults-local"
import type { Listing, ListingImage } from "@/lib/types"

type Step = "upload" | "review"

const ROTATING_MESSAGES = [
  "Reading labels",
  "Identifying item details",
  "Building your listing",
  "Checking photos for details",
  "Writing your draft",
]

function AnalysisProgressScreen({
  percent,
  message,
}: {
  percent: number
  message: string
}) {
  return (
    <div
      className="flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-border bg-card/70 px-6 py-12 text-center"
      role="status"
      aria-live="polite"
    >
      <p className="font-display text-2xl font-semibold tracking-tight">
        Analyzing photos
      </p>
      <div className="mt-6 h-2 w-full max-w-md overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
          style={{ width: `${Math.max(4, Math.min(100, percent))}%` }}
        />
      </div>
      <p className="mt-4 text-sm text-muted-foreground">{message}…</p>
    </div>
  )
}

export function ListingGenerator() {
  const { user } = useAuth()
  const router = useRouter()
  const [step, setStep] = useState<Step>("upload")
  const [images, setImages] = useState<ListingImage[]>([])
  const [listing, setListing] = useState<Listing | null>(null)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [sellerNotes, setSellerNotes] = useState("")
  const [progressPercent, setProgressPercent] = useState(0)
  const [progressMessage, setProgressMessage] = useState(ROTATING_MESSAGES[0])
  const [aspectMeta, setAspectMeta] = useState<{
    missing: string[]
    filled: number
    total: number
  }>({ missing: [], filled: 0, total: 0 })
  const [sessionHydrated, setSessionHydrated] = useState(false)

  const photosReady = useMemo(
    () => allListingImagesUploaded(images),
    [images]
  )
  const photosUploading = useMemo(
    () => listingImagesStillUploading(images),
    [images]
  )

  // Restore durable photo URLs after refresh / new Vercel instance.
  useEffect(() => {
    if (!user?.id || sessionHydrated) return
    const draft = readUploadSession(user.id)
    if (draft) {
      setImages(draft.images)
      if (draft.sellerNotes) setSellerNotes(draft.sellerNotes)
    }
    setSessionHydrated(true)
  }, [user?.id, sessionHydrated])

  // Persist only uploaded Supabase URLs so Analyze survives refresh.
  useEffect(() => {
    if (!user?.id || !sessionHydrated) return
    writeUploadSession(user.id, { images, sellerNotes })
  }, [user?.id, images, sellerNotes, sessionHydrated])

  useEffect(() => {
    if (!generating) return
    setProgressPercent(8)
    setProgressMessage(ROTATING_MESSAGES[0])
    let messageIndex = 0
    const messageTimer = window.setInterval(() => {
      messageIndex = (messageIndex + 1) % ROTATING_MESSAGES.length
      setProgressMessage(ROTATING_MESSAGES[messageIndex])
    }, 2800)
    const progressTimer = window.setInterval(() => {
      setProgressPercent((prev) => {
        if (prev >= 90) return 90
        if (prev < 40) return prev + 3
        if (prev < 70) return prev + 1.5
        return prev + 0.4
      })
    }, 400)
    return () => {
      window.clearInterval(messageTimer)
      window.clearInterval(progressTimer)
    }
  }, [generating])

  async function handleGenerate() {
    if (!user || images.length === 0) return
    if (images.length > MAX_LISTING_IMAGES) {
      setError(`Upload between 1 and ${MAX_LISTING_IMAGES} photos.`)
      return
    }
    if (!allListingImagesUploaded(images)) {
      setError(
        "Wait until every photo shows Saved before analyzing. Re-upload any that failed."
      )
      return
    }

    setError(null)
    setNotice(null)
    setGenerating(true)

    try {
      const ordered = [...images].sort(
        (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
      )

      // Temporary resized copies for AI only — originals stay at full resolution.
      // Must finish durable uploads (URL+path) before any OpenAI request.
      const uploaded = await uploadAnalyzeImagesIndividually({
        images: ordered,
        userId: user.id,
      })
      const imageUrls = uploaded.map((row) => row.url)
      if (
        imageUrls.length !== ordered.length ||
        imageUrls.some((url) => !url) ||
        uploaded.some((row) => !row.path)
      ) {
        throw new Error(
          `Analyze upload incomplete (${uploaded.filter((r) => r.url && r.path).length}/${ordered.length} ready). Fix Storage before Analyze.`
        )
      }

      const response = await fetch("/api/listings/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrls,
          sellerNotes: sellerNotes.trim() || undefined,
        }),
        credentials: "same-origin",
      })
      const parsed = await readApiJsonResponse<{
        error?: string
        draft?: GeneratedListingOutput
        model?: string
        imagesAnalyzed?: number
        imagesFailed?: Array<{ index: number; sourceUrl?: string; error: string }>
        warnings?: string[]
        partial?: boolean
        usageRecorded?: boolean
        usageRecordError?: string
      }>(response)
      if (!parsed.ok) {
        throw new Error(parsed.error)
      }
      const payload = parsed.data
      if (payload.usageRecorded === false) {
        console.warn(
          "[listing-generator] AI usage was not recorded",
          payload.usageRecordError
        )
      }
      if (payload.imagesFailed?.length) {
        console.warn("[listing-generator] partial analysis failed photos", {
          failed: payload.imagesFailed,
        })
      }

      const draft = payload.draft as GeneratedListingOutput
      setProgressPercent(92)
      setProgressMessage("Completing eBay item specifics")

      const mapped = mapDraftToListingFields(draft)
      const base = createEmptyListing(user.id)
      let next = withImages(base, ordered, {
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
        targetMarketplaces: ["ebay"],
        analysisMeta: {
          imagesAnalyzed: payload.imagesAnalyzed ?? ordered.length,
          model: payload.model ?? "vision",
          analyzedAt: new Date().toISOString(),
        },
      })

      if (!next.title.trim()) {
        throw new Error("Mapped listing title was empty after AI analysis.")
      }

      // AI employee: fill Taxonomy aspects before the seller sees the edit page.
      const hydrated = await hydrateListingEbayAspects(next)
      next = hydrated.listing

      // Apply saved selling defaults (shipping, returns, offers, promo).
      let defaultsApplied = false
      try {
        const prefsRes = await fetch("/api/seller/ebay-defaults", {
          credentials: "same-origin",
        })
        if (prefsRes.ok) {
          const prefs = (await prefsRes.json()) as {
            defaults?: unknown
            ready?: boolean
          }
          if (prefs.defaults && prefs.ready) {
            next = applyEbaySellerDefaultsToListing(
              next,
              normalizeEbaySellerDefaults(prefs.defaults),
              { onlyIfUnset: false }
            )
            defaultsApplied = true
          }
        }
      } catch {
        const local = readLocalEbaySellerDefaults()
        if (local && ebaySellerDefaultsAreReady(local.defaults)) {
          next = applyEbaySellerDefaultsToListing(next, local.defaults, {
            onlyIfUnset: false,
          })
          defaultsApplied = true
        }
      }

      setProgressPercent(100)
      setProgressMessage("Building your listing")

      if (payload.warnings?.length) {
        setNotice(payload.warnings.join(" "))
      } else if (payload.partial) {
        setNotice(
          "Partial analysis: some photos could not be read. Review the draft carefully."
        )
      } else if (!defaultsApplied) {
        setNotice(
          "Set your selling defaults once so shipping, returns, and offers fill automatically."
        )
      } else if (hydrated.ok && hydrated.summary.total > 0) {
        const n = hydrated.summary.needsAttention
        setNotice(
          n === 0
            ? `AI completed ${hydrated.summary.completed}/${hydrated.summary.total} item specifics. Selling preferences applied.`
            : `AI completed ${hydrated.summary.completed}/${hydrated.summary.total} item specifics. Only ${n} need your attention.`
        )
      } else if (defaultsApplied) {
        setNotice("Selling preferences applied from your defaults.")
      }

      setListing(next)
      setStep("review")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed")
    } finally {
      setGenerating(false)
      setProgressPercent(0)
    }
  }

  async function handleSave(status: Listing["status"] = "ready") {
    if (!listing || !user) return
    setSaving(true)
    setError(null)
    try {
      const sourceImages = (images.length > 0 ? images : listing.images) ?? []
      const normalizedImages = [...sourceImages]
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        .map((img, index) => ({
          ...img,
          sortOrder: index,
          isPrimary: index === 0,
        }))

      const durableImages = await ensureDurableOriginalImageUrls(
        normalizedImages,
        user.id
      )
      setImages(durableImages)

      const ready = listingIsReadyToPublish({
        ...listing,
        images: durableImages,
      })
      const toSave: Listing = {
        ...listing,
        images: durableImages,
        title: listing.title.trim(),
        status: ready ? status : "draft",
        updatedAt: new Date().toISOString(),
      }
      if (!toSave.title) {
        throw new Error("Title is required before saving.")
      }
      const saved = await persistListing(toSave)
      clearUploadSession(user.id)
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
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            {step === "upload" ? "Upload clothing photos" : "Review & edit listing"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {step === "upload"
              ? `Upload 1–${MAX_LISTING_IMAGES} photos — AI fills the listing like an employee.`
              : "Quick review: AI already filled most fields. Confirm anything marked Review, then publish."}
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

      {step === "upload" && (
        <div className="animate-rise space-y-5">
          {generating ? (
            <AnalysisProgressScreen
              percent={progressPercent}
              message={progressMessage}
            />
          ) : (
            <>
              <ImageUploader
                images={images}
                onChange={setImages}
                disabled={generating}
                userId={user?.id}
              />
              <div className="space-y-2">
                <Label htmlFor="seller-notes">Help the AI</Label>
                <Textarea
                  id="seller-notes"
                  value={sellerNotes}
                  onChange={(event) => setSellerNotes(event.target.value)}
                  placeholder="Add anything the photos may not show — women’s, size, flaws, brand, item type, etc."
                  disabled={generating}
                  className="min-h-[96px]"
                />
              </div>
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
                  disabled={!photosReady || generating}
                  onClick={() => void handleGenerate()}
                >
                  <Sparkles />
                  Analyze {images.length || ""} photo
                  {images.length === 1 ? "" : "s"}
                </Button>
                <p className="flex items-center gap-1.5 self-center text-xs text-muted-foreground">
                  <Camera className="h-3.5 w-3.5" />
                  {photosUploading
                    ? "Saving photos to cloud storage…"
                    : photosReady
                      ? "Creates a draft title, description, details, and price for you to edit"
                      : images.length === 0
                        ? "Upload photos to continue"
                        : "Analyze unlocks when every photo shows Saved"}
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {step === "review" && listing && (
        <div className="animate-rise space-y-6">
          <div className="rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm">
            <p className="font-medium text-foreground">{listing.title}</p>
            <p className="mt-1 text-muted-foreground">
              AI filled this listing from your photos. Confirm anything marked Review —
              most clothing listings need under 10 seconds.
            </p>
          </div>
          {notice && (
            <p
              className="rounded-xl border border-border bg-card/70 px-4 py-3 text-sm text-muted-foreground"
              role="status"
            >
              {notice}
            </p>
          )}

          <ImageUploader
            images={images}
            onChange={(next) => {
              setImages(next)
              setListing({ ...listing, images: next })
            }}
            disabled={saving}
            userId={user?.id}
          />
          <ListingEditorForm
            listing={{ ...listing, images }}
            onChange={setListing}
            disabled={saving}
            onAspectMetaChange={setAspectMeta}
          />
          <OneClickPublishBar
            listing={{ ...listing, images }}
            disabled={saving}
            aspectMeta={aspectMeta}
            onListingChange={(next) => {
              setListing(next)
              setImages(next.images)
            }}
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
              Save as draft
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
