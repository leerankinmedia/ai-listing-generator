const steps = [
  {
    step: "01",
    title: "Add inventory",
    description:
      "Upload photos and basics. ListWise keeps SKUs, costs, and stock in one place.",
  },
  {
    step: "02",
    title: "Generate with AI",
    description:
      "Get channel-aware titles, descriptions, and pricing suggestions instantly.",
  },
  {
    step: "03",
    title: "Publish everywhere",
    description:
      "Crosslist to connected marketplaces, then let auto-delist and offers run for you.",
  },
]

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="scroll-mt-20 border-t border-border/60 py-20 sm:py-28"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">
            How it works
          </p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Three steps from photo to multi-channel sale.
          </h2>
        </div>

        <ol className="mt-14 grid gap-10 md:grid-cols-3 md:gap-8">
          {steps.map((item) => (
            <li key={item.step} className="relative">
              <span className="font-display text-5xl font-bold text-primary/25">
                {item.step}
              </span>
              <h3 className="mt-3 font-display text-xl font-semibold text-foreground">
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
