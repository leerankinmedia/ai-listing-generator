/** Core domain types — designed for future marketplace + AI phases */

export type MarketplaceId =
  | "ebay"
  | "poshmark"
  | "mercari"
  | "depop"
  | "grailed"
  | "facebook"
  | "etsy"
  | "vinted"
  | "whatnot"

export type MarketplaceStatus = "connected" | "disconnected" | "syncing" | "error"

export type ListingStatus =
  | "draft"
  | "generating"
  | "ready"
  | "listed"
  | "sold"
  | "delisted"
  | "error"

export interface MarketplaceConnection {
  id: MarketplaceId
  status: MarketplaceStatus
  connectedAt?: string
  lastSyncedAt?: string
  accountLabel?: string
}

export interface InventoryItem {
  id: string
  title: string
  sku?: string
  brand?: string
  category?: string
  condition?: string
  cost?: number
  price?: number
  quantity: number
  images: string[]
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface Listing {
  id: string
  inventoryItemId: string
  marketplaceId: MarketplaceId
  status: ListingStatus
  title: string
  description?: string
  price: number
  externalId?: string
  externalUrl?: string
  listedAt?: string
  soldAt?: string
  createdAt: string
  updatedAt: string
}

export interface AiListingDraft {
  title: string
  description: string
  tags: string[]
  suggestedPrice?: number
  categoryHints: Partial<Record<MarketplaceId, string>>
}

export interface OfferAutomationRule {
  id: string
  marketplaceId: MarketplaceId
  enabled: boolean
  minOfferPercent: number
  autoAcceptPercent: number
  counterOfferPercent?: number
}

export interface AnalyticsSnapshot {
  revenue: number
  soldCount: number
  activeListings: number
  avgDaysToSale: number
  periodLabel: string
}

export interface UserProfile {
  id: string
  email: string
  fullName?: string
  avatarUrl?: string
  createdAt: string
}

export type FutureModule =
  | "ai-listing-generation"
  | "crosslisting"
  | "auto-delisting"
  | "offer-automation"
  | "inventory-management"
  | "analytics"
  | "marketplace-syncing"
