import type { Listing } from "@/lib/types"

/**
 * Maps ListWise categories to Whatnot External Taxonomy categoryId values.
 * Source of truth: https://api.whatnot.com/seller-api/rest/product-taxonomy/US.txt
 * Docs: https://developers.whatnot.com/docs/types/ProductCategoryInput
 *        https://developers.whatnot.com/docs/taxonomy/overview
 *
 * Prefer WHATNOT_DEFAULT_CATEGORY_ID when set; otherwise heuristic leaf IDs.
 */
const CATEGORY_HINTS: Array<{ id: number; needles: string[] }> = [
  { id: 173, needles: ["jean", "denim", "pant", "trouser"] },
  { id: 175, needles: ["short"] },
  { id: 160, needles: ["dress"] },
  { id: 176, needles: ["skirt"] },
  { id: 174, needles: ["shirt", "top", "blouse", "tee", "t-shirt"] },
  { id: 167, needles: ["jacket", "coat", "outerwear"] },
  { id: 365, needles: ["sneaker", "shoe", "boot", "loafer", "sandal"] },
  { id: 342, needles: ["bag", "purse", "handbag"] },
  { id: 127, needles: ["clothing", "apparel", "fashion", "vintage", "sweater", "hoodie"] },
]

export function resolveWhatnotCategoryId(listing: Listing): number {
  const fromEnv = process.env.WHATNOT_DEFAULT_CATEGORY_ID
  if (fromEnv && /^\d+$/.test(fromEnv)) {
    return Number(fromEnv)
  }

  const hay = `${listing.specifics.category || ""} ${listing.title}`.toLowerCase()
  for (const hint of CATEGORY_HINTS) {
    if (hint.needles.some((n) => hay.includes(n))) {
      return hint.id
    }
  }

  // Apparel & Accessories > Clothing
  return 127
}
