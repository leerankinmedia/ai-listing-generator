/**
 * Shared domain types for ListWise.
 * Designed so Phase 2+ features (AI listings, crosslisting, inventory, analytics)
 * can plug in without restructuring the app.
 */

export type MarketplaceId =
  | "ebay"
  | "poshmark"
  | "mercari"
  | "depop"
  | "grailed"
  | "facebook_marketplace"
  | "etsy"
  | "vinted"
  | "whatnot"

export type ListingStatus =
  | "draft"
  | "ready"
  | "listed"
  | "sold"
  | "delisted"
  | "error"

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error"

export interface MarketplaceConnection {
  marketplaceId: MarketplaceId
  status: ConnectionStatus
  accountLabel?: string
  lastSyncedAt?: string
  errorMessage?: string
}

export interface Listing {
  id: string
  title: string
  description?: string
  price: number
  currency: string
  condition?: string
  category?: string
  images: string[]
  status: ListingStatus
  marketplaceListings: MarketplaceListingRef[]
  createdAt: string
  updatedAt: string
}

export interface MarketplaceListingRef {
  marketplaceId: MarketplaceId
  externalId?: string
  url?: string
  status: ListingStatus
  price?: number
}

export interface InventoryItem {
  id: string
  sku?: string
  listingId?: string
  quantity: number
  location?: string
  cost?: number
}

export interface OfferAutomationRule {
  id: string
  listingId: string
  marketplaceId: MarketplaceId
  enabled: boolean
  minOfferPercent: number
  autoAcceptPercent?: number
}

export interface AnalyticsSummary {
  activeListings: number
  totalSales: number
  revenue: number
  views: number
  averageDaysToSell: number
}

export interface UserProfile {
  id: string
  email: string
  fullName?: string
  avatarUrl?: string
  createdAt: string
}

export interface DashboardStats {
  activeListings: number
  connectedMarketplaces: number
  pendingOffers: number
  revenueThisMonth: number
}
