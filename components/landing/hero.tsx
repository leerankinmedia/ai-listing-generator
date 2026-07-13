import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function Hero() {
  return (
    <section className="relative isolate min-h-[100svh] overflow-hidden">
      {/* Full-bleed atmospheric plane */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 lw-hero-plane"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 lw-grid-fade opacity-[0.35] dark:opacity-[0.2]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 top-24 -z-10 h-[28rem] w-[28rem] rounded-full bg-[var(--lw-accent)]/20 blur-3xl animate-lw-drift md:right-0 md:top-16"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-20 bottom-10 -z-10 h-[22rem] w-[22rem] rounded-full bg-sky-400/15 blur-3xl animate-lw-drift-slow dark:bg-sky-500/10"
      />

      <div className="mx-auto flex min-h-[100svh] max-w-6xl flex-col justify-center px-5 pb-16 pt-28 md:px-8 md:pb-24 md:pt-32">
        <div className="max-w-3xl animate-lw-rise">
          <p className="font-[family-name:var(--font-display)] text-5xl font-bold tracking-tight text-[var(--lw-fg)] sm:text-6xl md:text-7xl lg:text-8xl">
            List<span className="text-[var(--lw-accent)]">Wise</span>
          </p>
          <h1 className="mt-5 max-w-2xl text-2xl font-semibold leading-snug tracking-tight text-[var(--lw-fg)] sm:text-3xl md:text-4xl">
            Crosslist once. Sell everywhere — faster.
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-[var(--lw-fg-muted)] sm:text-lg">
            AI-powered listings for eBay, Poshmark, Mercari, Depop, and more —
            without the slow, clunky workflow.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/signup"
              className={cn(buttonVariants({ size: "lg" }), "animate-lw-fade")}
            >
              Start free
              <ArrowRight />
            </Link>
            <Link
              href="/#how-it-works"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "animate-lw-fade",
              )}
            >
              See how it works
            </Link>
          </div>
        </div>

        {/* Dominant product visual — full-bleed feel via wide composition */}
        <div className="relative mt-14 w-full animate-lw-rise-delayed md:mt-20">
          <div className="lw-product-stage overflow-hidden rounded-2xl border border-[var(--lw-border)] bg-[var(--lw-surface)]/80 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.45)] backdrop-blur-sm dark:shadow-[0_24px_80px_-32px_rgba(0,0,0,0.7)]">
            <div className="flex items-center gap-2 border-b border-[var(--lw-border)] px-4 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--lw-border-strong)]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--lw-border-strong)]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--lw-border-strong)]" />
              <span className="ml-3 text-xs font-medium text-[var(--lw-fg-subtle)]">
                listwise.app / dashboard
              </span>
            </div>
            <div className="grid gap-0 md:grid-cols-[220px_1fr]">
              <aside className="hidden border-r border-[var(--lw-border)] bg-[var(--lw-surface-2)]/50 p-4 md:block">
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--lw-fg-subtle)]">
                  Workspace
                </p>
                {["Overview", "Inventory", "Listings", "Channels", "Analytics"].map(
                  (item, i) => (
                    <div
                      key={item}
                      className={cn(
                        "mb-1 rounded-md px-3 py-2 text-sm",
                        i === 0
                          ? "bg-[var(--lw-accent)]/15 font-semibold text-[var(--lw-accent)]"
                          : "text-[var(--lw-fg-muted)]",
                      )}
                    >
                      {item}
                    </div>
                  ),
                )}
              </aside>
              <div className="p-4 sm:p-6">
                <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-sm text-[var(--lw-fg-muted)]">
                      Good morning
                    </p>
                    <p className="font-[family-name:var(--font-display)] text-xl font-bold text-[var(--lw-fg)]">
                      Ready to list
                    </p>
                  </div>
                  <div className="rounded-lg bg-[var(--lw-accent)] px-3 py-1.5 text-xs font-semibold text-[var(--lw-accent-fg)]">
                    + New listing
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    { label: "Active", value: "128" },
                    { label: "Sold MTD", value: "47" },
                    { label: "Channels", value: "9" },
                    { label: "Sync", value: "Live" },
                  ].map((stat) => (
                    <div
                      key={stat.label}
                      className="rounded-xl border border-[var(--lw-border)] bg-[var(--lw-bg)]/60 px-3 py-3"
                    >
                      <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--lw-fg-subtle)]">
                        {stat.label}
                      </p>
                      <p className="mt-1 font-[family-name:var(--font-display)] text-2xl font-bold tabular-nums text-[var(--lw-fg)]">
                        {stat.value}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 space-y-2">
                  {[
                    "Vintage Nike Windbreaker — 8 channels",
                    "Levi’s 501 Indigo — draft → AI polish",
                    "Sony WH-1000XM5 — offer auto-reply",
                  ].map((row) => (
                    <div
                      key={row}
                      className="flex items-center justify-between rounded-lg border border-[var(--lw-border)] bg-[var(--lw-bg)]/40 px-3 py-2.5 text-sm text-[var(--lw-fg-muted)]"
                    >
                      <span className="truncate">{row}</span>
                      <span className="ml-3 shrink-0 text-[11px] font-semibold text-[var(--lw-accent)]">
                        Synced
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
