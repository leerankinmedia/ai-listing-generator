import type { MarketplaceAdapter } from "@/lib/marketplaces/types"

/**
 * Placeholder eBay adapter — wires the module boundary in Phase 1.
 * Real OAuth + Trading/Sell APIs land in Phase 4.
 */
export const ebayAdapterStub: MarketplaceAdapter = {
  id: "ebay",
  displayName: "eBay",
  capabilities: {
    list: true,
    update: true,
    delist: true,
    syncInventory: true,
    autoDelistOnSale: true,
    offers: true,
    bulk: true,
  },
  async connect() {
    throw new Error("eBay OAuth is not implemented until Phase 4")
  },
  async createListing() {
    throw new Error("eBay createListing is not implemented until Phase 4")
  },
  async updateListing() {
    throw new Error("eBay updateListing is not implemented until Phase 4")
  },
  async delist() {
    throw new Error("eBay delist is not implemented until Phase 4")
  },
  async syncInventory() {
    throw new Error("eBay syncInventory is not implemented until Phase 4")
  },
}
