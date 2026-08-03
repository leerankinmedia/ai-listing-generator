/**
 * eBay Sell Metadata API — item condition policies per marketplace + category.
 */
import { ebayFetch } from "@/lib/marketplaces/adapters/ebay/client"
import {
  cacheGet,
  cacheSet,
  EBAY_METADATA_CACHE_TTL_MS,
  ebayMarketplaceId,
} from "@/lib/marketplaces/adapters/ebay/ebay-cache"
import type { EbayPolicyCondition } from "@/lib/marketplaces/adapters/ebay/condition-map"
import { MarketplaceError } from "@/lib/marketplaces/adapters/types"

type ConditionPoliciesResponse = {
  itemConditionPolicies?: Array<{
    categoryId?: string
    itemConditionRequired?: boolean
    itemConditions?: Array<{
      conditionId?: string | number
      conditionDescription?: string
      conditionHelpText?: string
    }>
  }>
}

export type EbayCategoryConditionPolicy = {
  marketplaceId: string
  categoryId: string
  itemConditionRequired: boolean
  conditions: EbayPolicyCondition[]
}

/**
 * Retrieve valid condition IDs for an exact marketplace + leaf category.
 * Results are cached and refreshed periodically.
 */
export async function getItemConditionPoliciesForCategory(
  accessToken: string,
  categoryId: string,
  marketplaceId: string = ebayMarketplaceId()
): Promise<EbayCategoryConditionPolicy> {
  const id = categoryId.trim()
  if (!id) {
    throw new MarketplaceError(
      "categoryId is required to load eBay condition policies.",
      "ebay_condition_category_required",
      400
    )
  }

  const cacheKey = `ebay:conditions:${marketplaceId}:${id}`
  const cached = cacheGet<EbayCategoryConditionPolicy>(cacheKey)
  if (cached) return cached

  // filter syntax: categoryIds:{id}
  const filter = encodeURIComponent(`categoryIds:{${id}}`)
  const response = (await ebayFetch(
    `/sell/metadata/v1/marketplace/${encodeURIComponent(marketplaceId)}/get_item_condition_policies?filter=${filter}`,
    accessToken,
    { method: "GET", step: "getItemConditionPolicies" }
  )) as ConditionPoliciesResponse | null

  const policy =
    (response?.itemConditionPolicies || []).find(
      (p) => String(p.categoryId || "").trim() === id
    ) || response?.itemConditionPolicies?.[0]

  const conditions: EbayPolicyCondition[] = []
  for (const c of policy?.itemConditions || []) {
    const conditionId = String(c.conditionId ?? "").trim()
    const conditionDescription = (c.conditionDescription || "").trim()
    if (!conditionId || !conditionDescription) continue
    conditions.push({
      conditionId,
      conditionDescription,
      conditionHelpText: c.conditionHelpText?.trim() || undefined,
    })
  }

  if (conditions.length === 0) {
    throw new MarketplaceError(
      `No item conditions are available for eBay category ${id}. Pick a different leaf category.`,
      "ebay_condition_policies_empty",
      400
    )
  }

  const result: EbayCategoryConditionPolicy = {
    marketplaceId,
    categoryId: id,
    itemConditionRequired: Boolean(policy?.itemConditionRequired),
    conditions,
  }
  cacheSet(cacheKey, result, EBAY_METADATA_CACHE_TTL_MS)
  return result
}
