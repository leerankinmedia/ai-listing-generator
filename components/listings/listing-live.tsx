"use client"

import Link from "next/link"
import { Check, ExternalLink } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import type { EbayLiveSummary } from "@/lib/listings/review-draft"
import { cn } from "@/lib/utils"

export function ListingLiveSuccess({
  summary,
  onCreateAnother,
}: {
  summary: EbayLiveSummary
  onCreateAnother?: () => void
}) {
  const priceLabel =
    Number.isFinite(summary.price) && summary.price > 0
      ? `$${summary.price.toFixed(2)}`
      : "—"

  return (
    <div className="mx-auto flex min-h-[min(70vh,560px)] max-w-md flex-col items-center justify-center px-4 py-10 text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-accent/15 text-accent">
        <Check className="h-8 w-8" aria-hidden />
      </div>
      <h1 className="font-display text-3xl font-semibold tracking-tight">
        Your listing is live
      </h1>
      <p className="mt-4 text-base font-medium leading-snug text-foreground">
        {summary.title || "Untitled listing"}
      </p>
      <p className="mt-2 text-lg font-semibold">{priceLabel}</p>
      {summary.listingId ? (
        <p className="mt-2 text-sm text-muted-foreground">
          eBay listing ID {summary.listingId}
        </p>
      ) : null}
      <div className="mt-8 flex w-full flex-col gap-3">
        {summary.url ? (
          <a
            href={summary.url}
            target="_blank"
            rel="noreferrer"
            className={cn(buttonVariants({ variant: "accent", size: "lg" }), "w-full")}
          >
            <ExternalLink className="h-4 w-4" />
            View on eBay
          </a>
        ) : null}
        <Link
          href="/dashboard/listings/new"
          className={cn(buttonVariants({ variant: "secondary", size: "lg" }), "w-full")}
          onClick={onCreateAnother}
        >
          Create another listing
        </Link>
        <Link
          href="/dashboard/listings"
          className={cn(buttonVariants({ variant: "ghost" }), "w-full")}
        >
          All listings
        </Link>
      </div>
    </div>
  )
}
