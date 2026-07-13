/**
 * Marketplace adapter contract — Phase 5+ implementation surface.
 * Phase 1 only defines the shared types so later modules plug in cleanly.
 */

export type MarketplaceId =
  | "ebay"
  | "poshmark"
  | "mercari"
  | "depop"
  | "grailed"
  | "vinted"
  | "whatnot"
  | "facebook"
  | "etsy"
  | "shopify"

export interface MarketplaceCapabilities {
  list: boolean
  update: boolean
  delist: boolean
  syncInventory: boolean
  offers: boolean
  webhooks: boolean
}

export interface ExternalListingRef {
  marketplace: MarketplaceId
  externalId: string
  url?: string | null
}

export interface CanonicalListing {
  title: string
  description: string
  price: number
  currency: string
  quantity: number
  condition: string
  categoryPath: string[]
  itemSpecifics: Record<string, string>
  imageUrls: string[]
  sku?: string | null
}

export interface MarketplaceAdapter {
  id: MarketplaceId
  displayName: string
  capabilities: MarketplaceCapabilities
  mapFromCanonical(item: CanonicalListing): Record<string, unknown>
  createListing?(item: CanonicalListing): Promise<ExternalListingRef>
  updateListing?(ref: ExternalListingRef, item: CanonicalListing): Promise<void>
  delist?(ref: ExternalListingRef): Promise<void>
}

/** Registry grows as adapters ship — start with capability stubs. */
export const MARKETPLACE_REGISTRY: Record<
  MarketplaceId,
  Pick<MarketplaceAdapter, "id" | "displayName" | "capabilities">
> = {
  ebay: {
    id: "ebay",
    displayName: "eBay",
    capabilities: {
      list: false,
      update: false,
      delist: false,
      syncInventory: false,
      offers: false,
      webhooks: false,
    },
  },
  poshmark: {
    id: "poshmark",
    displayName: "Poshmark",
    capabilities: {
      list: false,
      update: false,
      delist: false,
      syncInventory: false,
      offers: false,
      webhooks: false,
    },
  },
  mercari: {
    id: "mercari",
    displayName: "Mercari",
    capabilities: {
      list: false,
      update: false,
      delist: false,
      syncInventory: false,
      offers: false,
      webhooks: false,
    },
  },
  depop: {
    id: "depop",
    displayName: "Depop",
    capabilities: {
      list: false,
      update: false,
      delist: false,
      syncInventory: false,
      offers: false,
      webhooks: false,
    },
  },
  grailed: {
    id: "grailed",
    displayName: "Grailed",
    capabilities: {
      list: false,
      update: false,
      delist: false,
      syncInventory: false,
      offers: false,
      webhooks: false,
    },
  },
  vinted: {
    id: "vinted",
    displayName: "Vinted",
    capabilities: {
      list: false,
      update: false,
      delist: false,
      syncInventory: false,
      offers: false,
      webhooks: false,
    },
  },
  whatnot: {
    id: "whatnot",
    displayName: "Whatnot",
    capabilities: {
      list: false,
      update: false,
      delist: false,
      syncInventory: false,
      offers: false,
      webhooks: false,
    },
  },
  facebook: {
    id: "facebook",
    displayName: "Facebook Marketplace",
    capabilities: {
      list: false,
      update: false,
      delist: false,
      syncInventory: false,
      offers: false,
      webhooks: false,
    },
  },
  etsy: {
    id: "etsy",
    displayName: "Etsy",
    capabilities: {
      list: false,
      update: false,
      delist: false,
      syncInventory: false,
      offers: false,
      webhooks: false,
    },
  },
  shopify: {
    id: "shopify",
    displayName: "Shopify",
    capabilities: {
      list: false,
      update: false,
      delist: false,
      syncInventory: false,
      offers: false,
      webhooks: false,
    },
  },
}
