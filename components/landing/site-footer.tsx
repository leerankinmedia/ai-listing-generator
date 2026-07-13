import Link from "next/link"
import { Logo } from "@/components/layout/logo"
import { MARKETPLACES } from "@/lib/marketplaces/constants"

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--lw-border)] bg-[var(--lw-surface)]/40">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-5 py-12 md:flex-row md:justify-between md:px-8">
        <div>
          <Logo size="sm" />
          <p className="mt-3 max-w-xs text-sm text-[var(--lw-fg-muted)]">
            AI-powered crosslisting for modern resellers.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--lw-fg-subtle)]">
              Product
            </p>
            <ul className="mt-3 space-y-2 text-sm text-[var(--lw-fg-muted)]">
              <li>
                <Link href="/#features" className="hover:text-[var(--lw-fg)]">
                  Features
                </Link>
              </li>
              <li>
                <Link
                  href="/#marketplaces"
                  className="hover:text-[var(--lw-fg)]"
                >
                  Marketplaces
                </Link>
              </li>
              <li>
                <Link href="/signup" className="hover:text-[var(--lw-fg)]">
                  Sign up
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--lw-fg-subtle)]">
              Account
            </p>
            <ul className="mt-3 space-y-2 text-sm text-[var(--lw-fg-muted)]">
              <li>
                <Link href="/login" className="hover:text-[var(--lw-fg)]">
                  Log in
                </Link>
              </li>
              <li>
                <Link href="/dashboard" className="hover:text-[var(--lw-fg)]">
                  Dashboard
                </Link>
              </li>
            </ul>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--lw-fg-subtle)]">
              Channels
            </p>
            <p className="mt-3 text-sm leading-relaxed text-[var(--lw-fg-muted)]">
              {MARKETPLACES.map((m) => m.shortName).join(" · ")}
            </p>
          </div>
        </div>
      </div>
      <div className="border-t border-[var(--lw-border)] py-5 text-center text-xs text-[var(--lw-fg-subtle)]">
        © {new Date().getFullYear()} ListWise. All rights reserved.
      </div>
    </footer>
  )
}
