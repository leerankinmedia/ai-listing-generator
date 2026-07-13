"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Plus, Package } from "lucide-react"
import { useAuth } from "@/components/auth/auth-provider"
import { buttonVariants } from "@/components/ui/button"
import { fetchListings } from "@/lib/listings/repository"
import type { Listing } from "@/lib/types"
import { cn } from "@/lib/utils"

export function ListingsGrid() {
  const { user } = useAuth()
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)

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

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground animate-fade-in">
        Loading listings…
      </p>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Listings
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {listings.length} saved listing{listings.length === 1 ? "" : "s"}
          </p>
        </div>
        <Link
          href="/dashboard/listings/new"
          className={cn(buttonVariants({ variant: "accent" }))}
        >
          <Plus className="h-4 w-4" />
          New AI listing
        </Link>
      </div>

      {listings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
          <Package className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 font-medium">No listings yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload photos and generate your first AI listing.
          </p>
          <Link
            href="/dashboard/listings/new"
            className={cn(buttonVariants({ variant: "accent" }), "mt-5 inline-flex")}
          >
            <Plus className="h-4 w-4" />
            Create listing
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
                {listing.images[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={listing.images[0].url}
                    alt={listing.title}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    <Package className="h-8 w-8" />
                  </div>
                )}
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
