import { ListingForm } from "@/components/listing-form"

export default function HomePage() {
  return (
    <div className="relative min-h-dvh">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 pb-2 pt-5 sm:px-6 sm:pt-7">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--foreground)] text-sm font-bold text-[var(--background)] shadow-sm"
          >
            L
          </span>
          <span className="font-[family-name:var(--font-display)] text-lg font-bold tracking-tight brand-mark">
            Listora
          </span>
        </div>
        <span className="rounded-full border border-[var(--border)] bg-[var(--surface)]/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)] backdrop-blur">
          Phase 1 · AI listings
        </span>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
        <section className="relative mb-8 max-w-2xl animate-in-up sm:mb-10">
          <p className="font-[family-name:var(--font-display)] text-4xl font-extrabold leading-[1.05] tracking-tight text-[var(--foreground)] sm:text-5xl md:text-6xl">
            <span className="brand-mark">Listora</span>
          </p>
          <h1 className="mt-3 max-w-xl text-xl font-semibold leading-snug tracking-tight text-[var(--foreground)] sm:text-2xl">
            Turn product photos into eBay-ready listings in seconds.
          </h1>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-[var(--muted-foreground)] sm:text-base">
            SEO titles (70–80 chars), descriptions, categories, item specifics,
            keywords, pricing, confidence scores, and gap warnings — built for
            resellers who move inventory fast.
          </p>
        </section>

        <section className="rounded-[1.5rem] border border-[var(--border)] bg-[color-mix(in_oklab,var(--surface)_88%,white)] p-4 shadow-[0_24px_60px_-40px_rgb(15_28_36_/_0.55)] backdrop-blur-md animate-in-up sm:p-6 md:p-8"
          style={{ animationDelay: "80ms" }}
        >
          <div className="mb-5 flex items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-lg font-bold tracking-tight">
                AI Listing Generator
              </h2>
              <p className="mt-0.5 text-sm text-[var(--muted-foreground)]">
                Upload photos, add optional details, generate a complete draft.
              </p>
            </div>
          </div>
          <ListingForm />
        </section>
      </main>

      <footer className="mx-auto w-full max-w-5xl px-4 pb-10 text-center text-xs text-[var(--muted-foreground)] sm:px-6">
        Listora · Phase 1 foundation for multi-marketplace reseller ops
      </footer>
    </div>
  )
}
