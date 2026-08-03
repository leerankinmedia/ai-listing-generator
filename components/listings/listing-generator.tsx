"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Sparkles, Save, Camera } from "lucide-react"
import { usePaidToolsAccess } from "@/components/billing/paid-feature-gate"
import { ImageUploader } from "@/components/listings/image-uploader"
import { ListingEditorForm } from "@/components/listings/listing-editor-form"
import { OneClickPublishBar } from "@/components/listings/one-click-publish-bar"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/components/auth/auth-provider"
import { isOwnerBillingStatus } from "@/lib/billing/owner"
import { readApiJsonResponse } from "@/lib/api/read-json-response"
import {
  LISTING_PIPELINE_MODES,
  PIPELINE_MODE_LABELS,
  type ListingPipelineMode,
} from "@/lib/ai/pipeline-mode"
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

type ProgressStage =
  | "Uploading"
  | "Identifying item"
  | "Building listing"
  | "Ready"

const STAGE_PERCENT: Record<ProgressStage, number> = {
  Uploading: 20,
  "Identifying item": 55,
  "Building listing": 85,
  Ready: 100,
}

function AnalysisProgressScreen({
  percent,
  stage,
  detail,
}: {
  percent: number
  stage: ProgressStage
  detail?: string | null
}) {
  const stages: ProgressStage[] = [
    "Uploading",
    "Identifying item",
    "Building listing",
    "Ready",
  ]
  return (
    <div
      className="flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-border bg-card/70 px-6 py-12 text-center"
      role="status"
      aria-live="polite"
    >
      <p className="font-display text-2xl font-semibold tracking-tight">
        {stage === "Ready" ? "Ready" : "Analyzing photos"}
      </p>
      <div className="mt-6 h-2 w-full max-w-md overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
          style={{ width: `${Math.max(4, Math.min(100, percent))}%` }}
        />
      </div>
      <p className="mt-4 text-sm font-medium text-foreground">{stage}</p>
      {detail && (
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      )}
      <ol className="mt-6 flex flex-wrap justify-center gap-2 text-[11px] text-muted-foreground">
        {stages.map((s) => (
          <li
            key={s}
            className={
              s === stage
                ? "rounded-md bg-accent/15 px-2 py-1 font-semibold text-foreground"
                : "rounded-md px-2 py-1"
            }
          >
            {s}
          </li>
        ))}
      </ol>
    </div>
  )
}

