"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Loader2, Save, Trash2 } from "lucide-react"
import { ImageUploader } from "@/components/listings/image-uploader"
import { ListingEditorForm } from "@/components/listings/listing-editor-form"
import { OneClickPublishBar } from "@/components/listings/one-click-publish-bar"
import { usePaidToolsAccess } from "@/components/billing/paid-feature-gate"
import { Button, buttonVariants } from "@/components/ui/button"
import { useAuth } from "@/components/auth/auth-provider"
import { fetchListing, persistListing, removeListing } from "@/lib/listings/repository"
import { listingIsReadyToPublish } from "@/lib/listings/publish"
import type { Listing } from "@/lib/types"
import { cn } from "@/lib/utils"

function normalizeListing(row: Listing): Listing {
  const images = [...(row.images ?? [])]
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((img, index) => ({
      ...img,
      sortOrder: index,
      isPrimary: index === 0,
    }))

  return {
    ...row,
    images,
    fieldConfidence: row.fieldConfidence ?? {},
    specifics: row.specifics ?? {},
    keywords: row.keywords ?? [],
    targetMarketplaces: row.targetMarketplaces ?? [],
  }
}

export function ListingDetail({ listingId }: { listingId: string }) {
  const { user } = useAuth()
  const router = useRouter()
  const { unlocked, status } = usePaidToolsAccess()
  const readOnly = !unlocked
  const subscribeCta =
    status?.trialEligible === false || status?.status === "expired"
      ? "Subscribe"
      : "Start free trial"
  const [listing, setListing] = useState<Listing | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [aspectMeta, setAspectMeta] = useState<{
    missing: string[]
    filled: number
    total: number
  }>({ missing: [], filled: 0, total: 0 })

  useEffect(() => {
    let mounted = true
    void (async () => {
      try {
        const row = await fetchListing(listingId)
        if (!mounted) return
        if (!row || (user && row.userId !== user.id)) {
          setListing(null)
        } else {
          setListing(normalizeListing(row))
        }
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [listingId, user])

  async function handleSave(nextStatus: Listing["status"]) {
    if (!listing || readOnly) return
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const images = [...listing.images]
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        .map((img, index) => ({
          ...img,
          sortOrder: index,
          isPrimary: index === 0,
        }))
      const ready = listingIsReadyToPublish({ ...listing, images })
      const next: Listing = {
        ...listing,
        title: listing.title.trim(),
        images,
        status: ready ? nextStatus : "draft",
        updatedAt: new Date().toISOString(),
      }
      if (!next.title) {
        throw new Error("Title is required before saving.")
      }
      const saved = await persistListing(next)
      setListing(normalizeListing(saved))
      if (nextStatus === "ready" && saved.status === "draft") {
        setMessage(
          "Saved as draft — add a title, description, price, and at least one photo to mark ready."
        )
      } else if (saved.status === "draft") {
        setMessage("Draft saved.")
      } else {
        setMessage("Listing saved.")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!listing || readOnly) return
    if (!window.confirm("Delete this listing permanently?")) return
    await removeListing(listing.id)
    router.push("/dashboard/listings")
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading listing…</p>
  }

  if (!listing) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Listing not found.</p>
        <Link href="/dashboard/listings" className={cn(buttonVariants({ variant: "outline" }))}>
          Back to listings
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-24 sm:pb-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/dashboard/listings"
            className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            All listings
          </Link>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            {readOnly ? "View listing" : "Edit listing"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Status: {listing.status}
            {listing.aiGenerated ? " · AI generated" : ""}
            {listing.analysisMeta
              ? ` · ${listing.analysisMeta.imagesAnalyzed} photos analyzed`
              : ""}
            {readOnly ? " · read-only" : ""}
          </p>
        </div>
        <div className="hidden flex-wrap gap-2 sm:flex">
          {readOnly ? (
            <Link
              href="/checkout"
              className={cn(buttonVariants({ variant: "accent" }))}
            >
              {subscribeCta}
            </Link>
          ) : (
            <>
              <Button variant="outline" onClick={() => void handleDelete()} disabled={saving}>
                <Trash2 />
                Delete
              </Button>
              <Button
                variant="secondary"
                onClick={() => void handleSave("draft")}
                disabled={saving}
              >
                {saving ? <Loader2 className="animate-spin" /> : <Save />}
                Save as draft
              </Button>
              <Button
                variant="accent"
                onClick={() => void handleSave("ready")}
                disabled={saving}
              >
                {saving ? <Loader2 className="animate-spin" /> : <Save />}
                Save listing
              </Button>
            </>
          )}
        </div>
      </div>

      {readOnly && (
        <div className="flex flex-col gap-3 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">
            Editing, AI generation, and publishing are locked. Subscribe to make
            changes.
          </p>
          <Link
            href="/checkout"
            className={cn(buttonVariants({ variant: "accent", size: "sm" }), "shrink-0")}
          >
            {subscribeCta}
          </Link>
        </div>
      )}

      {message && (
        <p className="rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm">
          {message}
        </p>
      )}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <section className="space-y-2">
        <h2 className="font-display text-lg font-semibold">Photos</h2>
        <p className="text-sm text-muted-foreground">
          {readOnly
            ? "Photo changes require an active subscription."
            : "Choose a cover photo, reorder, or delete. Changes save with the listing."}
        </p>
        <ImageUploader
          images={listing.images}
          onChange={(images) => setListing({ ...listing, images })}
          disabled={saving || readOnly}
        />
      </section>

      <ListingEditorForm
        listing={listing}
        onChange={setListing}
        disabled={saving || readOnly}
        onAspectMetaChange={setAspectMeta}
      />
      {readOnly ? (
        <div className="rounded-2xl border border-border bg-card/70 p-4 sm:p-5">
          <h2 className="font-display text-lg font-semibold">Publish</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Publishing is locked until you subscribe.
          </p>
          <Link
            href="/checkout"
            className={cn(buttonVariants({ variant: "accent" }), "mt-4 inline-flex")}
          >
            {subscribeCta}
          </Link>
        </div>
      ) : (
        <OneClickPublishBar
          listing={listing}
          disabled={saving}
          aspectMeta={aspectMeta}
          onListingChange={setListing}
        />
      )}

      {!readOnly && (
      <div className="sticky bottom-3 z-20 flex flex-wrap gap-2 rounded-2xl border border-border bg-background/90 p-3 backdrop-blur-xl sm:hidden">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => void handleDelete()}
          disabled={saving}
        >
          <Trash2 />
          Delete
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className="flex-1"
          onClick={() => void handleSave("draft")}
          disabled={saving}
        >
          {saving ? <Loader2 className="animate-spin" /> : <Save />}
          Save as draft
        </Button>
        <Button
          variant="accent"
          size="sm"
          className="flex-1"
          onClick={() => void handleSave("ready")}
          disabled={saving}
        >
          {saving ? <Loader2 className="animate-spin" /> : <Save />}
          Save listing
        </Button>
      </div>
      )}
      {readOnly && (
        <div className="sticky bottom-3 z-20 sm:hidden">
          <Link
            href="/checkout"
            className={cn(buttonVariants({ variant: "accent" }), "w-full")}
          >
            {subscribeCta}
          </Link>
        </div>
      )}
    </div>
  )
}
