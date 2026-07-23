/**
 * Shared domain types for ListWise production listing engine.
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

export type DetectedFieldKey =
  | "brand"
  | "category"
  | "size"
  | "color"
  | "material"
  | "style"
  | "pattern"
  | "gender"
  | "condition"
  | "flaws"
  | "title"
  | "description"
  | "price"
  | "keywords"

export interface FieldConfidence {
  value: string
  confidence: number
  /** Short rationale from Vision / comps analysis */
  rationale?: string
}

export interface MarketplaceConnection {
  marketplaceId: MarketplaceId
  status: ConnectionStatus
  accountLabel?: string
  lastSyncedAt?: string
  errorMessage?: string
}

export interface ListingImage {
  id: string
  url: string
  storagePath?: string
  sortOrder: number
  isPrimary?: boolean
  /** Per-image Vision summary after analysis */
  analysis?: {
    summary?: string
    detectedFlaws?: string[]
    confidence?: number
  }
}

export interface ListingSpecifics {
  brand?: string
  size?: string
  color?: string
  material?: string
  style?: string
  pattern?: string
  gender?: string
  condition?: ItemCondition | string
  category?: string
  /** Visible defects / wear notes */
  flaws?: string
  extras?: Record<string, string>
}

export interface SoldCompsEstimate {
  suggestedPrice: number
  lowPrice: number
  highPrice: number
  currency: string
  confidence: number
  /** How the estimate was derived */
  method: "ai_market_comps" | "ebay_sold_api" | "manual"
  rationale: string
  comparableSummary?: string
  sampleSize?: number
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
  /** Confidence for every AI-detected / generated field (0–1) */
  fieldConfidence: Partial<Record<DetectedFieldKey, FieldConfidence>>
  comps?: SoldCompsEstimate
  images: ListingImage[]
  status: ListingStatus
  marketplaceListings: MarketplaceListingRef[]
  targetMarketplaces: MarketplaceId[]
  aiGenerated: boolean
  analysisMeta?: {
    imagesAnalyzed: number
    model: string
    analyzedAt: string
  }
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

export interface OneClickPublishRequest {
  listingId: string
  marketplaceIds: MarketplaceId[]
}

export interface OneClickPublishResult {
  marketplaceId: MarketplaceId
  ok: boolean
  status: "published" | "queued" | "skipped" | "error"
  message: string
  listingRef?: MarketplaceListingRef
  /** eBay (and similar) required item specifics the seller must fill before retry */
  requiredFields?: Array<{
    name: string
    allowedValues?: string[]
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
  fieldConfidence: Partial<Record<DetectedFieldKey, FieldConfidence>>
  comps: SoldCompsEstimate
}
