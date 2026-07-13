import Link from "next/link"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function HeroSection() {
  return (
    <section className="relative isolate min-h-[calc(100svh-4rem)] overflow-hidden">
      {/* Full-bleed visual plane — abstract network, not a product card */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_75%_35%,var(--hero-glow),transparent_50%)]" />
        <div className="absolute inset-y-0 right-[-5%] hidden w-[58%] lg:block">
          <div className="absolute inset-0 bg-gradient-to-l from-transparent via-background/10 to-background" />
          <MarketplaceVisual />
        </div>
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-background to-transparent" />
      </div>

      <div className="mx-auto flex min-h-[calc(100svh-4rem)] max-w-6xl flex-col justify-center px-4 pb-16 pt-8 sm:px-6 lg:pb-20">
        <div className="max-w-xl lg:max-w-2xl">
          <p className="animate-rise font-display text-5xl font-semibold leading-[0.92] tracking-tight text-foreground sm:text-6xl lg:text-7xl xl:text-8xl">
            List<span className="text-accent">Wise</span>
          </p>
          <h1 className="animate-rise-delay-1 mt-6 max-w-xl text-balance text-2xl font-medium leading-snug text-foreground/90 sm:text-3xl lg:text-4xl">
            Crosslist once. Sell everywhere. Move inventory faster.
          </h1>
          <p className="animate-rise-delay-2 mt-4 max-w-md text-base leading-relaxed text-muted-foreground sm:text-lg">
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

        <div className="animate-rise-delay-3 relative mt-12 h-52 w-full sm:h-64 lg:hidden">
          <MarketplaceVisual />
        </div>
      </div>
    </section>
  )
}

function MarketplaceVisual() {
  return (
    <div className="relative h-full w-full animate-float">
      <svg
        className="h-full w-full"
        viewBox="0 0 640 560"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="lw-line" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.15" />
            <stop offset="50%" stopColor="var(--accent)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.15" />
          </linearGradient>
        </defs>

        {/* Orbit rings */}
        <ellipse
          cx="340"
          cy="280"
          rx="210"
          ry="150"
          stroke="url(#lw-line)"
          strokeWidth="1.25"
        />
        <ellipse
          cx="340"
          cy="280"
          rx="150"
          ry="105"
          stroke="var(--accent)"
          strokeOpacity="0.28"
          strokeWidth="1.25"
        />
        <ellipse
          cx="340"
          cy="280"
          rx="95"
          ry="66"
          stroke="var(--foreground)"
          strokeOpacity="0.12"
          strokeWidth="1.25"
        />

        {/* Connection spokes */}
        <path
          d="M340 280 L160 170 M340 280 L250 120 M340 280 L430 115 M340 280 L520 175 M340 280 L545 290 M340 280 L500 400 M340 280 L340 450 M340 280 L180 400"
          stroke="var(--accent)"
          strokeOpacity="0.35"
          strokeWidth="1.2"
        />

        {/* Marketplace nodes */}
        {[
          [160, 170],
          [250, 120],
          [430, 115],
          [520, 175],
          [545, 290],
          [500, 400],
          [340, 450],
          [180, 400],
          [140, 280],
        ].map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r="7" fill="var(--foreground)" fillOpacity="0.9" />
            <circle cx={x} cy={y} r="3.5" fill="var(--accent)" />
          </g>
        ))}

        {/* Center brand mark */}
        <circle cx="340" cy="280" r="52" fill="var(--foreground)" />
        <circle cx="340" cy="280" r="36" fill="var(--accent)" />
        <path
          d="M318 274h28a9 9 0 0 1 0 18h-15"
          stroke="var(--accent-foreground)"
          strokeWidth="3.4"
          strokeLinecap="round"
        />
        <path
          d="M331 292h26"
          stroke="var(--foreground)"
          strokeWidth="3.4"
          strokeLinecap="round"
        />
      </svg>
    </div>
  )
}
