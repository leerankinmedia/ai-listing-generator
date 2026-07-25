"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import {
  ArrowUpRight,
  Package,
  Store,
  TrendingUp,
  Zap,
} from "lucide-react"
import { useAuth } from "@/components/auth/auth-provider"
import { useBillingStatus } from "@/components/billing/paywall"
import { FeatureLockPreview } from "@/components/billing/feature-lock-preview"
import { MARKETPLACES } from "@/lib/marketplaces"
import {
  countActiveListings,
  countConnectedShops,
  formatConnectedShopsLabel,
} from "@/lib/dashboard/stats"
import { fetchListings } from "@/lib/listings/repository"
import { buttonVariants } from "@/components/ui/button"
import type { Listing, MarketplaceId } from "@/lib/types"
import {
  BILLING_TRIAL_DAYS,
  MONTHLY_LISTING_CREDITS,
  PLAN_NAME,
  getMembershipPriceLabel,
} from "@/lib/billing/config"
import { cn } from "@/lib/utils"

const roadmap = [
  {
    id: "marketplaces",
    title: "Marketplace syncing",
    body: "Connect eBay, Poshmark, Mercari, Depop, Grailed, Facebook Marketplace, Etsy, Vinted, and Whatnot.",
  },
  {
    id: "inventory",
    title: "Inventory management",
    body: "Central SKU tracking with quantity sync across every connected channel.",
  },
  {
    id: "automation",
    title: "Offer & delist automation",
    body: "Auto-accept floors, counter rules, and instant delisting when an item sells.",
  },
  {
    id: "analytics",
    title: "Seller analytics",
    body: "Velocity, sell-through, and channel performance in one view.",
  },
]

type PublicConnection = {
  marketplaceId: MarketplaceId
  connected: boolean
  accountLabel?: string | null
}

