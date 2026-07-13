import type { Listing } from "@/lib/types"
import type { StoredMarketplaceConnection } from "@/lib/marketplaces/connections/crypto"
import {
  isWhatnotConfigured,
  refreshWhatnotToken,
  whatnotGraphql,
} from "@/lib/marketplaces/adapters/whatnot/oauth"
import { resolveWhatnotCategoryId } from "@/lib/marketplaces/adapters/whatnot/taxonomy"
import type { MarketplaceAdapter, PublishResult } from "@/lib/marketplaces/adapters/types"
import { MarketplaceError } from "@/lib/marketplaces/adapters/types"
import { saveConnection } from "@/lib/marketplaces/connections/store"
import { ensurePublicImageUrls } from "@/lib/marketplaces/images/ensure-public-urls"

/**
 * Official Whatnot Seller API mutations:
 * https://developers.whatnot.com/docs/mutations/productCreate
 * https://developers.whatnot.com/docs/mutations/listingPublish
 *
 * Input shapes match documented GraphQL types:
 * - CreateMediaInput: source + mediaContentType
 * - ProductInput: title, description, productCategory, variants
 * - MoneyInput: amount in minor units (Int)
 * - BuyItNowInput: price (required)
 */
const PRODUCT_CREATE = `
mutation ProductCreate($input: ProductInput!, $media: [CreateMediaInput!]!) {
  productCreate(input: $input, media: $media) {
    product {
      id
      title
      variants {
        edges {
          node {
            id
            sku
            listings {
              edges {
                node {
                  id
                }
              }
            }
          }
        }
      }
    }
    userErrors {
      field
      message
    }
  }
}
`

const LISTING_PUBLISH = `
mutation ListingPublish($input: ListingPublishInput!) {
  listingPublish(input: $input) {
    listing {
      id
    }
    userErrors {
      field
      message
    }
  }
}
`

function toMinorUnits(price: number): number {
  const cents = Math.round(price * 100)
  if (!Number.isFinite(cents) || cents <= 0) {
    throw new MarketplaceError(
      "Whatnot price must be greater than 0 (MoneyInput.amount in minor units).",
      "whatnot_price_invalid",
      400
    )
  }
  return cents
}

async function withFreshToken(connection: StoredMarketplaceConnection) {
  if (!connection.expiresAt) return connection
  const expires = Date.parse(connection.expiresAt)
  if (Number.isFinite(expires) && expires - Date.now() > 60_000) {
    return connection
  }
  if (!connection.refreshToken) {
    throw new MarketplaceError(
      "Whatnot access token expired. Reconnect your Whatnot account.",
      "whatnot_reauth_required",
      401
    )
  }
  const refreshed = await refreshWhatnotToken(connection.refreshToken)
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

export const whatnotAdapter: MarketplaceAdapter = {
  id: "whatnot",
  displayName: "Whatnot",
  isAppConfigured: isWhatnotConfigured,
  setupRequirements: () => [
    "WHATNOT_CLIENT_ID / WHATNOT_CLIENT_SECRET (issued by Whatnot)",
    "Whatnot Seller API partner access (Developer Preview; new applicants currently closed)",
    "WHATNOT_REDIRECT_URI (or NEXT_PUBLIC_APP_URL)",
    "CONNECTIONS_SECRET",
    "Public image hosting (SUPABASE_STORAGE_BUCKET or reachable NEXT_PUBLIC_APP_URL)",
    "Optional WHATNOT_DEFAULT_CATEGORY_ID (taxonomy categoryId)",
  ],
  async publish(listing: Listing, connection: StoredMarketplaceConnection): Promise<PublishResult> {
    if (!isWhatnotConfigured()) {
      throw new MarketplaceError(
        "Whatnot app credentials are not configured. Seller API access also requires Whatnot partner approval (Developer Preview; onboarding currently closed).",
        "whatnot_not_configured",
        503
      )
    }

    const auth = await withFreshToken(connection)
    const imageUrls = await ensurePublicImageUrls(
      listing.images.map((i) => i.url).filter(Boolean)
    )

    const sku =
      listing.id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 50) || `lw-${Date.now()}`
    const currencyCode = (listing.currency || "USD").toUpperCase()
    const amount = toMinorUnits(listing.price)
    const categoryId = resolveWhatnotCategoryId(listing)

    // Official CreateMediaInput: source + mediaContentType (IMAGE)
    const media = imageUrls.slice(0, 8).map((source) => ({
      source,
      mediaContentType: "IMAGE" as const,
    }))

    const title = listing.title.trim().slice(0, 999)
    const description = listing.description.trim().slice(0, 999)
    if (title.length < 1 || description.length < 1) {
      throw new MarketplaceError(
        "Whatnot requires a non-blank title and description (max 1000 chars).",
        "whatnot_copy_invalid",
        400
      )
    }

    const created = await whatnotGraphql<{
      productCreate: {
        product?: {
          id: string
          variants?: {
            edges: Array<{
              node: {
                id: string
                listings?: { edges: Array<{ node: { id: string } }> }
              }
            }>
          }
        }
        userErrors?: Array<{ message?: string }>
      }
    }>(auth.accessToken, PRODUCT_CREATE, {
      media,
      input: {
        title,
        description,
        productCategory: { categoryId },
        autoCreateShippingProfile: true,
        variants: [
          {
            sku,
            price: {
              amount,
              currencyCode,
            },
            mediaSources: imageUrls.slice(0, 8),
            listings: [
              {
                buyItNow: {
                  price: {
                    amount,
                    currencyCode,
                  },
                },
                published: false,
              },
            ],
          },
        ],
      },
    })

    const userError = created.productCreate.userErrors?.[0]?.message
    if (userError) {
      throw new MarketplaceError(userError, "whatnot_user_error", 400)
    }

    const listingId =
      created.productCreate.product?.variants?.edges?.[0]?.node?.listings
        ?.edges?.[0]?.node?.id

    if (!listingId) {
      throw new MarketplaceError(
        "Whatnot productCreate did not return a listing id.",
        "whatnot_listing_missing",
        502
      )
    }

    const published = await whatnotGraphql<{
      listingPublish: {
        listing?: { id: string }
        userErrors?: Array<{ message?: string }>
      }
    }>(auth.accessToken, LISTING_PUBLISH, {
      input: { id: listingId },
    })

    const publishError = published.listingPublish.userErrors?.[0]?.message
    if (publishError) {
      throw new MarketplaceError(publishError, "whatnot_publish_error", 400)
    }

    const finalId = published.listingPublish.listing?.id || listingId

    return {
      ok: true,
      listingRef: {
        marketplaceId: "whatnot",
        externalId: finalId,
        status: "listed",
        price: listing.price,
        lastSyncedAt: new Date().toISOString(),
      },
    }
  },
}
