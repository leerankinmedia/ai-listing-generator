import type { MarketplaceId } from "@/lib/marketplaces/constants"

/** Core domain types — ready for Phase 2+ integrations */

export interface UserProfile {
  id: string
  email: string
  fullName: string | null
  avatarUrl: string | null
  createdAt: string
}

export interface AuthSession {
  user: UserProfile
  accessToken?: string
  /** True when running without live Supabase credentials */
  isDemo: boolean
}

export type ListingStatus =
  | "draft"
  | "queued"
  | "active"
  | "sold"
  | "delisted"
  | "error"

export interface ListingChannel {
  marketplaceId: MarketplaceId
  externalId: string | null
  status: ListingStatus
  url: string | null
  price: number | null
  lastSyncedAt: string | null
}

export interface InventoryItem {
  id: string
  sku: string | null
  title: string
  description: string | null
  brand: string | null
  category: string | null
  condition: string | null
  cost: number | null
  price: number | null
  quantity: number
  images: string[]
  tags: string[]
  channels: ListingChannel[]
  createdAt: string
  updatedAt: string
}

export interface DashboardStats {
  activeListings: number
  totalSold: number
  inventoryCount: number
  connectedMarketplaces: number
  revenueMtd: number
}
