import { MARKETPLACES } from "@/lib/marketplaces/constants"

export function Marketplaces() {
  return (
    <section
      id="marketplaces"
      className="scroll-mt-20 border-y border-[var(--lw-border)] bg-[var(--lw-surface)]/60 py-20 md:py-28"
    >
      <div className="mx-auto max-w-6xl px-5 md:px-8">
        <div className="max-w-2xl">
          <h2 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-[var(--lw-fg)] md:text-4xl">
            Nine marketplaces. One workspace.
          </h2>
          <p className="mt-3 text-base text-[var(--lw-fg-muted)] md:text-lg">
            Integrations are queued for upcoming phases — the product surface is
            ready so connecting channels is frictionless.
          </p>
        </div>

        <ul className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-3">
          {MARKETPLACES.map((m) => (
            <li
              key={m.id}
              className="flex items-center gap-3 rounded-xl border border-[var(--lw-border)] bg-[var(--lw-bg)]/50 px-4 py-4 transition-colors hover:border-[var(--lw-accent)]/40"
            >
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
                style={{ backgroundColor: m.color }}
                aria-hidden
              >
                {m.shortName.slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate font-semibold text-[var(--lw-fg)]">
                  {m.name}
                </p>
                <p className="truncate text-xs text-[var(--lw-fg-subtle)]">
                  Coming soon
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
