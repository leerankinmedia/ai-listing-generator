"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { ChevronRight, FolderTree, Loader2, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { applyEbayCategorySelection } from "@/lib/listings/ebay-category"
import type {
  EbayListingCategory,
  EbayListingCondition,
  Listing,
} from "@/lib/types"
import { cn } from "@/lib/utils"

type CategoryNode = {
  categoryId: string
  categoryName: string
  categoryPath: string
  leafCategory: boolean
  childCount?: number
}

type ConditionOption = {
  conditionId: string
  conditionDescription: string
  conditionHelpText?: string
  conditionEnum?: string | null
}

type MappedCondition = {
  conditionId: string
  conditionName: string
  conditionEnum: string
}

interface EbayCategoryPickerProps {
  listing: Listing
  onChange: (listing: Listing) => void
  disabled?: boolean
  /** Review Draft: hide browse/search until Change category. */
  compact?: boolean
}

export function EbayCategoryPicker({
  listing,
  onChange,
  disabled,
  compact,
}: EbayCategoryPickerProps) {
  const [suggestions, setSuggestions] = useState<CategoryNode[]>([])
  const [browseStack, setBrowseStack] = useState<CategoryNode[]>([])
  const [children, setChildren] = useState<CategoryNode[]>([])
  const [treeId, setTreeId] = useState(
    listing.specifics.ebayCategory?.categoryTreeId || ""
  )
  const [marketplaceId, setMarketplaceId] = useState(
    listing.specifics.ebayCategory?.marketplaceId || "EBAY_US"
  )
  const [search, setSearch] = useState("")
  const [searchResults, setSearchResults] = useState<CategoryNode[]>([])
  const [conditions, setConditions] = useState<ConditionOption[]>([])
  const [loadingSuggest, setLoadingSuggest] = useState(false)
  const [loadingBrowse, setLoadingBrowse] = useState(false)
  const [loadingConditions, setLoadingConditions] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [browseOpen, setBrowseOpen] = useState(false)
  const [changeOpen, setChangeOpen] = useState(false)

  const selected = listing.specifics.ebayCategory
  const selectedCondition = listing.specifics.ebayCondition

  const loadSuggestions = useCallback(async () => {
    setLoadingSuggest(true)
    setError(null)
    try {
      const res = await fetch("/api/marketplaces/ebay/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          title: listing.title,
          itemType:
            listing.fieldConfidence?.itemType?.value ||
            listing.specifics.extras?.Type,
          department: listing.specifics.gender,
          brand: listing.specifics.brand,
          keywords: listing.keywords,
          categoryHint: listing.specifics.category,
          limit: 8,
        }),
      })
      const json = (await res.json()) as {
        error?: string
        categoryTreeId?: string
        marketplaceId?: string
        suggestions?: CategoryNode[]
      }
      if (!res.ok) throw new Error(json.error || "Could not load suggestions.")
      if (json.categoryTreeId) setTreeId(json.categoryTreeId)
      if (json.marketplaceId) setMarketplaceId(json.marketplaceId)
      setSuggestions(json.suggestions || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Category suggestions failed.")
    } finally {
      setLoadingSuggest(false)
    }
  }, [listing])

  const loadChildren = useCallback(
    async (parentId?: string) => {
      setLoadingBrowse(true)
      setError(null)
      try {
        const qs = new URLSearchParams({ mode: parentId ? "children" : "roots" })
        if (parentId) qs.set("categoryId", parentId)
        const res = await fetch(
          `/api/marketplaces/ebay/categories?${qs.toString()}`,
          { credentials: "same-origin" }
        )
        const json = (await res.json()) as {
          error?: string
          categoryTreeId?: string
          marketplaceId?: string
          children?: CategoryNode[]
          parent?: CategoryNode | null
        }
        if (!res.ok) throw new Error(json.error || "Could not browse categories.")
        if (json.categoryTreeId) setTreeId(json.categoryTreeId)
        if (json.marketplaceId) setMarketplaceId(json.marketplaceId)
        setChildren(json.children || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : "Browse failed.")
      } finally {
        setLoadingBrowse(false)
      }
    },
    []
  )

  const applyConditionPolicies = useCallback(
    async (category: EbayListingCategory, aiCondition?: string) => {
      setLoadingConditions(true)
      setError(null)
      try {
        const res = await fetch("/api/marketplaces/ebay/condition-policies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            categoryId: category.categoryId,
            categoryPath: category.categoryPath,
            aiCondition:
              aiCondition ||
              listing.specifics.condition ||
              listing.fieldConfidence?.condition?.value,
          }),
        })
        const json = (await res.json()) as {
          error?: string
          conditions?: ConditionOption[]
          mappedCondition?: MappedCondition | null
        }
        if (!res.ok) throw new Error(json.error || "Condition policies failed.")
        setConditions(json.conditions || [])
        const mapped = json.mappedCondition
        const condition: EbayListingCondition | null = mapped
          ? {
              conditionId: mapped.conditionId,
              conditionName: mapped.conditionName,
              conditionEnum: mapped.conditionEnum,
            }
          : null
        onChange(
          applyEbayCategorySelection(listing, category, condition)
        )
      } catch (err) {
        setError(err instanceof Error ? err.message : "Conditions failed.")
        onChange(applyEbayCategorySelection(listing, category, null))
      } finally {
        setLoadingConditions(false)
      }
    },
    [listing, onChange]
  )

  const selectLeaf = useCallback(
    async (node: CategoryNode) => {
      if (!node.leafCategory) {
        setBrowseStack((stack) => [...stack, node])
        await loadChildren(node.categoryId)
        return
      }
      const category: EbayListingCategory = {
        marketplaceId,
        categoryTreeId: treeId || listing.specifics.ebayCategory?.categoryTreeId || "",
        categoryId: node.categoryId,
        categoryName: node.categoryName,
        categoryPath: node.categoryPath || node.categoryName,
        leafCategory: true,
      }
      await applyConditionPolicies(category)
      setBrowseOpen(false)
      setSearch("")
      setSearchResults([])
    },
    [
      applyConditionPolicies,
      listing.specifics.ebayCategory?.categoryTreeId,
      loadChildren,
      marketplaceId,
      treeId,
    ]
  )

  useEffect(() => {
    void loadSuggestions()
  }, [loadSuggestions])

  useEffect(() => {
    // Load conditions when a category is already saved (e.g. after refresh).
    const cat = listing.specifics.ebayCategory
    if (!cat?.categoryId || conditions.length > 0) return
    void (async () => {
      setLoadingConditions(true)
      try {
        const res = await fetch("/api/marketplaces/ebay/condition-policies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            categoryId: cat.categoryId,
            categoryPath: cat.categoryPath,
            aiCondition: listing.specifics.condition,
          }),
        })
        const json = (await res.json()) as {
          conditions?: ConditionOption[]
          mappedCondition?: MappedCondition | null
        }
        if (res.ok) {
          setConditions(json.conditions || [])
          if (!listing.specifics.ebayCondition && json.mappedCondition) {
            onChange(
              applyEbayCategorySelection(listing, cat, {
                conditionId: json.mappedCondition.conditionId,
                conditionName: json.mappedCondition.conditionName,
                conditionEnum: json.mappedCondition.conditionEnum,
              })
            )
          }
        }
      } finally {
        setLoadingConditions(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listing.specifics.ebayCategory?.categoryId])

  async function runSearch() {
    const q = search.trim()
    if (!q) return
    setLoadingSuggest(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/marketplaces/ebay/categories?mode=search&q=${encodeURIComponent(q)}`,
        { credentials: "same-origin" }
      )
      const json = (await res.json()) as {
        error?: string
        suggestions?: CategoryNode[]
      }
      if (!res.ok) throw new Error(json.error || "Search failed.")
      setSearchResults(json.suggestions || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed.")
    } finally {
      setLoadingSuggest(false)
    }
  }

  async function openBrowser() {
    setBrowseOpen(true)
    setBrowseStack([])
    await loadChildren()
  }

  const conditionOptions = useMemo(() => {
    if (conditions.length > 0) return conditions
    return []
  }, [conditions])

  const showCategoryTools = !compact || !selected || changeOpen

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card/40 p-4">
      <div className="space-y-1">
        <Label>Category</Label>
        {!compact && (
          <p className="text-xs text-muted-foreground">
            Pick a leaf category from live eBay US Taxonomy. Conditions and item
            specifics load for that exact category only.
          </p>
        )}
      </div>

      {selected ? (
        <div className="rounded-lg border border-accent/30 bg-accent/10 px-3 py-3 text-sm">
          <p className="font-medium text-foreground">{selected.categoryName}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {selected.categoryPath}
          </p>
          {compact && (
            <button
              type="button"
              disabled={disabled}
              className="mt-2 min-h-11 rounded-lg border border-border bg-background px-3 text-sm font-medium"
              onClick={() => setChangeOpen((open) => !open)}
            >
              {changeOpen ? "Done" : "Change category"}
            </button>
          )}
        </div>
      ) : (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          Select a leaf category before publishing.
        </p>
      )}

      {showCategoryTools && (
      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Suggested for this listing
        </p>
        {loadingSuggest && suggestions.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading suggestions…
          </p>
        ) : (
          <ul className="space-y-1.5">
            {suggestions.map((s) => (
              <li key={s.categoryId}>
                <button
                  type="button"
                  disabled={disabled || loadingConditions}
                  onClick={() => void selectLeaf(s)}
                  className={cn(
                    "w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                    selected?.categoryId === s.categoryId
                      ? "border-accent bg-accent/15"
                      : "border-border hover:border-accent/50 hover:bg-secondary/40"
                  )}
                >
                  <span className="font-medium">{s.categoryName}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {s.categoryPath}
                  </span>
                </button>
              </li>
            ))}
            {suggestions.length === 0 && !loadingSuggest && (
              <li className="text-sm text-muted-foreground">
                No suggestions yet — search or browse below.
              </li>
            )}
          </ul>
        )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            disabled={disabled}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                void runSearch()
              }
            }}
            placeholder="Search all eBay categories…"
            className="pl-9"
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={disabled || !search.trim()}
          onClick={() => void runSearch()}
        >
          Search
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => void openBrowser()}
        >
          <FolderTree className="h-4 w-4" />
          Browse
        </Button>
      </div>

      {searchResults.length > 0 && (
        <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
          {searchResults.map((s) => (
            <li key={`search-${s.categoryId}`}>
              <button
                type="button"
                disabled={disabled}
                className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-secondary/60"
                onClick={() => void selectLeaf(s)}
              >
                <span className="font-medium">{s.categoryName}</span>
                <span className="block text-xs text-muted-foreground">
                  {s.categoryPath}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {browseOpen && (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            <button
              type="button"
              className="underline-offset-2 hover:underline"
              disabled={disabled || loadingBrowse}
              onClick={() => {
                setBrowseStack([])
                void loadChildren()
              }}
            >
              All categories
            </button>
            {browseStack.map((node, index) => (
              <span key={node.categoryId} className="inline-flex items-center gap-1">
                <ChevronRight className="h-3 w-3" />
                <button
                  type="button"
                  className="underline-offset-2 hover:underline"
                  disabled={disabled || loadingBrowse}
                  onClick={() => {
                    const next = browseStack.slice(0, index + 1)
                    setBrowseStack(next)
                    void loadChildren(node.categoryId)
                  }}
                >
                  {node.categoryName}
                </button>
              </span>
            ))}
          </div>
          {loadingBrowse ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
            </p>
          ) : (
            <ul className="max-h-56 space-y-1 overflow-y-auto">
              {children.map((child) => (
                <li key={child.categoryId}>
                  <button
                    type="button"
                    disabled={disabled}
                    className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-secondary/60"
                    onClick={() => void selectLeaf(child)}
                  >
                    <span>{child.categoryName}</span>
                    {!child.leafCategory && (
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                  </button>
                </li>
              ))}
              {children.length === 0 && (
                <li className="text-sm text-muted-foreground">No subcategories.</li>
              )}
            </ul>
          )}
        </div>
      )}
      </div>
      )}

      <div className="space-y-2 border-t border-border pt-3">
        <Label htmlFor="ebay-condition-policy">Condition</Label>
        {loadingConditions ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading valid conditions…
          </p>
        ) : conditionOptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Select a leaf category to load its valid eBay conditions.
          </p>
        ) : (
          <select
            id="ebay-condition-policy"
            disabled={disabled || !selected}
            value={selectedCondition?.conditionId || ""}
            onChange={(e) => {
              const id = e.target.value
              const opt = conditionOptions.find((c) => c.conditionId === id)
              if (!opt || !selected) return
              onChange(
                applyEbayCategorySelection(listing, selected, {
                  conditionId: opt.conditionId,
                  conditionName: opt.conditionDescription,
                  conditionEnum:
                    opt.conditionEnum ||
                    listing.specifics.ebayCondition?.conditionEnum ||
                    "USED_EXCELLENT",
                })
              )
            }}
            className="flex h-11 w-full rounded-lg border border-input bg-card px-3.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="" disabled>
              Choose condition
            </option>
            {conditionOptions.map((c) => (
              <option key={c.conditionId} value={c.conditionId}>
                {c.conditionDescription}
              </option>
            ))}
          </select>
        )}
        {selectedCondition && !compact && (
          <p className="text-[11px] text-muted-foreground">
            Condition ID {selectedCondition.conditionId}
            {selectedCondition.conditionEnum
              ? ` · ${selectedCondition.conditionEnum}`
              : ""}
          </p>
        )}
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {/unauthor/i.test(error)
            ? "Connect eBay to load live categories, conditions, and item specifics."
            : error}
        </p>
      )}
    </div>
  )
}
