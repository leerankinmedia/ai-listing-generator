import type { Listing } from "@/lib/types"
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
  return rowToListing(data as ListingRow)
}

export async function deleteSupabaseListing(id: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false
  const supabase = createClient()
  const { error } = await supabase.from("listings").delete().eq("id", id)
  if (error) throw error
  return true
}
