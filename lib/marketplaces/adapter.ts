/**
 * Marketplace adapter contract for future integrations.
 * Each marketplace will implement this interface in later phases.
 */

import type {
  CrossListing,
  InventoryItem,
  MarketplaceCapability,
  MarketplaceId,
} from "@/lib/types"

export interface MarketplaceCredentials {
  accessToken?: string
  refreshToken?: string
  expiresAt?: string
  metadata?: Record<string, string>
}

export interface PublishListingInput {
  item: InventoryItem
  price: number
  quantity: number
}

export interface MarketplaceAdapter {
  readonly id: MarketplaceId
  readonly capabilities: MarketplaceCapability[]

  connect(credentials: MarketplaceCredentials): Promise<void>
  disconnect(): Promise<void>
  isConnected(): Promise<boolean>

  publish(input: PublishListingInput): Promise<CrossListing>
  update(listingId: string, input: Partial<PublishListingInput>): Promise<CrossListing>
  delist(listingId: string): Promise<void>
  syncInventory(): Promise<InventoryItem[]>
}

/**
 * Placeholder adapter used until real marketplace APIs are wired.
 */
export class StubMarketplaceAdapter implements MarketplaceAdapter {
  constructor(
    public readonly id: MarketplaceId,
    public readonly capabilities: MarketplaceCapability[] = ["list", "delist"]
  ) {}

  async connect(): Promise<void> {
    throw new Error(`${this.id} integration is not available in Phase 1`)
  }

  async disconnect(): Promise<void> {
    throw new Error(`${this.id} integration is not available in Phase 1`)
  }

  async isConnected(): Promise<boolean> {
    return false
  }

  async publish(): Promise<CrossListing> {
    throw new Error(`${this.id} publish is not available in Phase 1`)
  }

  async update(): Promise<CrossListing> {
    throw new Error(`${this.id} update is not available in Phase 1`)
  }

  async delist(): Promise<void> {
    throw new Error(`${this.id} delist is not available in Phase 1`)
  }

  async syncInventory(): Promise<InventoryItem[]> {
    throw new Error(`${this.id} sync is not available in Phase 1`)
  }
}
