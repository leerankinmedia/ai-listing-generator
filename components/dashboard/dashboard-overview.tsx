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
import { ChallengeSummary } from "@/components/dashboard/challenge-summary"
import { OverviewInsights } from "@/components/dashboard/overview-insights"
import { MARKETPLACES } from "@/lib/marketplaces"
import {
  countActiveListings,
  countConnectedShops,
  formatConnectedShopsLabel,
  formatEntitlementStatusLabel,
} from "@/lib/dashboard/stats"
import { fetchListings } from "@/lib/listings/repository"
import { buttonVariants } from "@/components/ui/button"
import type { Listing, MarketplaceId } from "@/lib/types"
import {
  BILLING_TRIAL_DAYS,
  MONTHLY_LISTING_CREDITS,
  PLAN_NAME,
} from "@/lib/billing/config"
import { cn } from "@/lib/utils"

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
  const displayName =
    user?.fullName?.trim() ||
    user?.email?.split("@")[0] ||
    "Seller"
  const firstName = displayName.split(" ")[0] || "Seller"
  const toolsUnlocked = billing?.paidToolsUnlocked === true
  const previewMode = Boolean(billing?.previewMode || (billing && !toolsUnlocked))
  const trialExpired =
    billing?.status === "expired" || billing?.trialEligible === false
  const unlockCta = trialExpired
    ? "Subscribe"
    : `Start ${BILLING_TRIAL_DAYS}-day trial`
  const entitlementLabel = formatEntitlementStatusLabel(billing)
  const planLine = toolsUnlocked
    ? `${PLAN_NAME} · ${entitlementLabel}`
    : entitlementLabel

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
  const connectedNames = MARKETPLACES.filter((m) =>
    connectedIds.some((id) => String(id).toLowerCase() === m.id)
  ).map((m) => m.name)

  const stats = [
    {
      label: "Active listings",
      value: String(activeCount),
      hint: activeCount ? "Status: listed" : "None listed yet",
      icon: Package,
      href: "/dashboard/listings",
    },
    {
      label: "Connected shops",
      value: formatConnectedShopsLabel(connectedCount),
      hint: connectedCount > 0 ? "Your connections" : "Connect a shop",
      icon: Store,
      href: "/dashboard/connections",
    },
    {
      label: "Pending offers",
      value: "0",
      hint: "Coming soon",
      icon: Zap,
      href: null as string | null,
    },
    {
      label: "Revenue (30d)",
      value: "$0",
      hint: "Coming soon",
      icon: TrendingUp,
      href: null as string | null,
    },
  ]

  return (
    <div className="mx-auto max-w-6xl space-y-5 sm:space-y-8">
      <div className="animate-rise flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Welcome back</p>
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-4xl">
            {firstName}&apos;s workspace
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {previewMode
              ? trialExpired
                ? "Your trial has ended — browse Overview and listings in read-only mode, or subscribe to unlock tools."
                : "Explore your workspace — start a free trial when you’re ready to generate listings."
              : "Today’s challenge, performance, and sales insights."}
            {isDemo ? " · running in demo auth mode" : ""}
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

      <ChallengeSummary />

      <div className="animate-rise-delay-1 grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon
          const body = (
            <>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground sm:text-xs">
                  {stat.label}
                </p>
                <Icon className="h-3.5 w-3.5 shrink-0 text-accent sm:h-4 sm:w-4" />
              </div>
              <p className="mt-2 font-display text-2xl font-semibold sm:mt-3 sm:text-3xl">
                {stat.value}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground sm:mt-1 sm:text-xs">
                {stat.hint}
              </p>
            </>
          )
          if (stat.href) {
            return (
              <Link
                key={stat.label}
                href={stat.href}
                className="rounded-xl border border-border bg-card/80 p-3 backdrop-blur-sm transition-colors hover:border-accent/40 sm:p-4"
              >
                {body}
              </Link>
            )
          }
          return (
            <div
              key={stat.label}
              className="rounded-xl border border-border bg-card/80 p-3 backdrop-blur-sm sm:p-4"
            >
              {body}
            </div>
          )
        })}
      </div>

      <OverviewInsights />

      <section
        id="marketplaces"
        className="scroll-mt-24 rounded-xl border border-border bg-card/80 p-4"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Connected shops
            </p>
            <p className="mt-1 text-sm font-semibold">
              {connectedNames.length > 0
                ? connectedNames.join(", ")
                : "No marketplaces connected"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {formatConnectedShopsLabel(connectedCount)} connected
            </p>
          </div>
          <Link
            href="/dashboard/connections"
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "self-start sm:self-auto"
            )}
          >
            Manage connections
          </Link>
        </div>
      </section>

      <section
        id="settings"
        className="scroll-mt-24 rounded-xl border border-border bg-card/80 p-4 sm:p-5"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Account
            </p>
            <p className="mt-1 truncate font-display text-lg font-semibold">
              {displayName}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {planLine}
              {" · "}
              {billing?.listingCreditsUsed ?? 0}/
              {billing?.listingCreditsAllowance ?? MONTHLY_LISTING_CREDITS}{" "}
              credits used
            </p>
          </div>
          <Link
            href="/dashboard/billing"
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "self-start sm:self-auto"
            )}
          >
            Manage billing
          </Link>
        </div>
      </section>
    </div>
  )
}
