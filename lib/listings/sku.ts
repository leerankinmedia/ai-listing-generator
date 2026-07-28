/**
 * ListWise inventory SKU resolution for eBay Custom Label / Inventory SKU.
 * Never expose internal listing UUIDs as the seller-facing SKU.
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
  const extras = listing.specifics.extras || {}
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
    const extras = { ...(listing.specifics.extras || {}) }
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

/** Server-safe SKU pick for publish (no localStorage allocation). */
export function pickPublishSku(listing: Listing): string {
  const resolved = resolveListingSku(listing)
  if (resolved) return resolved
  // Last resort for server path without a pre-assigned SKU — short hash of id,
  // prefixed so it is never a raw UUID.
  const compact = listing.id.replace(/[^a-zA-Z0-9]/g, "").slice(-8).toUpperCase()
  return `LW${compact || Date.now()}`.slice(0, 50)
}
