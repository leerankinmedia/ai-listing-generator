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
  },
  {
    icon: Layers3,
    title: "One-click crosslisting",
    description:
      "Push inventory to eBay, Poshmark, Mercari, Depop, and more from a single draft.",
  },
  {
    icon: RefreshCw,
    title: "Auto delisting & sync",
    description:
      "When an item sells, ListWise removes it everywhere so you never double-sell.",
  },
  {
    icon: Bot,
    title: "Offer automation",
    description:
      "Set floors and auto-accept rules so negotiations run while you ship.",
  },
  {
    icon: ShieldCheck,
    title: "Inventory command",
    description:
      "Track SKUs, quantities, and marketplace status without spreadsheet chaos.",
  },
  {
    icon: LineChart,
    title: "Seller analytics",
    description:
      "See what moves, where it sells, and how fast — then double down.",
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
            Phase 1 ships the foundation. Architecture is ready for AI generation,
            marketplace syncing, and automation in the phases ahead.
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
                <h3 className="font-display text-lg font-semibold">{feature.title}</h3>
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
