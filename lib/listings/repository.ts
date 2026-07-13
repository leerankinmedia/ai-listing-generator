import type { Listing } from "@/lib/types"
import {
  deleteLocalListing,
  getLocalListing,
  listLocalListings,
  saveLocalListing,
} from "@/lib/listings/local-db"
import {
  deleteSupabaseListing,
  getSupabaseListing,
  listSupabaseListings,
  upsertSupabaseListing,
} from "@/lib/listings/supabase-repo"
import { isSupabaseConfigured } from "@/lib/supabase/client"

/**
 * Unified listing repository: Supabase when configured, IndexedDB otherwise.
 */
export async function fetchListings(userId: string): Promise<Listing[]> {
  if (isSupabaseConfigured()) {
    try {
      const remote = await listSupabaseListings(userId)
      if (remote) return remote
    } catch {
      // Fall through to local
    }
  }
  return listLocalListings(userId)
}

export async function fetchListing(id: string): Promise<Listing | null> {
  if (isSupabaseConfigured()) {
    try {
      const remote = await getSupabaseListing(id)
      if (remote) return remote
    } catch {
      // Fall through
    }
  }
  return getLocalListing(id)
}

export async function persistListing(listing: Listing): Promise<Listing> {
  if (isSupabaseConfigured()) {
    try {
      const remote = await upsertSupabaseListing(listing)
      if (remote) {
        await saveLocalListing(remote)
        return remote
      }
    } catch {
      // Fall through to local-only persistence
    }
  }
  return saveLocalListing(listing)
}

export async function removeListing(id: string): Promise<void> {
  if (isSupabaseConfigured()) {
    try {
      await deleteSupabaseListing(id)
    } catch {
      // continue local delete
    }
  }
  await deleteLocalListing(id)
}
