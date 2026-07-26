"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { ArrowLeft, Loader2, ShoppingBag } from "lucide-react"
import type {
  InsightsTimeframe,
  SalesInsightsPayload,
} from "@/lib/insights/types"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

function money(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—"
  return `$${n.toFixed(2)}`
}

function pct(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—"
  return `${Math.round(n * 100)}%`
}

function formatSoldDate(iso: string) {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return "—"
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

const TIMEFRAMES: { id: InsightsTimeframe; label: string }[] = [
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "90d", label: "90 days" },
]

export function SalesInsightsPage() {
  const [timeframe, setTimeframe] = useState<InsightsTimeframe>("30d")
  const [keyword, setKeyword] = useState("")
  const [category, setCategory] = useState("")
  const [condition, setCondition] = useState("")
  const [size, setSize] = useState("")
  const [brand, setBrand] = useState("")
  const [minPrice, setMinPrice] = useState("")
  const [maxPrice, setMaxPrice] = useState("")
  const [applied, setApplied] = useState({
    timeframe: "30d" as InsightsTimeframe,
    keyword: "",
    category: "",
    condition: "",
    size: "",
    brand: "",
    minPrice: "",
    maxPrice: "",
  })
  const [data, setData] = useState<SalesInsightsPayload | null>(null)
  const [loading, setLoading] = useState(true)

  const query = useMemo(() => {
    const params = new URLSearchParams()
    params.set("timeframe", applied.timeframe)
    if (applied.keyword.trim()) params.set("keyword", applied.keyword.trim())
    if (applied.category.trim()) params.set("category", applied.category.trim())
    if (applied.condition.trim()) params.set("condition", applied.condition.trim())
    if (applied.size.trim()) params.set("size", applied.size.trim())
    if (applied.brand.trim()) params.set("brand", applied.brand.trim())
    if (applied.minPrice.trim()) params.set("minPrice", applied.minPrice.trim())
    if (applied.maxPrice.trim()) params.set("maxPrice", applied.maxPrice.trim())
    return params.toString()
  }, [applied])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/insights/sales?${query}`, { cache: "no-store" })
      const json = (await res.json()) as SalesInsightsPayload
      if (!res.ok) {
        setData({
          available: false,
          reason: (json as { error?: string }).error || "Could not load insights.",
          source: null,
          filters: { timeframe: applied.timeframe },
          summary: null,
          recentSales: [],
          sourcing: [],
          filterOptions: { categories: [], conditions: [], brands: [], sizes: [] },
        })
        return
      }
      setData(json)
    } catch {
      setData({
        available: false,
        reason: "Could not load eBay sales data.",
        source: null,
        filters: { timeframe: applied.timeframe },
        summary: null,
        recentSales: [],
        sourcing: [],
        filterOptions: { categories: [], conditions: [], brands: [], sizes: [] },
      })
    } finally {
      setLoading(false)
    }
  }, [applied.timeframe, query])

  useEffect(() => {
    void refresh()
  }, [refresh])

  function applyFilters() {
    setApplied({
      timeframe,
      keyword,
      category,
      condition,
      size,
      brand,
      minPrice,
      maxPrice,
    })
  }

  const options = data?.filterOptions

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <Link
          href="/dashboard"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Overview
        </Link>
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
          Sales Insights
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Metrics are calculated only from your connected eBay sold orders — never
          estimated placeholders.
        </p>
      </div>

      <section className="rounded-xl border border-border bg-card/80 p-3.5 sm:p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Filters
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="timeframe">Timeframe</Label>
            <select
              id="timeframe"
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value as InsightsTimeframe)}
              className="flex h-11 w-full rounded-lg border border-input bg-card px-3.5 text-sm"
            >
              {TIMEFRAMES.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="keyword">Keyword / category</Label>
            <Input
              id="keyword"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Search titles"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="category">Category</Label>
            <select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="flex h-11 w-full rounded-lg border border-input bg-card px-3.5 text-sm"
            >
              <option value="">All</option>
              {(options?.categories || []).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="condition">Condition</Label>
            <select
              id="condition"
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              className="flex h-11 w-full rounded-lg border border-input bg-card px-3.5 text-sm"
            >
              <option value="">All</option>
              {(options?.conditions || []).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="size">Size</Label>
            <select
              id="size"
              value={size}
              onChange={(e) => setSize(e.target.value)}
              className="flex h-11 w-full rounded-lg border border-input bg-card px-3.5 text-sm"
            >
              <option value="">All</option>
              {(options?.sizes || []).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="brand">Brand</Label>
            <select
              id="brand"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              className="flex h-11 w-full rounded-lg border border-input bg-card px-3.5 text-sm"
            >
              <option value="">All</option>
              {(options?.brands || []).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="minPrice">Min price</Label>
            <Input
              id="minPrice"
              inputMode="decimal"
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="maxPrice">Max price</Label>
            <Input
              id="maxPrice"
              inputMode="decimal"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              placeholder="500"
            />
          </div>
        </div>
        <Button
          variant="accent"
          size="sm"
          className="mt-3"
          onClick={applyFilters}
          disabled={loading}
        >
          Apply filters
        </Button>
      </section>

      {loading && (
        <div className="rounded-xl border border-border bg-card/80 px-4 py-10 text-center text-sm text-muted-foreground">
          <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
          Loading real eBay sales data…
        </div>
      )}

      {!loading && data && !data.available && (
        <div className="rounded-xl border border-dashed border-border bg-card/40 px-4 py-10 text-center">
          <ShoppingBag className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 font-medium">Sales Insights unavailable</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.reason || "Connect eBay to load sold-order insights."}
          </p>
          <Link
            href="/dashboard/connections"
            className={cn(buttonVariants({ variant: "outline" }), "mt-4")}
          >
            Manage connections
          </Link>
        </div>
      )}

      {!loading && data?.available && data.summary && (
        <>
          <section className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[
              { label: "Average sold price", value: money(data.summary.averageSoldPrice) },
              { label: "Sell-through rate", value: pct(data.summary.sellThroughRate) },
              {
                label: "Sold price range",
                value:
                  data.summary.soldPriceMin != null &&
                  data.summary.soldPriceMax != null
                    ? `${money(data.summary.soldPriceMin)} – ${money(data.summary.soldPriceMax)}`
                    : "—",
              },
              { label: "Average shipping", value: money(data.summary.averageShipping) },
              { label: "Sold count", value: String(data.summary.soldCount) },
              {
                label: "Active eBay offers",
                value:
                  data.summary.activeListingCount != null
                    ? String(data.summary.activeListingCount)
                    : "—",
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl border border-border bg-card/80 px-3 py-3"
              >
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {stat.label}
                </p>
                <p className="mt-1 font-display text-xl font-semibold">{stat.value}</p>
              </div>
            ))}
          </section>

          <section className="space-y-2">
            <h2 className="font-display text-lg font-semibold">Recent sold items</h2>
            {data.recentSales.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                {data.reason || "No sold items matched these filters."}
              </p>
            ) : (
              <ul className="space-y-2">
                {data.recentSales.map((sale) => (
                  <li
                    key={sale.id}
                    className="rounded-xl border border-border bg-card/80 p-3"
                  >
                    <p className="text-sm font-semibold">{sale.title}</p>
                    <p className="mt-1 text-sm">
                      {money(sale.soldPrice)}
                      {sale.shippingCost != null
                        ? ` · ship ${money(sale.shippingCost)}`
                        : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatSoldDate(sale.soldAt)} · {sale.marketplace}
                      {sale.category ? ` · ${sale.category}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section id="what-to-source" className="scroll-mt-24 space-y-3">
            <div>
              <h2 className="font-display text-lg font-semibold">What to Source</h2>
              <p className="text-sm text-muted-foreground">
                High-performing used-item categories from your eBay sales — not
                fabricated market averages.
              </p>
            </div>
            {data.sourcing.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                No sourcing categories yet. Sell more on eBay to unlock tips.
              </p>
            ) : (
              <ul className="space-y-3">
                {data.sourcing.map((row) => (
                  <li
                    key={row.id}
                    className="rounded-xl border border-border bg-card/80 p-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="font-display text-lg font-semibold">
                          {row.categoryName}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {row.recentSoldCount} sold · avg {money(row.averageSoldPrice)} ·{" "}
                          {pct(row.sellThroughRate)} sell-through · avg ship{" "}
                          {money(row.averageShipping)}
                        </p>
                        <p className="mt-2 text-sm">{row.tip}</p>
                      </div>
                      <Link
                        href={`/dashboard/listings/new?sourceCategory=${encodeURIComponent(row.categoryName)}`}
                        className={cn(
                          buttonVariants({ variant: "accent", size: "sm" }),
                          "shrink-0 self-start"
                        )}
                      >
                        Start listing
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">
              Looking for BOLO research guides?{" "}
              <Link href="/dashboard/bolo" className="underline hover:text-foreground">
                Open the BOLO page
              </Link>
              .
            </p>
          </section>
        </>
      )}
    </div>
  )
}
