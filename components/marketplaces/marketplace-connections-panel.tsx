"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import {
  CheckCircle2,
  Download,
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

  /**
   * Use the same fetch()/cookie jar as Billing (`/api/billing/status`).
   * OAuth start returns JSON `{ authorizeUrl }` for credentialed fetch so we
   * never depend on reading a cross-origin 302 Location (HTTP status 0).
   */
  async function startOAuth(marketplaceId: MarketplaceId) {
    setBusyId(marketplaceId)
    setError(null)
    try {
      const oauthPath = `/api/marketplaces/${marketplaceId}/oauth/start?format=json`
      let res: Response
      try {
        res = await fetch(oauthPath, {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
          redirect: "manual",
          headers: {
            "Cache-Control": "no-store",
            Accept: "application/json",
          },
        })
      } catch (err) {
        throw new Error(
          JSON.stringify(
            {
              failingEndpoint: oauthPath,
              httpStatus: 0,
              responseBody: null,
              redirectUrl: null,
              serverError:
                err instanceof Error ? err.message : "Failed to fetch",
            },
            null,
            2
          )
        )
      }

      const locationHeader = res.headers.get("Location")
      const rawText = await res.text()
      let body: Record<string, unknown> | null = null
      try {
        body = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : null
      } catch {
        body = rawText ? { raw: rawText.slice(0, 500) } : null
      }

      const fail = (serverError: string | null) => {
        throw new Error(
          JSON.stringify(
            {
              failingEndpoint: oauthPath,
              httpStatus: res.status,
              responseBody: body,
              redirectUrl:
                locationHeader ||
                (typeof body?.authorizeUrl === "string"
                  ? body.authorizeUrl
                  : typeof body?.redirectUrl === "string"
                    ? body.redirectUrl
                    : null),
              responseType: res.type,
              serverError,
            },
            null,
            2
          )
        )
      }

      // Opaque cross-origin redirect (legacy 302-to-eBay path).
      if (res.status === 0 || res.type === "opaqueredirect") {
        fail(
          "Opaque redirect (HTTP 0). OAuth start must return JSON authorizeUrl for fetch clients."
        )
      }

      if (!res.ok) {
        fail(
          (body?.error as string | undefined) ||
            (body?.code as string | undefined) ||
            `OAuth start failed (HTTP ${res.status})`
        )
      }

      const authorizeUrl =
        (typeof body?.authorizeUrl === "string" && body.authorizeUrl) ||
        (typeof body?.redirectUrl === "string" && body.redirectUrl) ||
        locationHeader

      if (!authorizeUrl) {
        fail("OAuth start returned 200 without authorizeUrl/Location.")
        return
      }

      window.location.assign(authorizeUrl)
    } catch (err) {
      setBusyId(null)
      setError(
        err instanceof Error ? err.message : "Could not start OAuth connect."
      )
    }
  }

  /** Fetch helper that never swallows network/redirect failures. */
  async function fetchJsonDetailed(url: string): Promise<{
    url: string
    ok: boolean
    status: number
    body: unknown
    error?: string
  }> {
    try {
      const res = await fetch(url, {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
        redirect: "manual",
        headers: { "Cache-Control": "no-store" },
      })

      if (
        res.status >= 301 &&
        res.status <= 308
      ) {
        return {
          url,
          ok: false,
          status: res.status,
          body: null,
          error: `Unexpected redirect (${res.status}) to ${res.headers.get("Location") || "(no Location)"}`,
        }
      }

      const text = await res.text()
      let body: unknown = text
      try {
        body = text ? JSON.parse(text) : null
      } catch {
        body = { raw: text.slice(0, 500) }
      }

      return {
        url,
        ok: res.ok,
        status: res.status,
        body,
      }
    } catch (err) {
      return {
        url,
        ok: false,
        status: 0,
        body: null,
        error: err instanceof Error ? err.message : "Failed to fetch",
      }
    }
  }

  /** Same-cookie-jar comparison Billing vs OAuth (for Android / no DevTools). */
  async function compareBillingAndOAuthSession() {
    setError(null)
    setNotice(null)
    try {
      // Use dedicated compare endpoint (never redirects) + billing status.
      const billing = await fetchJsonDetailed("/api/billing/status")
      const oauth = await fetchJsonDetailed(
        "/api/marketplaces/ebay/oauth/session-compare"
      )

      if (!billing.ok || !oauth.ok) {
        const failing = !billing.ok ? billing : oauth
        const bodyObj =
          failing.body && typeof failing.body === "object"
            ? (failing.body as Record<string, unknown>)
            : { raw: failing.body }
        throw new Error(
          JSON.stringify(
            {
              failingEndpoint: failing.url,
              httpStatus: failing.status,
              fetchError: failing.error ?? null,
              responseBody: bodyObj,
              serverError:
                (bodyObj.error as string | undefined) ||
                (bodyObj.code as string | undefined) ||
                failing.error ||
                null,
              billingProbe: {
                url: billing.url,
                status: billing.status,
                ok: billing.ok,
                error: billing.error ?? null,
              },
              oauthProbe: {
                url: oauth.url,
                status: oauth.status,
                ok: oauth.ok,
                error: oauth.error ?? null,
              },
            },
            null,
            2
          )
        )
      }

      const billingJson = billing.body as Record<string, unknown>
      const oauthJson = oauth.body as Record<string, unknown>
      const billingUser = billingJson.authenticatedUser as
        | { id: string; email: string | null }
        | undefined

      setNotice(
        JSON.stringify(
          {
            billingAuthenticatedUser: billingUser ?? null,
            billingOwnerOverride: billingJson.ownerOverride ?? null,
            billingStatus: billingJson.status ?? null,
            oauthAuthenticatedEmail: oauthJson.authenticatedEmail ?? null,
            oauthAuthenticatedUserId: oauthJson.authenticatedUserId ?? null,
            oauthIsOwner: oauthJson.isOwner ?? null,
            oauthAuthSource: oauthJson.authSource ?? null,
            oauthEndpoint: oauthJson.endpoint ?? null,
            sessionsMatch:
              (billingUser?.email || null) ===
              (oauthJson.authenticatedEmail || null),
          },
          null,
          2
        )
      )
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Session compare failed."
      )
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
          Connect seller accounts securely. Credentials are stored in your
          ListWise account (Supabase) as the source of truth. Publish only works
          for connected marketplaces with real API credentials — never simulated
          success.
        </p>
      </header>

      {!loading && status && !status.connectionsSecretConfigured && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Set <code className="font-mono text-xs">CONNECTIONS_SECRET</code> (min
          16 chars) in the server environment before connecting accounts.
        </div>
      )}

      {notice && (
        <div className="flex items-start gap-2 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <pre className="max-w-full overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs">
            {notice}
          </pre>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void compareBillingAndOAuthSession()}
        >
          Compare Billing vs OAuth session
        </Button>
      </div>

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
                      <>
                        {adapter.id === "ebay" && (
                          <Link
                            href="/dashboard/inventory?import=1"
                            className={cn(
                              buttonVariants({ variant: "accent", size: "sm" })
                            )}
                          >
                            <Download />
                            Import Listings
                          </Link>
                        )}
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
                      </>
                    ) : adapter.authMethod === "oauth" ? (
                      <Button
                        variant="accent"
                        size="sm"
                        disabled={
                          busy ||
                          !isLive ||
                          !status?.connectionsSecretConfigured
                        }
                        onClick={() => void startOAuth(adapter.id)}
                      >
                        {busy ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <Plug />
                        )}
                        Connect with OAuth
                      </Button>
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
        After connecting eBay, use{" "}
        <Link
          href="/dashboard/inventory"
          className="underline underline-offset-2"
        >
          Import Listings
        </Link>{" "}
        to pull active inventory, or open a listing and{" "}
        <Link href="/dashboard/listings" className="underline underline-offset-2">
          Publish
        </Link>{" "}
        to push to marketplaces.
      </p>
    </div>
  )
}
