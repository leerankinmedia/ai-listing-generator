"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import {
  CheckCircle2,
  Link2,
  Link2Off,
  Loader2,
  Plug,
  Unplug,
} from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { PasswordInput } from "@/components/auth/password-input"
import { MARKETPLACES } from "@/lib/marketplaces"
import type { MarketplaceId } from "@/lib/types"
import { cn } from "@/lib/utils"

type AdapterStatus = "live" | "requires_credentials" | "coming_soon"

interface AdapterMeta {
  id: MarketplaceId
  name: string
  status: AdapterStatus
  authMethod: "oauth" | "api_token" | null
  capabilities: string[]
}

interface PublicConnection {
  marketplaceId: MarketplaceId
  authMethod: string
  accountLabel: string | null
  connectedAt: string
  updatedAt: string
  expiresAt: string | null
  connected: boolean
}

interface StatusPayload {
  connectionsSecretConfigured: boolean
  ebayConfigured: boolean
  vintedConfigured: boolean
  whatnotConfigured: boolean
  adapters: AdapterMeta[]
}

export function MarketplaceConnectionsPanel() {
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<StatusPayload | null>(null)
  const [connections, setConnections] = useState<PublicConnection[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<MarketplaceId | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [vintedToken, setVintedToken] = useState("")
  const [showVintedForm, setShowVintedForm] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [statusRes, connRes] = await Promise.all([
        fetch("/api/marketplaces/status"),
        fetch("/api/marketplaces/connections"),
      ])
      const statusJson = (await statusRes.json()) as StatusPayload
      setStatus(statusJson)

      if (connRes.ok) {
        const connJson = (await connRes.json()) as {
          connections: PublicConnection[]
        }
        setConnections(connJson.connections)
      } else {
        const connJson = (await connRes.json()) as { error?: string }
        setConnections([])
        if (connRes.status !== 503) {
          setError(connJson.error || "Failed to load connections.")
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load connections.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const message = searchParams.get("message")
    for (const id of ["ebay", "whatnot", "vinted"] as const) {
      const value = searchParams.get(id)
      if (value === "connected") {
        setNotice(`${id === "ebay" ? "eBay" : id === "whatnot" ? "Whatnot" : "Vinted"} connected.`)
      } else if (value === "error") {
        setError(message || `Failed to connect ${id}.`)
      }
    }
  }, [searchParams])

  const connectedMap = useMemo(() => {
    const map = new Map<MarketplaceId, PublicConnection>()
    for (const c of connections) map.set(c.marketplaceId, c)
    return map
  }, [connections])

  async function disconnect(marketplaceId: MarketplaceId) {
    setBusyId(marketplaceId)
    setError(null)
    try {
      const res = await fetch(
        `/api/marketplaces/connections?marketplaceId=${marketplaceId}`,
        { method: "DELETE" }
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Disconnect failed.")
      setNotice(`Disconnected ${marketplaceId}.`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Disconnect failed.")
    } finally {
      setBusyId(null)
    }
  }

  async function connectVinted() {
    setBusyId("vinted")
    setError(null)
    try {
      const res = await fetch("/api/marketplaces/vinted/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: vintedToken }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Vinted connect failed.")
      setVintedToken("")
      setShowVintedForm(false)
      setNotice("Vinted connected.")
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Vinted connect failed.")
    } finally {
      setBusyId(null)
    }
  }

  const adapters = status?.adapters ?? []

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Integrations
        </p>
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Marketplace Connections
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
          Connect seller accounts securely. Tokens are encrypted at rest in
          httpOnly cookies. Publish only works for connected marketplaces with
          real API credentials — never simulated success.
        </p>
      </header>

      {!status?.connectionsSecretConfigured && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Set <code className="font-mono text-xs">CONNECTIONS_SECRET</code> (min
          16 chars) in the server environment before connecting accounts.
        </div>
      )}

      {notice && (
        <div className="flex items-start gap-2 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <span>{notice}</span>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading marketplace status…
        </div>
      ) : (
        <ul className="space-y-4">
          {adapters.map((adapter) => {
            const def = MARKETPLACES.find((m) => m.id === adapter.id)
            const connected = connectedMap.get(adapter.id)
            const isLive = adapter.status === "live"
            const comingSoon = adapter.status === "coming_soon"
            const busy = busyId === adapter.id

            return (
              <li
                key={adapter.id}
                className="border-b border-border py-5 first:pt-0 last:border-0"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: def?.color ?? "#888" }}
                      />
                      <h2 className="font-display text-xl font-semibold">
                        {adapter.name}
                      </h2>
                      <span
                        className={cn(
                          "text-[11px] font-medium uppercase tracking-wider",
                          comingSoon
                            ? "text-muted-foreground"
                            : isLive
                              ? "text-accent"
                              : "text-amber-600 dark:text-amber-400"
                        )}
                      >
                        {comingSoon
                          ? "Coming soon"
                          : connected
                            ? "Connected"
                            : isLive
                              ? "Ready"
                              : "Needs credentials"}
                      </span>
                    </div>
                    <p className="max-w-xl text-sm text-muted-foreground">
                      {def?.description}
                    </p>
                    {connected && (
                      <p className="text-xs text-muted-foreground">
                        {connected.accountLabel || "Account connected"} · since{" "}
                        {new Date(connected.connectedAt).toLocaleString()}
                        {connected.expiresAt
                          ? ` · token expires ${new Date(connected.expiresAt).toLocaleString()}`
                          : ""}
                      </p>
                    )}
                    {adapter.status === "requires_credentials" && !connected && (
                      <p className="text-xs text-muted-foreground">
                        Server app credentials are missing for this marketplace.
                      </p>
                    )}
                    {adapter.id === "whatnot" && (
                      <p className="text-xs text-muted-foreground">
                        Whatnot Seller API is Developer Preview and currently
                        closed to new applicants per official docs.
                      </p>
                    )}
                    {adapter.id === "vinted" && (
                      <p className="text-xs text-muted-foreground">
                        Requires a Vinted Pro account allowlisted for
                        Integrations (official partner approval).
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {comingSoon ? (
                      <span className="text-xs text-muted-foreground">
                        Adapter slot reserved
                      </span>
                    ) : connected ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => void disconnect(adapter.id)}
                      >
                        {busy ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <Unplug />
                        )}
                        Disconnect
                      </Button>
                    ) : adapter.authMethod === "oauth" ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <a
                          href={`/api/marketplaces/${adapter.id}/oauth/start`}
                          className={cn(
                            buttonVariants({ variant: "accent", size: "sm" }),
                            (!isLive || !status?.connectionsSecretConfigured) &&
                              "pointer-events-none opacity-50"
                          )}
                          aria-disabled={
                            !isLive || !status?.connectionsSecretConfigured
                          }
                        >
                          <Plug />
                          Connect with OAuth
                        </a>
                        {adapter.id === "ebay" && (
                          <a
                            href="/api/marketplaces/ebay/oauth/start?debug=1"
                            className={cn(
                              buttonVariants({ variant: "outline", size: "sm" }),
                              (!isLive ||
                                !status?.connectionsSecretConfigured) &&
                                "pointer-events-none opacity-50"
                            )}
                          >
                            Inspect OAuth (temp)
                          </a>
                        )}
                      </div>
                    ) : adapter.authMethod === "api_token" ? (
                      <Button
                        variant="accent"
                        size="sm"
                        disabled={!status?.connectionsSecretConfigured}
                        onClick={() => setShowVintedForm((v) => !v)}
                      >
                        <Link2 />
                        Connect with token
                      </Button>
                    ) : null}
                  </div>
                </div>

                {adapter.id === "vinted" && showVintedForm && !connected && (
                  <div className="mt-4 space-y-3 border-t border-border pt-4">
                    <label className="block space-y-1.5 text-sm">
                      <span className="font-medium">Vinted Pro token</span>
                      <span className="block text-xs text-muted-foreground">
                        Paste <code className="font-mono">accessKey,signingKey</code>{" "}
                        from the Vinted Pro Integrations portal.
                      </span>
                      <PasswordInput
                        autoComplete="off"
                        value={vintedToken}
                        onChange={(e) => setVintedToken(e.target.value)}
                        className="font-mono"
                        placeholder="accessKey,signingKey"
                      />
                    </label>
                    <div className="flex gap-2">
                      <Button
                        variant="accent"
                        size="sm"
                        disabled={busy || !vintedToken.trim()}
                        onClick={() => void connectVinted()}
                      >
                        {busy ? <Loader2 className="animate-spin" /> : <Link2 />}
                        Save connection
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setShowVintedForm(false)
                          setVintedToken("")
                        }}
                      >
                        <Link2Off />
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <p className="text-sm text-muted-foreground">
        After connecting, open a listing and use{" "}
        <Link href="/dashboard/listings" className="underline underline-offset-2">
          Publish
        </Link>{" "}
        to push to one or more marketplaces.
      </p>
    </div>
  )
}
