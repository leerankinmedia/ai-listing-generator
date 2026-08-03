"use client"

/**
 * Compact eBay category display for the listing page.
 * AI auto-selects the leaf category during Analyze/hydrate.
 * Sellers only see the chosen path + an optional "Change category" list of
 * AI suggestions — never a mandatory taxonomy browser.
 */
import { useCallback, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
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
}

type ConditionOption = {
  conditionId: string
  conditionDescription: string
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
}

export function EbayCategoryPicker({
  listing,
  onChange,
  disabled,
}: EbayCategoryPickerProps) {
  const [suggestions, setSuggestions] = useState<CategoryNode[]>([])
  const [treeId, setTreeId] = useState(
    listing.specifics.ebayCategory?.categoryTreeId || ""
  )
  const [marketplaceId, setMarketplaceId] = useState(
    listing.specifics.ebayCategory?.marketplaceId || "EBAY_US"
  )
  const [conditions, setConditions] = useState<ConditionOption[]>([])
  const [loadingSuggest, setLoadingSuggest] = useState(false)
  const [loadingConditions, setLoadingConditions] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
          limit: 6,
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

  const loadConditions = useCallback(
    async (categoryId: string) => {
      if (!categoryId) {
        setConditions([])
        return
      }
      setLoadingConditions(true)
      try {
        const res = await fetch("/api/marketplaces/ebay/condition-policies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            categoryId,
            aiCondition:
              listing.specifics.condition ||
              listing.fieldConfidence?.condition?.value,
          }),
        })
        const json = (await res.json()) as {
          error?: string
          conditions?: ConditionOption[]
          mappedCondition?: MappedCondition | null
        }
        if (!res.ok) throw new Error(json.error || "Could not load conditions.")
        setConditions(json.conditions || [])
        if (
          json.mappedCondition &&
          (!listing.specifics.ebayCondition?.conditionId ||
            listing.specifics.ebayCondition.conditionId !==
              json.mappedCondition.conditionId)
        ) {
          const cat = listing.specifics.ebayCategory
          if (cat?.categoryId === categoryId) {
            onChange(
              applyEbayCategorySelection(listing, cat, {
                conditionId: json.mappedCondition.conditionId,
                conditionName: json.mappedCondition.conditionName,
                conditionEnum: json.mappedCondition.conditionEnum,
              })
            )
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Condition load failed.")
      } finally {
        setLoadingConditions(false)
      }
    },
    [listing, onChange]
  )

  // Auto-select top AI suggestion when Analyze left no leaf category.
  useEffect(() => {
    if (selected?.categoryId && selected.leafCategory !== false) return
    if (disabled) return
    let cancelled = false
    void (async () => {
      setLoadingSuggest(true)
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
            limit: 6,
          }),
        })
        const json = (await res.json()) as {
          categoryTreeId?: string
          marketplaceId?: string
          suggestions?: CategoryNode[]
        }
        if (cancelled) return
        const top = (json.suggestions || []).find((s) => s.leafCategory !== false)
        if (!top?.categoryId) return
        if (json.categoryTreeId) setTreeId(json.categoryTreeId)
        if (json.marketplaceId) setMarketplaceId(json.marketplaceId)
        setSuggestions(json.suggestions || [])
        const nextCat: EbayListingCategory = {
          marketplaceId: json.marketplaceId || marketplaceId || "EBAY_US",
          categoryTreeId: json.categoryTreeId || treeId || "",
          categoryId: top.categoryId,
          categoryName: top.categoryName,
          categoryPath: top.categoryPath,
          leafCategory: true,
        }
        onChange(applyEbayCategorySelection(listing, nextCat, null))
      } catch {
        /* hydrate/publish also auto-resolve */
      } finally {
        if (!cancelled) setLoadingSuggest(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // Only when missing a leaf — avoid loops on every listing keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.categoryId, selected?.leafCategory, disabled])

  useEffect(() => {
    const id = selected?.categoryId
    if (id) void loadConditions(id)
  }, [selected?.categoryId, loadConditions])

  function selectCategory(node: CategoryNode) {
    if (!node.leafCategory && node.leafCategory !== undefined) {
      setError("Pick a specific category from the suggestions.")
      return
    }
    const next: EbayListingCategory = {
      marketplaceId: marketplaceId || "EBAY_US",
      categoryTreeId: treeId || "",
      categoryId: node.categoryId,
      categoryName: node.categoryName,
      categoryPath: node.categoryPath,
      leafCategory: true,
    }
    onChange(applyEbayCategorySelection(listing, next, null))
    setChangeOpen(false)
    setError(null)
  }

  function selectCondition(conditionId: string) {
    const match = conditions.find((c) => c.conditionId === conditionId)
    if (!match || !selected) return
    const condition: EbayListingCondition = {
      conditionId: match.conditionId,
      conditionName: match.conditionDescription,
      conditionEnum: match.conditionEnum || "USED_EXCELLENT",
    }
    onChange(applyEbayCategorySelection(listing, selected, condition))
  }

  const displayPath =
    selected?.categoryPath ||
    selected?.categoryName ||
    listing.specifics.category ||
    (loadingSuggest ? "Choosing category…" : "Category will be set automatically")

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <Label>Category</Label>
          <p className="text-sm text-foreground">{displayPath}</p>
          {selected?.categoryId ? (
            <p className="text-xs text-muted-foreground">
              {selectedCondition?.conditionName
                ? `Condition: ${selectedCondition.conditionName}`
                : loadingConditions
                  ? "Loading condition…"
                  : null}
            </p>
          ) : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => {
            const next = !changeOpen
            setChangeOpen(next)
            if (next) void loadSuggestions()
          }}
        >
          Change category
        </Button>
      </div>

      {selected?.categoryId && conditions.length > 0 ? (
        <div className="space-y-1.5">
          <Label htmlFor="ebay-condition">Condition</Label>
          <select
            id="ebay-condition"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            disabled={disabled || loadingConditions}
            value={selectedCondition?.conditionId || ""}
            onChange={(e) => selectCondition(e.target.value)}
          >
            <option value="" disabled>
              Select condition
            </option>
            {conditions.map((c) => (
              <option key={c.conditionId} value={c.conditionId}>
                {c.conditionDescription}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {changeOpen ? (
        <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
          <p className="text-xs text-muted-foreground">
            Suggested from your photos and title — pick one if needed.
          </p>
          {loadingSuggest ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading suggestions…
            </p>
          ) : (
            <ul className="space-y-1">
              {suggestions.map((s) => (
                <li key={s.categoryId}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => selectCategory(s)}
                    className={cn(
                      "w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent/15",
                      selected?.categoryId === s.categoryId && "bg-accent/10 font-medium"
                    )}
                  >
                    {s.categoryPath || s.categoryName}
                  </button>
                </li>
              ))}
              {suggestions.length === 0 ? (
                <li className="text-xs text-muted-foreground">
                  No suggestions yet. Add a title or Help the AI note, then try again.
                </li>
              ) : null}
            </ul>
          )}
        </div>
      ) : null}

      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
