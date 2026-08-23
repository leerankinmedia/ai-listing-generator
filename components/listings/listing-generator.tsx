"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Sparkles } from "lucide-react"
import { GenerationProgressScreen, GENERATION_PROGRESS_MESSAGES } from "@/components/listings/generation-progress"
import { ImageUploader } from "@/components/listings/image-uploader"
import { ReviewDraft } from "@/components/listings/review-draft"
import { ListingLiveSuccess } from "@/components/listings/listing-live"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/components/auth/auth-provider"
import { readApiJsonResponse } from "@/lib/api/read-json-response"
import { uploadAnalyzeImagesIndividually } from "@/lib/listings/analyze-client"
import { hydrateListingEbayAspects } from "@/lib/listings/hydrate-ebay-aspects"
import { createEmptyListing, withImages } from "@/lib/listings/local-db"
import { mapDraftToListingFields } from "@/lib/listings/map-draft"
import { persistListing } from "@/lib/listings/repository"
import {
  logGenerateTimings,
  mergeGenerateStages,
} from "@/lib/observability/generate-timings"
import { ensureListingQuantity } from "@/lib/listings/review-draft"
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
import { readLocalEbaySellerDefaults } from "@/lib/seller/ebay-defaults-local"
import type { Listing, ListingImage, OneClickPublishResult } from "@/lib/types"
import type { EbayLiveSummary } from "@/lib/listings/review-draft"

type Step = "upload" | "review" | "live"

