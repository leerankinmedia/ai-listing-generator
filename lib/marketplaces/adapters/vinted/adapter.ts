import type { Listing } from "@/lib/types"
import type { StoredMarketplaceConnection } from "@/lib/marketplaces/connections/crypto"
import {
  mapConditionToVintedStatusName,
  resolveVintedCurrency,
  vintedFetch,
} from "@/lib/marketplaces/adapters/vinted/client"
import type { MarketplaceAdapter, PublishResult } from "@/lib/marketplaces/adapters/types"
import { MarketplaceError } from "@/lib/marketplaces/adapters/types"
import { ensurePublicImageUrls } from "@/lib/marketplaces/images/ensure-public-urls"

/**
 * Official Vinted Pro Integrations GetOntologies response shape:
 * https://pro-docs.svc.vinted.com/ — GetOntologiesResponse.enumerations
 */
type VintedOntologies = {
  enumerations: {
    catalogs: OntologyCatalog[]
    statuses: Array<{ id: number; title?: string; description?: string }>
    package_sizes: Array<{ id: number; title?: string }>
    colors: Array<{ id: number; title?: string }>
    size_groups: Array<{
      id: number
      title?: string
      sizes?: Array<{ id: number; title?: string }>
    }>
  }
}

type OntologyCatalog = {
  id: number
  title?: string
  catalogs?: OntologyCatalog[]
  size_group_ids?: number[]
}

function flattenCatalogs(
  nodes: OntologyCatalog[] | undefined,
  path: string[] = []
): Array<{ id: number; path: string; sizeGroupIds: number[] }> {
  if (!nodes) return []
  const out: Array<{ id: number; path: string; sizeGroupIds: number[] }> = []
  for (const node of nodes) {
    const nextPath = [...path, node.title || String(node.id)]
    const children = node.catalogs || []
    if (children.length === 0) {
      out.push({
        id: node.id,
        path: nextPath.join(" > "),
        sizeGroupIds: node.size_group_ids || [],
      })
    }
    out.push(...flattenCatalogs(children, nextPath))
  }
  return out
}

function pickCatalog(
  ontologies: VintedOntologies,
  listing: Listing
): { id: number; sizeGroupIds: number[] } {
  const leaves = flattenCatalogs(ontologies.enumerations.catalogs)
  const gender = (listing.specifics.gender || "").toLowerCase()
  const hay = `${listing.specifics.category || ""} ${listing.title}`.toLowerCase()

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
      "Could not map listing category to a Vinted leaf catalog_id. Set a more specific clothing category/gender.",
      "vinted_catalog_unmapped",
      400
    )
  }
  return { id: scored[0].id, sizeGroupIds: scored[0].sizeGroupIds }
}

function pickStatusId(ontologies: VintedOntologies, listing: Listing): number {
  const wanted = mapConditionToVintedStatusName(listing.specifics.condition)
  const match = ontologies.enumerations.statuses?.find(
    (s) => s.title?.toLowerCase() === wanted.toLowerCase()
  )
  if (match?.id) return match.id
  const fallback = ontologies.enumerations.statuses?.[0]?.id
  if (!fallback) {
    throw new MarketplaceError(
      "Vinted ontologies did not include item statuses.",
      "vinted_status_missing",
      502
    )
  }
  return fallback
}

function pickPackageSizeId(ontologies: VintedOntologies): number {
  const id = ontologies.enumerations.package_sizes?.[0]?.id
  if (!id) {
    throw new MarketplaceError(
      "Vinted ontologies did not include package sizes.",
      "vinted_package_missing",
      502
    )
  }
  return id
}

function pickColorIds(ontologies: VintedOntologies, listing: Listing): number[] {
  const color = (listing.specifics.color || "").toLowerCase()
  if (!color || !ontologies.enumerations.colors?.length) return []
  const match = ontologies.enumerations.colors.find((c) => {
    const title = (c.title || "").toLowerCase()
    return color.includes(title) || title.includes(color.split(/[\s/]/)[0] || "")
  })
  return match?.id ? [match.id] : []
}

