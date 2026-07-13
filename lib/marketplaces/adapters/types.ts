/**
 * Marketplace adapter contract.
 * Future phases implement one adapter per marketplace under this folder.
 */

import type { Listing, MarketplaceId, MarketplaceListingRef } from "@/lib/types"

export interface MarketplaceCredentials {
  accessToken?: string
  refreshToken?: string
  expiresAt?: string
  meta?: Record<string, string>
}

export interface PublishResult {
  ok: boolean
  listingRef?: MarketplaceListingRef
  error?: string
}

export interface MarketplaceAdapter {
  id: MarketplaceId
  connect(credentials: MarketplaceCredentials): Promise<void>
  disconnect(): Promise<void>
  publish(listing: Listing): Promise<PublishResult>
  update(listing: Listing, externalId: string): Promise<PublishResult>
  delist(externalId: string): Promise<{ ok: boolean; error?: string }>
  syncInventory?(sku: string, quantity: number): Promise<{ ok: boolean }>
}

/** Placeholder adapters — wire real APIs in Phase 2+. */
export const ADAPTER_STATUS = {
  ebay: "planned",
  poshmark: "planned",
  mercari: "planned",
  depop: "planned",
  grailed: "planned",
  facebook_marketplace: "planned",
  etsy: "planned",
  vinted: "planned",
  whatnot: "planned",
} as const satisfies Record<MarketplaceId, "planned" | "beta" | "live">
