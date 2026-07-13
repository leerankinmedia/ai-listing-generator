/**
 * Marketplace adapter contract — Phase 5+ implementations plug in here.
 * Phase 1 only defines the interface so the architecture stays extensible.
 */

export type MarketplaceId =
  | "ebay"
  | "poshmark"
  | "mercari"
  | "depop"
  | "grailed"
  | "vinted"
  | "whatnot"
  | "facebook_marketplace"
  | "etsy"
  | "shopify"

export type MarketplaceCapabilities = {
  list: boolean
  update: boolean
  delist: boolean
  syncInventory: boolean
  offers: boolean
  webhooks: boolean
}

export type MarketplaceConnection = {
  id: string
  marketplace: MarketplaceId
  status: "connected" | "expired" | "error" | "pending"
  externalAccountId?: string
  connectedAt: string
}

export type ExternalListingResult = {
  externalId: string
  url?: string
  status: "active" | "pending" | "error"
}

export type SyncResult = {
  quantity: number
  status: "in_sync" | "sold" | "ended" | "unknown"
  raw?: unknown
}

export type OfferAction =
  | { type: "accept" }
  | { type: "decline" }
  | { type: "counter"; amount: number }
  | { type: "ignore" }

/**
 * Every marketplace module must implement this contract.
 * Register adapters in `registry.ts` — core sync/jobs never import vendors directly.
 */
export interface MarketplaceAdapter {
  id: MarketplaceId
  displayName: string
  capabilities: MarketplaceCapabilities
  // Methods below are stubs until Phase 5+
  connect?(input: unknown): Promise<MarketplaceConnection>
  createListing?(input: unknown): Promise<ExternalListingResult>
  updateListing?(externalId: string, patch: unknown): Promise<void>
  delist?(externalId: string): Promise<void>
  syncInventory?(sku: string): Promise<SyncResult>
  handleOffer?(offer: unknown): Promise<OfferAction>
}

export const MARKETPLACE_ROADMAP: Record<
  MarketplaceId,
  { phase: number; notes: string }
> = {
  ebay: { phase: 5, notes: "Official Sell/Inventory APIs — first integration" },
  shopify: { phase: 6, notes: "Admin API + webhooks" },
  etsy: { phase: 6, notes: "Open API v3" },
  mercari: { phase: 6, notes: "Adapter when official API access available" },
  poshmark: { phase: 6, notes: "Adapter when official API access available" },
  depop: { phase: 7, notes: "Capability-limited adapter" },
  grailed: { phase: 7, notes: "Capability-limited adapter" },
  vinted: { phase: 7, notes: "Capability-limited adapter" },
  whatnot: { phase: 7, notes: "Livestream-oriented; limited listing sync" },
  facebook_marketplace: {
    phase: 7,
    notes: "Graph API constraints; partial automation",
  },
}
