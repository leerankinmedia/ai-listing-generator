const steps = [
  {
    step: "01",
    title: "Capture the item",
    body: "Upload photos and a few notes. ListWise prepares structured inventory ready for every channel.",
  },
  {
    step: "02",
    title: "Generate & refine",
    body: "AI drafts titles, descriptions, tags, and pricing. You approve once — variants stay marketplace-aware.",
  },
  {
    step: "03",
    title: "Crosslist & automate",
    body: "Publish broadly, auto-delist on sale, and let offer rules work while you source the next haul.",
  },
]

export function LandingHowItWorks() {
  return (
    <section
      id="how-it-works"
      className="scroll-mt-20 border-t border-[var(--lw-border)]"
    >
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--lw-accent)]">
            Workflow
          </p>
          <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-[var(--lw-fg)] sm:text-4xl">
            From photo to multi-channel listing in three moves.
          </h2>
        </div>

        <ol className="mt-12 grid gap-8 md:grid-cols-3">
          {steps.map((item) => (
            <li key={item.step} className="relative">
              <span className="font-[family-name:var(--font-display)] text-4xl font-bold text-[var(--lw-accent)]/25">
                {item.step}
              </span>
              <h3 className="mt-3 text-lg font-semibold text-[var(--lw-fg)]">
                {item.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--lw-fg-muted)]">
                {item.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
