/**
 * Live eBay Taxonomy API — category tree, suggestions, and browse helpers.
 * No hardcoded category ID maps. EBAY_US default tree is resolved at runtime.
 */
import { ebayFetch } from "@/lib/marketplaces/adapters/ebay/client"
import {
  cacheGet,
  cacheSet,
  EBAY_TAXONOMY_CACHE_TTL_MS,
  EBAY_TREE_ID_CACHE_TTL_MS,
  ebayMarketplaceId,
} from "@/lib/marketplaces/adapters/ebay/ebay-cache"
import { MarketplaceError } from "@/lib/marketplaces/adapters/types"
import {
  buildCategorySuggestionQuery,
  type CategorySuggestQuery,
} from "@/lib/marketplaces/adapters/ebay/category-suggest-query"

export { buildCategorySuggestionQuery }
export type { CategorySuggestQuery }

export type EbayCategoryNodeSummary = {
  categoryId: string
  categoryName: string
  /** Breadcrumb path from root (excluding marketplace root label when empty). */
  categoryPath: string
  leafCategory: boolean
  categoryTreeNodeLevel?: number
  parentCategoryId?: string
  childCount?: number
}

export type EbayCategorySuggestion = EbayCategoryNodeSummary & {
  relevancy?: string
}

type DefaultCategoryTreeResponse = {
  categoryTreeId?: string
  categoryTreeVersion?: string
}

type CategorySuggestionResponse = {
  categorySuggestions?: Array<{
    category?: { categoryId?: string; categoryName?: string }
    categoryTreeNodeAncestors?: Array<{
      categoryId?: string
      categoryName?: string
      categoryTreeNodeLevel?: number
    }>
    categoryTreeNodeLevel?: number
    relevancy?: string
  }>
  categoryTreeId?: string
}

type CategorySubtreeResponse = {
  categorySubtreeNode?: TaxonomyTreeNode
  categoryTreeId?: string
}

type TaxonomyTreeNode = {
  category?: { categoryId?: string; categoryName?: string }
  categoryTreeNodeLevel?: number
  leafCategoryTreeNode?: boolean
  parentCategoryTreeNodeHref?: string
  childCategoryTreeNodes?: TaxonomyTreeNode[]
}

function pathFromAncestors(
  ancestors: Array<{ categoryName?: string }> | undefined,
  leafName: string
): string {
  const parts = (ancestors || [])
    .map((a) => a.categoryName?.trim())
    .filter((n): n is string => Boolean(n))
  if (leafName.trim()) parts.push(leafName.trim())
  return parts.join(" > ")
}

export async function getEbayDefaultCategoryTreeId(
  accessToken: string,
  marketplaceId: string = ebayMarketplaceId()
): Promise<{ categoryTreeId: string; categoryTreeVersion?: string }> {
  const cacheKey = `ebay:treeId:${marketplaceId}`
  const cached = cacheGet<{ categoryTreeId: string; categoryTreeVersion?: string }>(
    cacheKey
  )
  if (cached?.categoryTreeId) return cached

  const tree = (await ebayFetch(
    `/commerce/taxonomy/v1/get_default_category_tree_id?marketplace_id=${encodeURIComponent(marketplaceId)}`,
    accessToken,
    { method: "GET", step: "getDefaultCategoryTreeId" }
  )) as DefaultCategoryTreeResponse | null

  const categoryTreeId = tree?.categoryTreeId?.trim()
  if (!categoryTreeId) {
    throw new MarketplaceError(
      "Could not determine the eBay category tree for this marketplace.",
      "ebay_category_tree_missing",
      502
    )
  }

  const value = {
    categoryTreeId,
    categoryTreeVersion: tree?.categoryTreeVersion,
  }
  cacheSet(cacheKey, value, EBAY_TREE_ID_CACHE_TTL_MS)
  return value
}

function nodeToSummary(
  node: TaxonomyTreeNode,
  parentPath: string,
  parentId?: string
): EbayCategoryNodeSummary | null {
  const categoryId = node.category?.categoryId?.trim()
  const categoryName = node.category?.categoryName?.trim()
  if (!categoryId || !categoryName) return null
  const categoryPath = parentPath
    ? `${parentPath} > ${categoryName}`
    : categoryName
  return {
    categoryId,
    categoryName,
    categoryPath,
    leafCategory: Boolean(node.leafCategoryTreeNode),
    categoryTreeNodeLevel: node.categoryTreeNodeLevel,
    parentCategoryId: parentId,
    childCount: node.childCategoryTreeNodes?.length,
  }
}

/**
 * Children of a category (or root when categoryId omitted).
 * Cached per tree + node for browse UI.
 */
