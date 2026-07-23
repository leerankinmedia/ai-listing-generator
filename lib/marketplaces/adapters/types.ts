import type {
  Listing,
  MarketplaceId,
  MarketplaceListingRef,
} from "@/lib/types"
import type { StoredMarketplaceConnection } from "@/lib/marketplaces/connections/crypto"

export class MarketplaceError extends Error {
  status: number
  code: string
  details?: {
    requiredFields?: Array<{
      name: string
      allowedValues?: string[]
    }>
  }
  constructor(
    message: string,
    code = "marketplace_error",
    status = 400,
    details?: MarketplaceError["details"]
  ) {
    super(message)
    this.name = "MarketplaceError"
    this.code = code
    this.status = status
    this.details = details
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
