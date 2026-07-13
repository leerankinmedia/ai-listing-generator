import Link from "next/link"
import { Logo } from "@/components/brand/logo"
import { MARKETPLACES } from "@/lib/marketplaces"

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 bg-card/40">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.2fr_1fr_1fr]">
        <div>
          <Logo size="sm" />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
            ListWise is the AI-powered crosslisting platform for sellers who
            want speed, clarity, and control across every marketplace.
          </p>
        </div>

        <div>
          <p className="text-sm font-semibold text-foreground">Product</p>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            <li>
              <a href="#features" className="hover:text-foreground">
                Features
              </a>
            </li>
            <li>
              <a href="#marketplaces" className="hover:text-foreground">
                Marketplaces
              </a>
            </li>
            <li>
              <Link href="/login" className="hover:text-foreground">
                Log in
              </Link>
            </li>
            <li>
              <Link href="/signup" className="hover:text-foreground">
                Sign up
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <p className="text-sm font-semibold text-foreground">Integrations</p>
          <ul className="mt-4 columns-2 gap-x-6 space-y-2 text-sm text-muted-foreground">
            {MARKETPLACES.map((m) => (
              <li key={m.id}>{m.name}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© {new Date().getFullYear()} ListWise. All rights reserved.</p>
          <p>Phase 1 · Landing & authentication</p>
        </div>
      </div>
    </footer>
  )
}
