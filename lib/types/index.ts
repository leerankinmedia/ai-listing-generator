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
  | "character"
  | "theme"
  | "features"
  | "itemType"
  | "licensedProperty"
  | "styleNumber"
  | "countryOfOrigin"
  | "waistSize"
  | "inseam"
  | "fit"
  | "rise"
  | "closure"
  | "fabricWash"
  | "pocketType"
  | "fabricType"
  | "garmentCare"
  | "sizeType"
  | "season"
  | "accents"
  | "model"
  | "productLine"
  | "mpn"
  | "upc"
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

/** Durable storage lifecycle for listing originals (Supabase is source of truth). */
export type ListingImageStorageStatus =
  | "pending"
  | "uploading"
  | "uploaded"
  | "error"

export interface ListingImage {
  id: string
  /** Permanent public/signed Supabase URL once storageStatus is uploaded. */
  url: string
  storagePath?: string
  /**
   * Upload lifecycle. Analyze Photos must wait until every image is `uploaded`
   * with a durable http(s) URL — never blob:, File, or staging paths.
   */
  storageStatus?: ListingImageStorageStatus
  /** Last upload failure message when storageStatus is error */
  storageError?: string
  sortOrder: number
  isPrimary?: boolean
  /** Per-image Vision summary after analysis */
  analysis?: {
    summary?: string
    detectedFlaws?: string[]
    confidence?: number
  }
}

/** Seller-entered eBay package dims/weight — never AI-invented. */
export interface ListingShippingPackage {
  /** Blank until the seller enters a value (do not default to 0 in the form). */
  weightPounds: number | null
  weightOunces: number | null
  lengthInches: number | null
  widthInches: number | null
  heightInches: number | null
  packageType: string
  /** Inventory API shippingIrregular — default false. */
  irregularPackage?: boolean
}

/** Selected leaf eBay category (Taxonomy) — never a hardcoded map. */
export interface EbayListingCategory {
  marketplaceId: string
  categoryTreeId: string
  categoryId: string
  categoryName: string
  /** Full breadcrumb path, e.g. Clothing > Women > … > Sweatshirts */
  categoryPath: string
  leafCategory: boolean
}

/** Condition chosen from Metadata getItemConditionPolicies for the selected category. */
export interface EbayListingCondition {
  conditionId: string
  conditionName: string
  /** Inventory API ConditionEnum derived from conditionId */
  conditionEnum: string
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
  /** Live eBay leaf category selection (source of truth for publish). */
  ebayCategory?: EbayListingCategory
  /** Condition ID/name from policies for ebayCategory.categoryId only. */
  ebayCondition?: EbayListingCondition
  /** Visible defects / wear notes */
  flaws?: string
  extras?: Record<string, string>
  /**
   * Package weight/dims/type for eBay Inventory packageWeightAndSize.
   * Required before eBay publish; leave empty for AI/imported drafts.
   */
  shippingPackage?: ListingShippingPackage
  /**
   * Shipping option for eBay publish. Defaults to calculated (buyer pays).
   * ListWise maps this to the correct fulfillment policy automatically.
   */
  shippingMode?: "calculated" | "flat" | "free"
  /** eBay shipping service code (e.g. USPSGroundAdvantage). */
  shippingService?: string
  /** Flat rate amount in USD when shippingMode is flat. */
  flatShippingAmount?: number
  /** Handling time in business days (eBay-supported values only). */
  handlingTimeDays?: number
  /** Required when shippingMode is free. */
  freeShippingConfirmed?: boolean
  /** Seller item location ZIP (Inventory location). Not an item specific. */
  itemLocationZip?: string
  /** International shipping off unless the seller explicitly enables it. */
  internationalShipping?: boolean
  /** When true, enable eBay Best Offer on the listing. */
  allowOffers?: boolean
  /** Domestic returns accepted. */
  returnsAccepted?: boolean
  /** Return window in days (30 or 60). */
  returnWindowDays?: 30 | 60
  /** Who pays return shipping. */
  returnShippingPaidBy?: "BUYER" | "SELLER"
  /** Require immediate payment (managed payments / payment policy). */
  requireImmediatePayment?: boolean
  /** Promoted Listings: off, dynamic ad rate, or custom %. */
  promotedListings?: "off" | "dynamic" | "custom"
  /** Custom promoted listings ad rate (2–100). */
  promotedListingsPercent?: number
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
    suggestedValue?: string
  }>
  /** Exact eBay aspect values already resolved — apply to listing state for preselect */
  resolvedFields?: Array<{
    name: string
    value: string
  }>
  /** Promoted Listings outcome when requested (never claimed unless eBay confirmed). */
  promotion?: {
    status: "off" | "applied" | "skipped" | "failed"
    mode?: "dynamic" | "custom"
    percent?: number | null
    message: string
  }
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
