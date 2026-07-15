import {
  Bot,
  Layers3,
  LineChart,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react"

const features = [
  {
    icon: Sparkles,
    title: "AI listing generation",
    description:
      "Turn photos into optimized titles, descriptions, and pricing suggestions in seconds.",
    comingSoon: false,
  },
  {
    icon: Layers3,
    title: "One-click crosslisting",
    description:
      "Push inventory to eBay, Poshmark, Mercari, Depop, and more from a single draft.",
    comingSoon: true,
  },
  {
    icon: RefreshCw,
    title: "Auto delisting & sync",
    description:
      "When an item sells, ListWise removes it everywhere so you never double-sell.",
    comingSoon: true,
  },
  {
    icon: Bot,
    title: "Offer automation",
    description:
      "Set floors and auto-accept rules so negotiations run while you ship.",
    comingSoon: true,
  },
  {
    icon: ShieldCheck,
    title: "Cloud inventory",
    description:
      "Track SKUs, quantities, and listing status in one workspace — no spreadsheet chaos.",
    comingSoon: false,
  },
  {
    icon: LineChart,
    title: "Seller analytics",
    description:
      "See what moves, where it sells, and how fast — then double down.",
    comingSoon: true,
  },
]

export function FeaturesSection() {
  return (
    <section id="features" className="scroll-mt-24 border-t border-border/70 py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-wider text-accent">
            Built for speed
          </p>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Everything multi-platform sellers need — nothing they don’t.
          </h2>
          <p className="mt-3 text-muted-foreground">
            AI listing generation and cloud inventory are live. Marketplace
            automation features are labeled Coming soon until they ship.
          </p>
        </div>

        <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon
            return (
              <div key={feature.title} className="group">
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-accent/15 text-accent-foreground transition-transform duration-300 group-hover:-translate-y-0.5 dark:text-accent">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="font-display text-lg font-semibold">
                  {feature.title}
                  {feature.comingSoon ? (
                    <span className="ml-2 align-middle text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Coming soon
                    </span>
                  ) : null}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
