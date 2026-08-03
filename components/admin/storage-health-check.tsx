"use client"

import { useState } from "react"
import { Loader2, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"

type HealthStep = {
  step: string
  ok: boolean
  detail: string
  ms: number
}

type HealthPayload = {
  ok?: boolean
  ready?: boolean
  error?: string | null
  totalMs?: number
  uploadedPath?: string | null
  publicUrl?: string | null
  steps?: HealthStep[]
  config?: {
    hasUrl?: boolean
    hasPublishableKey?: boolean
    hasServiceRoleKey?: boolean
    bucket?: string
    urlHost?: string | null
    missing?: string[]
    reason?: string | null
  }
}

export function StorageHealthCheck() {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<HealthPayload | null>(null)

  async function runCheck() {
    setBusy(true)
    setResult(null)
    try {
      const res = await fetch("/api/admin/storage-health", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      })
      const data = (await res.json()) as HealthPayload
      setResult(data)
    } catch (err) {
      setResult({
        ok: false,
        error: err instanceof Error ? err.message : "Health check request failed.",
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card/70 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Founder tools
          </p>
          <h3 className="mt-1 font-display text-lg font-semibold tracking-tight">
            Storage Health Check
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Tests Supabase env, bucket, upload, public read, and delete before
            running Analyze Photos.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => void runCheck()}
        >
          {busy ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
          {busy ? "Checking…" : "Run check"}
        </Button>
      </div>

      {result && (
        <div
          className={
            result.ok
              ? "rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-3 text-sm"
              : "rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-3 text-sm"
          }
          role="status"
        >
          <p className="font-semibold">
            {result.ok ? "Storage healthy" : "Storage check failed"}
            {typeof result.totalMs === "number"
              ? ` · ${(result.totalMs / 1000).toFixed(2)}s`
              : ""}
          </p>
          {result.error ? (
            <p className="mt-1 text-destructive">{result.error}</p>
          ) : null}
          {result.config ? (
            <ul className="mt-2 space-y-0.5 font-mono text-[11px] text-muted-foreground">
              <li>
                URL: {result.config.hasUrl ? `yes (${result.config.urlHost})` : "missing"}
              </li>
              <li>
                Publishable key:{" "}
                {result.config.hasPublishableKey ? "yes" : "missing"}
              </li>
              <li>
                Service role key:{" "}
                {result.config.hasServiceRoleKey ? "yes" : "missing"}
              </li>
              <li>Bucket: {result.config.bucket || "—"}</li>
              {result.config.missing && result.config.missing.length > 0 ? (
                <li>Missing: {result.config.missing.join(", ")}</li>
              ) : null}
            </ul>
          ) : null}
          {result.steps && result.steps.length > 0 ? (
            <ol className="mt-3 space-y-1.5">
              {result.steps.map((step) => (
                <li key={step.step} className="text-xs">
                  <span className="font-semibold">
                    {step.ok ? "✓" : "✗"} {step.step}
                  </span>
                  <span className="text-muted-foreground">
                    {" "}
                    ({step.ms}ms) — {step.detail}
                  </span>
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      )}
    </div>
  )
}
