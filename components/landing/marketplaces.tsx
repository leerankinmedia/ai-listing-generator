import { MARKETPLACES } from "@/lib/marketplaces"

export function Marketplaces() {
  const loop = [...MARKETPLACES, ...MARKETPLACES]

  return (
    <section
      id="marketplaces"
      className="scroll-mt-20 border-t border-border/60 py-20 sm:py-28"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">
            Marketplaces
          </p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Nine channels. One workflow.
          </h2>
          <p className="mt-4 text-base text-muted-foreground sm:text-lg">
            Phase 1 prepares the UI and architecture. Future phases wire live
            sync for every marketplace below.
          </p>
        </div>
      </div>

      <div className="relative mt-12 overflow-hidden">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-background to-transparent sm:w-24" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-background to-transparent sm:w-24" />

        <div className="flex w-max animate-marquee gap-3 px-4">
          {loop.map((marketplace, index) => (
            <div
              key={`${marketplace.id}-${index}`}
              className="flex h-14 min-w-[160px] items-center justify-center gap-2.5 rounded-full border border-border/80 bg-card/80 px-5 backdrop-blur"
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: marketplace.color }}
              />
              <span className="text-sm font-semibold text-foreground">
                {marketplace.name}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="mx-auto mt-12 grid max-w-6xl gap-4 px-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
        {MARKETPLACES.map((marketplace) => (
          <div
            key={marketplace.id}
            className="flex items-start gap-3 border-t border-border/70 pt-4"
          >
            <span
              className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: marketplace.color }}
            />
            <div>
              <p className="font-semibold text-foreground">{marketplace.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {marketplace.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
