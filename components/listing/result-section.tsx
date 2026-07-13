"use client"

import { EBAY_TITLE_MAX, EBAY_TITLE_MIN } from "@/lib/ebay/title"
import { Badge } from "@/components/ui/badge"
import { CopyButton } from "@/components/listing/copy-button"
import { ConfidenceMeter } from "@/components/listing/confidence-meter"
import { WarningsPanel } from "@/components/listing/warnings-panel"
import { PricingCard } from "@/components/listing/pricing-card"
import type { ListingResult } from "@/types/listing"
import { cn } from "@/lib/utils"

export function ResultSection({
  result,
  mode,
  model,
}: {
  result: ListingResult
  mode: "live" | "demo"
  model?: string
}) {
  const titleOk =
    result.title.length >= EBAY_TITLE_MIN && result.title.length <= EBAY_TITLE_MAX
  const specificsEntries = Object.entries(result.itemSpecifics)

  return (
    <div className="animate-rise space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={mode === "live" ? "success" : "warning"}>
          {mode === "live" ? `Live AI${model ? ` · ${model}` : ""}` : "Demo mode"}
        </Badge>
        <Badge tone={result.confidence.overall >= 75 ? "success" : "accent"}>
          {result.confidence.overall}% confidence
        </Badge>
      </div>

      <Panel
        title="eBay title"
        action={<CopyButton value={result.title} />}
        footer={
          <p
            className={cn(
              "text-xs tabular-nums",
              titleOk ? "text-emerald-800" : "text-amber-800",
            )}
          >
            {result.title.length} / {EBAY_TITLE_MAX} characters
            {titleOk
              ? ` · within ${EBAY_TITLE_MIN}–${EBAY_TITLE_MAX} SEO window`
              : ` · target ${EBAY_TITLE_MIN}–${EBAY_TITLE_MAX}`}
          </p>
        }
      >
        <p className="text-lg font-semibold leading-snug tracking-tight text-[var(--foreground)] sm:text-xl">
          {result.title}
        </p>
      </Panel>

      <Panel
        title="Description"
        action={<CopyButton value={result.description} />}
      >
        <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-[var(--foreground)]">
          {result.description}
        </pre>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Category">
          <p className="text-base font-semibold text-[var(--foreground)]">
            {result.category.name}
          </p>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            {result.category.path}
          </p>
          {result.category.ebayCategoryId && (
            <p className="mt-2 text-xs text-[var(--muted-foreground)]">
              eBay category ID: {result.category.ebayCategoryId}
            </p>
          )}
        </Panel>

        <Panel title="Pricing">
          <PricingCard pricing={result.pricing} />
        </Panel>
      </div>

      <Panel
        title="Item specifics"
        action={
          <CopyButton
            value={specificsEntries.map(([k, v]) => `${k}: ${v}`).join("\n")}
            label="Copy all"
          />
        }
      >
        {specificsEntries.length ? (
          <dl className="grid gap-2 sm:grid-cols-2">
            {specificsEntries.map(([key, value]) => (
              <div
                key={key}
                className="flex items-baseline justify-between gap-3 rounded-lg bg-[var(--muted)]/60 px-3 py-2"
              >
                <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  {key}
                </dt>
                <dd className="text-sm font-medium text-[var(--foreground)]">{value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-[var(--muted-foreground)]">No specifics generated.</p>
        )}
      </Panel>

      <Panel
        title="Keywords"
        action={<CopyButton value={result.keywords.join(", ")} />}
      >
        <div className="flex flex-wrap gap-2">
          {result.keywords.map((kw) => (
            <span
              key={kw}
              className="rounded-md bg-[var(--muted)] px-2.5 py-1 text-xs font-medium text-[var(--foreground)]"
            >
              {kw}
            </span>
          ))}
        </div>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Confidence">
          <ConfidenceMeter confidence={result.confidence} />
        </Panel>
        <Panel title="Missing information">
          <WarningsPanel warnings={result.warnings} />
        </Panel>
      </div>
    </div>
  )
}

function Panel({
  title,
  children,
  action,
  footer,
}: {
  title: string
  children: React.ReactNode
  action?: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow-soft)] sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold tracking-tight text-[var(--foreground)]">
          {title}
        </h3>
        {action}
      </div>
      {children}
      {footer && <div className="mt-3 border-t border-[var(--border)] pt-3">{footer}</div>}
    </section>
  )
}
