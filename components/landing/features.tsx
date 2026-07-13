import {
  Bot,
  Layers,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react"

const features = [
  {
    icon: Sparkles,
    title: "AI listing generation",
    description:
      "Turn photos into marketplace-ready titles, descriptions, and tags in seconds.",
  },
  {
    icon: Layers,
    title: "True crosslisting",
    description:
      "Publish once and push to every channel you sell on — without rewriting anything.",
  },
  {
    icon: RefreshCw,
    title: "Auto delisting",
    description:
      "When an item sells, ListWise clears it from the rest of your marketplaces automatically.",
  },
  {
    icon: Zap,
    title: "Offer automation",
    description:
      "Set rules to accept, decline, or counter — keep deals moving while you ship.",
  },
  {
    icon: Bot,
    title: "Inventory command center",
    description:
      "One source of truth for SKUs, photos, costs, and stock across every channel.",
  },
  {
    icon: ShieldCheck,
    title: "Built for scale",
    description:
      "Architecture ready for syncing, analytics, and continuous marketplace health checks.",
  },
]

export function Features() {
  return (
    <section id="features" className="scroll-mt-20 border-t border-border/60 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">
            Built for speed
          </p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Everything slower platforms make you wait for.
          </h2>
          <p className="mt-4 text-base text-muted-foreground sm:text-lg">
            ListWise is designed to feel instant — from AI drafts to multi-channel
            publish — so you spend time sourcing, not formatting.
          </p>
        </div>

        <div className="mt-12 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div key={feature.title} className="group">
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-accent-foreground transition-transform duration-300 group-hover:-translate-y-0.5">
                <feature.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-display text-lg font-semibold text-foreground">
                {feature.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
