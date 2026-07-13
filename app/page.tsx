import { ArrowRight, ScanLine, ShieldCheck, Sparkles } from "lucide-react"

import { ListingForm } from "@/components/listing/listing-form"

export default function HomePage() {
  return (
    <div className="relative min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <a href="/" className="group flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-xl bg-[var(--ink-deep)] text-sm font-semibold text-primary-foreground transition group-hover:scale-[1.03]">
              L
            </span>
            <span className="font-display text-lg font-semibold tracking-tight text-foreground">
              Listora
            </span>
          </a>
          <nav className="flex items-center gap-2 text-sm">
            <a
              href="#generator"
              className="hidden rounded-lg px-3 py-1.5 text-muted-foreground transition hover:text-foreground sm:inline"
            >
              Generator
            </a>
            <a
              href="/roadmap"
              className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 font-medium text-primary-foreground transition hover:bg-primary/90"
            >
              Roadmap
              <ArrowRight className="size-3.5" />
            </a>
          </nav>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -top-24 right-[-10%] h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
            <div className="absolute bottom-0 left-[-5%] h-56 w-56 rounded-full bg-accent/20 blur-3xl" />
          </div>

          <div className="relative mx-auto grid max-w-6xl gap-10 px-4 pb-10 pt-10 sm:px-6 sm:pb-14 sm:pt-14 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
            <div className="animate-rise">
              <p className="font-display text-5xl font-semibold tracking-tight text-foreground sm:text-6xl lg:text-7xl">
                Listora
              </p>
              <h1 className="mt-4 max-w-xl text-balance text-xl font-medium leading-snug text-foreground/90 sm:text-2xl">
                Photo-to-listing AI built for resellers who outgrow basic tools.
              </h1>
              <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground sm:text-base">
                Generate eBay-ready titles (70–80 chars), descriptions, categories, item specifics,
                keywords, pricing, and confidence warnings — mobile-first and production-minded.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <a
                  href="#generator"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
                >
                  <Sparkles className="size-4" />
                  Start generating
                </a>
                <a
                  href="#phase"
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-card/70 px-4 text-sm font-medium text-foreground transition hover:bg-muted"
                >
                  Phase 1 scope
                </a>
              </div>
            </div>

            <div className="animate-rise-delay-1 relative min-h-[220px] overflow-hidden rounded-3xl border border-border/70 bg-[var(--ink-deep)] p-5 text-primary-foreground shadow-[0_30px_80px_-40px_rgba(10,30,40,0.8)] sm:min-h-[280px] sm:p-6">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,color-mix(in_oklch,var(--primary)_35%,transparent),transparent_50%),linear-gradient(160deg,transparent,rgba(255,255,255,0.04))]" />
              <div className="relative flex h-full flex-col justify-between gap-8">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/55">
                    Reseller OS · Phase 1
                  </p>
                  <p className="mt-3 max-w-sm font-display text-2xl font-medium leading-snug text-white sm:text-3xl">
                    From thrift rack photo to searchable listing in one pass.
                  </p>
                </div>
                <ul className="grid gap-3 text-sm text-white/80 sm:grid-cols-3">
                  <li className="rounded-2xl bg-white/5 p-3 backdrop-blur">
                    <ScanLine className="mb-2 size-4 text-accent" />
                    Vision intake
                  </li>
                  <li className="rounded-2xl bg-white/5 p-3 backdrop-blur">
                    <Sparkles className="mb-2 size-4 text-accent" />
                    SEO titles
                  </li>
                  <li className="rounded-2xl bg-white/5 p-3 backdrop-blur">
                    <ShieldCheck className="mb-2 size-4 text-accent" />
                    Confidence
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section id="generator" className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
          <ListingForm />
        </section>

        <section id="phase" className="border-t border-border/60 bg-card/40">
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Building in phases
            </p>
            <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              Phase 1 ships the listing brain.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Auth, Stripe billing, inventory, and crosslisting adapters arrive next — without
              breaking this generator. See the full architecture in{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">docs/ROADMAP.md</code>.
            </p>
            <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["01", "AI Listing Generator", "Live"],
                ["02", "Auth + Stripe trials", "Next"],
                ["03", "Inventory core", "Planned"],
                ["04+", "Crosslist & sync", "Planned"],
              ].map(([num, title, status]) => (
                <li
                  key={num}
                  className="rounded-2xl border border-border/70 bg-background/70 px-4 py-4 animate-rise-delay-2"
                >
                  <p className="text-xs font-semibold tracking-[0.14em] text-primary">{num}</p>
                  <p className="mt-2 font-medium text-foreground">{title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{status}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© {new Date().getFullYear()} Listora · Built for professional resellers</p>
          <p className="text-xs">Next.js · TypeScript · OpenAI · Supabase-ready architecture</p>
        </div>
      </footer>
    </div>
  )
}
