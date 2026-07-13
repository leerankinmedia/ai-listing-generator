import type { Listing, ListingImage } from "@/lib/types"
import { isSupabaseConfigured, createClient } from "@/lib/supabase/client"

type ListingRow = {
  id: string
  user_id: string
  title: string
  description: string
  price: number
  currency: string
  keywords: string[]
  specifics: Listing["specifics"]
  field_confidence: Listing["fieldConfidence"]
  comps: Listing["comps"]
  images: Listing["images"]
  status: Listing["status"]
  marketplace_listings: Listing["marketplaceListings"]
  target_marketplaces: Listing["targetMarketplaces"]
  ai_generated: boolean
  analysis_meta: Listing["analysisMeta"]
  created_at: string
  updated_at: string
}

function rowToListing(row: ListingRow): Listing {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    description: row.description,
    price: Number(row.price),
    currency: row.currency,
    keywords: row.keywords ?? [],
    specifics: row.specifics ?? {},
    fieldConfidence: row.field_confidence ?? {},
    comps: row.comps ?? undefined,
    images: row.images ?? [],
    status: row.status,
    marketplaceListings: row.marketplace_listings ?? [],
    targetMarketplaces: row.target_marketplaces ?? [],
    aiGenerated: row.ai_generated,
    analysisMeta: row.analysis_meta ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function listingToRow(listing: Listing): Omit<ListingRow, "created_at" | "updated_at"> & {
  created_at?: string
  updated_at?: string
} {
  return {
    id: listing.id,
    user_id: listing.userId,
    title: listing.title,
    description: listing.description,
    price: listing.price,
    currency: listing.currency,
    keywords: listing.keywords,
    specifics: listing.specifics,
    field_confidence: listing.fieldConfidence ?? {},
    comps: listing.comps,
    images: listing.images,
    status: listing.status,
    marketplace_listings: listing.marketplaceListings,
    target_marketplaces: listing.targetMarketplaces,
    ai_generated: listing.aiGenerated,
    analysis_meta: listing.analysisMeta,
    created_at: listing.createdAt,
    updated_at: listing.updatedAt,
  }
}

async function syncListingPhotos(listing: Listing) {
  const supabase = createClient()
  const { error: deleteError } = await supabase
    .from("listing_photos")
    .delete()
    .eq("listing_id", listing.id)
    .eq("user_id", listing.userId)
  if (deleteError) throw deleteError

  if (listing.images.length === 0) return

  const rows = listing.images.map((image: ListingImage, index: number) => {
    const row: Record<string, unknown> = {
      listing_id: listing.id,
      user_id: listing.userId,
      url: image.url,
      storage_path: image.storagePath ?? null,
      sort_order: image.sortOrder ?? index,
      is_primary: Boolean(image.isPrimary) || index === 0,
      analysis: image.analysis ?? null,
    }
    if (/^[0-9a-f-]{36}$/i.test(image.id)) {
      row.id = image.id
    }
    return row
  })

  const { error: insertError } = await supabase.from("listing_photos").insert(rows)
  if (insertError) throw insertError
}

async function syncInventoryItem(listing: Listing) {
  const supabase = createClient()
  const sku =
    listing.id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 50) || listing.id
  const { data: existing, error: selectError } = await supabase
    .from("inventory_items")
    .select("id")
    .eq("user_id", listing.userId)
    .eq("listing_id", listing.id)
    .maybeSingle()
  if (selectError) throw selectError

  if (existing?.id) {
    const { error: updateError } = await supabase
      .from("inventory_items")
      .update({ sku, quantity: 1, updated_at: new Date().toISOString() })
      .eq("id", existing.id)
    if (updateError) throw updateError
    return
  }

  const { error: insertError } = await supabase.from("inventory_items").insert({
    user_id: listing.userId,
    listing_id: listing.id,
    sku,
    quantity: 1,
  })
  if (insertError) throw insertError
}

export async function listSupabaseListings(userId: string): Promise<Listing[] | null> {
  if (!isSupabaseConfigured()) return null
  const supabase = createClient()
  const { data, error } = await supabase
    .from("listings")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
  if (error) throw error
  return (data as ListingRow[]).map(rowToListing)
}

export async function getSupabaseListing(id: string): Promise<Listing | null> {
  if (!isSupabaseConfigured()) return null
  const supabase = createClient()
  const { data, error } = await supabase.from("listings").select("*").eq("id", id).maybeSingle()
  if (error) throw error
  return data ? rowToListing(data as ListingRow) : null
}

export async function upsertSupabaseListing(listing: Listing): Promise<Listing | null> {
  if (!isSupabaseConfigured()) return null
  const supabase = createClient()
  const { data, error } = await supabase
    .from("listings")
    .upsert(listingToRow(listing))
    .select("*")
    .single()
  if (error) throw error

  const saved = rowToListing(data as ListingRow)
  try {
    await syncListingPhotos(saved)
  } catch (photoError) {
    console.error("[listings] listing_photos sync failed", photoError)
  }
  try {
    await syncInventoryItem(saved)
  } catch (inventoryError) {
    console.error("[listings] inventory_items sync failed", inventoryError)
  }
  return saved
}

export async function deleteSupabaseListing(id: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false
  const supabase = createClient()
  // listing_photos cascade; inventory listing_id set null
  const { error } = await supabase.from("listings").delete().eq("id", id)
  if (error) throw error
  return true
}
