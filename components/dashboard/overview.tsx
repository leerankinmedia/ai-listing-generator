import Link from "next/link"
import {
  ArrowUpRight,
  Boxes,
  CircleDollarSign,
  Plus,
  Store,
  Tag,
} from "lucide-react"
import { MARKETPLACES } from "@/lib/marketplaces/registry"
import { buttonVariants } from "@/lib/ui/button-variants"
import { cn } from "@/lib/utils"
import type { DashboardStats } from "@/lib/types"

const demoStats: DashboardStats = {
  activeListings: 0,
  totalInventory: 0,
  soldThisMonth: 0,
  connectedMarketplaces: 0,
  pendingOffers: 0,
  revenueThisMonth: 0,
}

const upcoming = [
  "AI listing generation from photos",
  "Crosslisting to all 9 marketplaces",
  "Auto delisting on sale",
  "Offer automation rules",
  "Inventory + analytics sync",
]

export function DashboardOverview({ userName }: { userName: string }) {
  const stats = [
    {
      label: "Active listings",
      value: demoStats.activeListings,
      icon: Tag,
    },
    {
      label: "Inventory items",
      value: demoStats.totalInventory,
      icon: Boxes,
    },
    {
      label: "Connected markets",
      value: demoStats.connectedMarketplaces,
      icon: Store,
    },
    {
      label: "Revenue (MTD)",
      value: `$${demoStats.revenueThisMonth.toFixed(0)}`,
      icon: CircleDollarSign,
    },
  ]

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-[var(--lw-fg-muted)]">Welcome back</p>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-[var(--lw-fg)]">
            {userName}
          </h1>
        </div>
        <Link
          href="#inventory"
          className={cn(buttonVariants({ size: "default" }), "w-full sm:w-auto")}
        >
          <Plus className="h-4 w-4" />
          New listing
        </Link>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-[var(--lw-border)] bg-[var(--lw-surface)] p-4"
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--lw-fg-subtle)]">
                {stat.label}
              </span>
              <stat.icon className="h-4 w-4 text-[var(--lw-accent)]" />
            </div>
            <p className="text-2xl font-bold tracking-tight text-[var(--lw-fg)]">
              {stat.value}
            </p>
          </div>
        ))}
      </section>

      <section
        id="inventory"
        className="scroll-mt-24 rounded-xl border border-[var(--lw-border)] bg-[var(--lw-surface)] p-5 sm:p-6"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[var(--lw-fg)]">
              Inventory
            </h2>
            <p className="text-sm text-[var(--lw-fg-muted)]">
              Your source of truth for items, photos, and quantities.
            </p>
          </div>
        </div>
        <div className="mt-8 flex flex-col items-center justify-center rounded-lg border border-dashed border-[var(--lw-border-strong)] px-4 py-12 text-center">
          <Boxes className="mb-3 h-8 w-8 text-[var(--lw-fg-subtle)]" />
          <p className="font-medium text-[var(--lw-fg)]">No inventory yet</p>
          <p className="mt-1 max-w-sm text-sm text-[var(--lw-fg-muted)]">
            Inventory management and AI listing generation arrive in the next
            phase. This shell is ready for those flows.
          </p>
        </div>
      </section>

      <section
        id="marketplaces"
        className="scroll-mt-24 rounded-xl border border-[var(--lw-border)] bg-[var(--lw-surface)] p-5 sm:p-6"
      >
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-[var(--lw-fg)]">
            Marketplaces
          </h2>
          <p className="text-sm text-[var(--lw-fg-muted)]">
            Connect channels when integrations ship. Architecture is in place.
          </p>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {MARKETPLACES.map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between rounded-lg border border-[var(--lw-border)] bg-[var(--lw-bg)]/50 px-3.5 py-3"
            >
              <div className="flex items-center gap-2.5">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: m.color }}
                />
                <span className="text-sm font-medium text-[var(--lw-fg)]">
                  {m.name}
                </span>
              </div>
              <span className="text-xs text-[var(--lw-fg-subtle)]">Soon</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section
          id="analytics"
          className="scroll-mt-24 rounded-xl border border-[var(--lw-border)] bg-[var(--lw-surface)] p-5 sm:p-6"
        >
          <h2 className="text-lg font-semibold text-[var(--lw-fg)]">
            Analytics
          </h2>
          <p className="mt-1 text-sm text-[var(--lw-fg-muted)]">
            Channel performance, fees, and sell-through will live here.
          </p>
          <div className="mt-6 h-36 rounded-lg border border-dashed border-[var(--lw-border-strong)] bg-[var(--lw-bg)]/40" />
        </section>

        <section
          id="settings"
          className="scroll-mt-24 rounded-xl border border-[var(--lw-border)] bg-[var(--lw-surface)] p-5 sm:p-6"
        >
          <h2 className="text-lg font-semibold text-[var(--lw-fg)]">
            Roadmap unlocked next
          </h2>
          <ul className="mt-4 space-y-2.5">
            {upcoming.map((item) => (
              <li
                key={item}
                className="flex items-start gap-2 text-sm text-[var(--lw-fg-muted)]"
              >
                <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-[var(--lw-accent)]" />
                {item}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
