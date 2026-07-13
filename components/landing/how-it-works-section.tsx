const steps = [
  {
    step: "01",
    title: "Create your ListWise account",
    description: "Sign up in seconds and open a workspace built for sellers.",
  },
  {
    step: "02",
    title: "Connect marketplaces",
    description:
      "Link eBay, Poshmark, Mercari, and more as integrations unlock.",
  },
  {
    step: "03",
    title: "List once, sync everywhere",
    description:
      "Generate AI listings, crosspost, and let automation handle the rest.",
  },
]

export function HowItWorksSection() {
  return (
    <section
      id="how-it-works"
      className="scroll-mt-24 border-t border-border/70 py-20 sm:py-24"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-wider text-accent">
            How it works
          </p>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            From photo to multi-channel listing — without the busywork.
          </h2>
        </div>

        <ol className="mt-12 grid gap-8 md:grid-cols-3">
          {steps.map((item) => (
            <li key={item.step} className="relative">
              <p className="font-display text-4xl font-semibold text-accent/80">
                {item.step}
              </p>
              <h3 className="mt-3 font-display text-xl font-semibold">
                {item.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {item.description}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
