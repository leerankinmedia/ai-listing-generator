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
import { ensureEbayBusinessPolicyIds } from "@/lib/marketplaces/adapters/ebay/policies"
import { resolveEbayLeafCategoryId } from "@/lib/marketplaces/adapters/ebay/taxonomy"
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

async function resolveOfferId(
  accessToken: string,
  sku: string,
  offerBody: ReturnType<typeof mapListingToEbayOffer>
) {
  try {
    const created = (await ebayFetch(`/sell/inventory/v1/offer`, accessToken, {
      method: "POST",
      step: "createOffer",
      body: JSON.stringify(offerBody),
    })) as { offerId?: string }

    if (!created.offerId) {
      throw new MarketplaceError(
        "[createOffer] eBay did not return an offerId.",
        "ebay_offer_missing",
        502
      )
    }
    return created.offerId
  } catch (err) {
    // Offer may already exist for this SKU — reuse it.
    if (!(err instanceof MarketplaceError)) throw err
    const msg = err.message.toLowerCase()
    const maybeExists =
      err.status === 400 ||
      err.status === 409 ||
      msg.includes("already exists") ||
      msg.includes("offer exists") ||
      msg.includes("25002") ||
      msg.includes("25707") ||
      msg.includes("25709")

    if (!maybeExists) throw err

    const existing = (await ebayFetch(
      `/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}`,
      accessToken,
      { method: "GET", step: "getOffersBySku" }
    )) as { offers?: Array<{ offerId?: string }> } | null

    const offerId = existing?.offers?.[0]?.offerId
    if (!offerId) throw err

    console.info("[ebay/inventory] TEMP reusing existing offer", {
      step: "createOffer",
      sku,
      offerId,
      merchantLocationKey: offerBody.merchantLocationKey,
    })

    await ebayFetch(`/sell/inventory/v1/offer/${encodeURIComponent(offerId)}`, accessToken, {
      method: "PUT",
      step: "updateOffer",
      body: JSON.stringify(offerBody),
    })
    return offerId
  }
}

export const ebayAdapter: MarketplaceAdapter = {
  id: "ebay",
  displayName: "eBay",
  isAppConfigured: isEbayConfigured,
  setupRequirements: () => [
    "EBAY_CLIENT_ID",
    "EBAY_CLIENT_SECRET",
    "EBAY_RU_NAME",
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

    // 1) Seller-owned Business Policies (env IDs only if owned by this seller).
    const policies = await ensureEbayBusinessPolicyIds(auth.accessToken)

    // 2) ENABLED inventory location with postalCode + country; persist verified key.
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

    // 3) Create/replace inventory item
    await ebayFetch(
      `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`,
      withLocation.accessToken,
      {
        method: "PUT",
        step: "createOrReplaceInventoryItem",
        body: JSON.stringify(inventoryItem),
      }
    )

    // 4) Leaf category from Taxonomy suggestions (never a hardcoded parent ID)
    const { categoryId } = await resolveEbayLeafCategoryId(
      withLocation.accessToken,
      listing.title
    )

    const offer = mapListingToEbayOffer(
      listing,
      sku,
      merchantLocationKey,
      policies,
      categoryId
    )
    console.info("[ebay/location] TEMP offer request location key", {
      step: "createOffer",
      merchantLocationKey,
      sku,
      categoryId,
      fulfillmentPolicyId: policies.fulfillmentPolicyId,
      paymentPolicyId: policies.paymentPolicyId,
      returnPolicyId: policies.returnPolicyId,
      sameKeyAsSaved: merchantLocationKey === withLocation.meta?.merchantLocationKey,
    })

    // 5) Create (or update existing) offer with the verified location key
    const offerId = await resolveOfferId(withLocation.accessToken, sku, offer)

    // 6) Publish offer
    const published = (await ebayFetch(
      `/sell/inventory/v1/offer/${offerId}/publish`,
      withLocation.accessToken,
      { method: "POST", body: "{}", step: "publishOffer" }
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
        externalId: listingId || offerId,
        url: listingId ? `${site}/itm/${listingId}` : undefined,
        status: "listed",
        price: listing.price,
        lastSyncedAt: new Date().toISOString(),
      },
    }
  },
}
