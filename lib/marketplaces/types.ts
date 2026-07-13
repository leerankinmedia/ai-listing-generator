/**
 * Marketplace adapter contract — Phase 1 foundation.
 * Concrete adapters land in Phases 4–5. Do not call from UI yet.
 */

export type MarketplaceId =
  | "ebay"
  | "poshmark"
  | "mercari"
  | "depop"
  | "grailed"
  | "vinted"
  | "whatnot"
  | "facebook"
  | "etsy"
  | "shopify"

export type MarketplaceCapabilities = {
  list: boolean
  update: boolean
  delist: boolean
  syncInventory: boolean
  autoDelistOnSale: boolean
  offers: boolean
  bulk: boolean
}

export type CanonicalListing = {
  sku: string
  title: string
  description: string
  condition?: string
  brand?: string
  images: string[]
  category?: { name: string; path?: string; remoteId?: string }
  itemSpecifics?: Record<string, string>
  keywords?: string[]
  price: number
  currency?: string
  quantity: number
}

export type RemoteListing = {
  remoteId: string
  url?: string
  status: "draft" | "active" | "ended" | "error"
  raw?: unknown
}

export type SyncResult = {
  upserted: number
  delisted: number
  errors: string[]
}

export type OfferAction = "accept" | "decline" | "counter"

export type Offer = {
  id: string
  amount: number
  currency: string
  listingRemoteId: string
  status: "pending" | "accepted" | "declined" | "expired" | "countered"
}

export interface MarketplaceAdapter {
  id: MarketplaceId
  displayName: string
  capabilities: MarketplaceCapabilities
  connect(userId: string): Promise<{ authorizeUrl: string }>
  createListing(input: CanonicalListing): Promise<RemoteListing>
  updateListing(remoteId: string, patch: Partial<CanonicalListing>): Promise<void>
  delist(remoteId: string): Promise<void>
  syncInventory(userId: string): Promise<SyncResult>
  handleWebhook?(payload: unknown): Promise<{ ok: boolean; message?: string }>
  getOffers?(listingRemoteId: string): Promise<Offer[]>
  respondToOffer?(
    offerId: string,
    action: OfferAction,
    counterAmount?: number,
  ): Promise<void>
}

const registry = new Map<MarketplaceId, MarketplaceAdapter>()

export function registerMarketplace(adapter: MarketplaceAdapter) {
  registry.set(adapter.id, adapter)
}

export function getMarketplace(id: MarketplaceId) {
  return registry.get(id)
}

export function listMarketplaces() {
  return [...registry.values()]
}
