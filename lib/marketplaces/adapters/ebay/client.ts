import type { Listing } from "@/lib/types"
import { ebayApiBase } from "@/lib/marketplaces/adapters/ebay/oauth"
import { MarketplaceError } from "@/lib/marketplaces/adapters/types"

function requirePolicyEnv(name: string) {
  const value = process.env[name]
  if (!value) {
    throw new MarketplaceError(
      `${name} is required to publish to eBay (Business Policies).`,
      "ebay_policy_missing",
      400
    )
  }
  return value
}

export function mapListingToEbayInventory(listing: Listing) {
  const sku =
    listing.id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 50) || `lw-${Date.now()}`

  const aspects: Record<string, string[]> = {}
  if (listing.specifics.brand) aspects.Brand = [listing.specifics.brand]
  if (listing.specifics.size) aspects.Size = [listing.specifics.size]
  if (listing.specifics.color) aspects.Color = [listing.specifics.color]
  if (listing.specifics.material) aspects.Material = [listing.specifics.material]
  if (listing.specifics.style) aspects.Style = [listing.specifics.style]
  if (listing.specifics.pattern) aspects.Pattern = [listing.specifics.pattern]
  if (listing.specifics.gender) {
    aspects.Department = [listing.specifics.gender]
  }

  return {
    sku,
    inventoryItem: {
      availability: {
        shipToLocationAvailability: {
          quantity: 1,
        },
      },
      condition: mapCondition(listing.specifics.condition),
      conditionDescription: listing.specifics.flaws || undefined,
      product: {
        title: listing.title.slice(0, 80),
        description: listing.description,
        aspects,
        // Populated by adapter after EPS / Media API upload
        imageUrls: [] as string[],
      },
    },
  }
}

export function attachEbayImageUrls(
  inventoryItem: ReturnType<typeof mapListingToEbayInventory>["inventoryItem"],
  imageUrls: string[]
) {
  if (imageUrls.length === 0) {
    throw new MarketplaceError(
      "At least one listing photo is required to publish on eBay.",
      "ebay_images_required",
      400
    )
  }
  inventoryItem.product.imageUrls = imageUrls.slice(0, 24)
  return inventoryItem
}

function mapCondition(condition?: string) {
  switch (condition) {
    case "New with tags":
      return "NEW"
    case "New without tags":
      return "NEW_OTHER"
    case "Excellent":
      return "LIKE_NEW"
    case "Good":
      return "USED_EXCELLENT"
    case "Fair":
      return "USED_GOOD"
    case "Poor":
      return "USED_ACCEPTABLE"
    default:
      return "USED_EXCELLENT"
  }
}

export function mapListingToEbayOffer(listing: Listing, sku: string) {
  const categoryId = process.env.EBAY_DEFAULT_CATEGORY_ID || "15724"
  const marketplaceId = process.env.EBAY_MARKETPLACE_ID || "EBAY_US"
  const merchantLocationKey = requirePolicyEnv("EBAY_MERCHANT_LOCATION_KEY")

  return {
    sku,
    marketplaceId,
    format: "FIXED_PRICE",
    availableQuantity: 1,
    categoryId,
    listingDescription: listing.description,
    listingPolicies: {
      fulfillmentPolicyId: requirePolicyEnv("EBAY_FULFILLMENT_POLICY_ID"),
      paymentPolicyId: requirePolicyEnv("EBAY_PAYMENT_POLICY_ID"),
      returnPolicyId: requirePolicyEnv("EBAY_RETURN_POLICY_ID"),
    },
    merchantLocationKey,
    pricingSummary: {
      price: {
        currency: listing.currency || "USD",
        value: listing.price.toFixed(2),
      },
    },
  }
}

export async function ebayFetch(
  path: string,
  accessToken: string,
  init?: RequestInit & { contentLanguage?: string }
) {
  const headers = new Headers(init?.headers)
  headers.set("Authorization", `Bearer ${accessToken}`)
  headers.set("Content-Type", "application/json")
  headers.set("Accept", "application/json")
  headers.set("Content-Language", init?.contentLanguage || "en-US")

  const response = await fetch(`${ebayApiBase()}${path}`, {
    ...init,
    headers,
  })

  const text = await response.text()
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text }
  }

  if (!response.ok) {
    const err = json as { errors?: Array<{ message?: string }>; message?: string }
    const message =
      err?.errors?.[0]?.message ||
      err?.message ||
      `eBay API error (${response.status})`
    throw new MarketplaceError(message, "ebay_api_error", response.status)
  }

  return json
}
