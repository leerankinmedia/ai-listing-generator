import type { MarketplaceAdapter, MarketplaceId } from "./types"

/**
 * Central registry for marketplace adapters.
 * Phase 1 ships empty — adapters register themselves in later phases:
 *   import { registerMarketplace } from "@/lib/marketplaces/_core/registry"
 *   registerMarketplace(ebayAdapter)
 */
const adapters = new Map<MarketplaceId, MarketplaceAdapter>()

export function registerMarketplace(adapter: MarketplaceAdapter) {
  if (adapters.has(adapter.id)) {
    throw new Error(`Marketplace already registered: ${adapter.id}`)
  }
  adapters.set(adapter.id, adapter)
}

export function getMarketplace(id: MarketplaceId) {
  return adapters.get(id)
}

export function listMarketplaces() {
  return Array.from(adapters.values())
}

export function listCapable(
  capability: keyof MarketplaceAdapter["capabilities"]
) {
  return listMarketplaces().filter((a) => a.capabilities[capability])
}
