import type { MarketplaceId } from "@/lib/types"

/**
 * Marketplace registry — single source of truth for UI + adapter paths.
 * Live adapters: lib/marketplaces/adapters/{ebay,vinted,whatnot}
 * Future adapters register the same MarketplaceAdapter contract without
 * changing publish-service or Connections UI.
 */

export interface MarketplaceDefinition {
  id: MarketplaceId
  name: string
  shortName: string
  color: string
  description: string
  capabilities: {
    list: boolean
    delist: boolean
    syncInventory: boolean
    offers: boolean
    analytics: boolean
  }
  /** Placeholder for future OAuth / API adapter path */
  adapterPath: string
}

export const MARKETPLACES: MarketplaceDefinition[] = [
  {
    id: "ebay",
    name: "eBay",
    shortName: "eBay",
    color: "#E53238",
    description: "Reach global buyers with auctions and fixed-price listings.",
    capabilities: {
      list: true,
      delist: true,
      syncInventory: true,
      offers: true,
      analytics: true,
    },
    adapterPath: "lib/marketplaces/adapters/ebay",
  },
  {
    id: "poshmark",
    name: "Poshmark",
    shortName: "Posh",
    color: "#7F0353",
    description: "Social resale for fashion and lifestyle.",
    capabilities: {
      list: true,
      delist: true,
      syncInventory: true,
      offers: true,
      analytics: false,
    },
    adapterPath: "lib/marketplaces/adapters/poshmark",
  },
  {
    id: "mercari",
    name: "Mercari",
    shortName: "Mercari",
    color: "#4DC9EF",
    description: "Fast-moving marketplace for everyday goods.",
    capabilities: {
      list: true,
      delist: true,
      syncInventory: true,
      offers: true,
      analytics: false,
    },
    adapterPath: "lib/marketplaces/adapters/mercari",
  },
  {
    id: "depop",
    name: "Depop",
    shortName: "Depop",
    color: "#FF2300",
    description: "Gen-Z fashion and vintage discovery.",
    capabilities: {
      list: true,
      delist: true,
      syncInventory: true,
      offers: false,
      analytics: false,
    },
    adapterPath: "lib/marketplaces/adapters/depop",
  },
  {
    id: "grailed",
    name: "Grailed",
    shortName: "Grailed",
    color: "#111111",
    description: "Menswear and designer streetwear marketplace.",
    capabilities: {
      list: true,
      delist: true,
      syncInventory: true,
      offers: true,
      analytics: false,
    },
    adapterPath: "lib/marketplaces/adapters/grailed",
  },
  {
    id: "facebook_marketplace",
    name: "Facebook Marketplace",
    shortName: "FB MP",
    color: "#1877F2",
    description: "Local and shipping-based Facebook listings.",
    capabilities: {
      list: true,
      delist: true,
      syncInventory: false,
      offers: true,
      analytics: false,
    },
    adapterPath: "lib/marketplaces/adapters/facebook",
  },
  {
    id: "etsy",
    name: "Etsy",
    shortName: "Etsy",
    color: "#F1641E",
    description: "Handmade, vintage, and craft commerce.",
    capabilities: {
      list: true,
      delist: true,
      syncInventory: true,
      offers: false,
      analytics: true,
    },
    adapterPath: "lib/marketplaces/adapters/etsy",
  },
  {
    id: "vinted",
    name: "Vinted",
    shortName: "Vinted",
    color: "#09B1BA",
    description: "Peer-to-peer secondhand fashion across regions.",
    capabilities: {
      list: true,
      delist: true,
      syncInventory: true,
      offers: true,
      analytics: false,
    },
    adapterPath: "lib/marketplaces/adapters/vinted",
  },
  {
    id: "whatnot",
    name: "Whatnot",
    shortName: "Whatnot",
    color: "#FF3B5C",
    description: "Live auctions and community-driven selling.",
    capabilities: {
      list: true,
      delist: true,
      syncInventory: false,
      offers: false,
      analytics: true,
    },
    adapterPath: "lib/marketplaces/adapters/whatnot",
  },
]

export function getMarketplace(id: MarketplaceId): MarketplaceDefinition | undefined {
  return MARKETPLACES.find((m) => m.id === id)
}

export const MARKETPLACE_IDS = MARKETPLACES.map((m) => m.id)
