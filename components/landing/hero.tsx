import Link from "next/link"
import { ArrowRight, Sparkles } from "lucide-react"
import { buttonVariants } from "@/lib/ui/button-variants"
import { cn } from "@/lib/utils"

export function LandingHero() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 lw-hero-grid opacity-60"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-[var(--lw-accent)]/20 blur-3xl animate-float"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 top-32 h-80 w-80 rounded-full bg-sky-400/15 blur-3xl animate-float-delayed"
      />

      <div className="relative mx-auto flex min-h-[min(92vh,860px)] max-w-6xl flex-col justify-center px-4 pb-20 pt-16 sm:px-6 sm:pt-20">
        <div className="max-w-3xl animate-rise">
          <p className="mb-5 font-[family-name:var(--font-display)] text-4xl font-bold tracking-tight text-[var(--lw-fg)] sm:text-5xl md:text-6xl lg:text-7xl">
            List<span className="text-[var(--lw-accent)]">Wise</span>
          </p>
          <h1 className="max-w-2xl text-balance text-2xl font-semibold leading-tight tracking-tight text-[var(--lw-fg)] sm:text-3xl md:text-4xl">
            Crosslist once. Sell everywhere — faster than the rest.
          </h1>
          <p className="mt-5 max-w-xl text-pretty text-base leading-relaxed text-[var(--lw-fg-muted)] sm:text-lg">
            AI drafts your listings, pushes them across every marketplace, and
            keeps inventory in sync so you never double-sell or waste a listing.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/signup"
              className={cn(buttonVariants({ size: "lg" }), "group")}
            >
              Start listing smarter
              <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/login"
              className={cn(buttonVariants({ variant: "secondary", size: "lg" }))}
            >
              Log in to dashboard
            </Link>
          </div>
        </div>

        <div className="relative mt-14 animate-rise-delayed sm:mt-16">
          <div className="lw-hero-panel overflow-hidden rounded-2xl border border-[var(--lw-border)] shadow-[0_30px_80px_-40px_rgba(0,0,0,0.55)]">
            <div className="flex items-center gap-2 border-b border-[var(--lw-border)] bg-[var(--lw-surface)]/90 px-4 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-400/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
              <span className="ml-3 text-xs font-medium text-[var(--lw-fg-subtle)]">
                ListWise workspace
              </span>
            </div>
            <div className="grid gap-0 md:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-4 border-b border-[var(--lw-border)] p-5 md:border-b-0 md:border-r md:p-6">
                <div className="flex items-center gap-2 text-[var(--lw-accent)]">
                  <Sparkles className="h-4 w-4" />
                  <span className="text-xs font-semibold uppercase tracking-[0.16em]">
                    AI draft ready
                  </span>
                </div>
                <div className="space-y-2">
                  <div className="h-3 w-[75%] max-w-[280px] rounded bg-[var(--lw-fg)]/10" />
                  <div className="h-3 w-full rounded bg-[var(--lw-fg)]/10" />
                  <div className="h-3 w-[83%] rounded bg-[var(--lw-fg)]/10" />
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  {["eBay", "Poshmark", "Mercari", "Depop"].map((name) => (
                    <span
                      key={name}
                      className="rounded-md border border-[var(--lw-border)] bg-[var(--lw-surface-elevated)] px-2.5 py-1 text-xs font-medium text-[var(--lw-fg-muted)]"
                    >
                      {name}
                    </span>
                  ))}
                </div>
              </div>
              <div className="space-y-3 p-5 md:p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--lw-fg-subtle)]">
                  Live sync
                </p>
                {[
                  { label: "Inventory locked", meta: "1 unit" },
                  { label: "Auto-delist queued", meta: "On sale" },
                  { label: "Offer automation", meta: "Armed" },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between rounded-lg border border-[var(--lw-border)] bg-[var(--lw-surface)] px-3 py-2.5"
                  >
                    <span className="text-sm text-[var(--lw-fg)]">{row.label}</span>
                    <span className="text-xs font-medium text-[var(--lw-accent)]">
                      {row.meta}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
