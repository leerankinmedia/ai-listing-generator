import type { MarketplaceAdapter } from "@/lib/marketplaces/_core/types"

/**
 * eBay adapter stub (Phase 5).
 * Registers capabilities only — OAuth + Sell API wiring comes in Phase 5.
 */
export const ebayAdapterStub: MarketplaceAdapter = {
  id: "ebay",
  displayName: "eBay",
  capabilities: {
    list: true,
    update: true,
    delist: true,
    syncInventory: true,
    offers: true,
    webhooks: true,
  },
}
