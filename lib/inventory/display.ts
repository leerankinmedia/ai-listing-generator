import type { Listing } from "@/lib/types"

export type InventoryRow = {
  id: string
  title: string
  photoUrl: string | null
  price: number
  currency: string
  quantity: number
  sku: string
  category: string
  marketplace: string
  listingId: string
  status: string
  href: string
  externalUrl: string | null
  updatedAt: string
}

export function listingToInventoryRow(listing: Listing): InventoryRow | null {
  const ebayRef =
    listing.marketplaceListings.find((ref) => ref.marketplaceId === "ebay") ||
    null
  const extras = listing.specifics?.extras || {}
  const source = extras.source || ""
  const isImported =
    source === "ebay_import" ||
    Boolean(extras.ebayListingId) ||
    Boolean(ebayRef?.externalId)

  if (!isImported && listing.status !== "listed") {
    // Inventory MVP focuses on marketplace-backed / imported stock.
    // Still include any listed eBay-linked rows.
    if (!ebayRef) return null
  }
  if (!ebayRef && source !== "ebay_import") return null

  const cover =
    listing.images.find((img) => img.isPrimary) ||
    [...listing.images].sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
    )[0]

  const qtyRaw = Number(extras.quantity ?? extras.ebayQuantity ?? 1)
  const quantity = Number.isFinite(qtyRaw) ? Math.max(0, Math.floor(qtyRaw)) : 1
  const sku =
    extras.ebayOriginalSku?.trim() ||
    extras.ebaySku?.trim() ||
    extras.sku?.trim() ||
    ebayRef?.externalId ||
    listing.id.slice(0, 8)
  const listingId =
    extras.ebayListingId?.trim() || ebayRef?.externalId || "—"

  return {
    id: listing.id,
    title: listing.title || "Untitled",
    photoUrl: cover?.url || null,
    price: listing.price,
    currency: listing.currency || "USD",
    quantity,
    sku,
    category: listing.specifics?.category || extras.ebayCategoryId || "—",
    marketplace: "eBay",
    listingId,
    status: listing.status,
    href: `/dashboard/listings/${listing.id}`,
    externalUrl: ebayRef?.url || null,
    updatedAt: listing.updatedAt,
  }
}

export function listingsToInventoryRows(listings: Listing[]): InventoryRow[] {
  return listings
    .map(listingToInventoryRow)
    .filter((row): row is InventoryRow => Boolean(row))
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )
}

export function filterInventoryRows(
  rows: InventoryRow[],
  query: string
): InventoryRow[] {
  const q = query.trim().toLowerCase()
  if (!q) return rows
  return rows.filter((row) => {
    const haystack = [
      row.title,
      row.sku,
      row.listingId,
      row.category,
      row.marketplace,
      row.status,
      String(row.price),
    ]
      .join(" ")
      .toLowerCase()
    return haystack.includes(q)
  })
}
