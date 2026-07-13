"use client"

import { Check, Copy, Hash, Layers3, Tag } from "lucide-react"
import { useState } from "react"

import { ConfidenceBadge } from "@/components/listing/confidence-badge"
import { MissingInfoWarnings } from "@/components/listing/missing-info-warnings"
import { PricingCard } from "@/components/listing/pricing-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import type { GeneratedListing } from "@/lib/types/listing"
import { cn } from "@/lib/utils"

interface ResultSectionProps {
  listing: GeneratedListing
  costBasis?: number | null
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      aria-label={`Copy ${label}`}
      onClick={async () => {
        await navigator.clipboard.writeText(value)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1400)
      }}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? "Copied" : "Copy"}
    </Button>
  )
}

function titleLengthTone(count: number) {
  if (count >= 70 && count <= 80) return "text-[color-mix(in_oklch,var(--success)_90%,var(--foreground))]"
  if (count >= 60 && count < 70) return "text-[color-mix(in_oklch,var(--warning)_85%,var(--foreground))]"
  return "text-destructive"
}

export function ResultSection({ listing, costBasis }: ResultSectionProps) {
  return (
    <section className="space-y-5 animate-rise" aria-live="polite">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Generated listing
          </p>
          <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Ready to refine & publish
          </h2>
        </div>
        <Badge variant="secondary" className="rounded-md">
          {listing.condition}
        </Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_0.9fr]">
        <div className="space-y-4">
          <article className="rounded-2xl border border-border/70 bg-card/80 p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  eBay title
                </p>
                <h3 className="mt-2 text-lg font-semibold leading-snug text-foreground sm:text-xl">
                  {listing.title}
                </h3>
                <p className={cn("mt-2 text-xs font-medium", titleLengthTone(listing.titleCharacterCount))}>
                  {listing.titleCharacterCount} characters
                  {listing.titleCharacterCount >= 70 && listing.titleCharacterCount <= 80
                    ? " · optimal SEO band"
                    : " · outside 70–80 target"}
                </p>
              </div>
              <CopyButton value={listing.title} label="title" />
            </div>
          </article>

          <article className="rounded-2xl border border-border/70 bg-card/80 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Description
              </p>
              <CopyButton value={listing.description} label="description" />
            </div>
            <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
              {listing.description}
            </div>
          </article>

          <article className="rounded-2xl border border-border/70 bg-card/80 p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <Layers3 className="size-4 text-primary" />
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Category
              </p>
            </div>
            <p className="mt-2 text-base font-semibold text-foreground">{listing.category.primary}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {listing.category.path.join(" › ")}
            </p>
            <Separator className="my-3" />
            <p className="text-xs text-muted-foreground">
              eBay hint: <span className="text-foreground">{listing.category.ebayCategoryHint}</span>
            </p>
          </article>
        </div>

        <div className="space-y-4">
          <ConfidenceBadge
            score={listing.confidenceScore}
            breakdown={listing.confidenceBreakdown}
          />
          <PricingCard pricing={listing.pricing} costBasis={costBasis} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-border/70 bg-card/80 p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <Tag className="size-4 text-primary" />
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Item specifics
            </p>
          </div>
          {listing.itemSpecifics.length ? (
            <dl className="divide-y divide-border/60">
              {listing.itemSpecifics.map((spec) => (
                <div
                  key={`${spec.name}-${spec.value}`}
                  className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-3 py-2.5 text-sm"
                >
                  <dt className="text-muted-foreground">{spec.name}</dt>
                  <dd className="font-medium text-foreground">{spec.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">No specifics generated.</p>
          )}

          <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
            {listing.brand ? <Badge variant="outline">Brand: {listing.brand}</Badge> : null}
            {listing.size ? <Badge variant="outline">Size: {listing.size}</Badge> : null}
            {listing.color ? <Badge variant="outline">Color: {listing.color}</Badge> : null}
            {listing.material ? <Badge variant="outline">Material: {listing.material}</Badge> : null}
          </div>
        </article>

        <article className="rounded-2xl border border-border/70 bg-card/80 p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <Hash className="size-4 text-primary" />
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Keywords
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {listing.keywords.map((keyword) => (
              <span
                key={keyword}
                className="rounded-md border border-border/70 bg-muted/50 px-2.5 py-1 text-xs font-medium text-foreground"
              >
                {keyword}
              </span>
            ))}
          </div>
          <div className="mt-4">
            <CopyButton value={listing.keywords.join(", ")} label="keywords" />
          </div>
        </article>
      </div>

      <article className="rounded-2xl border border-border/70 bg-card/80 p-4 sm:p-5">
        <p className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Missing information warnings
        </p>
        <MissingInfoWarnings warnings={listing.missingInformation} />
      </article>
    </section>
  )
}
