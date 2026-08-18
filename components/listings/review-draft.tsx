"use client"

import { useEffect, useState } from "react"
import { Loader2, Save } from "lucide-react"
import { EbayCategoryPicker } from "@/components/listings/ebay-category-picker"
import { EbayItemSpecificsFields } from "@/components/listings/ebay-item-specifics-fields"
import { ImageUploader } from "@/components/listings/image-uploader"
import { SellingPreferencesPanel } from "@/components/listings/selling-preferences-panel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NullableNumberInput } from "@/components/ui/nullable-number-input"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/components/auth/auth-provider"
import { EBAY_TITLE_MAX } from "@/lib/listings/ebay-title"
import {
  EbayPublishBlockedError,
  publishListingToEbay,
} from "@/lib/listings/ebay-publish-client"
import {
  collectEbayPublishBlockers,
  ebayLiveSummary,
  ebayResultIsLive,
  listingFormatLabel,
  listingQuantity,
  setListingQuantity,
  type EbayAspectMeta,
  type EbayLiveSummary,
} from "@/lib/listings/review-draft"
import { persistListing } from "@/lib/listings/repository"
import type { Listing, OneClickPublishResult } from "@/lib/types"
import { cn } from "@/lib/utils"

type ShippingOpen = "shipping" | "returns" | null

