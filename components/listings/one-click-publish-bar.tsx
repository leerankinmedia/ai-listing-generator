"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Loader2, Rocket } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { MARKETPLACES } from "@/lib/marketplaces"
import type { Listing, MarketplaceId, OneClickPublishResult } from "@/lib/types"
import { cn } from "@/lib/utils"

const PHASE5_IDS: MarketplaceId[] = ["ebay", "vinted", "whatnot"]

const KNOWN_SPECIFIC_KEYS = new Set([
  "brand",
  "size",
  "color",
  "material",
  "style",
  "pattern",
  "gender",
])

interface PublicConnection {
  marketplaceId: MarketplaceId
  connected: boolean
  accountLabel?: string | null
}

function mapAspectToListingField(aspectName: string): keyof Listing["specifics"] | "extras" {
  const key = aspectName.trim().toLowerCase()
  if (KNOWN_SPECIFIC_KEYS.has(key)) return key as keyof Listing["specifics"]
  if (key === "department") return "gender"
  if (key === "colour") return "color"
  return "extras"
}

export function OneClickPublishBar({
  listing,
  disabled,
  onListingChange,
}: {
  listing: Listing
  disabled?: boolean
  onListingChange?: (listing: Listing) => void
}) {
  const [publishing, setPublishing] = useState(false)
  const [results, setResults] = useState<OneClickPublishResult[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [connections, setConnections] = useState<PublicConnection[]>([])
  const [selected, setSelected] = useState<MarketplaceId[]>([])
  const [loadingConnections, setLoadingConnections] = useState(true)

  const requiredFields = useMemo(() => {
    const fields = (results || []).flatMap((r) => r.requiredFields || [])
    const seen = new Set<string>()
    return fields.filter((f) => {
      const key = f.name.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [results])

  const loadConnections = useCallback(async () => {
    setLoadingConnections(true)
    try {
      const res = await fetch("/api/marketplaces/connections")
      if (!res.ok) {
        setConnections([])
        return
      }
      const json = (await res.json()) as { connections: PublicConnection[] }
      const connected = json.connections.filter((c) =>
        PHASE5_IDS.includes(c.marketplaceId)
      )
      setConnections(connected)

      const preferred = listing.targetMarketplaces.filter((id) =>
        connected.some((c) => c.marketplaceId === id)
      )
      setSelected(
        preferred.length > 0
          ? preferred
          : connected.map((c) => c.marketplaceId)
      )
    } catch {
      setConnections([])
    } finally {
      setLoadingConnections(false)
    }
  }, [listing.targetMarketplaces])

  useEffect(() => {
    void loadConnections()
  }, [loadConnections])

  const connectedIds = useMemo(
    () => new Set(connections.map((c) => c.marketplaceId)),
    [connections]
  )

  function toggle(id: MarketplaceId) {
    if (!connectedIds.has(id)) return
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  function readAspectValue(name: string) {
    const target = mapAspectToListingField(name)
    if (target === "extras") {
      return listing.specifics.extras?.[name] ?? ""
    }
    return (listing.specifics[target] as string | undefined) ?? ""
  }

  function writeAspectValue(name: string, value: string) {
    if (!onListingChange) return
    const target = mapAspectToListingField(name)
    if (target === "extras") {
      onListingChange({
        ...listing,
        specifics: {
          ...listing.specifics,
          extras: {
            ...(listing.specifics.extras || {}),
            [name]: value,
          },
        },
        updatedAt: new Date().toISOString(),
      })
      return
    }
    onListingChange({
      ...listing,
      specifics: {
        ...listing.specifics,
        [target]: value,
      },
      updatedAt: new Date().toISOString(),
    })
  }

  async function handlePublish() {
    setPublishing(true)
    setError(null)
    setResults(null)
    try {
      const response = await fetch("/api/listings/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listing,
          marketplaceIds: selected,
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || "Publish failed")
      setResults(payload.results as OneClickPublishResult[])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publish failed")
    } finally {
      setPublishing(false)
    }
  }

  const available = MARKETPLACES.filter((m) => PHASE5_IDS.includes(m.id))

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card/70 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold">Publish</h2>
          <p className="text-sm text-muted-foreground">
            Select connected marketplaces and publish this listing through their
            live APIs.{" "}
            <Link
              href="/dashboard/connections"
              className="underline underline-offset-2"
            >
              Manage connections
            </Link>
          </p>
        </div>
        <Button
          variant="accent"
          disabled={
            disabled ||
            publishing ||
            selected.length === 0 ||
            loadingConnections
          }
          onClick={() => void handlePublish()}
        >
          {publishing ? <Loader2 className="animate-spin" /> : <Rocket />}
          Publish
          {selected.length > 0 ? ` (${selected.length})` : ""}
        </Button>
      </div>

      {loadingConnections ? (
        <p className="text-sm text-muted-foreground">Checking connections…</p>
      ) : connections.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No marketplaces connected yet. Connect eBay, Vinted, or Whatnot on the{" "}
          <Link
            href="/dashboard/connections"
            className="underline underline-offset-2"
          >
            Connections
          </Link>{" "}
          page first.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {available.map((m) => {
            const isConnected = connectedIds.has(m.id)
            const isSelected = selected.includes(m.id)
            return (
              <button
                key={m.id}
                type="button"
                disabled={!isConnected}
                onClick={() => toggle(m.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
                  !isConnected && "cursor-not-allowed opacity-40",
                  isSelected
                    ? "border-accent/40 bg-accent/15 text-foreground"
                    : "border-border bg-secondary/60 text-muted-foreground hover:text-foreground"
                )}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: m.color }}
                />
                {m.shortName}
                {!isConnected && " (not connected)"}
              </button>
            )
          })}
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {results && (
        <ul className="space-y-2">
          {results.map((result) => (
            <li
              key={result.marketplaceId}
              className={cn(
                "rounded-lg border px-3 py-2 text-sm",
                result.ok
                  ? "border-accent/30 bg-accent/10"
                  : "border-destructive/30 bg-destructive/10"
              )}
            >
              <span className="font-medium capitalize">
                {result.marketplaceId.replaceAll("_", " ")}
              </span>
              <span className="text-muted-foreground"> — {result.message}</span>
            </li>
          ))}
        </ul>
      )}

      {requiredFields.length > 0 && onListingChange && (
        <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <div>
            <h3 className="text-sm font-semibold">Required eBay item specifics</h3>
            <p className="text-xs text-muted-foreground">
              Fill these fields for the selected category, then publish again.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {requiredFields.map((field) => {
              const value = readAspectValue(field.name)
              const options = field.allowedValues || []
              return (
                <div key={field.name} className="space-y-1.5">
                  <Label htmlFor={`ebay-aspect-${field.name}`}>
                    {field.name}
                    <span className="text-destructive"> *</span>
                  </Label>
                  {options.length > 0 ? (
                    <select
                      id={`ebay-aspect-${field.name}`}
                      value={value}
                      disabled={disabled || publishing}
                      onChange={(e) => writeAspectValue(field.name, e.target.value)}
                      className="flex h-10 w-full rounded-lg border border-input bg-card px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value="">Select {field.name}</option>
                      {options.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      id={`ebay-aspect-${field.name}`}
                      value={value}
                      disabled={disabled || publishing}
                      onChange={(e) => writeAspectValue(field.name, e.target.value)}
                      placeholder={`Enter ${field.name}`}
                      required
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}
