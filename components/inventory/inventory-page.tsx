"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import {
  Download,
  ExternalLink,
  Loader2,
  Package,
  RefreshCw,
  Search,
} from "lucide-react"
import { useAuth } from "@/components/auth/auth-provider"
import { usePaidToolsAccess } from "@/components/billing/paid-feature-gate"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  filterInventoryRows,
  listingsToInventoryRows,
  type InventoryRow,
} from "@/lib/inventory/display"
import { fetchListings } from "@/lib/listings/repository"
import { cn } from "@/lib/utils"

type ImportPageResponse = {
  ok?: boolean
  done?: boolean
  nextOffset?: number
  scanned?: number
  activeOnPage?: number
  totalOffers?: number | null
  progressPercent?: number | null
  created?: number
  updated?: number
  processed?: number
  failed?: number
  failures?: Array<{ ebayListingId: string; error: string }>
  warnings?: string[]
  message?: string
  error?: string
  code?: string
}

export function InventoryPage() {
  const { user } = useAuth()
  const searchParams = useSearchParams()
  const { unlocked, status, loading: accessLoading } = usePaidToolsAccess()
  const [rows, setRows] = useState<InventoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [progressLabel, setProgressLabel] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [ebayConnected, setEbayConnected] = useState(false)
  const autoImport = searchParams.get("import") === "1"
  const autoImportStarted = useRef(false)

  const filtered = useMemo(
    () => filterInventoryRows(rows, query),
    [rows, query]
  )

  const reload = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const listings = await fetchListings(user.id)
      setRows(listingsToInventoryRows(listings))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load inventory.")
    } finally {
      setLoading(false)
    }
  }, [user])

  const loadConnection = useCallback(async () => {
    try {
      const res = await fetch("/api/marketplaces/connections", {
        cache: "no-store",
      })
      if (!res.ok) {
        setEbayConnected(false)
        return
      }
      const json = (await res.json()) as {
        connections?: Array<{ marketplaceId: string; connected?: boolean }>
      }
      setEbayConnected(
        Boolean(
          json.connections?.some(
            (c) => c.marketplaceId === "ebay" && c.connected
          )
        )
      )
    } catch {
      setEbayConnected(false)
    }
  }, [])

  const runImport = useCallback(async () => {
    if (importing) return
    setImporting(true)
    setError(null)
    setNotice(null)
    setProgress(0)
    setProgressLabel("Starting eBay import…")

    let offset = 0
    let done = false
    let created = 0
    let updated = 0
    let failed = 0
    let scanned = 0
    const failureMessages: string[] = []

    try {
      while (!done) {
        const res = await fetch("/api/marketplaces/ebay/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ offset }),
        })
        const data = (await res.json()) as ImportPageResponse
        if (!res.ok) {
          throw new Error(data.error || "Import failed.")
        }

        created += data.created || 0
        updated += data.updated || 0
        failed += data.failed || 0
        scanned += data.scanned || 0
        if (data.failures?.length) {
          for (const failure of data.failures.slice(0, 5)) {
            failureMessages.push(
              `${failure.ebayListingId}: ${failure.error}`
            )
          }
        }

        if (typeof data.progressPercent === "number") {
          setProgress(data.progressPercent)
        } else if (data.done) {
          setProgress(100)
        } else {
          setProgress((prev) =>
            prev === null ? 15 : Math.min(95, prev + 10)
          )
        }

        setProgressLabel(
          data.done
            ? data.message || "Import complete."
            : `Scanning eBay offers… ${scanned} scanned · ${created + updated} saved`
        )

        done = Boolean(data.done)
        offset = data.nextOffset ?? offset
        if (!done && data.nextOffset === undefined) {
          throw new Error("Import stalled without a next page offset.")
        }
      }

      setNotice(
        `Imported from eBay: ${created} new, ${updated} updated${
          failed ? `, ${failed} failed` : ""
        }.`
      )
      if (failureMessages.length) {
        setError(failureMessages.join(" · "))
      }
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.")
      setProgress(null)
    } finally {
      setImporting(false)
      setProgressLabel(null)
    }
  }, [importing, reload])

  useEffect(() => {
    void reload()
    void loadConnection()
  }, [reload, loadConnection])

  useEffect(() => {
    if (
      !autoImport ||
      !ebayConnected ||
      !unlocked ||
      importing ||
      loading ||
      accessLoading ||
      autoImportStarted.current
    ) {
      return
    }
    autoImportStarted.current = true
    void runImport()
  }, [
    autoImport,
    ebayConnected,
    unlocked,
    importing,
    loading,
    accessLoading,
    runImport,
  ])

  if (loading || accessLoading) {
    return (
      <p className="text-sm text-muted-foreground animate-fade-in">
        Loading inventory…
      </p>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Inventory
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {rows.length} imported item{rows.length === 1 ? "" : "s"}
            {filtered.length !== rows.length
              ? ` · ${filtered.length} match${filtered.length === 1 ? "" : "es"}`
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={importing}
            onClick={() => void reload()}
          >
            <RefreshCw className={cn(importing && "opacity-50")} />
            Refresh
          </Button>
          {ebayConnected ? (
            <Button
              variant="accent"
              size="sm"
              disabled={importing || !unlocked}
              onClick={() => void runImport()}
            >
              {importing ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Download />
              )}
              Import Listings
            </Button>
          ) : (
            <Link
              href="/dashboard/connections"
              className={cn(buttonVariants({ variant: "accent", size: "sm" }))}
            >
              Connect eBay to import
            </Link>
          )}
        </div>
      </div>

      {!unlocked && (
        <div className="rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm">
          Start a trial or subscribe to import and manage inventory actions.
        </div>
      )}

      {importing && (
        <div className="rounded-xl border border-border bg-card/80 px-4 py-3 space-y-2">
          <div className="flex items-center justify-between gap-3 text-sm">
            <p className="font-medium">Importing active eBay listings…</p>
            <p className="text-muted-foreground">
              {progress === null ? "…" : `${progress}%`}
            </p>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-accent transition-all duration-300"
              style={{ width: `${progress ?? 8}%` }}
            />
          </div>
          {progressLabel && (
            <p className="text-xs text-muted-foreground">{progressLabel}</p>
          )}
        </div>
      )}

      {notice && (
        <p className="rounded-xl border border-accent/25 bg-accent/10 px-4 py-3 text-sm">
          {notice}
        </p>
      )}
      {error && (
        <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search title, SKU, listing ID, category…"
          className="pl-9"
          aria-label="Search inventory"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
          <Package className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 font-medium">
            {rows.length === 0 ? "No imported inventory yet" : "No matches"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {rows.length === 0
              ? ebayConnected
                ? "Import your active eBay listings to populate inventory."
                : "Connect eBay on Connections, then import active listings."
              : "Try a different search."}
          </p>
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <ul className="space-y-3 md:hidden">
            {filtered.map((row) => (
              <li
                key={row.id}
                className="rounded-xl border border-border bg-card/80 p-3"
              >
                <div className="flex gap-3">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-secondary">
                    {row.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={row.photoUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <Package className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={row.href}
                      className="line-clamp-2 font-medium hover:underline"
                    >
                      {row.title}
                    </Link>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {row.marketplace} · {row.status} · Qty {row.quantity}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      SKU {row.sku} · ID {row.listingId}
                    </p>
                    <p className="mt-1 text-sm font-semibold">
                      {row.currency} {row.price.toFixed(2)}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-border bg-secondary/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-3 font-medium">Item</th>
                  <th className="px-3 py-3 font-medium">SKU</th>
                  <th className="px-3 py-3 font-medium">Qty</th>
                  <th className="px-3 py-3 font-medium">Price</th>
                  <th className="px-3 py-3 font-medium">Category</th>
                  <th className="px-3 py-3 font-medium">Marketplace</th>
                  <th className="px-3 py-3 font-medium">Listing ID</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-border/70 last:border-0 hover:bg-secondary/30"
                  >
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-secondary">
                          {row.photoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={row.photoUrl}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : null}
                        </div>
                        <div className="min-w-0">
                          <Link
                            href={row.href}
                            className="line-clamp-2 font-medium hover:underline"
                          >
                            {row.title}
                          </Link>
                          {row.externalUrl && (
                            <a
                              href={row.externalUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                            >
                              View on eBay
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs">{row.sku}</td>
                    <td className="px-3 py-3">{row.quantity}</td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {row.currency} {row.price.toFixed(2)}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {row.category}
                    </td>
                    <td className="px-3 py-3">{row.marketplace}</td>
                    <td className="px-3 py-3 font-mono text-xs">
                      {row.listingId}
                    </td>
                    <td className="px-3 py-3 capitalize">{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
