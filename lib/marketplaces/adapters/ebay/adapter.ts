import type { Listing } from "@/lib/types"
import type { StoredMarketplaceConnection } from "@/lib/marketplaces/connections/crypto"
import {
  attachEbayImageUrls,
  ebayFetch,
  mapListingToEbayInventory,
  mapListingToEbayOffer,
} from "@/lib/marketplaces/adapters/ebay/client"
import { ensureEbayMerchantLocationKey } from "@/lib/marketplaces/adapters/ebay/location"
import { resolveEbayImageUrls } from "@/lib/marketplaces/adapters/ebay/media"
import { isEbayConfigured, refreshEbayToken } from "@/lib/marketplaces/adapters/ebay/oauth"
import type { MarketplaceAdapter, PublishResult } from "@/lib/marketplaces/adapters/types"
import { MarketplaceError } from "@/lib/marketplaces/adapters/types"
import { saveConnection } from "@/lib/marketplaces/connections/store"

async function withFreshToken(connection: StoredMarketplaceConnection) {
  if (!connection.expiresAt) return connection
  const expires = Date.parse(connection.expiresAt)
  if (Number.isFinite(expires) && expires - Date.now() > 60_000) {
    return connection
  }
  if (!connection.refreshToken) {
    throw new MarketplaceError(
      "eBay access token expired. Reconnect your eBay account.",
      "ebay_reauth_required",
      401
    )
  }
  const refreshed = await refreshEbayToken(connection.refreshToken)
  const next: StoredMarketplaceConnection = {
    ...connection,
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken,
    expiresAt: new Date(Date.now() + refreshed.expiresIn * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  }
  await saveConnection(next)
  return next
}

export const ebayAdapter: MarketplaceAdapter = {
  id: "ebay",
  displayName: "eBay",
  isAppConfigured: isEbayConfigured,
  setupRequirements: () => [
    "EBAY_CLIENT_ID",
    "EBAY_CLIENT_SECRET",
    "EBAY_RU_NAME",
    "EBAY_FULFILLMENT_POLICY_ID",
    "EBAY_PAYMENT_POLICY_ID",
    "EBAY_RETURN_POLICY_ID",
    "CONNECTIONS_SECRET",
  ],
  async publish(listing: Listing, connection: StoredMarketplaceConnection): Promise<PublishResult> {
    if (!isEbayConfigured()) {
      throw new MarketplaceError(
        "eBay app credentials are not configured.",
        "ebay_not_configured",
        503
      )
    }

    const auth = await withFreshToken(connection)
    const { merchantLocationKey, connection: withLocation } =
      await ensureEbayMerchantLocationKey(auth.accessToken, auth)
    const sourceUrls = listing.images.map((img) => img.url).filter(Boolean)
    if (sourceUrls.length === 0) {
      throw new MarketplaceError(
        "At least one listing photo is required to publish on eBay.",
        "ebay_images_required",
        400
      )
    }
    const imageUrls = await resolveEbayImageUrls(withLocation.accessToken, sourceUrls)
    const { sku, inventoryItem } = mapListingToEbayInventory(listing)
    attachEbayImageUrls(inventoryItem, imageUrls)

    await ebayFetch(
      `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`,
      withLocation.accessToken,
      {
        method: "PUT",
        body: JSON.stringify(inventoryItem),
      }
    )

    const offer = mapListingToEbayOffer(listing, sku, merchantLocationKey)
    const created = (await ebayFetch(`/sell/inventory/v1/offer`, withLocation.accessToken, {
      method: "POST",
      body: JSON.stringify(offer),
    })) as { offerId?: string }

    if (!created.offerId) {
      throw new MarketplaceError("eBay did not return an offerId.", "ebay_offer_missing", 502)
    }

    const published = (await ebayFetch(
      `/sell/inventory/v1/offer/${created.offerId}/publish`,
      withLocation.accessToken,
      { method: "POST", body: "{}" }
    )) as { listingId?: string }

    const listingId = published.listingId
    const marketplaceId = process.env.EBAY_MARKETPLACE_ID || "EBAY_US"
    const site =
      marketplaceId === "EBAY_US" ? "https://www.ebay.com" : "https://www.ebay.com"

    return {
      ok: true,
      externalUrl: listingId ? `${site}/itm/${listingId}` : undefined,
      listingRef: {
        marketplaceId: "ebay",
        externalId: listingId || created.offerId,
        url: listingId ? `${site}/itm/${listingId}` : undefined,
        status: "listed",
        price: listing.price,
        lastSyncedAt: new Date().toISOString(),
      },
    }
  },
}
