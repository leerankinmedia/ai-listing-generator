"use client"

import { useState } from "react"
import {
  AlertTriangle,
  Check,
  Copy,
  Sparkles,
  Tag,
  DollarSign,
  Search,
  Layers,
  Info,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import type { GenerateListingResponse } from "@/lib/types/listing"
import {
  cn,
  confidenceTone,
  formatCurrency,
  isOptimalTitleLength,
} from "@/lib/utils"

type ResultSectionProps = {
  result: GenerateListingResponse
}

function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="shrink-0"
      onClick={async () => {
        await navigator.clipboard.writeText(value)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1500)
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {label ?? (copied ? "Copied" : "Copy")}
    </Button>
  )
}

function ConfidenceBar({
  label,
  score,
}: {
  label: string
  score: number
}) {
  const tone = confidenceTone(score)
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-[var(--muted-foreground)]">{label}</span>
        <span className="font-semibold tabular-nums text-[var(--foreground)]">
          {score}%
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--muted)]">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-700 ease-out",
            tone === "high" && "bg-[var(--success)]",
            tone === "medium" && "bg-[var(--warning)]",
            tone === "low" && "bg-[var(--destructive)]"
          )}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  )
}

export function ResultSection({ result }: ResultSectionProps) {
  const { listing, meta } = result
  const overallTone = confidenceTone(listing.confidence.overall)

  return (
    <section
      className="space-y-5 animate-in-up"
      aria-live="polite"
      aria-label="Generated listing results"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
            Generated listing
          </p>
          <h2 className="mt-1 font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-[var(--foreground)]">
            Ready to refine &amp; list
          </h2>
        </div>
        <div
          className={cn(
            "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold",
            overallTone === "high" && "bg-[var(--success-soft)] text-[var(--success)]",
            overallTone === "medium" && "bg-[var(--warning-soft)] text-[var(--warning-fg)]",
            overallTone === "low" && "bg-[var(--destructive-soft)] text-[var(--destructive)]"
          )}
        >
          <Sparkles className="h-3.5 w-3.5" />
          {listing.confidence.overall}% confidence
        </div>
      </div>

      {/* Title */}
      <article className="result-panel">
        <header className="result-panel-header">
          <div className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-[var(--accent)]" />
            <h3 className="text-sm font-semibold">eBay title</h3>
          </div>
          <CopyButton value={listing.title} />
        </header>
        <p className="text-lg font-semibold leading-snug tracking-tight text-[var(--foreground)] sm:text-xl">
          {listing.title}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span
            className={cn(
              "rounded-md px-2 py-1 font-medium tabular-nums",
              isOptimalTitleLength(listing.title)
                ? "bg-[var(--success-soft)] text-[var(--success)]"
                : "bg-[var(--warning-soft)] text-[var(--warning-fg)]"
            )}
          >
            {meta.titleLength} / 80 chars
            {meta.titleInOptimalRange ? " · optimal 70–80" : " · adjust toward 70–80"}
          </span>
        </div>
        {listing.titleAlternates.length > 0 && (
          <div className="mt-4 space-y-2 border-t border-[var(--border)] pt-4">
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
              Alternates
            </p>
            {listing.titleAlternates.map((alt) => (
              <div
                key={alt}
                className="flex items-start justify-between gap-3 rounded-xl bg-[var(--muted)]/60 px-3 py-2.5"
              >
                <p className="text-sm leading-snug text-[var(--foreground)]">{alt}</p>
                <CopyButton value={alt} label="Copy" />
              </div>
            ))}
          </div>
        )}
      </article>

      {/* Identification + pricing row */}
      <div className="grid gap-4 lg:grid-cols-2">
        <article className="result-panel">
          <header className="result-panel-header">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-[var(--accent)]" />
              <h3 className="text-sm font-semibold">Identified item</h3>
            </div>
          </header>
          <p className="text-sm leading-relaxed text-[var(--foreground)]">
            {listing.identifiedItem.summary}
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            {[
              ["Brand", listing.identifiedItem.brand],
              ["Product", listing.identifiedItem.productName],
              ["Model", listing.identifiedItem.model],
              ["Color", listing.identifiedItem.color],
              ["Size", listing.identifiedItem.size],
              ["Material", listing.identifiedItem.material],
            ]
              .filter(([, v]) => Boolean(v))
              .map(([k, v]) => (
                <div key={k as string}>
                  <dt className="text-xs text-[var(--muted-foreground)]">{k}</dt>
                  <dd className="font-medium">{v}</dd>
                </div>
              ))}
          </dl>
        </article>

        <article className="result-panel">
          <header className="result-panel-header">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-[var(--accent)]" />
              <h3 className="text-sm font-semibold">Pricing recommendation</h3>
            </div>
          </header>
          <div className="flex items-baseline gap-2">
            <span className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight">
              {formatCurrency(
                listing.pricing.suggestedPrice,
                listing.pricing.currency
              )}
            </span>
            <span className="text-sm text-[var(--muted-foreground)]">suggested</span>
          </div>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            Range{" "}
            {formatCurrency(listing.pricing.priceLow, listing.pricing.currency)} –{" "}
            {formatCurrency(listing.pricing.priceHigh, listing.pricing.currency)}
            {listing.pricing.estimatedDaysToSell
              ? ` · ~${listing.pricing.estimatedDaysToSell} days to sell`
              : null}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-[var(--foreground)]">
            {listing.pricing.rationale}
          </p>
        </article>
      </div>

      {/* Description */}
      <article className="result-panel">
        <header className="result-panel-header">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-[var(--accent)]" />
            <h3 className="text-sm font-semibold">Description</h3>
          </div>
          <CopyButton value={listing.description} />
        </header>
        <div className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--foreground)]">
          {listing.description}
        </div>
        <p className="mt-3 text-xs text-[var(--muted-foreground)]">
          Condition label: {listing.condition}
        </p>
      </article>

      {/* Category + keywords */}
      <div className="grid gap-4 lg:grid-cols-2">
        <article className="result-panel">
          <header className="result-panel-header">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-[var(--accent)]" />
              <h3 className="text-sm font-semibold">Category</h3>
            </div>
            <CopyButton value={listing.category.breadcrumb} />
          </header>
          <p className="text-base font-semibold">{listing.category.primary}</p>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            {listing.category.breadcrumb}
          </p>
          {listing.category.ebayCategoryIdHint && (
            <p className="mt-2 text-xs tabular-nums text-[var(--muted-foreground)]">
              Category ID hint: {listing.category.ebayCategoryIdHint}
            </p>
          )}
          {listing.category.alternatives &&
            listing.category.alternatives.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm text-[var(--muted-foreground)]">
                {listing.category.alternatives.map((alt) => (
                  <li key={alt}>· {alt}</li>
                ))}
              </ul>
            )}
        </article>

        <article className="result-panel">
          <header className="result-panel-header">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-[var(--accent)]" />
              <h3 className="text-sm font-semibold">Keywords</h3>
            </div>
            <CopyButton value={listing.keywords.join(", ")} />
          </header>
          <div className="flex flex-wrap gap-2">
            {listing.keywords.map((kw) => (
              <span
                key={kw}
                className="rounded-lg bg-[var(--muted)] px-2.5 py-1 text-xs font-medium text-[var(--foreground)]"
              >
                {kw}
              </span>
            ))}
          </div>
        </article>
      </div>

      {/* Item specifics */}
      <article className="result-panel">
        <header className="result-panel-header">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-[var(--accent)]" />
            <h3 className="text-sm font-semibold">Item specifics</h3>
          </div>
          <CopyButton
            value={Object.entries(listing.itemSpecifics)
              .map(([k, v]) => `${k}: ${v}`)
              .join("\n")}
          />
        </header>
        <div className="overflow-hidden rounded-xl border border-[var(--border)]">
          <table className="w-full text-sm">
            <tbody>
              {Object.entries(listing.itemSpecifics).map(([key, value], i) => (
                <tr
                  key={key}
                  className={cn(
                    "border-b border-[var(--border)] last:border-0",
                    i % 2 === 0 ? "bg-transparent" : "bg-[var(--muted)]/40"
                  )}
                >
                  <th className="w-[40%] px-3 py-2.5 text-left font-medium text-[var(--muted-foreground)]">
                    {key}
                  </th>
                  <td className="px-3 py-2.5 text-[var(--foreground)]">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      {/* Confidence + warnings */}
      <div className="grid gap-4 lg:grid-cols-2">
        <article className="result-panel">
          <header className="result-panel-header">
            <h3 className="text-sm font-semibold">Confidence breakdown</h3>
          </header>
          <div className="space-y-3">
            <ConfidenceBar label="Overall" score={listing.confidence.overall} />
            <ConfidenceBar label="Title" score={listing.confidence.title} />
            <ConfidenceBar label="Category" score={listing.confidence.category} />
            <ConfidenceBar
              label="Item specifics"
              score={listing.confidence.itemSpecifics}
            />
            <ConfidenceBar label="Pricing" score={listing.confidence.pricing} />
            <ConfidenceBar
              label="Description"
              score={listing.confidence.description}
            />
          </div>
        </article>

        <article className="result-panel">
          <header className="result-panel-header">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-[var(--warning-fg)]" />
              <h3 className="text-sm font-semibold">Missing information</h3>
            </div>
          </header>
          {listing.missingInformation.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              No critical gaps detected. Double-check measurements and flaws before
              publishing.
            </p>
          ) : (
            <ul className="space-y-3">
              {listing.missingInformation.map((item) => (
                <li
                  key={`${item.field}-${item.message}`}
                  className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/40 px-3 py-2.5"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                        item.severity === "critical" &&
                          "bg-[var(--destructive-soft)] text-[var(--destructive)]",
                        item.severity === "recommended" &&
                          "bg-[var(--warning-soft)] text-[var(--warning-fg)]",
                        item.severity === "optional" &&
                          "bg-[var(--muted)] text-[var(--muted-foreground)]"
                      )}
                    >
                      {item.severity}
                    </span>
                    <span className="text-xs font-medium text-[var(--muted-foreground)]">
                      {item.field}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm text-[var(--foreground)]">
                    {item.message}
                  </p>
                  {item.suggestion && (
                    <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                      {item.suggestion}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </article>
      </div>

      <p className="text-center text-[11px] text-[var(--muted-foreground)]">
        Model {meta.model} · generated {new Date(meta.generatedAt).toLocaleString()}
      </p>
    </section>
  )
}
