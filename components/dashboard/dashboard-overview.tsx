"use client"

import {
  ArrowUpRight,
  Package,
  Store,
  TrendingUp,
  Zap,
} from "lucide-react"
import { useAuth } from "@/components/auth/auth-provider"
import { MARKETPLACES } from "@/lib/marketplaces"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const stats = [
  {
    label: "Active listings",
    value: "0",
    hint: "Ready for Phase 2",
    icon: Package,
  },
  {
    label: "Connected shops",
    value: "0 / 9",
    hint: "Marketplace adapters ready",
    icon: Store,
  },
  {
    label: "Pending offers",
    value: "0",
    hint: "Automation coming soon",
    icon: Zap,
  },
  {
    label: "Revenue (30d)",
    value: "$0",
    hint: "Analytics scaffolding live",
    icon: TrendingUp,
  },
]

const roadmap = [
  {
    id: "listings",
    title: "AI listing generation",
    body: "Photo → title, description, tags, and price suggestions powered by OpenAI.",
  },
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

export function DashboardOverview() {
  const { user, isDemo } = useAuth()
  const firstName = user?.fullName?.split(" ")[0] || user?.email?.split("@")[0] || "Seller"

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="animate-rise flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Welcome back</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            {firstName}&apos;s workspace
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Phase 1 foundation is live
            {isDemo ? " · running in demo auth mode" : ""}.
          </p>
        </div>
        <button
          type="button"
          disabled
          title="AI listing generation ships in Phase 2"
          className={cn(
            buttonVariants({ variant: "accent" }),
            "self-start opacity-70 sm:self-auto"
          )}
        >
          New listing
          <ArrowUpRight className="h-4 w-4" />
        </button>
      </div>

      <div className="animate-rise-delay-1 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <div
              key={stat.label}
              className="rounded-xl border border-border bg-card/80 p-4 backdrop-blur-sm"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {stat.label}
                </p>
                <Icon className="h-4 w-4 text-accent" />
              </div>
              <p className="mt-3 font-display text-3xl font-semibold">{stat.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{stat.hint}</p>
            </div>
          )
        })}
      </div>

      <section id="marketplaces" className="animate-rise-delay-2 scroll-mt-24">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-semibold">Marketplaces</h2>
            <p className="text-sm text-muted-foreground">
              Connection UI is ready — OAuth adapters plug in next.
            </p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {MARKETPLACES.map((marketplace) => (
            <div
              key={marketplace.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card/80 px-4 py-3.5"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: marketplace.color }}
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{marketplace.name}</p>
                  <p className="text-xs text-muted-foreground">Not connected</p>
                </div>
              </div>
              <button
                type="button"
                disabled
                className="shrink-0 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground"
                title="Coming in a future phase"
              >
                Connect
              </button>
            </div>
          ))}
        </div>
      </section>

      <section id="listings" className="scroll-mt-24 space-y-4">
        <div>
          <h2 className="font-display text-xl font-semibold">Listings</h2>
          <p className="text-sm text-muted-foreground">
            Your catalog will appear here once AI listing generation ships.
          </p>
        </div>
        <div className="rounded-xl border border-dashed border-border bg-card/40 px-6 py-14 text-center">
          <Package className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 font-medium">No listings yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Architecture types and marketplace refs are ready for Phase 2.
          </p>
        </div>
      </section>

      <section id="automation" className="scroll-mt-24">
        <h2 className="font-display text-xl font-semibold">Product roadmap</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Scaffolded modules prepared for upcoming phases.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {roadmap.map((item) => (
            <div
              key={item.id}
              id={item.id === "listings" ? undefined : item.id}
              className="rounded-xl border border-border bg-card/80 p-4"
            >
              <p className="text-sm font-semibold">{item.title}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {item.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section id="settings" className="scroll-mt-24 rounded-xl border border-border bg-card/80 p-5">
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
            <dt className="text-muted-foreground">Auth mode</dt>
            <dd className="mt-0.5 font-medium">{isDemo ? "Demo" : "Supabase"}</dd>
          </div>
        </dl>
      </section>
    </div>
  )
}
