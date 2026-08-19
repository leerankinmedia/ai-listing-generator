"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Trash2 } from "lucide-react"
import { ListingLiveSuccess } from "@/components/listings/listing-live"
import { ReviewDraft } from "@/components/listings/review-draft"
import { usePaidToolsAccess } from "@/components/billing/paid-feature-gate"
import { Button, buttonVariants } from "@/components/ui/button"
import { useAuth } from "@/components/auth/auth-provider"
import { fetchListing, persistListing, removeListing } from "@/lib/listings/repository"
import { ebayLiveSummary, ensureListingQuantity, type EbayLiveSummary } from "@/lib/listings/review-draft"
import {
  clearUploadSession,
  normalizeListingImageStorage,
  readUploadSession,
} from "@/lib/listings/upload-session"
import type { Listing, OneClickPublishResult } from "@/lib/types"
import { cn } from "@/lib/utils"

function normalizeListing(row: Listing): Listing {
  const images = normalizeListingImageStorage(
    [...(row.images ?? [])]
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((img, index) => ({
        ...img,
        sortOrder: index,
        isPrimary: index === 0,
      }))
  )

  return {
    ...row,
    images,
    fieldConfidence: row.fieldConfidence ?? {},
    specifics: row.specifics ?? {},
    keywords: row.keywords ?? [],
    targetMarketplaces: row.targetMarketplaces ?? ["ebay"],
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
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [liveSummary, setLiveSummary] = useState<EbayLiveSummary | null>(null)

  useEffect(() => {
    let mounted = true
    void (async () => {
      try {
        const row = await fetchListing(listingId)
        if (!mounted) return
        if (!row || (user && row.userId !== user.id)) {
          setListing(null)
        } else {
          let next = ensureListingQuantity(normalizeListing(row))
          if (user?.id && next.images.length === 0) {
            const session = readUploadSession(user.id)
            if (
              session?.images.length &&
              (!session.listingId || session.listingId === listingId)
            ) {
              next = { ...next, images: session.images }
            }
          }
          setListing(next)
          if (user?.id && next.images.length > 0) {
            clearUploadSession(user.id)
          }
        }
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [listingId, user])

  async function handleDelete() {
    if (!listing || readOnly) return
    if (!window.confirm("Delete this listing permanently?")) return
    await removeListing(listing.id)
    if (user?.id) clearUploadSession(user.id)
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

  if (liveSummary) {
    return <ListingLiveSuccess summary={liveSummary} />
  }

  if (readOnly) {
    return (
      <div className="mx-auto max-w-lg space-y-5">
        <Link
          href="/dashboard/listings"
          className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          All listings
        </Link>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {listing.title || "Listing"}
        </h1>
        <p className="text-sm text-muted-foreground">Status: {listing.status}</p>
        <div className="rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm">
          Editing and publishing are locked.
        </div>
        <Link
          href="/checkout"
          className={cn(buttonVariants({ variant: "accent", size: "lg" }), "w-full")}
        >
          {subscribeCta}
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/dashboard/listings"
          className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Listings
        </Link>
        <Button
          variant="ghost"
          className="min-h-11 text-destructive"
          onClick={() => void handleDelete()}
        >
          <Trash2 />
          Delete
        </Button>
      </div>

      {listing.status === "listed" && (
        <div className="rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm">
          This listing is live on eBay
          {listing.marketplaceListings.find((m) => m.marketplaceId === "ebay")
            ?.externalId
            ? ` · ID ${listing.marketplaceListings.find((m) => m.marketplaceId === "ebay")?.externalId}`
            : ""}
          .
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

      <ReviewDraft
        listing={listing}
        onChange={setListing}
        notice={null}
        onSaved={async (saved) => {
          setListing(normalizeListing(saved))
          setMessage("Draft saved.")
          try {
            await persistListing(saved)
          } catch {
            /* already persisted in ReviewDraft */
          }
        }}
        onPublished={(payload: {
          listing: Listing
          results: OneClickPublishResult[]
          summary: EbayLiveSummary
        }) => {
          if (user?.id) clearUploadSession(user.id)
          setListing(payload.listing)
          setLiveSummary(
            payload.summary.title
              ? payload.summary
              : ebayLiveSummary(payload.listing, payload.results)
          )
        }}
      />
    </div>
  )
}
