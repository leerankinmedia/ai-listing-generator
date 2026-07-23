import { ebayFetch } from "@/lib/marketplaces/adapters/ebay/client"
import { MarketplaceError } from "@/lib/marketplaces/adapters/types"

type CategorySuggestion = {
  category?: {
    categoryId?: string
    categoryName?: string
  }
  categoryTreeNodeLevel?: number
}

type CategorySuggestionResponse = {
  categorySuggestions?: CategorySuggestion[]
  categoryTreeId?: string
}

type DefaultCategoryTreeResponse = {
  categoryTreeId?: string
  categoryTreeVersion?: string
}

function marketplaceId() {
  return process.env.EBAY_MARKETPLACE_ID || "EBAY_US"
}

/**
 * Resolve a leaf categoryId via Taxonomy getCategorySuggestions for the listing title.
 * Uses the marketplace default category tree (EBAY_US → getDefaultCategoryTreeId).
 */
export async function resolveEbayLeafCategoryId(
  accessToken: string,
  listingTitle: string
): Promise<{ categoryId: string; categoryName: string }> {
  const title = listingTitle.trim()
  if (!title) {
    throw new MarketplaceError(
      "Could not determine an eBay category",
      "ebay_category_undetermined",
      400
    )
  }

  const tree = (await ebayFetch(
    `/commerce/taxonomy/v1/get_default_category_tree_id?marketplace_id=${encodeURIComponent(marketplaceId())}`,
    accessToken,
    { method: "GET", step: "getDefaultCategoryTreeId" }
  )) as DefaultCategoryTreeResponse | null

  const categoryTreeId = tree?.categoryTreeId?.trim()
  if (!categoryTreeId) {
    throw new MarketplaceError(
      "Could not determine an eBay category",
      "ebay_category_tree_missing",
      502
    )
  }

  const suggestions = (await ebayFetch(
    `/commerce/taxonomy/v1/category_tree/${encodeURIComponent(categoryTreeId)}/get_category_suggestions?q=${encodeURIComponent(title)}`,
    accessToken,
    { method: "GET", step: "getCategorySuggestions" }
  )) as CategorySuggestionResponse | null

  const firstValid = (suggestions?.categorySuggestions || []).find(
    (s) => Boolean(s.category?.categoryId?.trim())
  )
  const categoryId = firstValid?.category?.categoryId?.trim()
  const categoryName = firstValid?.category?.categoryName?.trim() || "(unnamed)"

  if (!categoryId) {
    throw new MarketplaceError(
      "Could not determine an eBay category",
      "ebay_category_undetermined",
      400
    )
  }

  // Log only title, selected category ID, and category name (no tokens/PII beyond title).
  console.info("[ebay/taxonomy] TEMP category suggestion selected", {
    title,
    categoryId,
    categoryName,
  })

  return { categoryId, categoryName }
}
