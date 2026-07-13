import { registerMarketplace, listMarketplaces } from "@/lib/marketplaces/types"
import { ebayAdapterStub } from "@/lib/marketplaces/ebay"

let initialized = false

/** Idempotent registry bootstrap — call from server routes when needed. */
export function ensureMarketplaceRegistry() {
  if (initialized) return listMarketplaces()
  registerMarketplace(ebayAdapterStub)
  initialized = true
  return listMarketplaces()
}

export { listMarketplaces, getMarketplace } from "@/lib/marketplaces/types"
