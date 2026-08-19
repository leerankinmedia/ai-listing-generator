/**
 * Review Draft helpers for the mobile Magical Listing flow.
 * Keep AI-generated drafts editable, persistable, and eBay-publishable.
 */

import {
  ebayFreeShippingBlockMessage,
  ebayShippingPackageBlockMessage,
  listingHasCorePublishFields,
} from "@/lib/listings/publish"
import type { Listing, OneClickPublishResult } from "@/lib/types"

export type EbayAspectLoadStatus =
  | "loading"
  | "ready"
  | "ebay_not_connected"
  | "failed"

export type EbayAspectMeta = {
  missing: string[]
  filled: number
  total: number
  status?: EbayAspectLoadStatus
}

function aspectSpecificsBlockers(aspectMeta?: EbayAspectMeta): string[] {
  if (!aspectMeta || aspectMeta.status === "loading") {
    return ["Item specifics (still loading)"]
  }
  if (aspectMeta.status === "ebay_not_connected") {
    const msg =
      aspectMeta.missing.map((name) => name.trim()).find(Boolean) ||
      "Connect eBay to load item specifics"
    return [msg]
  }
  if (aspectMeta.status === "failed") {
    const named = aspectMeta.missing.map((name) => name.trim()).filter(Boolean)
    return named.length > 0
      ? named
      : ["Could not load eBay item specifics"]
  }
  return aspectMeta.missing.map((name) => name.trim()).filter(Boolean)
}

export const REVIEW_DRAFT_PRIMARY_ASPECTS = [
  "Brand",
  "Size",
  "Size Type",
  "Color",
  "Department",
] as const

export function listingQuantity(listing: Listing): number {
  const raw = listing.specifics.extras?.quantity
  const n = Number(raw ?? 1)
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.floor(n)
}

export function setListingQuantity(listing: Listing, quantity: number): Listing {
  const qty = Math.max(1, Math.floor(Number(quantity) || 1))
  return {
    ...listing,
    specifics: {
      ...listing.specifics,
      extras: {
        ...(listing.specifics.extras || {}),
        quantity: String(qty),
      },
    },
    updatedAt: new Date().toISOString(),
  }
}

/** Quantity defaults to 1 — never invent other inventory counts. */
export function ensureListingQuantity(listing: Listing): Listing {
  const extras = listing.specifics.extras || {}
  const current = Number(extras.quantity ?? 1)
  if (Number.isFinite(current) && current >= 1 && extras.quantity) {
    return listing
  }
  return setListingQuantity(listing, 1)
}

export function listingFormatLabel(listing: Listing): string {
  const format = (listing.specifics.extras?.listingFormat || "FIXED_PRICE").toUpperCase()
  if (format.includes("AUCTION")) return "Auction"
  return "Buy It Now"
}

export function collectEbayPublishBlockers(
  listing: Listing,
  aspectMeta?: EbayAspectMeta
): string[] {
  const missing: string[] = []

  if (!listing.title.trim()) missing.push("Title")
  if (!listing.description.trim()) missing.push("Description")
  if (!(listing.price > 0)) missing.push("Price")
  if (listing.images.length === 0) missing.push("Photos")

  const category = listing.specifics.ebayCategory
  if (!category?.categoryId || category.leafCategory === false) {
    missing.push("eBay category")
  }
  if (!listing.specifics.ebayCondition?.conditionId) {
    missing.push("Condition")
  }

  const packageBlock = ebayShippingPackageBlockMessage(listing)
  if (packageBlock) missing.push(packageBlock)

  const freeBlock = ebayFreeShippingBlockMessage(listing)
  if (freeBlock) missing.push(freeBlock)

  missing.push(...aspectSpecificsBlockers(aspectMeta))

  return missing
}

export function reviewDraftIsPublishReady(
  listing: Listing,
  aspectMeta?: EbayAspectMeta
): boolean {
  return (
    listingHasCorePublishFields(listing) &&
    collectEbayPublishBlockers(listing, aspectMeta).length === 0
  )
}

export type EbayLiveSummary = {
  title: string
  price: number
  listingId: string
  url: string
}

export function ebayLiveSummary(
  listing: Listing,
  results?: OneClickPublishResult[] | null
): EbayLiveSummary {
  const fromResult = results?.find(
    (row) => row.marketplaceId === "ebay" && row.ok && row.listingRef
  )
  const ref =
    fromResult?.listingRef ||
    listing.marketplaceListings.find((row) => row.marketplaceId === "ebay")

  return {
    title: listing.title.trim(),
    price: listing.price,
    listingId: ref?.externalId?.trim() || "",
    url: ref?.url?.trim() || "",
  }
}

export function ebayResultIsLive(results: OneClickPublishResult[] | null | undefined) {
  return Boolean(
    results?.some(
      (row) =>
        row.marketplaceId === "ebay" &&
        row.ok &&
        (row.status === "published" || Boolean(row.listingRef?.externalId))
    )
  )
}