export function ListingGenerator() {
  const { user } = useAuth()
  const router = useRouter()
  const [step, setStep] = useState<Step>("upload")
  const [images, setImages] = useState<ListingImage[]>([])
  const [listing, setListing] = useState<Listing | null>(null)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [sellerNotes, setSellerNotes] = useState("")
  const [progressPercent, setProgressPercent] = useState(0)
  const [progressMessage, setProgressMessage] = useState(
    GENERATION_PROGRESS_MESSAGES[0]
  )
  const [sessionHydrated, setSessionHydrated] = useState(false)
  const [liveSummary, setLiveSummary] = useState<EbayLiveSummary | null>(null)
  const [notesOpen, setNotesOpen] = useState(false)

  const photosReady = useMemo(
    () => allListingImagesUploaded(images),
    [images]
  )
  const photosUploading = useMemo(
    () => listingImagesStillUploading(images),
    [images]
  )

  useEffect(() => {
    if (!user?.id || sessionHydrated) return
    const draft = readUploadSession(user.id)
    if (draft) {
      setImages(draft.images)
      if (draft.sellerNotes) {
        setSellerNotes(draft.sellerNotes)
        setNotesOpen(true)
      }
    }
    setSessionHydrated(true)
  }, [user?.id, sessionHydrated, router])

  useEffect(() => {
    if (!user?.id || !sessionHydrated) return
    writeUploadSession(user.id, {
      images,
      sellerNotes,
    })
  }, [user?.id, images, sellerNotes, sessionHydrated])

  useEffect(() => {
    if (!generating) return
    setProgressPercent(8)
    setProgressMessage(GENERATION_PROGRESS_MESSAGES[0])
    let messageIndex = 0
    const messageTimer = window.setInterval(() => {
      messageIndex = (messageIndex + 1) % GENERATION_PROGRESS_MESSAGES.length
      setProgressMessage(GENERATION_PROGRESS_MESSAGES[messageIndex])
    }, 2400)
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
        "Wait until every photo is saved, then generate. Re-upload any that failed."
      )
      return
    }

    setError(null)
    setNotice(null)
    setGenerating(true)

    try {
      const generateStarted = Date.now()
      const ordered = [...images].sort(
        (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
      )

      const analyzeUpload = await uploadAnalyzeImagesIndividually({
        images: ordered,
      })
      const imageUrls = analyzeUpload.urls
      console.info("[timing]", {
        flow: "generate",
        stage: "photo_analysis_preparation",
        ms: analyzeUpload.timings.photo_analysis_preparation,
      })
      console.info("[timing]", {
        flow: "generate",
        stage: "analysis_image_upload",
        ms: analyzeUpload.timings.analysis_image_upload,
      })

      const generateApiStarted = Date.now()
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
        timings?: { totalMs?: number; stages?: Record<string, number> }
      }>(response)
      console.info("[timing]", {
        flow: "generate",
        stage: "generate_api",
        ms: Date.now() - generateApiStarted,
        server: parsed.ok ? parsed.data.timings : undefined,
      })
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
      setProgressMessage("Adding item details")

      const mappingStarted = Date.now()
      const mapped = mapDraftToListingFields(draft)
      const base = createEmptyListing(user.id)
      let next = withImages(base, ordered, {
        title: mapped.title,
        description: mapped.description,
        price: mapped.price,
        currency: mapped.currency,
        keywords: mapped.keywords,
        specifics: {
          ...base.specifics,
          ...mapped.specifics,
          extras: {
            ...(base.specifics.extras || {}),
            ...(mapped.specifics.extras || {}),
            quantity: mapped.specifics.extras?.quantity?.trim() || "1",
          },
        },
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
      next = ensureListingQuantity(next)
      const draftMappingMs = Date.now() - mappingStarted
      console.info("[timing]", {
        flow: "generate",
        stage: "draft_mapping",
        ms: draftMappingMs,
      })

      if (!next.title.trim()) {
        throw new Error("Mapped listing title was empty after AI analysis.")
      }

      const hydrateStarted = Date.now()
      const [hydrated, defaultsBundle] = await Promise.all([
        hydrateListingEbayAspects(next),
        (async () => {
          try {
            const prefsRes = await fetch("/api/seller/ebay-defaults", {
              credentials: "same-origin",
            })
            if (prefsRes.ok) {
              const prefs = (await prefsRes.json()) as {
                defaults?: unknown
                ready?: boolean
              }
              if (prefs.defaults) {
                const normalized = normalizeEbaySellerDefaults(prefs.defaults)
                return {
                  defaults: normalized,
                  applied: ebaySellerDefaultsAreReady(normalized),
                }
              }
            }
          } catch {
            /* local fallback below */
          }
          const local = readLocalEbaySellerDefaults()
          if (local?.defaults) {
            return {
              defaults: local.defaults,
              applied: ebaySellerDefaultsAreReady(local.defaults),
            }
          }
          return { defaults: null, applied: false }
        })(),
      ])
      next = hydrated.listing
      let defaultsApplied = false
      if (defaultsBundle.defaults) {
        next = applyEbaySellerDefaultsToListing(next, defaultsBundle.defaults, {
          onlyIfUnset: false,
        })
        defaultsApplied = defaultsBundle.applied
      }
      console.info("[timing]", {
        flow: "generate",
        stage: "taxonomy_aspects_hydration",
        ms: Date.now() - hydrateStarted,
        ebay: hydrated.timings,
      })

      setProgressPercent(100)
      setProgressMessage("Preparing your draft")

      if (payload.warnings?.length) {
        setNotice(payload.warnings.join(" "))
      } else if (payload.partial) {
        setNotice(
          "Partial analysis: some photos could not be read. Review the draft carefully."
        )
      } else if (!defaultsApplied) {
        setNotice(
          "Set selling defaults once so shipping, returns, and handling fill automatically."
        )
      }

      let saved: Listing
      try {
        const persistStarted = Date.now()
        saved = await persistListing({
          ...next,
          images: ordered,
          status: "draft",
          updatedAt: new Date().toISOString(),
        })
        if (saved.images.length === 0 && ordered.length > 0) {
          saved = await persistListing({
            ...saved,
            images: ordered,
            updatedAt: new Date().toISOString(),
          })
        }
        const persistMs = Date.now() - persistStarted
        console.info("[timing]", {
          flow: "generate",
          stage: "database_save",
          ms: persistMs,
        })
        const redirectStarted = Date.now()
        writeUploadSession(user.id, {
          images: saved.images.length > 0 ? saved.images : ordered,
          sellerNotes,
          listingId: saved.id,
        })
        router.replace(`/dashboard/listings/${saved.id}`)
        const redirectMs = Date.now() - redirectStarted
        console.info("[timing]", {
          flow: "generate",
          stage: "redirect_to_review",
          ms: redirectMs,
        })
        const totalMs = Date.now() - generateStarted
        const stages = mergeGenerateStages(
          analyzeUpload.timings,
          parsed.ok ? parsed.data.timings?.stages : undefined,
          hydrated.timings,
          {
            draft_mapping: draftMappingMs,
            database_save: persistMs,
            redirect_to_review: redirectMs,
            total: totalMs,
          }
        )
        logGenerateTimings(stages, {
          model: payload.model,
          imagesAnalyzed: payload.imagesAnalyzed,
          photoCount: ordered.length,
        })
        return
      } catch (persistError) {
        console.error("[listing-generator] persist after generate failed", persistError)
        setListing(next)
        setImages(ordered)
        setNotice(
          "Draft is on this device until you tap Save draft. Cloud save failed — check your connection."
        )
        setStep("review")
        return
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed")
    } finally {
      setGenerating(false)
      setProgressPercent(0)
    }
  }

  function handlePublished(payload: {
    listing: Listing
    results: OneClickPublishResult[]
    summary: EbayLiveSummary
  }) {
    if (user?.id) clearUploadSession(user.id)
    setListing(payload.listing)
    setLiveSummary(payload.summary)
    setStep("live")
  }

  if (step === "live" && liveSummary) {
    return (
      <ListingLiveSuccess
        summary={liveSummary}
        onCreateAnother={() => {
          if (user?.id) clearUploadSession(user.id)
        }}
      />
    )
  }

  if (step === "review" && listing) {
    return (
      <ReviewDraft
        listing={{ ...listing, images }}
        onChange={(next) => {
          setListing(next)
          setImages(next.images)
        }}
        notice={notice}
        onPublished={handlePublished}
      />
    )
  }

  return (
    <div className="mx-auto max-w-lg space-y-5 pb-28">
      {generating ? (
        <GenerationProgressScreen
          percent={progressPercent}
          message={progressMessage}
          photoCount={images.length}
        />
      ) : (
        <>
          <header className="space-y-1">
            <h1 className="font-display text-3xl font-semibold tracking-tight">
              Create listing
            </h1>
            <p className="text-sm text-muted-foreground">
              Add photos, then generate. AI fills the eBay draft for you.
            </p>
          </header>

          <ImageUploader
            images={images}
            onChange={setImages}
            disabled={generating}
            userId={user?.id}
            variant="create"
          />

          <div>
            <button
              type="button"
              className="text-sm font-medium text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => setNotesOpen((open) => !open)}
            >
              {notesOpen ? "Hide extra notes" : "Add a note the photos don’t show"}
            </button>
            {notesOpen && (
              <div className="mt-2 space-y-2">
                <Label htmlFor="seller-notes" className="sr-only">
                  Seller notes
                </Label>
                <Textarea
                  id="seller-notes"
                  value={sellerNotes}
                  onChange={(event) => setSellerNotes(event.target.value)}
                  placeholder="Size, flaws, brand, department — only if the photos miss it."
                  disabled={generating}
                  className="min-h-[88px]"
                />
              </div>
            )}
          </div>

          {error && (
            <p
              className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
              role="alert"
            >
              {error}
            </p>
          )}

          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl">
            <div className="mx-auto max-w-lg">
              <Button
                variant="accent"
                size="lg"
                className="h-12 w-full text-base"
                disabled={!photosReady || generating}
                onClick={() => void handleGenerate()}
              >
                {generating ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Sparkles />
                )}
                Generate listing
              </Button>
              <p className="mt-2 text-center text-xs text-muted-foreground">
                {photosUploading
                  ? "Saving photos…"
                  : photosReady
                    ? "One tap — then review the draft"
                    : images.length === 0
                      ? "Add photos to continue"
                      : "Generate unlocks when every photo is saved"}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
