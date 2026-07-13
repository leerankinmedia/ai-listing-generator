import type { MarketplaceId, MarketplaceConnection } from "@/lib/types"

export interface MarketplaceMeta {
  id: MarketplaceId
  name: string
  shortName: string
  color: string
  description: string
}

/** Registry of marketplaces ListWise will support in future phases */
export const MARKETPLACES: MarketplaceMeta[] = [
  {
    id: "ebay",
    name: "eBay",
    shortName: "eBay",
    color: "#E53238",
    description: "Global auction & Buy It Now reach",
  },
  {
    id: "poshmark",
    name: "Poshmark",
    shortName: "Posh",
    color: "#7F0353",
    description: "Social resale for fashion",
  },
  {
    id: "mercari",
    name: "Mercari",
    shortName: "Mercari",
    color: "#4DC9DC",
    description: "Fast-moving general marketplace",
  },
  {
    id: "depop",
    name: "Depop",
    shortName: "Depop",
    color: "#FF2300",
    description: "Youth-driven fashion discovery",
  },
  {
    id: "grailed",
    name: "Grailed",
    shortName: "Grailed",
    color: "#1A1A1A",
    description: "Menswear & designer streetwear",
  },
  {
    id: "facebook",
    name: "Facebook Marketplace",
    shortName: "FB MP",
    color: "#1877F2",
    description: "Local & national buyer reach",
  },
  {
    id: "etsy",
    name: "Etsy",
    shortName: "Etsy",
    color: "#F1641E",
    description: "Handmade, vintage & craft buyers",
  },
  {
    id: "vinted",
    name: "Vinted",
    shortName: "Vinted",
    color: "#09B1BA",
    description: "Secondhand fashion across regions",
  },
  {
    id: "whatnot",
    name: "Whatnot",
    shortName: "Whatnot",
    color: "#FF5A36",
    description: "Live selling & auctions",
  },
]

export function getMarketplace(id: MarketplaceId): MarketplaceMeta {
  const found = MARKETPLACES.find((m) => m.id === id)
  if (!found) throw new Error(`Unknown marketplace: ${id}`)
  return found
}

/** Default disconnected state for dashboard — ready for OAuth wiring */
export function defaultMarketplaceConnections(): MarketplaceConnection[] {
  return MARKETPLACES.map((m) => ({
    id: m.id,
    status: "disconnected" as const,
  }))
}

export const FUTURE_MODULES = [
  {
    id: "ai-listing-generation" as const,
    title: "AI Listing Generation",
    description: "Generate titles, descriptions, and tags optimized per marketplace.",
  },
  {
    id: "crosslisting" as const,
    title: "One-Click Crosslisting",
    description: "Publish inventory across every connected channel in seconds.",
  },
  {
    id: "auto-delisting" as const,
    title: "Auto Delisting",
    description: "When an item sells, remove it everywhere automatically.",
  },
  {
    id: "offer-automation" as const,
    title: "Offer Automation",
    description: "Accept, decline, or counter offers with smart rules.",
  },
  {
    id: "inventory-management" as const,
    title: "Inventory Management",
    description: "Central SKU, photos, costs, and quantity in one source of truth.",
  },
  {
    id: "analytics" as const,
    title: "Analytics",
    description: "Track sell-through, velocity, and channel performance.",
  },
  {
    id: "marketplace-syncing" as const,
    title: "Marketplace Syncing",
    description: "Keep prices, stock, and listing status in continuous sync.",
  },
] as const
