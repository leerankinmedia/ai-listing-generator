/**
 * Seller Custom Label vs internal Inventory API SKU.
 *
 * eBay Inventory requires a SKU as the inventory-item key. That value is
 * also what Seller Hub shows as Custom Label unless we clear it after
 * publish. Only a seller-entered (or imported) SKU may appear as Custom Label.
 */

import type { Listing } from "@/lib/types"
import { isEbayInventoryApiSku } from "@/lib/marketplaces/adapters/ebay/import-map"

export const SKU_SETTINGS_KEY = "listwise.skuSettings"

export type SkuSettings = {
  prefix: string
  nextNumber: number
  pad: number
  /** When true, auto-assign the next ListWise SKU (LW00001…) on publish. Default false. */
  autoGenerate: boolean
}

export const DEFAULT_SKU_SETTINGS: SkuSettings = {
  prefix: "LW",
  nextNumber: 1,
  pad: 5,
  autoGenerate: false,
}

export function readSkuSettings(): SkuSettings {
  if (typeof window === "undefined") return { ...DEFAULT_SKU_SETTINGS }
  try {
    const raw = window.localStorage.getItem(SKU_SETTINGS_KEY)
    if (!raw) return { ...DEFAULT_SKU_SETTINGS }
    const parsed = JSON.parse(raw) as Partial<SkuSettings>
    return {
      prefix: String(parsed.prefix || "LW")
        .replace(/[^a-zA-Z0-9]/g, "")
        .slice(0, 10) || "LW",
      nextNumber: Math.max(1, Math.floor(Number(parsed.nextNumber) || 1)),
      pad: Math.min(8, Math.max(3, Math.floor(Number(parsed.pad) || 5))),
      autoGenerate: Boolean(parsed.autoGenerate),
    }
  } catch {
    return { ...DEFAULT_SKU_SETTINGS }
  }
}

export function writeSkuSettings(settings: SkuSettings) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(SKU_SETTINGS_KEY, JSON.stringify(settings))
}

export function formatListWiseSku(
  settings: SkuSettings,
  number = settings.nextNumber
): string {
  const prefix = settings.prefix || "LW"
  const num = String(Math.max(1, Math.floor(number))).padStart(settings.pad, "0")
  return `${prefix}${num}`.slice(0, 50)
}

/** Allocate the next SKU and persist the counter (client-side). */
export function allocateNextListWiseSku(): string {
  const settings = readSkuSettings()
  const sku = formatListWiseSku(settings)
  writeSkuSettings({
    ...settings,
    nextNumber: settings.nextNumber + 1,
  })
  return sku
}

/**
 * Prefer imported eBay SKU / saved ListWise SKU. Never use listing UUID.
 */
export function resolveListingSku(listing: Listing): string | null {
  const extras = listing.specifics?.extras || {}
  const candidates = [
    extras.ebayOriginalSku,
    extras.ebaySku,
    extras.sku,
    extras.SKU,
  ]
  for (const raw of candidates) {
    const trimmed = raw?.trim()
    if (trimmed && isEbayInventoryApiSku(trimmed)) return trimmed.trim()
    // Allow ListWise LW##### even if somehow non-matching — sanitize later.
    if (trimmed && /^[A-Za-z0-9]{1,50}$/.test(trimmed)) return trimmed
  }
  return null
}

/**
 * Ensure listing.specifics.extras.sku is set when appropriate.
 * Imported listings keep their eBay SKU.
 * New listings only get the next ListWise SKU when autoGenerate is enabled
 * in account settings — otherwise SKU stays optional/empty.
 */
export function ensureListingInventorySku(
  listing: Listing,
  opts?: { forceAllocate?: boolean }
): Listing {
  const existing = resolveListingSku(listing)
  if (existing) {
    const extras = { ...(listing.specifics?.extras || {}) }
    if (extras.sku !== existing) {
      extras.sku = existing
      return {
        ...listing,
        specifics: { ...listing.specifics, extras },
        updatedAt: new Date().toISOString(),
      }
    }
    return listing
  }

  const settings =
    typeof window !== "undefined" ? readSkuSettings() : DEFAULT_SKU_SETTINGS
  const shouldAllocate =
    opts?.forceAllocate === true || settings.autoGenerate === true
  if (!shouldAllocate) {
    return listing
  }

  const sku =
    typeof window !== "undefined"
      ? allocateNextListWiseSku()
      : formatListWiseSku(DEFAULT_SKU_SETTINGS, Date.now() % 100000)

  return {
    ...listing,
    specifics: {
      ...listing.specifics,
      extras: {
        ...(listing.specifics.extras || {}),
        sku,
      },
    },
    updatedAt: new Date().toISOString(),
  }
}

/** Stable Inventory API key derived from the listing id — never a Custom Label. */
export function derivedInternalInventorySku(listingId: string): string {
  const compact = listingId.replace(/[^a-zA-Z0-9]/g, "").slice(-8).toUpperCase()
  return `LW${compact || "ITEM"}`.slice(0, 50)
}

/**
 * Seller-facing Custom Label only — never an auto-generated LW hash, even if
 * an older publish path wrote that hash onto extras.sku.
 */
export function sellerFacingCustomLabel(listing: Listing): string | null {
  const stored = resolveListingSku(listing)
  if (!stored) return null
  if (
    stored.toUpperCase() === derivedInternalInventorySku(listing.id).toUpperCase()
  ) {
    return null
  }
  return stored
}

/**
 * Internal Inventory API key. Uses the seller Custom Label when they entered
 * one; otherwise a stable hash of the listing id. Never write this onto
 * extras.sku or treat it as a Custom Label.
 */
export function internalInventorySku(listing: Listing): string {
  const stored = listing.specifics?.extras?.ebayInventorySku?.trim()
  if (stored && isEbayInventoryApiSku(stored)) return stored
  const seller = sellerFacingCustomLabel(listing)
  if (seller) return seller
  return derivedInternalInventorySku(listing.id)
}

export function shouldClearEbayCustomLabel(listing: Listing): boolean {
  return sellerFacingCustomLabel(listing) == null
}

/** Server-safe Inventory API SKU (not a seller Custom Label). */
export function pickPublishSku(listing: Listing): string {
  return internalInventorySku(listing)
}