function pickSizeId(
  ontologies: VintedOntologies,
  listing: Listing,
  sizeGroupIds: number[]
): number | undefined {
  const size = (listing.specifics.size || "").toLowerCase()
  if (!size) return undefined
  const groups = ontologies.enumerations.size_groups || []
  const relevant =
    sizeGroupIds.length > 0
      ? groups.filter((g) => sizeGroupIds.includes(g.id))
      : groups
  for (const group of relevant) {
    const match = group.sizes?.find(
      (s) =>
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
    "Vinted Pro account allowlisted for Integrations (partner approval)",
    "Vinted Pro access token (accessKey,signingKey) from Integrations Portal",
    "CONNECTIONS_SECRET",
    "Public image hosting (SUPABASE_STORAGE_BUCKET or reachable NEXT_PUBLIC_APP_URL)",
    "Listing currency EUR or GBP (or VINTED_CURRENCY=EUR|GBP)",
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

    const brand = listing.specifics.brand?.trim()
    if (!brand) {
      throw new MarketplaceError(
        "Vinted CreateItems requires brand (official ItemProperties.brand).",
        "vinted_brand_required",
        400
      )
    }

    const currency = resolveVintedCurrency(listing.currency)
    const title = listing.title.trim().slice(0, 100)
    const description = [
      listing.description.trim(),
      listing.specifics.flaws ? `\n\nFlaws: ${listing.specifics.flaws}` : "",
    ]
      .join("")
      .slice(0, 2000)

    if (title.length < 5 || description.length < 5) {
      throw new MarketplaceError(
        "Vinted requires title 5–100 chars and description 5–2000 chars.",
        "vinted_copy_invalid",
        400
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
    })) as VintedOntologies

    if (!ontologies?.enumerations?.catalogs) {
      throw new MarketplaceError(
        "Unexpected GetOntologies response (missing enumerations.catalogs).",
        "vinted_ontologies_invalid",
        502
      )
    }

    const catalog = pickCatalog(ontologies, listing)
    const statusId = pickStatusId(ontologies, listing)
    const packageSizeId = pickPackageSizeId(ontologies)
    const colorIds = pickColorIds(ontologies, listing)
    const sizeId = pickSizeId(ontologies, listing, catalog.sizeGroupIds)

    if (catalog.sizeGroupIds.length > 0 && !sizeId) {
      throw new MarketplaceError(
        "This Vinted catalog requires size_id. Set listing size to a value from Vinted size groups.",
        "vinted_size_required",
        400
      )
    }

    const item: Record<string, unknown> = {
      title,
      description,
      catalog_id: catalog.id,
      price: listing.price,
      currency,
      status_id: statusId,
      package_size_id: packageSizeId,
      brand,
      photo_urls: imageUrls.slice(0, 20),
      item_reference: listing.id.slice(0, 100),
      // Publish to marketplace (not draft). Official field is_draft is required.
      is_draft: false,
    }
    if (colorIds.length) item.color_ids = colorIds
    if (sizeId) item.size_id = sizeId

    // CreateItems returns 202 Accepted; items upload asynchronously.
    const response = (await vintedFetch({
      method: "POST",
      path: "/api/v1/items",
      accessKey,
      signingKey,
      body: { items: [item] },
      acceptStatuses: [202],
    })) as {
      items?: Array<{ item_id?: string; item_reference?: string }>
    }

    const externalId = response.items?.[0]?.item_id
    if (!externalId) {
      throw new MarketplaceError(
        "Vinted CreateItems accepted the request but returned no item_id.",
        "vinted_item_id_missing",
        502
      )
    }

    return {
      ok: true,
      // Official docs: receiving item_id does not mean the item is listed yet (202 async).
      listingRef: {
        marketplaceId: "vinted",
        externalId: String(externalId),
        status: "ready",
        price: listing.price,
        lastSyncedAt: new Date().toISOString(),
      },
    }
  },
}
