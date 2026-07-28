import {
  normalizeEbaySellerDefaults,
  type EbaySellerDefaults,
} from "@/lib/seller/ebay-defaults"

const LOCAL_KEY = "listwise.ebaySellerDefaults"

export type LocalSellerPreferences = {
  defaults: EbaySellerDefaults
  setupCompleted: boolean
}

export function readLocalEbaySellerDefaults(): LocalSellerPreferences | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as {
      defaults?: unknown
      setupCompleted?: boolean
    }
    return {
      defaults: normalizeEbaySellerDefaults(parsed.defaults),
      setupCompleted: Boolean(parsed.setupCompleted),
    }
  } catch {
    return null
  }
}

export function writeLocalEbaySellerDefaults(
  defaults: EbaySellerDefaults,
  setupCompleted: boolean
) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(
    LOCAL_KEY,
    JSON.stringify({ defaults, setupCompleted })
  )
}
