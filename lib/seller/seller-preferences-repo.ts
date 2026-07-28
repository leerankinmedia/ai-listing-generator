import { createClient } from "@/lib/supabase/server"
import {
  normalizeEbaySellerDefaults,
  type EbaySellerDefaults,
} from "@/lib/seller/ebay-defaults"

export type SellerPreferencesRow = {
  defaults: EbaySellerDefaults
  setupCompleted: boolean
}

export class SellerPreferencesError extends Error {
  code: "table_missing" | "read_failed" | "write_failed"
  constructor(
    message: string,
    code: SellerPreferencesError["code"] = "read_failed"
  ) {
    super(message)
    this.name = "SellerPreferencesError"
    this.code = code
  }
}

function isMissingTableError(message: string): boolean {
  return (
    /seller_preferences/i.test(message) &&
    (/schema cache/i.test(message) ||
      /does not exist/i.test(message) ||
      /could not find the table/i.test(message) ||
      /relation .* does not exist/i.test(message))
  )
}

function wrapError(
  err: unknown,
  fallbackCode: SellerPreferencesError["code"]
): SellerPreferencesError {
  const message =
    err instanceof Error ? err.message : "Seller preferences unavailable."
  if (isMissingTableError(message)) {
    return new SellerPreferencesError(
      "Could not find the table public.seller_preferences in the schema cache. Run migration 008_seller_preferences.sql in the production Supabase SQL editor, then run: NOTIFY pgrst, 'reload schema';",
      "table_missing"
    )
  }
  return new SellerPreferencesError(message, fallbackCode)
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
      throw wrapError(error, "read_failed")
    }
    if (!data) return null
    return {
      defaults: normalizeEbaySellerDefaults(data.ebay_defaults),
      setupCompleted: Boolean(data.setup_completed),
    }
  } catch (err) {
    if (err instanceof SellerPreferencesError) throw err
    throw wrapError(err, "read_failed")
  }
}

export async function upsertSellerPreferences(
  userId: string,
  defaults: EbaySellerDefaults,
  setupCompleted: boolean
): Promise<SellerPreferencesRow> {
  const normalized = normalizeEbaySellerDefaults(defaults)
  try {
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
      throw wrapError(error, "write_failed")
    }

    return {
      defaults: normalizeEbaySellerDefaults(data.ebay_defaults),
      setupCompleted: Boolean(data.setup_completed),
    }
  } catch (err) {
    if (err instanceof SellerPreferencesError) throw err
    throw wrapError(err, "write_failed")
  }
}
