import assert from "node:assert/strict"
import { describe, it, beforeEach, afterEach } from "node:test"
import {
  decryptPayloadWithFallback,
  encryptPayload,
  isConnectionsCryptoConfigured,
  resolveConnectionsSecretCandidates,
  serializeConnection,
  deserializeConnection,
  type StoredMarketplaceConnection,
} from "@/lib/marketplaces/connections/crypto"
import { buildCategorySuggestionQuery } from "@/lib/marketplaces/adapters/ebay/taxonomy"
import { mapListingToEbayOffer } from "@/lib/marketplaces/adapters/ebay/client"
import { applyEbayCategorySelection } from "@/lib/listings/ebay-category"
import type { Listing } from "@/lib/types"

describe("connections crypto recovery", () => {
  const keys = [
    "CONNECTIONS_SECRET",
    "SUPABASE_SERVICE_ROLE_KEY",
    "EBAY_CLIENT_SECRET",
  ] as const
  const saved: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const key of keys) {
      saved[key] = process.env[key]
      delete process.env[key]
    }
  })

  afterEach(() => {
    for (const key of keys) {
      const value = saved[key]
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  it("auto-derives a secret from SUPABASE_SERVICE_ROLE_KEY when CONNECTIONS_SECRET is unset", () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY =
      "service-role-key-for-tests-min-16-chars"
    assert.equal(isConnectionsCryptoConfigured(), true)
    const candidates = resolveConnectionsSecretCandidates()
    assert.ok(candidates.length >= 1)
    assert.equal(candidates.includes("service-role-key-for-tests-min-16-chars"), false)
  })

  it("decrypts payloads encrypted with the explicit CONNECTIONS_SECRET", () => {
    process.env.CONNECTIONS_SECRET = "explicit-connections-secret-32b"
    process.env.SUPABASE_SERVICE_ROLE_KEY =
      "service-role-key-for-tests-min-16-chars"
    const connection: StoredMarketplaceConnection = {
      marketplaceId: "ebay",
      authMethod: "oauth",
      accessToken: "access-token-value",
      refreshToken: "refresh-token-value",
      accountLabel: "seller123",
      connectedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }
    const payload = serializeConnection(connection)
    const roundTrip = deserializeConnection(payload)
    assert.equal(roundTrip.accessToken, "access-token-value")
    assert.equal(roundTrip.marketplaceId, "ebay")
  })

  it("still decrypts when CONNECTIONS_SECRET is removed but service-role derivation matches encryption", () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY =
      "service-role-key-for-tests-min-16-chars"
    const plaintext = JSON.stringify({ hello: "world" })
    const encrypted = encryptPayload(plaintext)
    delete process.env.CONNECTIONS_SECRET
    const decrypted = decryptPayloadWithFallback(encrypted)
    assert.equal(decrypted, plaintext)
  })
})

describe("ebay publish recovery regression", () => {
  it("builds a taxonomy query from apparel fields without forcing a manual browser", () => {
    const q = buildCategorySuggestionQuery({
      title: "Nike Women's Track Pants Gray M",
      itemType: "Track Pants",
      department: "Women",
      brand: "Nike",
      categoryHint: "Women > Clothing > Pants",
    })
    assert.ok(q)
    assert.match(q, /Nike/i)
    assert.match(q, /Women|Track|Pants/i)
  })

  it("maps a leaf category + calculated shipping offer body for publishOffer", () => {
    let listing = {
      id: "listing-1",
      userId: "user-1",
      title: "Nike Women's Track Pants Gray M",
      description: "Pre-owned Nike track pants.",
      price: 24.99,
      currency: "USD",
      status: "ready",
      keywords: ["Nike", "Women", "Track Pants"],
      images: [],
      targetMarketplaces: ["ebay"],
      fieldConfidence: {},
      specifics: {
        brand: "Nike",
        size: "M",
        color: "Gray",
        gender: "Women",
        condition: "Pre-owned",
        category: "Women > Clothing > Pants",
        shippingMode: "calculated",
        allowOffers: false,
        shippingPackage: {
          weightPounds: 1,
          weightOunces: 0,
          lengthInches: 12,
          widthInches: 10,
          heightInches: 3,
          packageType: "MAILING_BOX",
        },
        extras: {
          Brand: "Nike",
          Department: "Women",
          Size: "M",
          Color: "Gray",
          Type: "Track Pants",
        },
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    } as unknown as Listing

    listing = applyEbayCategorySelection(
      listing,
      {
        marketplaceId: "EBAY_US",
        categoryTreeId: "0",
        categoryId: "63863",
        categoryName: "Pants",
        categoryPath:
          "Clothing, Shoes & Accessories > Women > Women's Clothing > Pants",
        leafCategory: true,
      },
      {
        conditionId: "3000",
        conditionName: "Pre-owned - Good",
        conditionEnum: "USED_GOOD",
      }
    )

    assert.equal(listing.specifics.ebayCategory?.categoryId, "63863")
    assert.equal(listing.specifics.ebayCategory?.leafCategory, true)
    assert.equal(listing.specifics.ebayCondition?.conditionId, "3000")
    assert.equal(listing.specifics.allowOffers, false)
    assert.equal(listing.specifics.shippingMode, "calculated")

    const offer = mapListingToEbayOffer(
      listing,
      "LW-TEST-SKU-1",
      "default_location",
      {
        fulfillmentPolicyId: "fulfillment-1",
        paymentPolicyId: "payment-1",
        returnPolicyId: "return-1",
      },
      "63863"
    )

    assert.equal(offer.categoryId, "63863")
    assert.equal(offer.listingPolicies.fulfillmentPolicyId, "fulfillment-1")
    assert.equal(
      (offer.listingPolicies.bestOfferTerms as { bestOfferEnabled?: boolean })
        ?.bestOfferEnabled,
      false
    )
    assert.equal(offer.pricingSummary.price.value, "24.99")
    assert.equal(offer.merchantLocationKey, "default_location")
  })
})
