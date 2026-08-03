/**
 * Apply / clear eBay category + condition on a listing when the seller picks
 * a leaf category or the category changes.
 */
import type {
  EbayListingCategory,
  EbayListingCondition,
  Listing,
} from "@/lib/types"

const ASPECT_CORE_KEYS = new Set([
  "brand",
  "size",
  "color",
  "material",
  "style",
  "pattern",
  "gender",
  "condition",
  "category",
  "flaws",
])

/** Extras keys that are marketplace plumbing — keep across category changes. */
const KEEP_EXTRA_PREFIXES = ["ebay", "sku", "quantity", "minoffer", "autodecline", "itemlocation"]

function shouldKeepExtraKey(key: string): boolean {
  const lower = key.trim().toLowerCase()
  if (!lower) return false
  if (lower === "allowoffers") return true
  return KEEP_EXTRA_PREFIXES.some(
    (p) => lower === p || lower.startsWith(p)
  )
}

/**
 * When category changes: clear incompatible condition + aspect extras, keep
 * core AI fields (brand/size/…) for remapping onto the new category aspects.
 */
export function applyEbayCategorySelection(
  listing: Listing,
  category: EbayListingCategory,
  condition?: EbayListingCondition | null
): Listing {
  const prevId = listing.specifics.ebayCategory?.categoryId
  const categoryChanged = Boolean(prevId && prevId !== category.categoryId)

  const extras = { ...(listing.specifics.extras || {}) }
  if (categoryChanged) {
    for (const key of Object.keys(extras)) {
      if (shouldKeepExtraKey(key)) continue
      // Drop previous category aspect overrides — they may be invalid.
      if (!ASPECT_CORE_KEYS.has(key.toLowerCase())) {
        delete extras[key]
      }
    }
  }

  extras.ebayCategoryId = category.categoryId
  extras.ebayCategoryName = category.categoryName
  extras.ebayCategoryPath = category.categoryPath
  extras.ebayCategoryTreeId = category.categoryTreeId

  if (condition) {
    extras.ebayConditionId = condition.conditionId
    extras.ebayConditionDisplay = condition.conditionName
    extras.ebayConditionEnum = condition.conditionEnum
  } else if (categoryChanged) {
    delete extras.ebayConditionId
    delete extras.ebayConditionDisplay
    delete extras.ebayConditionEnum
  }

  return {
    ...listing,
    specifics: {
      ...listing.specifics,
      category: category.categoryPath || category.categoryName,
      ebayCategory: category,
      ebayCondition: condition || (categoryChanged ? undefined : listing.specifics.ebayCondition),
      extras,
    },
  }
}

export function clearEbayCategorySelection(listing: Listing): Listing {
  const extras = { ...(listing.specifics.extras || {}) }
  delete extras.ebayCategoryId
  delete extras.ebayCategoryName
  delete extras.ebayCategoryPath
  delete extras.ebayCategoryTreeId
  delete extras.ebayConditionId
  delete extras.ebayConditionDisplay
  delete extras.ebayConditionEnum

  return {
    ...listing,
    specifics: {
      ...listing.specifics,
      ebayCategory: undefined,
      ebayCondition: undefined,
      extras,
    },
  }
}

export function listingHasLeafEbayCategory(listing: Listing): boolean {
  const cat = listing.specifics.ebayCategory
  return Boolean(cat?.categoryId && cat.leafCategory)
}
