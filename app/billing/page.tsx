import type { Metadata } from "next"
import Link from "next/link"
import { Logo } from "@/components/brand/logo"
import { BillingPanel } from "@/components/billing/billing-panel"
import { ThemeToggle } from "@/components/theme-toggle"

export const metadata: Metadata = {
  title: "Billing",
}

export default function BillingPage() {
  return (
    <div className="relative flex min-h-screen flex-col">
      <div className="flex items-center justify-between px-4 py-4 sm:px-6">
        <Logo />
        <ThemeToggle />
      </div>
      <div className="flex flex-1 justify-center px-4 pb-16 pt-4">
        <div className="animate-rise w-full max-w-2xl rounded-2xl border border-border bg-card/90 p-6 shadow-[0_24px_60px_-40px_rgba(10,15,26,0.45)] backdrop-blur-sm sm:p-8">
          <div className="mb-6">
            <h1 className="font-display text-2xl font-semibold tracking-tight">
              Billing
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Subscription status, ListWise Pro credits, and manage billing in
              Stripe.
            </p>
          </div>
          <BillingPanel />
        </div>
      </div>
      <p className="pb-6 text-center text-xs text-muted-foreground">
        <Link href="/pricing" className="hover:text-foreground">
          Pricing
        </Link>
        {" · "}
        <Link href="/dashboard" className="hover:text-foreground">
          Dashboard
        </Link>
      </p>
    </div>
  )
}
