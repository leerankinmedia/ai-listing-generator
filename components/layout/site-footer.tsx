import Link from "next/link"
import { Logo } from "@/components/brand/logo"

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-background/60">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12 sm:px-6 md:flex-row md:items-start md:justify-between">
        <div className="max-w-sm space-y-3">
          <Logo />
          <p className="text-sm leading-relaxed text-muted-foreground">
            AI-powered crosslisting for professional sellers. List once, sync
            everywhere, sell faster.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Product
            </p>
            <ul className="space-y-2 text-sm">
              <li>
                <a href="#features" className="hover:text-accent">
                  Features
                </a>
              </li>
              <li>
                <a href="#marketplaces" className="hover:text-accent">
                  Marketplaces
                </a>
              </li>
              <li>
                <Link href="/signup" className="hover:text-accent">
                  Get started
                </Link>
              </li>
            </ul>
          </div>
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Account
            </p>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/login" className="hover:text-accent">
                  Log in
                </Link>
              </li>
              <li>
                <Link href="/signup" className="hover:text-accent">
                  Sign up
                </Link>
              </li>
              <li>
                <Link href="/dashboard" className="hover:text-accent">
                  Dashboard
                </Link>
              </li>
            </ul>
          </div>
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Coming soon
            </p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>AI listing generation</li>
              <li>Offer automation</li>
              <li>Inventory sync</li>
            </ul>
          </div>
        </div>
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 text-xs text-muted-foreground sm:px-6">
          <p>© {new Date().getFullYear()} ListWise. All rights reserved.</p>
          <p>Built for multi-marketplace sellers.</p>
        </div>
      </div>
    </footer>
  )
}
