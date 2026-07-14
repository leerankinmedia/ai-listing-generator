"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Loader2, RefreshCw, Shield } from "lucide-react"
import { useAuth } from "@/components/auth/auth-provider"
import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type UsagePayload = {
  summary: {
    totalGenerations: number
    succeeded: number
    failed: number
    totalEstimatedCostUsd: number
    averageCostPerSuccessfulListing: number
  }
  byUser: Array<{
    userId: string
    generations: number
    estimatedCostUsd: number
    succeeded: number
  }>
  byModel: Array<{
    model: string
    generations: number
    estimatedCostUsd: number
    totalTokens: number
  }>
  recent: Array<{
    id: string
    userId: string
    model: string
    imagesAnalyzed: number
    totalTokens: number
    estimatedCostUsd: number
    status: string
    createdAt: string
    errorMessage: string | null
  }>
}

function money(value: number) {
  return `$${value.toFixed(4)}`
}

export function AiUsageAdminClient() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const [data, setData] = useState<UsagePayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/ai-usage")
      const payload = await res.json()
      if (!res.ok) {
        throw new Error(payload.error || "Forbidden")
      }
      setData(payload as UsagePayload)
    } catch (err) {
      setData(null)
      setError(err instanceof Error ? err.message : "Failed to load usage")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login")
      return
    }
    if (user) void load()
  }, [authLoading, user, router, load])

  if (authLoading || (user && loading && !data && !error)) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading AI usage…
      </p>
    )
  }

  if (error) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
        <p className="text-xs text-muted-foreground">
          This page is private. Your email must be listed in{" "}
          <code className="font-mono">AI_USAGE_ADMIN_EMAILS</code>.
        </p>
        <Link href="/dashboard" className={cn(buttonVariants({ variant: "outline" }))}>
          Back to dashboard
        </Link>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1 inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-accent">
            <Shield className="h-3.5 w-3.5" />
            Admin only
          </p>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            AI usage & cost
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Estimated OpenAI spend from listing generations. Keys never leave the
            server.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw />
          Refresh
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Total generations",
            value: String(data.summary.totalGenerations),
          },
          {
            label: "Total estimated cost",
            value: money(data.summary.totalEstimatedCostUsd),
          },
          {
            label: "Avg cost / successful listing",
            value: money(data.summary.averageCostPerSuccessfulListing),
          },
          {
            label: "Succeeded / failed",
            value: `${data.summary.succeeded} / ${data.summary.failed}`,
          },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-border bg-card/70 px-4 py-3"
          >
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {card.label}
            </p>
            <p className="mt-1 font-display text-xl font-semibold">{card.value}</p>
          </div>
        ))}
      </div>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">Cost by user</h2>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-secondary/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">User ID</th>
                <th className="px-3 py-2 font-medium">Generations</th>
                <th className="px-3 py-2 font-medium">Succeeded</th>
                <th className="px-3 py-2 font-medium">Est. cost</th>
              </tr>
            </thead>
            <tbody>
              {data.byUser.map((row) => (
                <tr key={row.userId} className="border-t border-border">
                  <td className="px-3 py-2 font-mono text-xs">{row.userId}</td>
                  <td className="px-3 py-2">{row.generations}</td>
                  <td className="px-3 py-2">{row.succeeded}</td>
                  <td className="px-3 py-2">{money(row.estimatedCostUsd)}</td>
                </tr>
              ))}
              {data.byUser.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-6 text-center text-muted-foreground"
                  >
                    No usage yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">Cost by model</h2>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-secondary/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Model</th>
                <th className="px-3 py-2 font-medium">Generations</th>
                <th className="px-3 py-2 font-medium">Tokens</th>
                <th className="px-3 py-2 font-medium">Est. cost</th>
              </tr>
            </thead>
            <tbody>
              {data.byModel.map((row) => (
                <tr key={row.model} className="border-t border-border">
                  <td className="px-3 py-2 font-mono text-xs">{row.model}</td>
                  <td className="px-3 py-2">{row.generations}</td>
                  <td className="px-3 py-2">{row.totalTokens.toLocaleString()}</td>
                  <td className="px-3 py-2">{money(row.estimatedCostUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">Recent runs</h2>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-secondary/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Model</th>
                <th className="px-3 py-2 font-medium">Images</th>
                <th className="px-3 py-2 font-medium">Tokens</th>
                <th className="px-3 py-2 font-medium">Cost</th>
              </tr>
            </thead>
            <tbody>
              {data.recent.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {new Date(row.createdAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2">{row.status}</td>
                  <td className="px-3 py-2 font-mono text-xs">{row.model}</td>
                  <td className="px-3 py-2">{row.imagesAnalyzed}</td>
                  <td className="px-3 py-2">{row.totalTokens}</td>
                  <td className="px-3 py-2">{money(row.estimatedCostUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
