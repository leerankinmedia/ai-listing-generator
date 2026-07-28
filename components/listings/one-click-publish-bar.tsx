"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Loader2, Rocket } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  ebayFreeShippingBlockMessage,
  ebayShippingPackageBlockMessage,
} from "@/lib/listings/publish"
import {
  applyPublishResultsToListing,
  publishResultsIncludeSuccess,
} from "@/lib/listings/publish-persist"
import {
  EbayShippingModeFields,
  EbayShippingPublishSummary,
} from "@/components/listings/ebay-shipping-section"
import { ShippingPackageFields } from "@/components/listings/shipping-package-fields"
import { PrePublishReviewCard } from "@/components/listings/pre-publish-review"
import { ensureListingInventorySku } from "@/lib/listings/sku"
import { enrichEbayTitleTowardLimit } from "@/lib/listings/ebay-title"
import {
  applyExactAspectsToListing,
  validateAspectsAgainstOptions,
} from "@/lib/listings/ebay-aspect-fields"
import { persistListing } from "@/lib/listings/repository"
import { ensureDurableOriginalImageUrls } from "@/lib/listings/durable-images"
import { readApiJsonResponse } from "@/lib/api/read-json-response"
import { useAuth } from "@/components/auth/auth-provider"
import { MARKETPLACES } from "@/lib/marketplaces"
import type { Listing, MarketplaceId, OneClickPublishResult } from "@/lib/types"
import { cn } from "@/lib/utils"

const PHASE5_IDS: MarketplaceId[] = ["ebay", "vinted", "whatnot"]

interface PublicConnection {
  marketplaceId: MarketplaceId
  connected: boolean
  accountLabel?: string | null
}

