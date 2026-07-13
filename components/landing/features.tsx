import {
  Sparkles,
  Share2,
  Trash2,
  Handshake,
  Package,
  BarChart3,
  RefreshCw,
} from "lucide-react"
import { FUTURE_FEATURES } from "@/lib/marketplaces/constants"

const icons = {
  sparkles: Sparkles,
  share: Share2,
  trash: Trash2,
  handshake: Handshake,
  package: Package,
  chart: BarChart3,
  refresh: RefreshCw,
} as const

export function Features() {
  return (
    <section id="features" className="scroll-mt-20 py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-5 md:px-8">
        <div className="max-w-2xl">
          <h2 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-[var(--lw-fg)] md:text-4xl">
            Built for sellers who move fast
          </h2>
          <p className="mt-3 text-base text-[var(--lw-fg-muted)] md:text-lg">
            ListWise is architected for AI listing, crosslisting, and automation —
            so every phase ships on a solid foundation.
          </p>
        </div>

        <ul className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {FUTURE_FEATURES.map((feature) => {
            const Icon = icons[feature.icon]
            return (
              <li key={feature.id} className="group">
                <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--lw-accent)]/12 text-[var(--lw-accent)] transition-transform duration-300 group-hover:-translate-y-0.5">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-semibold text-[var(--lw-fg)]">
                  {feature.title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--lw-fg-muted)]">
                  {feature.description}
                </p>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
