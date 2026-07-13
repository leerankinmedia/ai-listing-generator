import type { MarketplaceDefinition } from "@/lib/types"

/**
 * Canonical marketplace registry.
 * Phase 1: UI + architecture only — adapters are stubs for future phases.
 */
export const MARKETPLACES: MarketplaceDefinition[] = [
  {
    id: "ebay",
    name: "eBay",
    shortName: "eBay",
    description: "Global auctions and Buy It Now listings",
    color: "#E53238",
    status: "coming_soon",
    capabilities: ["list", "delist", "sync_inventory", "offers", "analytics"],
  },
  {
    id: "poshmark",
    name: "Poshmark",
    shortName: "Posh",
    description: "Social fashion resale with party-driven discovery",
    color: "#7B2334",
    status: "coming_soon",
    capabilities: ["list", "delist", "sync_inventory", "offers"],
  },
  {
    id: "mercari",
    name: "Mercari",
    shortName: "Mercari",
    description: "Fast-moving local and national secondhand marketplace",
    color: "#4DC3CD",
    status: "coming_soon",
    capabilities: ["list", "delist", "sync_inventory", "offers"],
  },
  {
    id: "depop",
    name: "Depop",
    shortName: "Depop",
    description: "Gen-Z fashion discovery and trend-led inventory",
    color: "#FF2300",
    status: "coming_soon",
    capabilities: ["list", "delist", "sync_inventory"],
  },
  {
    id: "grailed",
    name: "Grailed",
    shortName: "Grailed",
    description: "Menswear and streetwear with serious buyers",
    color: "#111111",
    status: "coming_soon",
    capabilities: ["list", "delist", "sync_inventory", "offers", "messaging"],
  },
  {
    id: "facebook_marketplace",
    name: "Facebook Marketplace",
    shortName: "FB MP",
    description: "Local reach with massive organic traffic",
    color: "#1877F2",
    status: "coming_soon",
    capabilities: ["list", "delist", "sync_inventory", "messaging"],
  },
  {
    id: "etsy",
    name: "Etsy",
    shortName: "Etsy",
    description: "Handmade, vintage, and craft marketplace buyers",
    color: "#F1641E",
    status: "coming_soon",
    capabilities: ["list", "delist", "sync_inventory", "analytics"],
  },
  {
    id: "vinted",
    name: "Vinted",
    shortName: "Vinted",
    description: "European secondhand fashion with low fees",
    color: "#09B1BA",
    status: "coming_soon",
    capabilities: ["list", "delist", "sync_inventory", "offers", "messaging"],
  },
  {
    id: "whatnot",
    name: "Whatnot",
    shortName: "Whatnot",
    description: "Live auction commerce and collector demand",
    color: "#FFD700",
    status: "coming_soon",
    capabilities: ["list", "sync_inventory", "analytics"],
  },
]

export function getMarketplace(id: string) {
  return MARKETPLACES.find((m) => m.id === id)
}

export function getMarketplaceNames() {
  return MARKETPLACES.map((m) => m.name)
}