export async function getEbayCategoryChildren(
  accessToken: string,
  options: {
    categoryId?: string
    categoryTreeId?: string
    marketplaceId?: string
  } = {}
): Promise<{
  marketplaceId: string
  categoryTreeId: string
  parent: EbayCategoryNodeSummary | null
  children: EbayCategoryNodeSummary[]
}> {
  const marketplaceId = options.marketplaceId || ebayMarketplaceId()
  const treeId =
    options.categoryTreeId ||
    (await getEbayDefaultCategoryTreeId(accessToken, marketplaceId)).categoryTreeId

  const parentId = options.categoryId?.trim() || ""
  const cacheKey = `ebay:subtree:${treeId}:${parentId || "root"}`
  const cached = cacheGet<{
    marketplaceId: string
    categoryTreeId: string
    parent: EbayCategoryNodeSummary | null
    children: EbayCategoryNodeSummary[]
  }>(cacheKey)
  if (cached) return cached

  // Root: prefer subtree of category 0 (US root) to avoid downloading the full tree.
  if (!parentId) {
    try {
      const subtree = (await ebayFetch(
        `/commerce/taxonomy/v1/category_tree/${encodeURIComponent(treeId)}/get_category_subtree?category_id=0`,
        accessToken,
        { method: "GET", step: "getCategorySubtreeRoot" }
      )) as CategorySubtreeResponse | null
      const root = subtree?.categorySubtreeNode
      if (root?.childCategoryTreeNodes?.length) {
        const rootName = root.category?.categoryName?.trim() || ""
        const rootId = root.category?.categoryId?.trim() || "0"
        const children = root.childCategoryTreeNodes
          .map((child) => nodeToSummary(child, rootName, rootId))
          .filter((n): n is EbayCategoryNodeSummary => Boolean(n))
        const result = {
          marketplaceId,
          categoryTreeId: treeId,
          parent: {
            categoryId: rootId,
            categoryName: rootName || "Root",
            categoryPath: rootName || "Root",
            leafCategory: Boolean(root.leafCategoryTreeNode),
            categoryTreeNodeLevel: root.categoryTreeNodeLevel,
            childCount: children.length,
          },
          children,
        }
        cacheSet(cacheKey, result, EBAY_TAXONOMY_CACHE_TTL_MS)
        return result
      }
    } catch {
      // Fall through to getCategoryTree.
    }

    const tree = (await ebayFetch(
      `/commerce/taxonomy/v1/category_tree/${encodeURIComponent(treeId)}`,
      accessToken,
      { method: "GET", step: "getCategoryTree" }
    )) as { rootCategoryNode?: TaxonomyTreeNode; categoryTreeId?: string } | null

    const root = tree?.rootCategoryNode
    const rootName = root?.category?.categoryName?.trim() || ""
    const rootId = root?.category?.categoryId?.trim()
    const children = (root?.childCategoryTreeNodes || [])
      .map((child) => nodeToSummary(child, rootName, rootId))
      .filter((n): n is EbayCategoryNodeSummary => Boolean(n))

    const result = {
      marketplaceId,
      categoryTreeId: treeId,
      parent: rootId
        ? {
            categoryId: rootId,
            categoryName: rootName || "Root",
            categoryPath: rootName || "Root",
            leafCategory: Boolean(root?.leafCategoryTreeNode),
            categoryTreeNodeLevel: root?.categoryTreeNodeLevel,
            childCount: children.length,
          }
        : null,
      children,
    }
    cacheSet(cacheKey, result, EBAY_TAXONOMY_CACHE_TTL_MS)
    return result
  }

  const subtree = (await ebayFetch(
    `/commerce/taxonomy/v1/category_tree/${encodeURIComponent(treeId)}/get_category_subtree?category_id=${encodeURIComponent(parentId)}`,
    accessToken,
    { method: "GET", step: "getCategorySubtree" }
  )) as CategorySubtreeResponse | null

  const node = subtree?.categorySubtreeNode
  const parentName = node?.category?.categoryName?.trim() || ""
  const parentPath = parentName
  const parentSummary = node
    ? nodeToSummary(node, "", undefined)
    : null
  // Rebuild path without duplicating — subtree node is the parent itself.
  const parent: EbayCategoryNodeSummary | null = parentSummary
    ? {
        ...parentSummary,
        categoryPath: parentName,
      }
    : null

  const children = (node?.childCategoryTreeNodes || [])
    .map((child) => nodeToSummary(child, parentPath, parentId))
    .filter((n): n is EbayCategoryNodeSummary => Boolean(n))

  const result = {
    marketplaceId,
    categoryTreeId: treeId,
    parent,
    children,
  }
  cacheSet(cacheKey, result, EBAY_TAXONOMY_CACHE_TTL_MS)
  return result
}

