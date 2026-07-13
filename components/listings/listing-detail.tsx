"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Loader2, Save, Trash2 } from "lucide-react"
import { ImageUploader } from "@/components/listings/image-uploader"
import { ListingEditorForm } from "@/components/listings/listing-editor-form"
import { OneClickPublishBar } from "@/components/listings/one-click-publish-bar"
import { Button, buttonVariants } from "@/components/ui/button"
import { useAuth } from "@/components/auth/auth-provider"
import { fetchListing, persistListing, removeListing } from "@/lib/listings/repository"
import { listingIsReadyToPublish } from "@/lib/listings/publish"
import type { Listing } from "@/lib/types"
import { cn } from "@/lib/utils"

function normalizeListing(row: Listing): Listing {
  return {
    ...row,
    fieldConfidence: row.fieldConfidence ?? {},
    specifics: row.specifics ?? {},
    keywords: row.keywords ?? [],
    targetMarketplaces: row.targetMarketplaces ?? [],
  }
}

export function ListingDetail({ listingId }: { listingId: string }) {
  const { user } = useAuth()
  const router = useRouter()
  const [listing, setListing] = useState<Listing | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

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

  async function handleSave() {
    if (!listing) return
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const next: Listing = {
        ...listing,
        status: listingIsReadyToPublish(listing)
          ? listing.status === "draft"
            ? "ready"
            : listing.status
          : "draft",
        updatedAt: new Date().toISOString(),
      }
      const saved = await persistListing(next)
      setListing(normalizeListing(saved))
      setMessage("Listing saved.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!listing) return
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
    <div className="mx-auto max-w-5xl space-y-6">
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
            Edit listing
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Status: {listing.status}
            {listing.aiGenerated ? " · AI generated" : ""}
            {listing.analysisMeta
              ? ` · ${listing.analysisMeta.imagesAnalyzed} photos analyzed`
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void handleDelete()} disabled={saving}>
            <Trash2 />
            Delete
          </Button>
          <Button variant="accent" onClick={() => void handleSave()} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />}
            Save changes
          </Button>
        </div>
      </div>

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

      <ImageUploader
        images={listing.images}
        onChange={(images) => setListing({ ...listing, images })}
        disabled={saving}
      />

      <ListingEditorForm listing={listing} onChange={setListing} disabled={saving} />
      <OneClickPublishBar listing={listing} disabled={saving} />
    </div>
  )
}
