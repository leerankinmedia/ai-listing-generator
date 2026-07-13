import type { Listing } from "@/lib/types"
import type { StoredMarketplaceConnection } from "@/lib/marketplaces/connections/crypto"
import {
  mapConditionToVintedStatusName,
  vintedFetch,
} from "@/lib/marketplaces/adapters/vinted/client"
import type { MarketplaceAdapter, PublishResult } from "@/lib/marketplaces/adapters/types"
import { MarketplaceError } from "@/lib/marketplaces/adapters/types"
import { ensurePublicImageUrls } from "@/lib/marketplaces/images/ensure-public-urls"

type OntologyNode = {
  id?: number
  title?: string
  code?: string
  catalogs?: OntologyNode[]
  statuses?: Array<{ id: number; title?: string }>
  package_sizes?: Array<{ id: number; title?: string }>
  colors?: Array<{ id: number; title?: string; code?: string }>
  size_groups?: Array<{
    id: number
    title?: string
    sizes?: Array<{ id: number; title?: string }>
  }>
}

function flattenCatalogs(
  nodes: OntologyNode[] | undefined,
  path: string[] = []
): Array<{ id: number; path: string }> {
  if (!nodes) return []
  const out: Array<{ id: number; path: string }> = []
  for (const node of nodes) {
    const nextPath = [...path, node.title || node.code || String(node.id)]
    if (node.id && (!node.catalogs || node.catalogs.length === 0)) {
      out.push({ id: node.id, path: nextPath.join(" > ") })
    }
    out.push(...flattenCatalogs(node.catalogs, nextPath))
  }
  return out
}

function pickCatalogId(
  ontologies: OntologyNode,
  listing: Listing
): number {
  const leaves = flattenCatalogs(ontologies.catalogs)
  const category = (listing.specifics.category || "").toLowerCase()
  const gender = (listing.specifics.gender || "").toLowerCase()
  const hay = `${category} ${listing.title}`.toLowerCase()

  const scored = leaves
    .map((leaf) => {
      const p = leaf.path.toLowerCase()
      let score = 0
      if (gender && p.includes(gender)) score += 3
      if (hay.includes("jean") && p.includes("jean")) score += 5
      if (hay.includes("jacket") && p.includes("jacket")) score += 5
      if (hay.includes("coat") && p.includes("coat")) score += 4
      if (hay.includes("dress") && p.includes("dress")) score += 5
      if (hay.includes("shirt") && p.includes("shirt")) score += 4
      if (hay.includes("sweater") && p.includes("sweater")) score += 4
      if (hay.includes("shoe") && p.includes("shoe")) score += 5
      return { ...leaf, score }
    })
    .sort((a, b) => b.score - a.score)

  if (!scored[0] || scored[0].score === 0) {
    throw new MarketplaceError(
      "Could not map listing category to a Vinted catalog. Set a more specific clothing category.",
      "vinted_catalog_unmapped",
      400
    )
  }
  return scored[0].id
}

function pickStatusId(ontologies: OntologyNode, listing: Listing): number {
  const wanted = mapConditionToVintedStatusName(listing.specifics.condition)
  const match = ontologies.statuses?.find(
    (s) => s.title?.toLowerCase() === wanted.toLowerCase()
  )
  if (match?.id) return match.id
  const fallback = ontologies.statuses?.[0]?.id
  if (!fallback) {
    throw new MarketplaceError(
      "Vinted ontologies did not include item statuses.",
      "vinted_status_missing",
      502
    )
  }
  return fallback
}

function pickPackageSizeId(ontologies: OntologyNode): number {
  const id = ontologies.package_sizes?.[0]?.id
  if (!id) {
    throw new MarketplaceError(
      "Vinted ontologies did not include package sizes.",
      "vinted_package_missing",
      502
    )
  }
  return id
}

function pickColorIds(ontologies: OntologyNode, listing: Listing): number[] {
  const color = (listing.specifics.color || "").toLowerCase()
  if (!color || !ontologies.colors?.length) return []
  const match = ontologies.colors.find((c) => {
    const title = (c.title || c.code || "").toLowerCase()
    return color.includes(title) || title.includes(color.split(/[\s/]/)[0] || "")
  })
  return match?.id ? [match.id] : []
}

function pickSizeId(ontologies: OntologyNode, listing: Listing): number | undefined {
  const size = (listing.specifics.size || "").toLowerCase()
  if (!size) return undefined
  for (const group of ontologies.size_groups || []) {
    const match = group.sizes?.find((s) =>
      (s.title || "").toLowerCase().includes(size) ||
      size.includes((s.title || "").toLowerCase())
    )
    if (match?.id) return match.id
  }
  return undefined
}

export const vintedAdapter: MarketplaceAdapter = {
  id: "vinted",
  displayName: "Vinted",
  isAppConfigured: () => Boolean(process.env.CONNECTIONS_SECRET),
  setupRequirements: () => [
    "Vinted Pro account allowlisted for Integrations",
    "Vinted Pro access token (accessKey,signingKey)",
    "CONNECTIONS_SECRET",
    "Public image hosting (SUPABASE_STORAGE_BUCKET or reachable NEXT_PUBLIC_APP_URL)",
  ],
  async publish(listing: Listing, connection: StoredMarketplaceConnection): Promise<PublishResult> {
    const accessKey = connection.accessToken
    const signingKey = connection.meta?.signingKey
    if (!accessKey || !signingKey) {
      throw new MarketplaceError(
        "Vinted connection is missing access/signing keys. Reconnect with a Pro token.",
        "vinted_reconnect",
        401
      )
    }

    const imageUrls = await ensurePublicImageUrls(
      listing.images.map((i) => i.url).filter(Boolean)
    )

    const ontologies = (await vintedFetch({
      method: "GET",
      path: "/api/v1/ontologies",
      accessKey,
      signingKey,
    })) as OntologyNode

    const catalogId = pickCatalogId(ontologies, listing)
    const statusId = pickStatusId(ontologies, listing)
    const packageSizeId = pickPackageSizeId(ontologies)
    const colorIds = pickColorIds(ontologies, listing)
    const sizeId = pickSizeId(ontologies, listing)

    const item: Record<string, unknown> = {
      title: listing.title.slice(0, 100),
      description: [
        listing.description,
        listing.specifics.flaws
          ? `\n\nFlaws: ${listing.specifics.flaws}`
          : "",
      ]
        .join("")
        .slice(0, 4000),
      catalog_id: catalogId,
      price: listing.price,
      currency: listing.currency || "USD",
      status_id: statusId,
      package_size_id: packageSizeId,
      brand: listing.specifics.brand || undefined,
      photo_urls: imageUrls.slice(0, 20),
    }
    if (colorIds.length) item.color_ids = colorIds
    if (sizeId) item.size_id = sizeId

    const response = (await vintedFetch({
      method: "POST",
      path: "/api/v1/items",
      accessKey,
      signingKey,
      body: { items: [item] },
    })) as {
      items?: Array<{ id?: string | number; external_id?: string }>
      item_ids?: Array<string | number>
    }

    const externalId =
      response.items?.[0]?.id ||
      response.items?.[0]?.external_id ||
      response.item_ids?.[0]

    if (!externalId) {
      throw new MarketplaceError(
        "Vinted accepted the request but returned no item id.",
        "vinted_item_id_missing",
        502
      )
    }

    return {
      ok: true,
      listingRef: {
        marketplaceId: "vinted",
        externalId: String(externalId),
        status: "listed",
        price: listing.price,
        lastSyncedAt: new Date().toISOString(),
      },
    }
  },
}