export function ReviewDraft({
  listing,
  onChange,
  disabled,
  onSaved,
  onPublished,
  notice,
}: {
  listing: Listing
  onChange: (listing: Listing) => void
  disabled?: boolean
  onSaved?: (listing: Listing) => void
  onPublished?: (payload: {
    listing: Listing
    results: OneClickPublishResult[]
    summary: EbayLiveSummary
  }) => void
  notice?: string | null
}) {
  const { user } = useAuth()
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [blockers, setBlockers] = useState<string[]>([])
  const [defaultsReady, setDefaultsReady] = useState<boolean | null>(null)
  const [shippingOpen, setShippingOpen] = useState<ShippingOpen>("shipping")
  const [aspectMeta, setAspectMeta] = useState<EbayAspectMeta>({
    missing: [],
    filled: 0,
    total: 0,
  })

  useEffect(() => {
    let mounted = true
    void (async () => {
      try {
        const res = await fetch("/api/seller/ebay-defaults", {
          credentials: "same-origin",
        })
        if (!res.ok) {
          if (mounted) setDefaultsReady(false)
          return
        }
        const json = (await res.json()) as { ready?: boolean }
        if (mounted) setDefaultsReady(Boolean(json.ready))
      } catch {
        if (mounted) setDefaultsReady(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  const qty = listingQuantity(listing)

  useEffect(() => {
    if (!listing.id) return
    const timer = window.setTimeout(() => {
      void persistListing({
        ...listing,
        status: listing.status === "listed" ? "listed" : "draft",
        updatedAt: new Date().toISOString(),
      }).catch((err) => {
        console.warn("[review-draft] autosave failed", err)
      })
    }, 900)
    return () => window.clearTimeout(timer)
  }, [listing])

  function update(partial: Partial<Listing>) {
    onChange({
      ...listing,
      ...partial,
      specifics: partial.specifics
        ? { ...listing.specifics, ...partial.specifics }
        : listing.specifics,
      updatedAt: new Date().toISOString(),
    })
  }

  async function handleSaveDraft() {
    if (!user) return
    setSaving(true)
    setError(null)
    try {
      const saved = await persistListing({
        ...listing,
        status: "draft",
        updatedAt: new Date().toISOString(),
      })
      onChange(saved)
      onSaved?.(saved)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save draft")
    } finally {
      setSaving(false)
    }
  }

  async function handleListOnEbay() {
    if (!user?.id) {
      setError("Sign in required to publish.")
      return
    }
    setPublishing(true)
    setError(null)
    setBlockers([])
    try {
      const local = collectEbayPublishBlockers(listing, aspectMeta)
      if (local.length > 0) {
        setBlockers(local)
        setError(
          local.length === 1
            ? local[0]
            : `Complete required fields: ${local.join(", ")}.`
        )
        return
      }
      const published = await publishListingToEbay({
        listing,
        userId: user.id,
        aspectMeta,
        onListingChange: onChange,
      })
      onChange(published.listing)
      if (ebayResultIsLive(published.results)) {
        onPublished?.({
          listing: published.listing,
          results: published.results,
          summary: ebayLiveSummary(published.listing, published.results),
        })
      } else {
        const ebay = published.results.find((row) => row.marketplaceId === "ebay")
        setError(ebay?.message || "eBay did not confirm the listing.")
      }
    } catch (err) {
      if (err instanceof EbayPublishBlockedError) {
        setBlockers(err.blockers)
        setError(err.message)
      } else {
        setError(err instanceof Error ? err.message : "Publish failed")
      }
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-5 pb-28">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Review draft
        </p>
        <Label htmlFor="review-title" className="sr-only">
          Title
        </Label>
        <Textarea
          id="review-title"
          value={listing.title}
          disabled={busy}
          maxLength={EBAY_TITLE_MAX}
          rows={3}
          onChange={(e) =>
            update({ title: e.target.value.slice(0, EBAY_TITLE_MAX) })
          }
          className="min-h-[5.5rem] resize-none text-lg font-semibold leading-snug"
          placeholder="Listing title"
        />
        <p className="text-xs text-muted-foreground">
          {listing.title.length}/{EBAY_TITLE_MAX}
        </p>
      </header>

      {notice ? (
        <p
          className="rounded-xl border border-border bg-card/70 px-4 py-3 text-sm text-muted-foreground"
          role="status"
        >
          {notice}
        </p>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Photos</h2>
        <ImageUploader
          images={listing.images}
          onChange={(images) => update({ images })}
          disabled={busy}
          userId={user?.id}
          variant="review"
        />
      </section>

      <EbayCategoryPicker
        listing={listing}
        onChange={onChange}
        disabled={busy}
        compact
      />

      <EbayItemSpecificsFields
        listing={listing}
        onChange={onChange}
        disabled={busy}
        variant="review"
        onMetaChange={(meta) =>
          setAspectMeta({
            missing: meta.missing,
            filled: meta.filled,
            total: meta.total,
          })
        }
      />

      <section className="space-y-2">
        <Label htmlFor="review-description">Description</Label>
        <Textarea
          id="review-description"
          value={listing.description}
          disabled={busy}
          rows={8}
          onChange={(e) => update({ description: e.target.value })}
          className="min-h-[180px]"
          placeholder="Resale description"
        />
      </section>

      <section className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="review-price">Price</Label>
          <NullableNumberInput
            id="review-price"
            min={0}
            step="0.01"
            disabled={busy}
            value={listing.price > 0 ? listing.price : null}
            placeholder="0.00"
            onValueChange={(n) => update({ price: n == null ? 0 : n })}
          />
          {listing.comps?.suggestedPrice ? (
            <p className="text-[11px] text-muted-foreground">
              Suggested ${listing.comps.suggestedPrice.toFixed(0)}
              {listing.comps.method === "ebay_sold_api" ? " from sold comps" : ""}
            </p>
          ) : listing.price > 0 ? null : (
            <p className="text-[11px] text-muted-foreground">
              Enter a price — do not publish a fabricated comp.
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="review-qty">Quantity</Label>
          <Input
            id="review-qty"
            type="number"
            min={1}
            inputMode="numeric"
            disabled={busy}
            value={qty}
            onChange={(e) =>
              onChange(setListingQuantity(listing, Number(e.target.value)))
            }
            className="h-11"
          />
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card/40 px-3 py-3 text-sm">
        <p className="text-xs text-muted-foreground">Listing format</p>
        <p className="font-medium">{listingFormatLabel(listing)}</p>
      </section>

      <section className="space-y-3">
        <button
          type="button"
          className="flex min-h-12 w-full items-center justify-between rounded-xl border border-border bg-card/40 px-3 text-left"
          onClick={() =>
            setShippingOpen(shippingOpen === "shipping" ? null : "shipping")
          }
        >
          <span className="font-semibold">Shipping</span>
          <span className="text-xs text-muted-foreground">
            {shippingOpen === "shipping" ? "Hide" : "Show"}
          </span>
        </button>
        {shippingOpen === "shipping" ? (
          <SellingPreferencesPanel
            listing={listing}
            onChange={onChange}
            disabled={busy}
            defaultsReady={defaultsReady === true}
          />
        ) : (
          <p className="px-1 text-sm text-muted-foreground">
            {listing.specifics.returnsAccepted === false
              ? "Returns not accepted"
              : `${listing.specifics.returnWindowDays === 60 ? 60 : 30}-day returns`}
            {" · "}
            Qty {qty}
          </p>
        )}
      </section>

      {(error || blockers.length > 0) && (
        <div
          className={cn(
            "rounded-xl border px-4 py-3 text-sm",
            error || blockers.length > 0
              ? "border-destructive/30 bg-destructive/10 text-destructive"
              : "border-amber-500/30 bg-amber-500/10 text-amber-950 dark:text-amber-100"
          )}
          role={error ? "alert" : "status"}
        >
          {error ? <p>{error}</p> : null}
          {blockers.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-4">
              {blockers.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl">
        <div className="mx-auto flex max-w-lg gap-2">
          <Button
            variant="secondary"
            className="h-12 min-w-0 flex-1"
            disabled={busy}
            onClick={() => void handleSaveDraft()}
          >
            {saving ? <Loader2 className="animate-spin" /> : <Save />}
            Save draft
          </Button>
          <Button
            variant="accent"
            className="h-12 min-w-0 flex-[1.4]"
            disabled={busy}
            onClick={() => void handleListOnEbay()}
          >
            {publishing ? <Loader2 className="animate-spin" /> : null}
            List on eBay
          </Button>
        </div>
      </div>
    </div>
  )
}
