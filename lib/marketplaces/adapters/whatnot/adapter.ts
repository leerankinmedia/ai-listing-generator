import type { Listing } from "@/lib/types"
import type { StoredMarketplaceConnection } from "@/lib/marketplaces/connections/crypto"
import {
  isWhatnotConfigured,
  refreshWhatnotToken,
  whatnotGraphql,
} from "@/lib/marketplaces/adapters/whatnot/oauth"
import type { MarketplaceAdapter, PublishResult } from "@/lib/marketplaces/adapters/types"
import { MarketplaceError } from "@/lib/marketplaces/adapters/types"
import { saveConnection } from "@/lib/marketplaces/connections/store"
import { ensurePublicImageUrls } from "@/lib/marketplaces/images/ensure-public-urls"

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
    "WHATNOT_CLIENT_ID",
    "WHATNOT_CLIENT_SECRET",
    "WHATNOT_REDIRECT_URI (or NEXT_PUBLIC_APP_URL)",
    "CONNECTIONS_SECRET",
    "Whatnot Seller API access (Developer Preview approval)",
    "Public image hosting (SUPABASE_STORAGE_BUCKET or reachable NEXT_PUBLIC_APP_URL)",
  ],
  async publish(listing: Listing, connection: StoredMarketplaceConnection): Promise<PublishResult> {
    if (!isWhatnotConfigured()) {
      throw new MarketplaceError(
        "Whatnot app credentials are not configured.",
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

    const media = imageUrls.slice(0, 8).map((url, index) => ({
      url,
      position: index,
    }))

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
        title: listing.title.slice(0, 120),
        description: listing.description,
        variants: [
          {
            sku,
            price: {
              amount: listing.price.toFixed(2),
              currencyCode: listing.currency || "USD",
            },
            listings: [
              {
                buyItNow: {
                  enabled: true,
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
