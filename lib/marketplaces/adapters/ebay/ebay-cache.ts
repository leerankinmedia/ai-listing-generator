/**
 * Shared eBay marketplace helpers.
 */

export function ebayMarketplaceId(): string {
  return (process.env.EBAY_MARKETPLACE_ID || "EBAY_US").trim() || "EBAY_US"
}

/** In-memory TTL cache for Taxonomy / Metadata responses (per server instance). */
type CacheEntry<T> = { value: T; expiresAt: number }

const store = new Map<string, CacheEntry<unknown>>()

export function cacheGet<T>(key: string): T | null {
  const entry = store.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    store.delete(key)
    return null
  }
  return entry.value as T
}

export function cacheSet<T>(key: string, value: T, ttlMs: number) {
  store.set(key, { value, expiresAt: Date.now() + Math.max(1_000, ttlMs) })
}

export function cacheDelete(prefixOrKey: string) {
  if (!prefixOrKey.endsWith("*")) {
    store.delete(prefixOrKey)
    return
  }
  const prefix = prefixOrKey.slice(0, -1)
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key)
  }
}

/** Default TTL: 12 hours — refresh periodically for eBay taxonomy/metadata changes. */
export const EBAY_TAXONOMY_CACHE_TTL_MS = 12 * 60 * 60 * 1000
export const EBAY_METADATA_CACHE_TTL_MS = 6 * 60 * 60 * 1000
export const EBAY_TREE_ID_CACHE_TTL_MS = 24 * 60 * 60 * 1000