export function DashboardOverview() {
  const { user, isDemo } = useAuth()
  const { status: billing } = useBillingStatus(Boolean(user))
  const [listings, setListings] = useState<Listing[]>([])
  const [connectedIds, setConnectedIds] = useState<MarketplaceId[]>([])
  const firstName =
    user?.fullName?.split(" ")[0] || user?.email?.split("@")[0] || "Seller"
  const toolsUnlocked = billing?.paidToolsUnlocked === true
  const previewMode = Boolean(billing?.previewMode || (billing && !toolsUnlocked))
  const trialExpired =
    billing?.status === "expired" || billing?.trialEligible === false
  const unlockCta = trialExpired
    ? "Subscribe"
    : `Start ${BILLING_TRIAL_DAYS}-day trial`

  useEffect(() => {
    if (!user) return
    let mounted = true
    void fetchListings(user.id).then((rows) => {
      if (mounted) setListings(rows)
    })
    void fetch("/api/marketplaces/connections", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return [] as PublicConnection[]
        const json = (await res.json()) as { connections?: PublicConnection[] }
        return json.connections || []
      })
      .then((connections) => {
        if (!mounted) return
        setConnectedIds(
          connections
            .filter((c) => c.connected)
            .map((c) => c.marketplaceId)
        )
      })
      .catch(() => {
        if (mounted) setConnectedIds([])
      })
    return () => {
      mounted = false
    }
  }, [user])

  const activeCount = countActiveListings(listings)
  const connectedCount = countConnectedShops(connectedIds)
  const connectedSet = new Set(connectedIds)

  const stats = [
    {
      label: "Active listings",
      value: String(activeCount),
      hint: activeCount
        ? "Listed on a marketplace"
        : "Publish a listing to see it here",
      icon: Package,
      href: "/dashboard/listings",
    },
    {
      label: "Connected shops",
      value: formatConnectedShopsLabel(connectedCount),
      hint:
        connectedCount > 0
          ? "From your marketplace connections"
          : "Connect eBay to start publishing",
      icon: Store,
      href: "/dashboard/connections",
    },
    {
      label: "Pending offers",
      value: "0",
      hint: "Automation coming soon",
      icon: Zap,
      href: null as string | null,
    },
    {
      label: "Revenue (30d)",
      value: "$0",
      hint: "Analytics coming soon",
      icon: TrendingUp,
      href: null as string | null,
    },
  ]

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="animate-rise flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Welcome back</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            {firstName}&apos;s workspace
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {previewMode
              ? trialExpired
                ? "Your trial has ended — browse Overview and listings in read-only mode, or subscribe to unlock tools."
                : "Explore your workspace — start a free trial when you’re ready to generate listings."
              : "Production AI listing engine is live"}
            {isDemo ? " · running in demo auth mode" : ""}.
          </p>
        </div>
        <Link
          href={previewMode ? "/checkout" : "/dashboard/listings/new"}
          className={cn(
            buttonVariants({ variant: "accent" }),
            "self-start sm:self-auto"
          )}
        >
          {previewMode ? unlockCta : "New listing"}
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>

      {previewMode && (
        <div className="animate-rise rounded-xl border border-accent/25 bg-accent/10 px-4 py-3 text-sm">
          {trialExpired
            ? "Your free trial has expired. Overview and existing listings stay available to view. AI generation, editing, publishing, and marketplace changes stay locked until you subscribe. "
            : `Start your ${BILLING_TRIAL_DAYS}-day free trial to unlock AI Generator, listings actions, and marketplace tools. Overview, Billing, and Account stay available. `}
          <Link href="/checkout" className="font-semibold underline">
            {unlockCta}
          </Link>
        </div>
      )}

      <div className="animate-rise-delay-1 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon
          const body = (
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {stat.label}
                </p>
                <Icon className="h-4 w-4 text-accent" />
              </div>
              <p className="mt-3 font-display text-3xl font-semibold">{stat.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{stat.hint}</p>
            </>
          )
          if (stat.href) {
            return (
              <Link
                key={stat.label}
                href={stat.href}
                className="rounded-xl border border-border bg-card/80 p-4 backdrop-blur-sm transition-colors hover:border-accent/40"
              >
                {body}
              </Link>
            )
          }
          return (
            <div
              key={stat.label}
              className="rounded-xl border border-border bg-card/80 p-4 backdrop-blur-sm"
            >
              {body}
            </div>
          )
        })}
      </div>

      <section id="listings" className="animate-rise-delay-2 scroll-mt-24 space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-semibold">Recent listings</h2>
            <p className="text-sm text-muted-foreground">
              Vision analyzes every photo with confidence scores and sold comps.
            </p>
          </div>
          <Link
            href="/dashboard/listings"
            className="text-sm font-medium text-muted-foreground hover:text-accent"
          >
            View all
          </Link>
        </div>
        {listings.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/40 px-6 py-14 text-center">
            <Package className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 font-medium">No listings yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload photos and generate SEO-ready copy in seconds.
            </p>
            <Link
              href={previewMode ? "/checkout" : "/dashboard/listings/new"}
              className={cn(buttonVariants({ variant: "accent" }), "mt-5 inline-flex")}
            >
              {previewMode ? unlockCta : "Open AI generator"}
            </Link>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {listings.slice(0, 6).map((listing) => (
              <Link
                key={listing.id}
                href={`/dashboard/listings/${listing.id}`}
                className="overflow-hidden rounded-xl border border-border bg-card/80 transition-colors hover:border-accent/40"
              >
                <div className="aspect-[16/10] bg-secondary">
                  {listing.images[0] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={listing.images[0].url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
                <div className="space-y-1 p-3.5">
                  <p className="line-clamp-1 text-sm font-semibold">
                    {listing.title || "Untitled"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    ${listing.price.toFixed(2)} · {listing.status}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section id="marketplaces" className="scroll-mt-24">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-semibold">Marketplaces</h2>
            <p className="text-sm text-muted-foreground">
              Connection status from your account — manage OAuth on Connections.
            </p>
          </div>
          <Link
            href="/dashboard/connections"
            className="text-sm font-medium text-muted-foreground hover:text-accent"
          >
            Manage connections
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {MARKETPLACES.map((marketplace) => {
            const connected = connectedSet.has(marketplace.id)
            return (
              <Link
                key={marketplace.id}
                href="/dashboard/connections"
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card/80 px-4 py-3.5 transition-colors hover:border-accent/40"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: marketplace.color }}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {marketplace.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {connected ? "Connected" : "Not connected"}
                    </p>
                  </div>
                </div>
                <span className="shrink-0 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground">
                  {connected ? "Manage" : "Connect"}
                </span>
              </Link>
            )
          })}
        </div>
      </section>

      <section id="automation" className="scroll-mt-24 space-y-4">
        <div>
          <h2 className="font-display text-xl font-semibold">Coming next</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Crosslisting, automation, and analytics phases.
          </p>
        </div>
        {previewMode ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <div id="inventory" className="scroll-mt-24">
              <FeatureLockPreview
                feature="inventory"
                trialEligible={!trialExpired}
              />
            </div>
            <div id="automation" className="scroll-mt-24">
              <FeatureLockPreview
                feature="automation"
                trialEligible={!trialExpired}
              />
            </div>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {roadmap.map((item) => (
              <div
                key={item.id}
                id={item.id}
                className="rounded-xl border border-border bg-card/80 p-4"
              >
                <p className="text-sm font-semibold">{item.title}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section
        id="settings"
        className="scroll-mt-24 rounded-xl border border-border bg-card/80 p-5"
      >
        <h2 className="font-display text-xl font-semibold">Account</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Email</dt>
            <dd className="mt-0.5 font-medium">{user?.email ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Name</dt>
            <dd className="mt-0.5 font-medium">{user?.fullName ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Plan</dt>
            <dd className="mt-0.5 font-medium">
              {billing?.planName || PLAN_NAME} ·{" "}
              {billing?.priceLabel || getMembershipPriceLabel()}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">AI listing credits</dt>
            <dd className="mt-0.5 font-medium">
              {billing?.listingCreditsUsed ?? 0} /{" "}
              {billing?.listingCreditsAllowance ?? MONTHLY_LISTING_CREDITS} used
              this cycle
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Auth mode</dt>
            <dd className="mt-0.5 font-medium">{isDemo ? "Demo" : "Supabase"}</dd>
          </div>
        </dl>
        <p className="mt-4 text-xs text-muted-foreground">
          1 completed AI-generated listing = 1 credit. Credit limits are not
          enforced yet.{" "}
          <Link href="/dashboard/billing" className="underline hover:text-foreground">
            Manage billing
          </Link>
        </p>
      </section>
    </div>
  )
}
