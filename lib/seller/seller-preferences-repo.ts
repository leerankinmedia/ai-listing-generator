import { createClient } from "@/lib/supabase/server"
import {
  normalizeEbaySellerDefaults,
  type EbaySellerDefaults,
} from "@/lib/seller/ebay-defaults"

export type SellerPreferencesRow = {
  defaults: EbaySellerDefaults
  setupCompleted: boolean
}

export async function getSellerPreferences(
  userId: string
): Promise<SellerPreferencesRow | null> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("seller_preferences")
      .select("ebay_defaults, setup_completed")
      .eq("user_id", userId)
      .maybeSingle()
    if (error) {
      console.warn("[seller-preferences] read failed", error.message)
      return null
    }
    if (!data) return null
    return {
      defaults: normalizeEbaySellerDefaults(data.ebay_defaults),
      setupCompleted: Boolean(data.setup_completed),
    }
  } catch (err) {
    console.warn(
      "[seller-preferences] read unavailable",
      err instanceof Error ? err.message : err
    )
    return null
  }
}

export async function upsertSellerPreferences(
  userId: string,
  defaults: EbaySellerDefaults,
  setupCompleted: boolean
): Promise<SellerPreferencesRow> {
  const normalized = normalizeEbaySellerDefaults(defaults)
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("seller_preferences")
    .upsert(
      {
        user_id: userId,
        ebay_defaults: normalized,
        setup_completed: setupCompleted,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    )
    .select("ebay_defaults, setup_completed")
    .single()

  if (error) {
    throw new Error(error.message || "Could not save seller preferences.")
  }

  return {
    defaults: normalizeEbaySellerDefaults(data.ebay_defaults),
    setupCompleted: Boolean(data.setup_completed),
  }
}
