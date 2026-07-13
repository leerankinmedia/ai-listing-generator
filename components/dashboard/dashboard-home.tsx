import Link from "next/link"
import {
  ArrowRight,
  Package,
  ShoppingBag,
  Plug,
  Sparkles,
} from "lucide-react"
import { MARKETPLACES, FUTURE_FEATURES } from "@/lib/marketplaces/constants"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { UserProfile } from "@/lib/types"

export function DashboardHome({ user }: { user: UserProfile }) {
  const firstName = user.fullName?.split(" ")[0] || "there"

  return (
    <div className="mx-auto max-w-5xl space-y-10">
      <div className="animate-lw-rise">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-[var(--lw-fg)] md:text-4xl">
          Welcome back, {firstName}
        </h1>
        <p className="mt-2 max-w-xl text-[var(--lw-fg-muted)]">
          Your ListWise workspace is ready. Connect marketplaces and unlock AI
          listing in upcoming phases.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Active listings", value: "—", icon: ShoppingBag },
          { label: "Inventory", value: "—", icon: Package },
          { label: "Connected", value: "0 / 9", icon: Plug },
          { label: "AI drafts", value: "—", icon: Sparkles },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-[var(--lw-border)] bg-[var(--lw-surface)] px-4 py-4"
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--lw-fg-subtle)]">
                {stat.label}
              </p>
              <stat.icon className="h-4 w-4 text-[var(--lw-fg-subtle)]" />
            </div>
            <p className="mt-2 font-[family-name:var(--font-display)] text-2xl font-bold tabular-nums text-[var(--lw-fg)]">
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      <section id="channels" className="scroll-mt-24">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--lw-fg)]">
              Marketplace channels
            </h2>
            <p className="text-sm text-[var(--lw-fg-muted)]">
              Architecture is in place — live OAuth arrives in a later phase.
            </p>
          </div>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {MARKETPLACES.map((m) => (
            <li
              key={m.id}
              className="flex items-center gap-3 rounded-xl border border-[var(--lw-border)] bg-[var(--lw-surface)] px-4 py-3"
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold text-white"
                style={{ backgroundColor: m.color }}
              >
                {m.shortName.slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[var(--lw-fg)]">
                  {m.name}
                </p>
                <p className="text-xs text-[var(--lw-fg-subtle)]">Not connected</p>
              </div>
              <button
                type="button"
                disabled
                className="rounded-md border border-[var(--lw-border)] px-2.5 py-1 text-xs font-medium text-[var(--lw-fg-subtle)]"
              >
                Soon
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section id="inventory" className="scroll-mt-24">
        <h2 className="text-lg font-semibold text-[var(--lw-fg)]">
          What&apos;s next
        </h2>
        <p className="mt-1 text-sm text-[var(--lw-fg-muted)]">
          Phase roadmap baked into the product shell.
        </p>
        <ul className="mt-4 divide-y divide-[var(--lw-border)] rounded-xl border border-[var(--lw-border)] bg-[var(--lw-surface)]">
          {FUTURE_FEATURES.map((f) => (
            <li
              key={f.id}
              className="flex items-center justify-between gap-4 px-4 py-3.5"
            >
              <div>
                <p className="text-sm font-semibold text-[var(--lw-fg)]">
                  {f.title}
                </p>
                <p className="text-xs text-[var(--lw-fg-muted)]">{f.description}</p>
              </div>
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-[var(--lw-accent)]">
                Planned
              </span>
            </li>
          ))}
        </ul>
      </section>

      <div
        id="crosslist"
        className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-[var(--lw-border)] bg-[var(--lw-ink)] px-6 py-8 sm:flex-row sm:items-center"
      >
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-white">
            Ready when you are
          </h2>
          <p className="mt-1 max-w-md text-sm text-white/65">
            Return to the homepage anytime, or keep exploring the workspace shell.
          </p>
        </div>
        <Link
          href="/"
          className={cn(
            buttonVariants(),
            "bg-teal-400 text-slate-950 hover:bg-teal-300",
          )}
        >
          View site
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  )
}
