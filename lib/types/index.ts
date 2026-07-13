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

export type ItemCondition =
  | "New with tags"
  | "New without tags"
  | "Excellent"
  | "Good"
  | "Fair"
  | "Poor"

export interface MarketplaceConnection {
  marketplaceId: MarketplaceId
  status: ConnectionStatus
  accountLabel?: string
  lastSyncedAt?: string
  errorMessage?: string
}

export interface ListingImage {
  id: string
  /** Public URL, data URL, or storage path */
  url: string
  /** Optional storage object key for Supabase Storage */
  storagePath?: string
  sortOrder: number
  isPrimary?: boolean
}

export interface ListingSpecifics {
  brand?: string
  size?: string
  color?: string
  material?: string
  style?: string
  condition?: ItemCondition | string
  category?: string
  /** Free-form key/value extras for marketplace-specific fields */
  extras?: Record<string, string>
}

export interface Listing {
  id: string
  userId: string
  title: string
  description: string
  price: number
  currency: string
  keywords: string[]
  specifics: ListingSpecifics
  images: ListingImage[]
  status: ListingStatus
  /** Future publish targets — adapters fill these in later phases */
  marketplaceListings: MarketplaceListingRef[]
  /** Which marketplaces the seller intends to publish to */
  targetMarketplaces: MarketplaceId[]
  aiGenerated: boolean
  createdAt: string
  updatedAt: string
}

export interface MarketplaceListingRef {
  marketplaceId: MarketplaceId
  externalId?: string
  url?: string
  status: ListingStatus
  price?: number
  lastSyncedAt?: string
  errorMessage?: string
}

/** Payload adapters will consume when publishing */
export interface PublishReadyListing {
  listing: Listing
  marketplaceId: MarketplaceId
  overrides?: Partial<{
    title: string
    description: string
    price: number
    specifics: ListingSpecifics
  }>
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

export interface GeneratedListingDraft {
  title: string
  description: string
  price: number
  currency: string
  keywords: string[]
  specifics: ListingSpecifics
}
