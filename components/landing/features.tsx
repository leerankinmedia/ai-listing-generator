import {
  BarChart3,
  Bot,
  Layers3,
  RefreshCw,
  ShieldCheck,
  Zap,
} from "lucide-react"

const features = [
  {
    icon: Bot,
    title: "AI listing generation",
    body: "Turn photos into marketplace-ready titles, descriptions, and pricing suggestions in seconds.",
  },
  {
    icon: Layers3,
    title: "One-click crosslisting",
    body: "Publish once and fan out to eBay, Poshmark, Mercari, Depop, and more from a single draft.",
  },
  {
    icon: RefreshCw,
    title: "Auto delisting",
    body: "When an item sells, ListWise pulls sibling listings so you never double-sell inventory.",
  },
  {
    icon: Zap,
    title: "Offer automation",
    body: "Set rules once. Accept, counter, or decline offers without living in marketplace inboxes.",
  },
  {
    icon: ShieldCheck,
    title: "Inventory as source of truth",
    body: "Central SKUs, quantities, and photos stay authoritative while channels stay in sync.",
  },
  {
    icon: BarChart3,
    title: "Performance analytics",
    body: "See what sells where, track fees vs. margin, and double down on the channels that win.",
  },
]

export function LandingFeatures() {
  return (
    <section id="features" className="scroll-mt-20 border-t border-[var(--lw-border)]">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--lw-accent)]">
            Built for speed
          </p>
          <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-[var(--lw-fg)] sm:text-4xl">
            Everything a serious reseller needs — without the clutter.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-[var(--lw-fg-muted)]">
            Phase 1 ships the foundation. Every feature below is designed into
            the architecture so future phases plug in cleanly.
          </p>
        </div>

        <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <article key={feature.title} className="group">
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--lw-border)] bg-[var(--lw-surface)] text-[var(--lw-accent)] transition-transform duration-300 group-hover:-translate-y-0.5">
                <feature.icon className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold text-[var(--lw-fg)]">
                {feature.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--lw-fg-muted)]">
                {feature.body}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
