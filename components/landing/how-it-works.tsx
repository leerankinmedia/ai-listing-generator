const steps = [
  {
    step: "01",
    title: "Snap & describe",
    body: "Upload photos. ListWise drafts titles, descriptions, and pricing with AI.",
  },
  {
    step: "02",
    title: "Crosslist everywhere",
    body: "Push to every connected channel in one motion — no retyping, no tab chaos.",
  },
  {
    step: "03",
    title: "Automate the rest",
    body: "Auto-delist on sale, handle offers, and keep inventory synced in real time.",
  },
]

export function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-20 py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-5 md:px-8">
        <div className="max-w-2xl">
          <h2 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-[var(--lw-fg)] md:text-4xl">
            From photo to multi-channel in minutes
          </h2>
          <p className="mt-3 text-base text-[var(--lw-fg-muted)] md:text-lg">
            A clearer path than legacy crosslisting tools — less waiting, more
            selling.
          </p>
        </div>

        <ol className="mt-14 grid gap-10 md:grid-cols-3 md:gap-8">
          {steps.map((item) => (
            <li key={item.step} className="relative">
              <span className="font-[family-name:var(--font-display)] text-5xl font-bold tabular-nums text-[var(--lw-accent)]/25">
                {item.step}
              </span>
              <h3 className="mt-2 text-xl font-semibold text-[var(--lw-fg)]">
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
