import { MARKETPLACES } from "@/lib/marketplaces/registry"

export function LandingMarketplaces() {
  return (
    <section
      id="marketplaces"
      className="scroll-mt-20 border-t border-[var(--lw-border)] bg-[var(--lw-surface)]"
    >
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--lw-accent)]">
            Marketplaces
          </p>
          <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-[var(--lw-fg)] sm:text-4xl">
            Nine channels. One control plane.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-[var(--lw-fg-muted)]">
            Integrations are scaffolded and ready for future phases — no
            marketplace APIs are live yet, by design.
          </p>
        </div>

        <ul className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3">
          {MARKETPLACES.map((marketplace) => (
            <li
              key={marketplace.id}
              className="flex items-center gap-3 rounded-xl border border-[var(--lw-border)] bg-[var(--lw-bg)]/60 px-4 py-4 transition-colors hover:border-[var(--lw-border-strong)]"
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: marketplace.color }}
                aria-hidden
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[var(--lw-fg)]">
                  {marketplace.name}
                </p>
                <p className="text-xs text-[var(--lw-fg-subtle)]">Coming soon</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
