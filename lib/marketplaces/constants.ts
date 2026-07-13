/**
 * Marketplace registry for future crosslisting integrations.
 * Phase 1: UI + architecture only — no live API connections.
 */

export type MarketplaceId =
  | "ebay"
  | "poshmark"
  | "mercari"
  | "depop"
  | "grailed"
  | "facebook"
  | "etsy"
  | "vinted"
  | "whatnot"

export type MarketplaceStatus = "coming_soon" | "beta" | "connected" | "disconnected"

export interface MarketplaceDefinition {
  id: MarketplaceId
  name: string
  shortName: string
  color: string
  description: string
  status: MarketplaceStatus
  /** Relative priority for default crosslist order */
  defaultPriority: number
}

export const MARKETPLACES: MarketplaceDefinition[] = [
  {
    id: "ebay",
    name: "eBay",
    shortName: "eBay",
    color: "#E53238",
    description: "Global auctions and Buy It Now",
    status: "coming_soon",
    defaultPriority: 1,
  },
  {
    id: "poshmark",
    name: "Poshmark",
    shortName: "Posh",
    color: "#7B2D5B",
    description: "Social fashion resale",
    status: "coming_soon",
    defaultPriority: 2,
  },
  {
    id: "mercari",
    name: "Mercari",
    shortName: "Mercari",
    color: "#4DC3C9",
    description: "Mobile-first marketplace",
    status: "coming_soon",
    defaultPriority: 3,
  },
  {
    id: "depop",
    name: "Depop",
    shortName: "Depop",
    color: "#FF2300",
    description: "Gen-Z thrift & streetwear",
    status: "coming_soon",
    defaultPriority: 4,
  },
  {
    id: "grailed",
    name: "Grailed",
    shortName: "Grailed",
    color: "#1A1A1A",
    description: "Menswear & designer",
    status: "coming_soon",
    defaultPriority: 5,
  },
  {
    id: "facebook",
    name: "Facebook Marketplace",
    shortName: "FB",
    color: "#1877F2",
    description: "Local & social commerce",
    status: "coming_soon",
    defaultPriority: 6,
  },
  {
    id: "etsy",
    name: "Etsy",
    shortName: "Etsy",
    color: "#F1641E",
    description: "Handmade & vintage",
    status: "coming_soon",
    defaultPriority: 7,
  },
  {
    id: "vinted",
    name: "Vinted",
    shortName: "Vinted",
    color: "#09B1BA",
    description: "Peer-to-peer fashion",
    status: "coming_soon",
    defaultPriority: 8,
  },
  {
    id: "whatnot",
    name: "Whatnot",
    shortName: "Whatnot",
    color: "#FFCD00",
    description: "Live auction streaming",
    status: "coming_soon",
    defaultPriority: 9,
  },
]

export const MARKETPLACE_MAP = Object.fromEntries(
  MARKETPLACES.map((m) => [m.id, m]),
) as Record<MarketplaceId, MarketplaceDefinition>

/** Future feature modules — used for dashboard roadmapping UI */
export const FUTURE_FEATURES = [
  {
    id: "ai-listing",
    title: "AI listing generation",
    description: "Titles, descriptions, and pricing from photos",
    icon: "sparkles",
  },
  {
    id: "crosslisting",
    title: "One-click crosslisting",
    description: "Publish to every connected marketplace at once",
    icon: "share",
  },
  {
    id: "auto-delist",
    title: "Auto delisting",
    description: "Remove sold items everywhere instantly",
    icon: "trash",
  },
  {
    id: "offers",
    title: "Offer automation",
    description: "Smart counter-offers and floor prices",
    icon: "handshake",
  },
  {
    id: "inventory",
    title: "Inventory management",
    description: "Unified stock across all channels",
    icon: "package",
  },
  {
    id: "analytics",
    title: "Analytics",
    description: "Sell-through, fees, and channel ROI",
    icon: "chart",
  },
  {
    id: "sync",
    title: "Marketplace syncing",
    description: "Keep listings and status in lockstep",
    icon: "refresh",
  },
] as const
