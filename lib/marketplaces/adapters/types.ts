import type {
  Listing,
  MarketplaceId,
  MarketplaceListingRef,
} from "@/lib/types"
import type { StoredMarketplaceConnection } from "@/lib/marketplaces/connections/crypto"

export class MarketplaceError extends Error {
  status: number
  code: string
  constructor(message: string, code = "marketplace_error", status = 400) {
    super(message)
    this.name = "MarketplaceError"
    this.code = code
    this.status = status
  }
}

export interface PublishResult {
  ok: boolean
  listingRef?: MarketplaceListingRef
  error?: string
  externalUrl?: string
}

export interface MarketplaceAdapter {
  id: MarketplaceId
  displayName: string
  /** Whether app-level credentials are configured in env */
  isAppConfigured(): boolean
  /** Human-readable setup requirements */
  setupRequirements(): string[]
  publish(
    listing: Listing,
    connection: StoredMarketplaceConnection
  ): Promise<PublishResult>
}

export type AdapterCapability =
  | "oauth"
  | "api_token"
  | "publish"
  | "disconnect"

export interface AdapterMeta {
  id: MarketplaceId
  name: string
  status: "live" | "requires_credentials" | "coming_soon"
  authMethod: "oauth" | "api_token" | null
  capabilities: AdapterCapability[]
}
