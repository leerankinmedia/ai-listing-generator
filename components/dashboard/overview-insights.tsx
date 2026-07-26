"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { Loader2, ShoppingBag, Sparkles } from "lucide-react"
import type { SalesInsightsPayload } from "@/lib/insights/types"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

function money(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—"
  return `$${n.toFixed(0)}`
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
  })
}

/** Overview Sales Insights + top sourcing previews (single eBay fetch). */
export function OverviewInsights() {
  const [data, setData] = useState<SalesInsightsPayload | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/insights/sales?timeframe=30d", {
        cache: "no-store",
      })
      const json = (await res.json()) as SalesInsightsPayload
      if (!res.ok) {
        setData({
          available: false,
          reason:
            (json as { error?: string }).error ||
            "Could not load eBay sales data.",
          source: null,
          filters: { timeframe: "30d" },
          summary: null,
          recentSales: [],
          sourcing: [],
          filterOptions: {
            categories: [],
            conditions: [],
            brands: [],
            sizes: [],
          },
        })
        return
      }
      setData(json)
    } catch {
      setData({
        available: false,
        reason: "Could not load eBay sales data.",
        source: null,
        filters: { timeframe: "30d" },
        summary: null,
        recentSales: [],
        sourcing: [],
        filterOptions: {
          categories: [],
          conditions: [],
          brands: [],
          sizes: [],
        },
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const topSourcing = data?.available ? data.sourcing.slice(0, 3) : []

  return (
    <>
      <section id="sales" className="animate-rise-delay-2 scroll-mt-24 space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold">Sales Insights</h2>
            <p className="text-sm text-muted-foreground">
              From your connected eBay sold orders.
            </p>
          </div>
          <Link
            href="/dashboard/insights"
            className="text-sm font-medium text-muted-foreground hover:text-accent"
          >
            View all
          </Link>
        </div>

        {loading && (
          <div className="rounded-xl border border-border bg-card/80 px-4 py-8 text-center text-sm text-muted-foreground">
            <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
            Loading eBay sales data…
          </div>
        )}

        {!loading && data && !data.available && (
          <div className="rounded-xl border border-dashed border-border bg-card/40 px-4 py-8 text-center">
            <ShoppingBag className="mx-auto h-7 w-7 text-muted-foreground" />
            <p className="mt-3 font-medium">Sales Insights unavailable</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {data.reason || "Connect eBay to load real sold-order insights."}
            </p>
            <Link
              href="/dashboard/connections"
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "mt-4"
              )}
            >
              Manage connections
            </Link>
          </div>
        )}

        {!loading && data?.available && data.summary && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {[
                {
                  label: "Avg sold",
                  value: money(data.summary.averageSoldPrice),
                },
                {
                  label: "Sell-through",
                  value: pct(data.summary.sellThroughRate),
                },
                {
                  label: "Price range",
                  value:
                    data.summary.soldPriceMin != null &&
                    data.summary.soldPriceMax != null
                      ? `${money(data.summary.soldPriceMin)}–${money(data.summary.soldPriceMax)}`
                      : "—",
                },
                {
                  label: "Avg ship",
                  value: money(data.summary.averageShipping),
                },
                { label: "Sold", value: String(data.summary.soldCount) },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-xl border border-border bg-card/80 px-3 py-2.5"
                >
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    {stat.label}
                  </p>
                  <p className="mt-1 font-display text-lg font-semibold">
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>

            {data.recentSales.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-card/40 px-4 py-6 text-center text-sm text-muted-foreground">
                {data.reason || "No recent eBay sold items in this timeframe."}
              </div>
            ) : (
              <ul className="space-y-2">
                {data.recentSales.map((sale) => (
                  <li
                    key={sale.id}
                    className="flex items-center gap-3 rounded-xl border border-border bg-card/80 p-2.5"
                  >
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-secondary">
                      <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 text-sm font-semibold">
                        {sale.title}
                      </p>
                      <p className="text-sm font-medium">
                        ${sale.soldPrice.toFixed(2)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatSoldDate(sale.soldAt)} · {sale.marketplace}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <section id="sourcing" className="scroll-mt-24 space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold">
              Top sourcing opportunities
            </h2>
            <p className="text-sm text-muted-foreground">
              Based on your real eBay sold orders.
            </p>
          </div>
          <Link
            href="/dashboard/insights#what-to-source"
            className="text-sm font-medium text-muted-foreground hover:text-accent"
          >
            View all
          </Link>
        </div>

        {loading && (
          <div className="rounded-xl border border-border bg-card/80 px-4 py-6 text-center text-sm text-muted-foreground">
            <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
            Loading sourcing data…
          </div>
        )}

        {!loading && (!data?.available || topSourcing.length === 0) && (
          <div className="rounded-xl border border-dashed border-border bg-card/40 px-4 py-6 text-center">
            <Sparkles className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">Sourcing data unavailable</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {data?.reason ||
                "Connect eBay and record sold orders to see category opportunities."}
            </p>
          </div>
        )}

        {!loading && topSourcing.length > 0 && (
          <ul className="space-y-2">
            {topSourcing.map((row) => (
              <li
                key={row.id}
                className="rounded-xl border border-border bg-card/80 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{row.categoryName}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {row.recentSoldCount} sold · avg{" "}
                      {money(row.averageSoldPrice)} · {pct(row.sellThroughRate)}{" "}
                      sell-through
                    </p>
                  </div>
                  <Link
                    href={`/dashboard/listings/new?sourceCategory=${encodeURIComponent(row.categoryName)}`}
                    className={cn(
                      buttonVariants({ variant: "accent", size: "sm" }),
                      "shrink-0"
                    )}
                  >
                    Start listing
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
