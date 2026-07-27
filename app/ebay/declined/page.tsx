import type { Metadata } from "next"
import Link from "next/link"
import { Logo } from "@/components/brand/logo"
import { ThemeToggle } from "@/components/theme-toggle"

export const metadata: Metadata = {
  title: "eBay connection declined",
  description:
    "You declined eBay authorization for ListWise. You can try again anytime from Connections.",
}

export default function EbayDeclinedPage() {
  return (
    <div className="relative flex min-h-screen flex-col">
      <div className="flex items-center justify-between px-4 py-4 sm:px-6">
        <Logo />
        <ThemeToggle />
      </div>

      <div className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="animate-rise w-full max-w-md rounded-2xl border border-border bg-card/90 p-6 shadow-[0_24px_60px_-40px_rgba(10,15,26,0.45)] backdrop-blur-sm sm:p-8">
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            eBay authorization declined
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            ListWise was not connected to your eBay account. No tokens were
            stored. You can authorize again whenever you’re ready.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/dashboard/connections"
              className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90"
            >
              Back to Connections
            </Link>
            <Link
              href="/"
              className="inline-flex h-10 items-center justify-center rounded-lg border border-border px-4 text-sm font-medium transition hover:bg-muted"
            >
              Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