export function ListingGenerator() {
  const { user } = useAuth()
  const { status: billingStatus } = usePaidToolsAccess()
  const isFounder = isOwnerBillingStatus(billingStatus)
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
  const [progressStage, setProgressStage] =
    useState<ProgressStage>("Uploading")
  const [progressDetail, setProgressDetail] = useState<string | null>(null)
  const [pipelineMode, setPipelineMode] =
    useState<ListingPipelineMode>("hybrid")
  const [lastTimings, setLastTimings] = useState<{
    uploadMs?: number
    identityMs?: number
    listingMs?: number
    ebayMetadataMs?: number
    totalMs?: number
    pipelineMode?: string
    identityModel?: string
    copyModel?: string
  } | null>(null)
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
    setLastTimings(null)
    setProgressStage("Uploading")
    setProgressPercent(STAGE_PERCENT.Uploading)
    setProgressDetail(null)

    const wallStart = Date.now()
    try {
      const ordered = [...images].sort(
        (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
      )

      const uploadStart = Date.now()
      // Temporary resized copies for AI only — originals stay at full resolution.
      const imageUrls = await uploadAnalyzeImagesIndividually({
        images: ordered,
        onProgress: (label) => setProgressDetail(label),
      })
      const uploadMs = Date.now() - uploadStart

      setProgressStage("Identifying item")
      setProgressPercent(STAGE_PERCENT["Identifying item"])
      setProgressDetail(
        isFounder
          ? PIPELINE_MODE_LABELS[pipelineMode]
          : "Reading tags and product details"
      )

      const response = await fetch("/api/listings/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrls,
          sellerNotes: sellerNotes.trim() || undefined,
          uploadMs,
          ...(isFounder ? { pipelineMode } : {}),
        }),
        credentials: "same-origin",
      })
      const parsed = await readApiJsonResponse<{
        error?: string
        draft?: GeneratedListingOutput
        model?: string
        identityModel?: string
        copyModel?: string
        pipelineMode?: string
        timings?: {
          uploadMs?: number
          identityMs?: number
          listingMs?: number
          ebayMetadataMs?: number
          totalMs?: number
        }
        categorySuggestions?: Array<{
          categoryId: string
          categoryName: string
          categoryPath: string
        }>
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

      setProgressStage("Building listing")
      setProgressPercent(STAGE_PERCENT["Building listing"])
      setProgressDetail("eBay category & item specifics")

      const draft = payload.draft as GeneratedListingOutput
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

      // Seed top Taxonomy suggestion early when the server prefetched it.
      const topCat = payload.categorySuggestions?.[0]
      if (topCat?.categoryId) {
        next = {
          ...next,
          specifics: {
            ...next.specifics,
            category: topCat.categoryPath || next.specifics.category,
            ebayCategory: {
              marketplaceId: "EBAY_US",
              categoryTreeId: "",
              categoryId: topCat.categoryId,
              categoryName: topCat.categoryName,
              categoryPath: topCat.categoryPath,
              leafCategory: true,
            },
          },
        }
      }

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

      setProgressStage("Ready")
      setProgressPercent(100)
      const wallMs = Date.now() - wallStart
      const timings = {
        ...(payload.timings || {}),
        uploadMs: payload.timings?.uploadMs ?? uploadMs,
        totalMs: payload.timings?.totalMs ?? wallMs,
        pipelineMode: payload.pipelineMode,
        identityModel: payload.identityModel,
        copyModel: payload.copyModel,
      }
      setLastTimings(timings)
      console.info("[listing-generator] analysis timings", timings)

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

      if (isFounder && timings.totalMs) {
        const keyFields = [
          "brand",
          "gender",
          "size",
          "category",
          "condition",
          "itemType",
        ] as const
        const accuracy = keyFields.map((key) => {
          const fc = next.fieldConfidence?.[key]
          const value = (fc?.value || "").toString().slice(0, 40)
          const conf =
            typeof fc?.confidence === "number"
              ? Math.round(fc.confidence * 100)
              : "?"
          return `${key}=${value || "—"}(${conf}%)`
        })
        console.info("[listing-generator] founder field snapshot", {
          pipelineMode: timings.pipelineMode || pipelineMode,
          identityModel: timings.identityModel,
          copyModel: timings.copyModel,
          timings,
          accuracy,
        })
        setNotice((prev) =>
          [
            prev,
            `Founder timing · ${timings.pipelineMode || pipelineMode}: upload ${Math.round((timings.uploadMs || 0) / 100) / 10}s · AI identity ${Math.round((timings.identityMs || 0) / 100) / 10}s · listing ${Math.round((timings.listingMs || 0) / 100) / 10}s · total ${Math.round((timings.totalMs || 0) / 100) / 10}s · ${accuracy.join(" · ")}`,
          ]
            .filter(Boolean)
            .join(" ")
        )
      }

      setListing(next)
      setStep("review")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed")
    } finally {
      setGenerating(false)
      setProgressPercent(0)
      setProgressDetail(null)
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
              stage={progressStage}
              detail={progressDetail}
            />
          ) : (
            <>
              <ImageUploader
                images={images}
                onChange={setImages}
                disabled={generating}
                userId={user?.id}
              />
              {isFounder && (
                <div className="space-y-2 rounded-xl border border-dashed border-accent/40 bg-accent/5 p-3">
                  <Label htmlFor="pipeline-mode">
                    Founder model test (temporary)
                  </Label>
                  <select
                    id="pipeline-mode"
                    value={pipelineMode}
                    onChange={(e) =>
                      setPipelineMode(e.target.value as ListingPipelineMode)
                    }
                    className="flex h-11 w-full rounded-lg border border-input bg-card px-3.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {LISTING_PIPELINE_MODES.map((mode) => (
                      <option key={mode} value={mode}>
                        {PIPELINE_MODE_LABELS[mode]}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-muted-foreground">
                    Compare mini vs strong vs hybrid. Timings appear after Analyze.
                    {lastTimings?.totalMs
                      ? ` Last total: ${(lastTimings.totalMs / 1000).toFixed(1)}s`
                      : ""}
                  </p>
                </div>
              )}
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
