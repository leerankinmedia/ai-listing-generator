import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { Logo } from "@/components/brand/logo"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 mesh-bg" />
      <div className="pointer-events-none absolute inset-0 grid-fade opacity-70" />

      <div className="relative mx-auto flex min-h-[calc(100svh-4rem)] max-w-6xl flex-col justify-center px-4 py-16 sm:px-6 lg:py-20">
        <div className="max-w-3xl">
          <Logo size="lg" className="animate-rise" href="/" />

          <h1 className="animate-rise delay-100 mt-8 font-display text-4xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-6xl text-balance">
            Crosslist faster than anything else.
          </h1>

          <p className="animate-rise delay-200 mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            ListWise is the AI-powered command center for multi-marketplace
            sellers — list once, publish everywhere, sell without the busywork.
          </p>

          <div className="animate-rise delay-300 mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/signup"
              className={cn(buttonVariants({ size: "lg" }), "gap-2")}
            >
              Start free
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="#how-it-works"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
            >
              See how it works
            </Link>
          </div>
        </div>

        <div className="animate-rise delay-400 relative mt-14 w-full lg:mt-16">
          <HeroProductVisual />
        </div>
      </div>
    </section>
  )
}

function HeroProductVisual() {
  return (
    <div
      className="relative w-full overflow-hidden rounded-2xl border border-border/80 bg-card/90 shadow-[0_40px_80px_-40px_rgba(10,18,32,0.45)] backdrop-blur"
      aria-hidden
    >
      <div className="flex items-center gap-2 border-b border-border/70 px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-border" />
        <span className="h-2.5 w-2.5 rounded-full bg-border" />
        <span className="h-2.5 w-2.5 rounded-full bg-border" />
        <span className="ml-3 text-xs font-medium text-muted-foreground">
          ListWise · Crosslist studio
        </span>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-foreground">
          <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-primary" />
          AI ready
        </span>
      </div>

      <div className="grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="border-b border-border/70 p-5 sm:p-6 lg:border-b-0 lg:border-r">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Source item
          </p>
          <div className="mt-4 flex gap-4">
            <div className="h-28 w-24 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-zinc-700 via-zinc-500 to-emerald-700/60 sm:h-32 sm:w-28">
              <div className="flex h-full items-end p-2">
                <span className="rounded bg-black/35 px-1.5 py-0.5 text-[10px] font-medium text-white">
                  Photo
                </span>
              </div>
            </div>
            <div className="min-w-0 flex-1 space-y-2.5">
              <div className="h-3 w-[88%] rounded-full bg-foreground/15" />
              <div className="h-3 w-[62%] rounded-full bg-foreground/10" />
              <div className="mt-4 space-y-2">
                <div className="h-2.5 w-full rounded-full bg-primary/25" />
                <div className="h-2.5 w-[92%] rounded-full bg-primary/20" />
                <div className="h-2.5 w-[70%] rounded-full bg-primary/15" />
              </div>
              <div className="pt-2 text-sm font-semibold text-foreground">
                Vintage Nike Windbreaker · M
              </div>
              <div className="text-xs text-muted-foreground">
                Suggested · $68 · 9 channels
              </div>
            </div>
          </div>
        </div>

        <div className="p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Publishing to
          </p>
          <ul className="mt-4 space-y-2.5">
            {[
              { name: "eBay", state: "Queued" },
              { name: "Poshmark", state: "Queued" },
              { name: "Mercari", state: "Queued" },
              { name: "Depop", state: "Queued" },
              { name: "Etsy", state: "Queued" },
            ].map((row, i) => (
              <li
                key={row.name}
                className="flex items-center justify-between rounded-lg bg-secondary/70 px-3 py-2.5"
                style={{ animationDelay: `${450 + i * 80}ms` }}
              >
                <span className="text-sm font-medium text-foreground">
                  {row.name}
                </span>
                <span className="text-xs font-semibold text-primary">
                  {row.state}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
