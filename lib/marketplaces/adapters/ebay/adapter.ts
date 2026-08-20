import type { Listing } from "@/lib/types"
import type { StoredMarketplaceConnection } from "@/lib/marketplaces/connections/crypto"
import {
  attachEbayImageUrls,
  createOrReplaceEbayInventoryItem,
  ebayFetch,
  mapListingToEbayInventory,
  mapListingToEbayOffer,
} from "@/lib/marketplaces/adapters/ebay/client"
import {
  applyRequiredEbayAspects,
  fetchEbayItemAspectsForCategory,
  finalizeEbayColorAspect,
  missingAspectsError,
  relocateEbayColorAccentDetails,
} from "@/lib/marketplaces/adapters/ebay/aspects"
import { ebayShippingPackageBlockMessage } from "@/lib/listings/publish"
import {
  shippingPackageIsComplete,
  toEbayPackageWeightAndSize,
} from "@/lib/listings/shipping-package"
import { ensureEbayMerchantLocationKey } from "@/lib/marketplaces/adapters/ebay/location"
import { resolveEbayImageUrls } from "@/lib/marketplaces/adapters/ebay/media"
import { isEbayConfigured, refreshEbayToken, ebayEnv } from "@/lib/marketplaces/adapters/ebay/oauth"
import {
  ensureEbayBusinessPolicyIds,
  parseEbayPolicyCache,
  serializeEbayPolicyCache,
} from "@/lib/marketplaces/adapters/ebay/policies"
import { applyEbayPromotedListing } from "@/lib/marketplaces/adapters/ebay/promoted-listings"
import {
  conditionIdAllowedForCategory,
  conditionEnumForId,
  inventoryConditionAllowedForCategory,
  mapAiConditionToPolicy,
} from "@/lib/marketplaces/adapters/ebay/condition-map"
import { ebayMarketplaceId } from "@/lib/marketplaces/adapters/ebay/ebay-cache"
import { getItemConditionPoliciesForCategory } from "@/lib/marketplaces/adapters/ebay/metadata-conditions"
import {
  buildCategorySuggestionQuery,
  getEbayCategoryNode,
  getEbayCategorySuggestions,
} from "@/lib/marketplaces/adapters/ebay/taxonomy"
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
    "EBAY_REDIRECT_URI",
    "EBAY_ENVIRONMENT",
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

    let auth = await withFreshToken(connection)

    // 1) Seller-owned Business Policies — match explicit shipping mode
    // (default: buyer pays calculated). Never silently use free shipping.
    const shippingMode =
      listing.specifics.shippingMode === "flat" ||
      listing.specifics.shippingMode === "free" ||
      listing.specifics.shippingMode === "calculated"
        ? listing.specifics.shippingMode
        : "calculated"
    console.info("[ebay/shipping] listing snapshot for fulfillment policy", {
      shippingMode,
      handlingTimeDays: listing.specifics.handlingTimeDays ?? 1,
      shippingService:
        listing.specifics.shippingService ||
        listing.specifics.extras?.shippingService ||
        "USPSGroundAdvantage",
      flatShippingAmount: listing.specifics.flatShippingAmount ?? null,
      freeShippingConfirmed: Boolean(listing.specifics.freeShippingConfirmed),
      packageComplete: shippingPackageIsComplete(
        listing.specifics.shippingPackage
      ),
    })
    const policies = await ensureEbayBusinessPolicyIds(auth.accessToken, {
      shippingMode,
      freeShippingConfirmed: Boolean(listing.specifics.freeShippingConfirmed),
      flatShippingAmount: listing.specifics.flatShippingAmount,
      handlingTimeDays: listing.specifics.handlingTimeDays,
      shippingServiceCode:
        listing.specifics.shippingService ||
        listing.specifics.extras?.shippingService ||
        "USPSGroundAdvantage",
      returnsAccepted: listing.specifics.returnsAccepted !== false,
      returnWindowDays: listing.specifics.returnWindowDays === 60 ? 60 : 30,
      returnShippingPaidBy:
        listing.specifics.returnShippingPaidBy === "SELLER" ? "SELLER" : "BUYER",
      requireImmediatePayment: Boolean(listing.specifics.requireImmediatePayment),
      policyCache: parseEbayPolicyCache(auth.meta?.ebayPolicyCache),
    })
    const nextPolicyCache = serializeEbayPolicyCache(policies.policyCache)
    if (auth.meta?.ebayPolicyCache !== nextPolicyCache) {
      auth = {
        ...auth,
        meta: { ...auth.meta, ebayPolicyCache: nextPolicyCache },
        updatedAt: new Date().toISOString(),
      }
      await saveConnection(auth)
    }
    console.info("[ebay/shipping] publish using fulfillment policy", {
      shippingMode,
      freeShippingConfirmed: Boolean(listing.specifics.freeShippingConfirmed),
      handlingTimeDays: listing.specifics.handlingTimeDays ?? 1,
      shippingService:
        listing.specifics.shippingService || "USPSGroundAdvantage",
      policy: policies.fulfillmentSummary,
    })

    // 2) ENABLED inventory location with postalCode + country; persist verified key.
    const { merchantLocationKey, connection: withLocation } =
      await ensureEbayMerchantLocationKey(auth.accessToken, auth, {
        postalCode: listing.specifics.extras?.itemLocationZip,
      })

    const sourceUrls = [...listing.images]
      .sort((a, b) => {
        if (a.isPrimary && !b.isPrimary) return -1
        if (!a.isPrimary && b.isPrimary) return 1
        return (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
      })
      .map((img) => img.url)
      .filter(Boolean)
    if (sourceUrls.length === 0) {
      throw new MarketplaceError(
        "At least one listing photo is required to publish on eBay.",
        "ebay_images_required",
        400
      )
    }
    const cover = listing.images.find((i) => i.isPrimary) || listing.images[0]
    console.info("[ebay/images] ListWise gallery order before resolve", {
      count: sourceUrls.length,
      coverUrlPreview: cover?.url?.slice(0, 96) || null,
      index0IsCover: sourceUrls[0] === cover?.url,
      order: sourceUrls.map((url, index) => ({
        index,
        preview: url.slice(0, 64),
      })),
    })
    const imageUrls = await resolveEbayImageUrls(withLocation.accessToken, sourceUrls)
    if (imageUrls[0] && sourceUrls[0]) {
      console.info("[ebay/images] verified cover is eBay image 1", {
        listwiseCoverMatchesPayload0: true,
        payloadCount: imageUrls.length,
        listwiseCount: sourceUrls.length,
      })
    }
    const { sku, inventoryItem } = mapListingToEbayInventory(listing)
    attachEbayImageUrls(inventoryItem, imageUrls)

    // Guard: payload must contain every URL exactly once, index 0 present.
    const payloadImages = inventoryItem.product.imageUrls
    if (!payloadImages[0]) {
      throw new MarketplaceError(
        "The first listing photo is missing from the eBay publish payload.",
        "ebay_image_first_missing",
        400
      )
    }
    if (payloadImages.length !== imageUrls.length) {
      throw new MarketplaceError(
        "eBay image payload length mismatch after attach — publish aborted.",
        "ebay_image_payload_mismatch",
        500
      )
    }
    if (new Set(payloadImages).size !== payloadImages.length) {
      throw new MarketplaceError(
        "eBay image payload contained duplicate URLs — publish aborted.",
        "ebay_image_payload_duplicate",
        500
      )
    }
    console.info("[ebay/images] TEMP createOrReplaceInventoryItem product.imageUrls", {
      sku,
      count: payloadImages.length,
      uniqueCount: new Set(payloadImages).size,
      index0EqualsResolved0: payloadImages[0] === imageUrls[0],
      index1EqualsResolved1:
        payloadImages.length > 1 ? payloadImages[1] === imageUrls[1] : null,
      // Redacted path only — no tokens.
      urls: payloadImages.map((url, index) => {
        try {
          const u = new URL(url)
          return { index, origin: u.origin, path: u.pathname.slice(0, 96) }
        } catch {
          return { index, origin: "invalid", path: "" }
        }
      }),
    })

    // 3) Leaf category — prefer saved Taxonomy selection; never invent parent IDs.
    const marketplaceId = ebayMarketplaceId()
    let categoryId = listing.specifics.ebayCategory?.categoryId?.trim() || ""
    let categoryName =
      listing.specifics.ebayCategory?.categoryName?.trim() || ""
    let categoryPath =
      listing.specifics.ebayCategory?.categoryPath?.trim() ||
      listing.specifics.category?.trim() ||
      ""
    let categoryTreeId =
      listing.specifics.ebayCategory?.categoryTreeId?.trim() || ""

    if (!categoryId || listing.specifics.ebayCategory?.leafCategory === false) {
      const query = buildCategorySuggestionQuery({
        title: listing.title,
        itemType:
          listing.fieldConfidence?.itemType?.value ||
          listing.specifics.extras?.Type,
        department: listing.specifics.gender,
        brand: listing.specifics.brand,
        keywords: listing.keywords,
        categoryHint: listing.specifics.category,
      })
      const suggested = await getEbayCategorySuggestions(
        withLocation.accessToken,
        query || listing.title,
        { marketplaceId, limit: 1 }
      )
      const first = suggested.suggestions[0]
      if (!first?.categoryId) {
        throw new MarketplaceError(
          "Select a leaf eBay category before publishing.",
          "ebay_category_undetermined",
          400
        )
      }
      categoryId = first.categoryId
      categoryName = first.categoryName
      categoryPath = first.categoryPath
      categoryTreeId = suggested.categoryTreeId
    }

    const categoryNode = await getEbayCategoryNode(
      withLocation.accessToken,
      categoryId,
      { categoryTreeId: categoryTreeId || undefined, marketplaceId }
    )
    if (categoryNode && !categoryNode.leafCategory) {
      throw new MarketplaceError(
        "Only leaf (bottom-level) eBay categories can be published. Pick a more specific category.",
        "ebay_category_not_leaf",
        400
      )
    }
    if (categoryNode?.categoryName) categoryName = categoryNode.categoryName

    // 3b) Condition policies for THIS category only — never reuse another category's ID.
    const conditionPolicy = await getItemConditionPoliciesForCategory(
      withLocation.accessToken,
      categoryId,
      marketplaceId
    )
    const validConditionIds = conditionPolicy.conditions.map((c) => c.conditionId)

    let selectedConditionId =
      listing.specifics.ebayCondition?.conditionId?.trim() ||
      listing.specifics.extras?.ebayConditionId?.trim() ||
      ""
    let selectedConditionName =
      listing.specifics.ebayCondition?.conditionName?.trim() ||
      listing.specifics.extras?.ebayConditionDisplay?.trim() ||
      ""
    let selectedConditionEnum =
      listing.specifics.ebayCondition?.conditionEnum?.trim() ||
      listing.specifics.extras?.ebayConditionEnum?.trim() ||
      ""

    if (
      !selectedConditionId ||
      !conditionIdAllowedForCategory(selectedConditionId, conditionPolicy.conditions)
    ) {
      const mapped = mapAiConditionToPolicy(
        listing.specifics.condition ||
          listing.fieldConfidence?.condition?.value ||
          "Pre-owned",
        conditionPolicy.conditions
      )
      if (!mapped) {
        throw new MarketplaceError(
          `No valid eBay condition for category ${categoryId}.`,
          "ebay_condition_unmapped",
          400
        )
      }
      selectedConditionId = mapped.conditionId
      selectedConditionName = mapped.conditionName
      selectedConditionEnum = mapped.conditionEnum
    } else if (!selectedConditionEnum) {
      selectedConditionEnum =
        conditionEnumForId(selectedConditionId) || inventoryItem.condition
    }

    if (
      !conditionIdAllowedForCategory(selectedConditionId, conditionPolicy.conditions)
    ) {
      throw new MarketplaceError(
        `Condition ID ${selectedConditionId} is not valid for category ${categoryId}. Valid IDs: ${validConditionIds.join(", ")}.`,
        "ebay_condition_invalid_for_category",
        400
      )
    }

    inventoryItem.condition = selectedConditionEnum

    if (
      !inventoryConditionAllowedForCategory(
        inventoryItem.condition,
        conditionPolicy.conditions
      )
    ) {
      // Fall back to the enum for the validated conditionId.
      const fromId = conditionEnumForId(selectedConditionId)
      if (!fromId) {
        throw new MarketplaceError(
          `Condition ${selectedConditionName} (${selectedConditionId}) cannot be mapped to an Inventory API enum for category ${categoryId}.`,
          "ebay_condition_enum_missing",
          400
        )
      }
      inventoryItem.condition = fromId
    }

    console.info("[ebay/publish] category + condition before inventory write", {
      marketplaceId,
      categoryTreeId: categoryTreeId || null,
      categoryId,
      categoryName,
      categoryPath,
      selectedConditionName,
      selectedConditionId,
      selectedConditionEnum: inventoryItem.condition,
      validConditionIds,
      itemConditionRequired: conditionPolicy.itemConditionRequired,
    })

    // 4) Required item aspects for this leaf category — before inventory write
    const taxonomyAspects = await fetchEbayItemAspectsForCategory(
      withLocation.accessToken,
      categoryId
    )
    const { aspects, missingRequired, resolvedFields } = applyRequiredEbayAspects(
      listing,
      taxonomyAspects,
      inventoryItem.product.aspects
    )
    if (missingRequired.length > 0) {
      throw missingAspectsError(missingRequired, resolvedFields)
    }
    // Force gray-family → exact eBay Color "Gray" on the inventory aspect only.
    // AI-detected color / title wording are left unchanged on the listing record.
    const finalized = finalizeEbayColorAspect(listing, taxonomyAspects, aspects)
    const withAccents = relocateEbayColorAccentDetails(
      listing,
      finalized.aspects,
      inventoryItem.product.description
    )
    inventoryItem.product.aspects = withAccents.aspects
    inventoryItem.product.description = withAccents.description
    console.info("[ebay/color] TEMP inventory payload Color", {
      sku,
      color: inventoryItem.product.aspects.Color || null,
      accents: inventoryItem.product.aspects.Accents || null,
      titleUnchanged: inventoryItem.product.title.slice(0, 80),
    })

    // Package weight/dims required for publishOffer (eBay error 25020).
    // Never invent — seller must enter values or pick a saved preset.
    const packageBlock = ebayShippingPackageBlockMessage(listing)
    if (packageBlock || !shippingPackageIsComplete(listing.specifics.shippingPackage)) {
      throw new MarketplaceError(
        packageBlock ||
          "Enter shipping package details before publishing to eBay.",
        "ebay_shipping_package_required",
        400
      )
    }
    inventoryItem.packageWeightAndSize = toEbayPackageWeightAndSize(
      listing.specifics.shippingPackage!
    )
    console.info("[ebay/inventory] packageWeightAndSize", {
      sku,
      packageWeightAndSize: inventoryItem.packageWeightAndSize,
    })

    // 5) Create/replace inventory item (sanitize + log + one 25001 retry)
    const replaced = await createOrReplaceEbayInventoryItem({
      accessToken: withLocation.accessToken,
      sku,
      inventoryItem,
    })
    const publishSku = replaced.sku

    const offer = mapListingToEbayOffer(
      {
        ...listing,
        description: withAccents.description,
      },
      publishSku,
      merchantLocationKey,
      policies,
      categoryId
    )
    console.info("[ebay/location] TEMP offer request location key", {
      step: "createOffer",
      merchantLocationKey,
      sku: publishSku,
      categoryId,
      fulfillmentPolicyId: policies.fulfillmentPolicyId,
      paymentPolicyId: policies.paymentPolicyId,
      returnPolicyId: policies.returnPolicyId,
      sameKeyAsSaved: merchantLocationKey === withLocation.meta?.merchantLocationKey,
    })

    // 6) Create (or update existing) offer with the verified location key
    console.info("[ebay/publish] pre-publishOffer validation", {
      marketplaceId,
      categoryTreeId: categoryTreeId || null,
      categoryId,
      categoryPath,
      selectedConditionName,
      selectedConditionId,
      selectedConditionEnum: inventoryItem.condition,
      validConditionIds,
      sku: publishSku,
      offerCategoryId: offer.categoryId,
    })

    if (
      !conditionIdAllowedForCategory(selectedConditionId, conditionPolicy.conditions)
    ) {
      throw new MarketplaceError(
        `Refusing publishOffer: condition ID ${selectedConditionId} is not in the condition policy for category ${categoryId}.`,
        "ebay_condition_invalid_for_category",
        400
      )
    }

    const offerId = await resolveOfferId(withLocation.accessToken, publishSku, offer)

    // 7) Publish offer
    const published = (await ebayFetch(
      `/sell/inventory/v1/offer/${offerId}/publish`,
      withLocation.accessToken,
      { method: "POST", body: "{}", step: "publishOffer" }
    )) as { listingId?: string }

    const listingId = published.listingId
    // Item browse URL follows API/auth env (EBAY_ENVIRONMENT), not marketplaceId or browser host.
    const site =
      ebayEnv() === "sandbox"
        ? "https://sandbox.ebay.com"
        : "https://www.ebay.com"
    const itemUrl = listingId ? `${site}/itm/${listingId}` : undefined

    const promoMode =
      listing.specifics.promotedListings === "dynamic" ||
      listing.specifics.promotedListings === "custom"
        ? listing.specifics.promotedListings
        : "off"

    // Promoted Listings is optional and separate from inventory publish.
    // Never call Marketing API when Off, and never let promotion failure
    // undo a successful listing.
    let promotion: {
      status: "off" | "applied" | "skipped" | "failed"
      mode?: "dynamic" | "custom"
      percent?: number | null
      message: string
    } = {
      status: "off",
      message: "Promoted listings off.",
    }

    if (promoMode !== "off") {
      try {
        promotion = await applyEbayPromotedListing(
          withLocation.accessToken,
          listingId,
          {
            mode: promoMode,
            percent: listing.specifics.promotedListingsPercent,
          }
        )
      } catch (promoErr) {
        const raw =
          promoErr instanceof Error ? promoErr.message : "Promotion failed"
        const needsReconnect =
          /scope|invalid_scope|insufficient|unauthorized|401|403|marketing/i.test(
            raw
          )
        promotion = {
          status: "failed",
          mode: promoMode,
          percent:
            promoMode === "custom"
              ? listing.specifics.promotedListingsPercent ?? null
              : null,
          message: needsReconnect
            ? "Listing published, but promotion requires reconnecting eBay."
            : `Listing published, but promotion failed: ${raw}`,
        }
      }
      if (
        promotion.status === "failed" &&
        /scope|invalid_scope|insufficient|unauthorized|reconnect/i.test(
          promotion.message
        ) &&
        !/Listing published/.test(promotion.message)
      ) {
        promotion = {
          ...promotion,
          message:
            "Listing published, but promotion requires reconnecting eBay.",
        }
      }
    }

    return {
      ok: true,
      externalUrl: itemUrl,
      promotion: {
        status: promotion.status,
        mode: promotion.mode,
        percent: promotion.percent,
        message: promotion.message,
      },
      listingRef: {
        marketplaceId: "ebay",
        externalId: listingId || offerId,
        url: itemUrl,
        status: "listed",
        price: listing.price,
        lastSyncedAt: new Date().toISOString(),
      },
    }
  },
}