export function OneClickPublishBar({
  listing,
  disabled,
  onListingChange,
  aspectMeta,
}: {
  listing: Listing
  disabled?: boolean
  onListingChange?: (listing: Listing) => void
  /** Missing/filled specifics from the main editor — summary only here. */
  aspectMeta?: {
    missing: string[]
    filled: number
    total: number
  }
}) {
  const { user } = useAuth()
  const [publishing, setPublishing] = useState(false)
  const [results, setResults] = useState<OneClickPublishResult[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [connections, setConnections] = useState<PublicConnection[]>([])
  const [selected, setSelected] = useState<MarketplaceId[]>([])
  const [loadingConnections, setLoadingConnections] = useState(true)

  const ebaySelected = selected.includes("ebay")

  const loadConnections = useCallback(async () => {
    setLoadingConnections(true)
    try {
      const res = await fetch("/api/marketplaces/connections")
      if (!res.ok) {
        setConnections([])
        return
      }
      const json = (await res.json()) as { connections: PublicConnection[] }
      const connected = json.connections.filter((c) =>
        PHASE5_IDS.includes(c.marketplaceId)
      )
      setConnections(connected)

      const preferred = listing.targetMarketplaces.filter((id) =>
        connected.some((c) => c.marketplaceId === id)
      )
      setSelected(
        preferred.length > 0
          ? preferred
          : connected.map((c) => c.marketplaceId)
      )
    } catch {
      setConnections([])
    } finally {
      setLoadingConnections(false)
    }
  }, [listing.targetMarketplaces])

  useEffect(() => {
    void loadConnections()
  }, [loadConnections])

  // Enrich title toward 80 chars when eBay is selected — never auto-fill SKU
  // unless account settings enable automatic SKU generation.
  useEffect(() => {
    if (!ebaySelected || !onListingChange) return
    const withSku = ensureListingInventorySku(listing)
    const enrichedTitle = enrichEbayTitleTowardLimit(withSku.title, withSku)
    if (
      enrichedTitle !== listing.title ||
      withSku.specifics.extras?.sku !== listing.specifics.extras?.sku
    ) {
      onListingChange({
        ...withSku,
        title: enrichedTitle,
        updatedAt: new Date().toISOString(),
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per listing when eBay selected
  }, [ebaySelected, listing.id])

  const connectedIds = useMemo(
    () => new Set(connections.map((c) => c.marketplaceId)),
    [connections]
  )

  function toggle(id: MarketplaceId) {
    if (!connectedIds.has(id)) return
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  async function handlePublish() {
    setPublishing(true)
    setError(null)
    setResults(null)
    try {
      if (!user?.id) {
        throw new Error("Sign in required to publish.")
      }

      let listingForChecks = listing

      if (selected.includes("ebay")) {
        const packageBlock = ebayShippingPackageBlockMessage(listingForChecks)
        if (packageBlock) {
          setError(packageBlock)
          setPublishing(false)
          return
        }
        const freeBlock = ebayFreeShippingBlockMessage(listingForChecks)
        if (freeBlock) {
          setError(freeBlock)
          setPublishing(false)
          return
        }

        // Silently re-validate specifics against eBay exact options; only ask
        // about required fields that still cannot be determined confidently.
        try {
          const previewRes = await fetch(
            "/api/marketplaces/ebay/aspects-preview",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ listing: listingForChecks }),
            }
          )
          if (previewRes.ok) {
            const preview = (await previewRes.json()) as {
              formFields?: Array<{
                name: string
                required: boolean
                allowedValues?: string[]
                value?: string
                suggestedValue?: string
              }>
              resolvedFields?: Array<{ name: string; value: string }>
              missingRequiredNames?: string[]
              suggestedTitle?: string
            }
            const optionsByName = new Map<string, string[]>()
            for (const field of preview.formFields || []) {
              if (field.allowedValues?.length) {
                optionsByName.set(field.name.toLowerCase(), field.allowedValues)
              }
            }
            const merged = [
              ...(preview.resolvedFields || []),
              ...((preview.formFields || [])
                .filter((f) => f.value || f.suggestedValue)
                .map((f) => ({
                  name: f.name,
                  value: (f.value || f.suggestedValue || "").trim(),
                }))
                .filter((f) => f.value) as Array<{ name: string; value: string }>),
            ]
            listingForChecks = applyExactAspectsToListing(
              listingForChecks,
              merged,
              optionsByName
            )
            const validated = validateAspectsAgainstOptions(
              listingForChecks,
              preview.formFields || []
            )
            listingForChecks = validated.listing
            if (
              preview.suggestedTitle &&
              preview.suggestedTitle.length >= 70 &&
              preview.suggestedTitle.length <= 80
            ) {
              listingForChecks = {
                ...listingForChecks,
                title: preview.suggestedTitle,
              }
            }
            onListingChange?.(listingForChecks)
            const missing =
              validated.missingRequired.length > 0
                ? validated.missingRequired
                : preview.missingRequiredNames || []
            if (missing.length > 0) {
              setError(
                `Complete required item specifics in the form above: ${missing.join(", ")}.`
              )
              setPublishing(false)
              return
            }
          } else if (aspectMeta?.missing && aspectMeta.missing.length > 0) {
            setError(
              `Complete required item specifics in the form above: ${aspectMeta.missing.join(", ")}.`
            )
            setPublishing(false)
            return
          }
        } catch {
          if (aspectMeta?.missing && aspectMeta.missing.length > 0) {
            setError(
              `Complete required item specifics in the form above: ${aspectMeta.missing.join(", ")}.`
            )
            setPublishing(false)
            return
          }
        }
      }

      // Assign inventory SKU only when automatic SKU generation is enabled.
      const prepared = ensureListingInventorySku({
        ...listingForChecks,
        title: enrichEbayTitleTowardLimit(
          listingForChecks.title,
          listingForChecks
        ),
      })

      const durableImages = await ensureDurableOriginalImageUrls(
        prepared.images,
        user.id
      )
      const listingForPublish: Listing = {
        ...prepared,
        images: durableImages,
        updatedAt: new Date().toISOString(),
      }
      onListingChange?.(listingForPublish)

      const response = await fetch("/api/listings/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listing: listingForPublish,
          marketplaceIds: selected,
        }),
      })
      const parsed = await readApiJsonResponse<{
        error?: string
        results?: OneClickPublishResult[]
        listing?: Listing
      }>(response)
      if (!parsed.ok) throw new Error(parsed.error || "Publish failed")
      const payload = parsed.data
      const publishResults = payload.results as OneClickPublishResult[]
      setResults(publishResults)

      if (publishResultsIncludeSuccess(publishResults) && user) {
        const fromServer =
          payload.listing && typeof payload.listing === "object"
            ? (payload.listing as Listing)
            : applyPublishResultsToListing(
                listingForPublish,
                publishResults,
                user.id
              )
        onListingChange?.(fromServer)
        try {
          const saved = await persistListing(fromServer)
          if (saved && saved !== fromServer) onListingChange?.(saved)
        } catch (persistError) {
          console.error("[publish] client persist after publish failed", persistError)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publish failed")
    } finally {
      setPublishing(false)
    }
  }

  const available = MARKETPLACES.filter((m) => PHASE5_IDS.includes(m.id))
  const unresolved = aspectMeta?.missing || []

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card/70 p-4 sm:p-5">
      <div>
        <h2 className="font-display text-lg font-semibold">Publish</h2>
        <p className="text-sm text-muted-foreground">
          Select connected marketplaces, set shipping, and review the summary — edit
          item specifics in the form above.{" "}
          <Link
            href="/dashboard/connections"
            className="underline underline-offset-2"
          >
            Manage connections
          </Link>
        </p>
      </div>

      {loadingConnections ? (
        <p className="text-sm text-muted-foreground">Checking connections…</p>
      ) : connections.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No marketplaces connected yet. Connect eBay, Vinted, or Whatnot on the{" "}
          <Link
            href="/dashboard/connections"
            className="underline underline-offset-2"
          >
            Connections
          </Link>{" "}
          page first.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {available.map((m) => {
            const isConnected = connectedIds.has(m.id)
            const isSelected = selected.includes(m.id)
            return (
              <button
                key={m.id}
                type="button"
                disabled={!isConnected}
                onClick={() => toggle(m.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
                  !isConnected && "cursor-not-allowed opacity-40",
                  isSelected
                    ? "border-accent/40 bg-accent/15 text-foreground"
                    : "border-border bg-secondary/60 text-muted-foreground hover:text-foreground"
                )}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: m.color }}
                />
                {m.shortName}
                {!isConnected && " (not connected)"}
              </button>
            )
          })}
        </div>
      )}

      {ebaySelected && onListingChange && (
        <div className="space-y-4 rounded-xl border border-border bg-secondary/20 p-3">
          <div>
            <h3 className="text-sm font-semibold">Shipping</h3>
            <p className="text-xs text-muted-foreground">
              Calculated, Flat, or Free — plus handling time, weight, and dimensions.
              Numeric fields stay blank until you enter them.
            </p>
          </div>
          <EbayShippingModeFields
            listing={listing}
            onChange={onListingChange}
            disabled={disabled || publishing}
            compact
          />
          <ShippingPackageFields
            listing={listing}
            onChange={onListingChange}
            disabled={disabled || publishing}
            compact
          />
          <EbayShippingPublishSummary listing={listing} />
          <PrePublishReviewCard
            listing={listing}
            missingAspects={unresolved}
            aspectFilledCount={aspectMeta?.filled}
            aspectTotalCount={aspectMeta?.total}
          />
          {unresolved.length > 0 && (
            <p className="text-sm text-destructive" role="status">
              Unresolved requirements — fix in Item specifics above:{" "}
              {unresolved.join(", ")}.
            </p>
          )}
        </div>
      )}

      {ebaySelected && !onListingChange && (
        <PrePublishReviewCard
          listing={listing}
          missingAspects={unresolved}
          aspectFilledCount={aspectMeta?.filled}
          aspectTotalCount={aspectMeta?.total}
        />
      )}

      <div className="flex justify-end">
        <Button
          variant="accent"
          disabled={
            disabled ||
            publishing ||
            selected.length === 0 ||
            loadingConnections
          }
          onClick={() => void handlePublish()}
        >
          {publishing ? <Loader2 className="animate-spin" /> : <Rocket />}
          Publish
          {selected.length > 0 ? ` (${selected.length})` : ""}
        </Button>
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {results && (
        <ul className="space-y-2">
          {results.map((result) => (
            <li
              key={result.marketplaceId}
              className={cn(
                "rounded-lg border px-3 py-2 text-sm",
                result.ok
                  ? "border-accent/30 bg-accent/10"
                  : "border-destructive/30 bg-destructive/10"
              )}
            >
              <span className="font-medium capitalize">
                {result.marketplaceId.replaceAll("_", " ")}
              </span>
              <span className="text-muted-foreground"> — {result.message}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
