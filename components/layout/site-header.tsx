import Link from "next/link"

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)]/70 bg-[var(--background)]/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:h-16 sm:px-6">
        <Link href="/" className="group flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--ink)] text-[13px] font-bold text-[var(--ink-foreground)] shadow-sm transition-transform group-hover:scale-105">
            L
          </span>
          <span className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-[var(--foreground)]">
            Listora
          </span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <span className="hidden rounded-md bg-[var(--accent-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--accent-foreground-soft)] sm:inline">
            Phase 1 · AI Generator
          </span>
          <a
            href="#generator"
            className="rounded-lg px-3 py-2 font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]"
          >
            Generator
          </a>
        </nav>
      </div>
    </header>
  )
}
