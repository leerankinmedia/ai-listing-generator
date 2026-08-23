"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Plus, Package } from "lucide-react"
import { useAuth } from "@/components/auth/auth-provider"
import { usePaidToolsAccess } from "@/components/billing/paid-feature-gate"
import { buttonVariants } from "@/components/ui/button"
import { fetchListings } from "@/lib/listings/repository"
import type { Listing } from "@/lib/types"
import { cn } from "@/lib/utils"

export function ListingsGrid() {
  const { user } = useAuth()
  const { unlocked, status, loading: accessLoading } = usePaidToolsAccess()
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const subscribeCta =
    status?.trialEligible === false || status?.status === "expired"
      ? "Subscribe"
      : "Start free trial"
  const createHref = unlocked ? "/dashboard/listings/new" : "/checkout"

  useEffect(() => {
    if (!user) return
    let mounted = true
    void (async () => {
      try {
        const rows = await fetchListings(user.id)
        if (mounted) setListings(rows)
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [user])

  if (loading || accessLoading) {
    return (
      <p className="text-sm text-muted-foreground animate-fade-in">
        Loading listings…
      </p>
    )
  }

  return (
    <div className="space-y-6">
      {!unlocked && (
        <div className="flex flex-col gap-3 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">
            {status?.status === "expired"
              ? "Your trial has expired. You can view existing listings in read-only mode."
              : "Subscribe to create new AI listings and edit or publish."}
          </p>
          <Link
            href="/checkout"
            className={cn(buttonVariants({ variant: "accent", size: "sm" }), "shrink-0")}
          >
            {subscribeCta}
          </Link>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Listings
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {listings.length} saved listing{listings.length === 1 ? "" : "s"}
            {!unlocked ? " · read-only" : ""}
          </p>
        </div>
        <Link
          href={createHref}
          className={cn(buttonVariants({ variant: "accent" }))}
        >
          <Plus className="h-4 w-4" />
          {unlocked ? "Create listing" : subscribeCta}
        </Link>
      </div>

      {listings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
          <Package className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 font-medium">No listings yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {unlocked
              ? "Upload photos and generate your first AI listing."
              : "Subscribe to generate your first AI listing."}
          </p>
          <Link
            href={createHref}
            className={cn(buttonVariants({ variant: "accent" }), "mt-5 inline-flex")}
          >
            <Plus className="h-4 w-4" />
            {unlocked ? "Create listing" : subscribeCta}
          </Link>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {listings.map((listing) => (
            <Link
              key={listing.id}
              href={`/dashboard/listings/${listing.id}`}
              className="group overflow-hidden rounded-2xl border border-border bg-card/80 transition-colors hover:border-accent/40"
            >
              <div className="aspect-[4/3] bg-secondary">
                {(() => {
                  const cover =
                    listing.images.find((img) => img.isPrimary) ||
                    [...listing.images].sort(
                      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
                    )[0]
                  return cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={cover.url}
                      alt={listing.title}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      <Package className="h-8 w-8" />
                    </div>
                  )
                })()}
              </div>
              <div className="space-y-1.5 p-4">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="line-clamp-2 text-sm font-semibold leading-snug">
                    {listing.title || "Untitled listing"}
                  </h2>
                  <span className="shrink-0 rounded-md bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {listing.status}
                  </span>
                </div>
                <p className="text-sm font-medium">
                  ${listing.price.toFixed(2)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {listing.images.length} photo
                  {listing.images.length === 1 ? "" : "s"}
                  {listing.aiGenerated ? " · AI drafted" : ""}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
