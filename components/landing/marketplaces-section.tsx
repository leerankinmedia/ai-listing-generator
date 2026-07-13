import { MARKETPLACES } from "@/lib/marketplaces"

export function MarketplacesSection() {
  return (
    <section
      id="marketplaces"
      className="scroll-mt-24 border-t border-border/70 py-20 sm:py-24"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-accent">
            Marketplace ready
          </p>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Nine marketplaces. One ListWise workspace.
          </h2>
          <p className="mt-3 text-muted-foreground">
            Integrations ship in future phases — the registry and adapters are
            already scaffolded so connecting each channel is a clean plug-in.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3">
          {MARKETPLACES.map((marketplace) => (
            <div
              key={marketplace.id}
              className="flex items-center gap-3 rounded-xl border border-border/80 bg-card/70 px-4 py-4 backdrop-blur-sm transition-colors hover:border-accent/40"
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: marketplace.color }}
                aria-hidden
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{marketplace.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  Adapter ready
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
