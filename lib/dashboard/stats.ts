import { MARKETPLACES } from "@/lib/marketplaces"
import type { Listing, MarketplaceId } from "@/lib/types"

export const DASHBOARD_MARKETPLACE_TOTAL = MARKETPLACES.length

/** Saved listings with status exactly `listed` (drafts/ready never count). */
export function countActiveListings(listings: Listing[]): number {
  return listings.filter((listing) => listing.status === "listed").length
}

/** Count of authenticated marketplace connections that are currently connected. */
export function countConnectedShops(
  connectedMarketplaceIds: Iterable<MarketplaceId | string>
): number {
  const set = new Set(
    [...connectedMarketplaceIds]
      .map((id) => String(id).toLowerCase())
      .filter(Boolean)
  )
  return set.size
}

export function formatConnectedShopsLabel(connectedCount: number): string {
  return `${connectedCount} / ${DASHBOARD_MARKETPLACE_TOTAL}`
}

/** Human label for account entitlement — never implies Pro unless unlocked. */
export function formatEntitlementStatusLabel(billing: {
  paidToolsUnlocked?: boolean
  statusLabel?: string
  status?: string
  adminOverride?: boolean
} | null): string {
  if (!billing) return "Loading…"
  if (billing.paidToolsUnlocked) {
    if (billing.adminOverride) return "Admin override"
    if (billing.status === "trialing") return "Trialing"
    if (billing.status === "active") return "Active"
    return billing.statusLabel || "Active"
  }
  if (billing.statusLabel) return billing.statusLabel
  if (billing.status === "expired") return "Trial expired"
  return "No subscription"
}
