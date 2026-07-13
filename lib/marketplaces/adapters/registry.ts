import type { MarketplaceId } from "@/lib/types"
import type { AdapterMeta, MarketplaceAdapter } from "@/lib/marketplaces/adapters/types"
import { MarketplaceError } from "@/lib/marketplaces/adapters/types"
import { ebayAdapter } from "@/lib/marketplaces/adapters/ebay/adapter"
import { isEbayConfigured } from "@/lib/marketplaces/adapters/ebay/oauth"
import { vintedAdapter } from "@/lib/marketplaces/adapters/vinted/adapter"
import { whatnotAdapter } from "@/lib/marketplaces/adapters/whatnot/adapter"
import { isWhatnotConfigured } from "@/lib/marketplaces/adapters/whatnot/oauth"
import { isConnectionsCryptoConfigured } from "@/lib/marketplaces/connections/crypto"
import { PHASE5_MARKETPLACES } from "@/lib/marketplaces/connections/store"

const adapters: Record<string, MarketplaceAdapter> = {
  ebay: ebayAdapter,
  vinted: vintedAdapter,
  whatnot: whatnotAdapter,
}

export function getAdapter(marketplaceId: MarketplaceId): MarketplaceAdapter {
  const adapter = adapters[marketplaceId]
  if (!adapter) {
    throw new MarketplaceError(
      `${marketplaceId} is not implemented yet. Phase 5 supports eBay, Vinted, and Whatnot.`,
      "adapter_missing",
      501
    )
  }
  return adapter
}

export function listImplementedAdapters(): MarketplaceAdapter[] {
  return PHASE5_MARKETPLACES.map((id) => adapters[id])
}

export function getAdapterMeta(): AdapterMeta[] {
  const cryptoReady = isConnectionsCryptoConfigured()
  return [
    {
      id: "ebay",
      name: "eBay",
      status: isEbayConfigured() && cryptoReady ? "live" : "requires_credentials",
      authMethod: "oauth",
      capabilities: ["oauth", "publish", "disconnect"],
    },
    {
      id: "vinted",
      name: "Vinted",
      status: cryptoReady ? "live" : "requires_credentials",
      authMethod: "api_token",
      capabilities: ["api_token", "publish", "disconnect"],
    },
    {
      id: "whatnot",
      name: "Whatnot",
      status:
        isWhatnotConfigured() && cryptoReady ? "live" : "requires_credentials",
      authMethod: "oauth",
      capabilities: ["oauth", "publish", "disconnect"],
    },
    {
      id: "poshmark",
      name: "Poshmark",
      status: "coming_soon",
      authMethod: null,
      capabilities: [],
    },
    {
      id: "mercari",
      name: "Mercari",
      status: "coming_soon",
      authMethod: null,
      capabilities: [],
    },
    {
      id: "depop",
      name: "Depop",
      status: "coming_soon",
      authMethod: null,
      capabilities: [],
    },
    {
      id: "grailed",
      name: "Grailed",
      status: "coming_soon",
      authMethod: null,
      capabilities: [],
    },
    {
      id: "etsy",
      name: "Etsy",
      status: "coming_soon",
      authMethod: null,
      capabilities: [],
    },
    {
      id: "facebook_marketplace",
      name: "Facebook Marketplace",
      status: "coming_soon",
      authMethod: null,
      capabilities: [],
    },
  ]
}