export async function getEbayCategorySuggestions(
  accessToken: string,
  query: string,
  options: {
    marketplaceId?: string
    categoryTreeId?: string
    limit?: number
  } = {}
): Promise<{
  marketplaceId: string
  categoryTreeId: string
  query: string
  suggestions: EbayCategorySuggestion[]
}> {
  const q = query.trim()
  if (!q) {
    throw new MarketplaceError(
      "Enter a search query to find eBay categories.",
      "ebay_category_query_empty",
      400
    )
  }

  const marketplaceId = options.marketplaceId || ebayMarketplaceId()
  const treeId =
    options.categoryTreeId ||
    (await getEbayDefaultCategoryTreeId(accessToken, marketplaceId)).categoryTreeId

  const cacheKey = `ebay:suggest:${treeId}:${q.toLowerCase()}`
  const cached = cacheGet<{
    marketplaceId: string
    categoryTreeId: string
    query: string
    suggestions: EbayCategorySuggestion[]
  }>(cacheKey)
  if (cached) return cached

  const response = (await ebayFetch(
    `/commerce/taxonomy/v1/category_tree/${encodeURIComponent(treeId)}/get_category_suggestions?q=${encodeURIComponent(q)}`,
    accessToken,
    { method: "GET", step: "getCategorySuggestions" }
  )) as CategorySuggestionResponse | null

  const limit = Math.min(20, Math.max(1, options.limit ?? 8))
  const suggestions: EbayCategorySuggestion[] = []
  for (const row of response?.categorySuggestions || []) {
    const categoryId = row.category?.categoryId?.trim()
    const categoryName = row.category?.categoryName?.trim()
    if (!categoryId || !categoryName) continue
    suggestions.push({
      categoryId,
      categoryName,
      categoryPath: pathFromAncestors(row.categoryTreeNodeAncestors, categoryName),
      leafCategory: true, // suggestions API returns leaf categories
      categoryTreeNodeLevel: row.categoryTreeNodeLevel,
      relevancy: row.relevancy,
    })
    if (suggestions.length >= limit) break
  }

  const result = {
    marketplaceId,
    categoryTreeId: treeId,
    query: q,
    suggestions,
  }
  cacheSet(cacheKey, result, EBAY_TAXONOMY_CACHE_TTL_MS)
  return result
}

/**
 * Resolve the best leaf category suggestion for a listing.
 * Prefer an already-selected leaf categoryId on the listing when provided.
 */
export async function resolveEbayLeafCategoryId(
  accessToken: string,
  listingTitle: string
): Promise<{ categoryId: string; categoryName: string; categoryPath?: string }> {
  const result = await getEbayCategorySuggestions(accessToken, listingTitle, {
    limit: 1,
  })
  const first = result.suggestions[0]
  if (!first) {
    throw new MarketplaceError(
      "Could not determine an eBay category",
      "ebay_category_undetermined",
      400
    )
  }
  console.info("[ebay/taxonomy] category suggestion selected", {
    title: listingTitle.slice(0, 120),
    categoryId: first.categoryId,
    categoryName: first.categoryName,
    categoryPath: first.categoryPath,
  })
  return {
    categoryId: first.categoryId,
    categoryName: first.categoryName,
    categoryPath: first.categoryPath,
  }
}

/** Fetch a single category node summary (for path display). */
export async function getEbayCategoryNode(
  accessToken: string,
  categoryId: string,
  options: { categoryTreeId?: string; marketplaceId?: string } = {}
): Promise<EbayCategoryNodeSummary | null> {
  const id = categoryId.trim()
  if (!id) return null
  const marketplaceId = options.marketplaceId || ebayMarketplaceId()
  const treeId =
    options.categoryTreeId ||
    (await getEbayDefaultCategoryTreeId(accessToken, marketplaceId)).categoryTreeId

  const cacheKey = `ebay:node:${treeId}:${id}`
  const cached = cacheGet<EbayCategoryNodeSummary | null>(cacheKey)
  if (cached !== null && cached !== undefined) return cached

  try {
    const subtree = (await ebayFetch(
      `/commerce/taxonomy/v1/category_tree/${encodeURIComponent(treeId)}/get_category_subtree?category_id=${encodeURIComponent(id)}`,
      accessToken,
      { method: "GET", step: "getCategorySubtree" }
    )) as CategorySubtreeResponse | null
    const node = subtree?.categorySubtreeNode
    const summary = node
      ? {
          categoryId: node.category?.categoryId?.trim() || id,
          categoryName: node.category?.categoryName?.trim() || id,
          categoryPath: node.category?.categoryName?.trim() || id,
          leafCategory: Boolean(node.leafCategoryTreeNode),
          categoryTreeNodeLevel: node.categoryTreeNodeLevel,
          childCount: node.childCategoryTreeNodes?.length,
        }
      : null
    cacheSet(cacheKey, summary, EBAY_TAXONOMY_CACHE_TTL_MS)
    return summary
  } catch {
    cacheSet(cacheKey, null, 60_000)
    return null
  }
}
