import Link from "next/link"
import { Logo } from "@/components/branding/logo"
import { getMarketplaceNames } from "@/lib/marketplaces/registry"

export function SiteFooter() {
  const marketplaces = getMarketplaceNames()

  return (
    <footer className="border-t border-[var(--lw-border)] bg-[var(--lw-surface)]">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.2fr_1fr_1fr]">
        <div className="space-y-4">
          <Logo />
          <p className="max-w-sm text-sm leading-relaxed text-[var(--lw-fg-muted)]">
            AI-powered crosslisting that keeps inventory, listings, and offers in
            sync — so you sell faster across every marketplace that matters.
          </p>
        </div>

        <div>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--lw-fg-subtle)]">
            Product
          </h3>
          <ul className="space-y-2 text-sm text-[var(--lw-fg-muted)]">
            <li>
              <a href="#features" className="hover:text-[var(--lw-fg)]">
                Features
              </a>
            </li>
            <li>
              <a href="#marketplaces" className="hover:text-[var(--lw-fg)]">
                Marketplaces
              </a>
            </li>
            <li>
              <a href="#how-it-works" className="hover:text-[var(--lw-fg)]">
                How it works
              </a>
            </li>
            <li>
              <Link href="/signup" className="hover:text-[var(--lw-fg)]">
                Get started
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--lw-fg-subtle)]">
            Coming soon
          </h3>
          <p className="text-sm leading-relaxed text-[var(--lw-fg-muted)]">
            {marketplaces.join(" · ")}
          </p>
        </div>
      </div>

      <div className="border-t border-[var(--lw-border)]">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-5 text-xs text-[var(--lw-fg-subtle)] sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© {new Date().getFullYear()} ListWise. All rights reserved.</p>
          <p>Built for professional resellers.</p>
        </div>
      </div>
    </footer>
  )
}
