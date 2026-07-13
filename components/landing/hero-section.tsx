import Link from "next/link"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 pb-16 pt-14 sm:px-6 sm:pb-20 sm:pt-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-12 lg:pt-24">
        <div className="relative z-10">
          <p className="animate-rise font-display text-5xl font-semibold leading-[0.95] tracking-tight text-foreground sm:text-6xl lg:text-7xl">
            List<span className="text-accent">Wise</span>
          </p>
          <h1 className="animate-rise-delay-1 mt-5 max-w-xl text-balance text-2xl font-medium leading-snug text-foreground/90 sm:text-3xl">
            Crosslist once. Sell everywhere. Move inventory faster.
          </h1>
          <p className="animate-rise-delay-2 mt-4 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
            The AI-powered command center for multi-marketplace sellers —
            listings, sync, offers, and analytics in one focused workflow.
          </p>
          <div className="animate-rise-delay-3 mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/signup"
              className={cn(buttonVariants({ variant: "accent", size: "lg" }))}
            >
              Start free
            </Link>
            <Link
              href="/login"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
            >
              Log in
            </Link>
          </div>
        </div>

        <div className="animate-rise-delay-2 relative">
          <div className="animate-float mesh-panel relative overflow-hidden rounded-2xl border border-border/70 p-4 shadow-[0_30px_80px_-40px_rgba(10,15,26,0.55)] sm:p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Live workspace
                </p>
                <p className="font-display text-lg font-semibold">
                  Crosslist preview
                </p>
              </div>
              <span className="rounded-md bg-accent/15 px-2.5 py-1 text-xs font-semibold text-accent-foreground dark:text-accent">
                Sync ready
              </span>
            </div>

            <div className="space-y-3">
              <div className="rounded-xl border border-border/80 bg-background/70 p-3.5 backdrop-blur-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">Vintage Nike Windbreaker</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      AI draft · 8 marketplaces queued
                    </p>
                  </div>
                  <p className="text-sm font-semibold">$68</p>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {["eBay", "Poshmark", "Depop", "Mercari", "Grailed"].map(
                    (name) => (
                      <span
                        key={name}
                        className="rounded-md bg-secondary px-2 py-1 text-[11px] font-medium text-secondary-foreground"
                      >
                        {name}
                      </span>
                    )
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                {[
                  { label: "Active", value: "124" },
                  { label: "Synced", value: "9" },
                  { label: "Offers", value: "18" },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-xl border border-border/80 bg-background/70 px-3 py-3 backdrop-blur-sm"
                  >
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      {stat.label}
                    </p>
                    <p className="mt-1 font-display text-xl font-semibold">
                      {stat.value}
                    </p>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-border/80 bg-background/70 p-3.5 backdrop-blur-sm">
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="font-medium">Listing velocity</span>
                  <span className="text-accent">+42% this week</span>
                </div>
                <div className="flex h-16 items-end gap-1.5">
                  {[40, 55, 48, 70, 62, 88, 96].map((h, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-sm bg-accent/80"
                      style={{ height: `${h}%`, opacity: 0.45 + i * 0.08 }}
                    />
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
