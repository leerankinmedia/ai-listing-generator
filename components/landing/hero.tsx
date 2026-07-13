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

      <div className="relative mx-auto flex min-h-[calc(100svh-4rem)] max-w-6xl flex-col justify-center px-4 pt-14 pb-0 sm:px-6 sm:pt-16">
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
      </div>

      <div className="animate-rise delay-400 relative mt-12 w-full sm:mt-16">
        <HeroProductVisual />
      </div>
    </section>
  )
}

function HeroProductVisual() {
  return (
    <div
      className="relative w-full border-y border-border/70 bg-card/60 backdrop-blur-sm"
      aria-hidden
    >
      <div className="mx-auto grid max-w-6xl gap-0 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="border-b border-border/70 px-4 py-6 sm:px-6 sm:py-8 lg:border-b-0 lg:border-r">
          <div className="mb-5 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Crosslist studio
            </p>
            <p className="text-xs font-medium text-primary">
              Publishing · 9 channels
            </p>
          </div>

          <div className="flex gap-4 sm:gap-5">
            <div className="h-36 w-28 shrink-0 overflow-hidden bg-gradient-to-br from-zinc-700 via-zinc-500 to-emerald-800/70 sm:h-44 sm:w-36">
              <div className="flex h-full items-end p-2.5">
                <span className="bg-black/40 px-1.5 py-0.5 text-[10px] font-medium text-white">
                  Photo
                </span>
              </div>
            </div>
            <div className="min-w-0 flex-1 space-y-3 pt-1">
              <div className="space-y-2">
                <div className="h-3 w-[90%] rounded-full bg-foreground/15" />
                <div className="h-3 w-[64%] rounded-full bg-foreground/10" />
              </div>
              <div className="space-y-2 pt-1">
                <div className="h-2.5 w-full rounded-full bg-primary/25" />
                <div className="h-2.5 w-[94%] rounded-full bg-primary/18" />
                <div className="h-2.5 w-[72%] rounded-full bg-primary/12" />
              </div>
              <div className="pt-3">
                <p className="text-base font-semibold text-foreground sm:text-lg">
                  Vintage Nike Windbreaker · M
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Suggested · $68
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 py-6 sm:px-6 sm:py-8">
          <p className="mb-5 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Publishing to
          </p>
          <ul className="space-y-2.5">
            {[
              "eBay",
              "Poshmark",
              "Mercari",
              "Depop",
              "Etsy",
              "Vinted",
            ].map((name) => (
              <li
                key={name}
                className="flex items-center justify-between border-b border-border/50 py-2.5 last:border-b-0"
              >
                <span className="text-sm font-medium text-foreground">
                  {name}
                </span>
                <span className="text-xs font-semibold text-primary">
                  Queued
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
