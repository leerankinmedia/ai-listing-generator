import type {
  Listing,
  MarketplaceId,
  OneClickPublishResult,
} from "@/lib/types"
import { getAdapter } from "@/lib/marketplaces/adapters/registry"
import { MarketplaceError } from "@/lib/marketplaces/adapters/types"
import { getConnection, isPhase5Marketplace } from "@/lib/marketplaces/connections/store"
import { listingCanPublishTo } from "@/lib/listings/publish"
import { getMarketplace } from "@/lib/marketplaces"

/**
 * Production publish orchestration.
 * Only calls real adapters. Never reports success without an API response.
 */
export async function publishListingOneClick(
  listing: Listing,
  marketplaceIds: MarketplaceId[]
): Promise<OneClickPublishResult[]> {
  const gate = listingCanPublishTo(listing, marketplaceIds)
  if (!gate.ok) {
    return marketplaceIds.map((marketplaceId) => ({
      marketplaceId,
      ok: false,
      status: "error" as const,
      message:
        gate.message ||
        "Listing needs title, description, price, and at least one photo.",
    }))
  }

  const results: OneClickPublishResult[] = []

  for (const marketplaceId of marketplaceIds) {
    const def = getMarketplace(marketplaceId)
    try {
      if (!isPhase5Marketplace(marketplaceId)) {
        results.push({
          marketplaceId,
          ok: false,
          status: "error",
          message: `${def?.name ?? marketplaceId} is not available yet.`,
        })
        continue
      }

      const connection = await getConnection(marketplaceId)
      if (!connection) {
        results.push({
          marketplaceId,
          ok: false,
          status: "error",
          message: `Connect ${def?.name ?? marketplaceId} on the Marketplace Connections page first.`,
        })
        continue
      }

      const adapter = getAdapter(marketplaceId)
      if (!adapter.isAppConfigured()) {
        results.push({
          marketplaceId,
          ok: false,
          status: "error",
          message: `${adapter.displayName} app credentials are not configured on the server.`,
        })
        continue
      }

      const published = await adapter.publish(listing, connection)
      if (!published.ok || !published.listingRef) {
        results.push({
          marketplaceId,
          ok: false,
          status: "error",
          message: published.error || "Publish failed without a listing reference.",
        })
        continue
      }

      const queued = published.listingRef.status === "ready"
      const promo = published.promotion
      let message = published.externalUrl
        ? `Published: ${published.externalUrl}`
        : queued
          ? `Accepted by ${adapter.displayName} (async). Poll item status or webhooks for completion.`
          : `Published to ${adapter.displayName}.`
      if (promo && promo.status !== "off") {
        message = `${message} ${promo.message}`
      }

      results.push({
        marketplaceId,
        ok: true,
        status: queued ? "queued" : "published",
        message,
        listingRef: published.listingRef,
        promotion: promo,
      })    } catch (error) {
      const message =
        error instanceof MarketplaceError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Publish failed."
      results.push({
        marketplaceId,
        ok: false,
        status: "error",
        message,
        requiredFields:
          error instanceof MarketplaceError
            ? error.details?.requiredFields
            : undefined,
        resolvedFields:
          error instanceof MarketplaceError
            ? error.details?.resolvedFields
            : undefined,
      })
    }
  }

  return results
}
