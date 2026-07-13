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

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error"
  | "coming_soon"

export interface MarketplaceDefinition {
  id: MarketplaceId
  name: string
  shortName: string
  description: string
  color: string
  status: ConnectionStatus
  capabilities: MarketplaceCapability[]
}

export type MarketplaceCapability =
  | "list"
  | "delist"
  | "sync_inventory"
  | "offers"
  | "analytics"
  | "messaging"

export interface InventoryItem {
  id: string
  title: string
  description: string
  price: number
  quantity: number
  condition: string
  category: string
  brand?: string
  size?: string
  images: string[]
  sku?: string
  tags: string[]
  createdAt: string
  updatedAt: string
}

export interface CrossListing {
  id: string
  inventoryItemId: string
  marketplaceId: MarketplaceId
  externalListingId?: string
  status: ListingStatus
  price: number
  url?: string
  lastSyncedAt?: string
  errorMessage?: string
}

export interface UserProfile {
  id: string
  email: string
  fullName: string | null
  avatarUrl: string | null
  createdAt: string
}

export interface DashboardStats {
  activeListings: number
  totalInventory: number
  soldThisMonth: number
  connectedMarketplaces: number
  pendingOffers: number
  revenueThisMonth: number
}
