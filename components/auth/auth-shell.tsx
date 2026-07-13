import Link from "next/link"
import { Logo } from "@/components/layout/logo"
import { ThemeToggle } from "@/components/layout/theme-toggle"

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <div className="relative min-h-[100svh] overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 lw-hero-plane opacity-80" />
      <div aria-hidden className="pointer-events-none absolute inset-0 lw-grid-fade opacity-30" />

      <div className="relative mx-auto flex min-h-[100svh] max-w-md flex-col justify-center px-5 py-12">
        <div className="mb-8 flex items-center justify-between">
          <Logo href="/" />
          <ThemeToggle />
        </div>

        <div className="rounded-2xl border border-[var(--lw-border)] bg-[var(--lw-surface)]/90 p-6 shadow-[0_20px_60px_-28px_rgba(15,23,42,0.35)] backdrop-blur-md sm:p-8">
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-[var(--lw-fg)]">
            {title}
          </h1>
          <p className="mt-1.5 text-sm text-[var(--lw-fg-muted)]">{subtitle}</p>
          <div className="mt-7">{children}</div>
        </div>

        <p className="mt-6 text-center text-xs text-[var(--lw-fg-subtle)]">
          By continuing you agree to ListWise{" "}
          <Link href="/" className="underline-offset-2 hover:underline">
            terms
          </Link>
          .
        </p>
      </div>
    </div>
  )
}
