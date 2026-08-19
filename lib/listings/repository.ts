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

/**
 * Unified listing repository.
 * Uses Supabase only when NEXT_PUBLIC_SUPABASE_* is configured.
 * Otherwise persists to browser IndexedDB (local to this device/browser).
 */
export async function persistListing(listing: Listing): Promise<Listing> {
  if (isSupabaseConfigured()) {
    try {
      const remote = await upsertSupabaseListing(listing)
      if (remote) {
        const merged =
          remote.images.length === 0 && listing.images.length > 0
            ? { ...remote, images: listing.images }
            : remote
        await saveLocalListing(merged)
        return merged
      }
    } catch (error) {
      console.error("[listings] Supabase save failed, using IndexedDB", error)
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
