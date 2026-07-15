import type { Metadata } from "next"
import Link from "next/link"
import { Logo } from "@/components/brand/logo"
import { PricingPageClient } from "@/components/billing/pricing-page-client"
import { ThemeToggle } from "@/components/theme-toggle"

export const metadata: Metadata = {
  title: "ListWise Pro pricing",
}

export default function PricingPage() {
  return (
    <div className="relative flex min-h-screen flex-col">
      <div className="flex items-center justify-between px-4 py-4 sm:px-6">
        <Logo />
        <ThemeToggle />
      </div>
      <div className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-lg">
          <PricingPageClient />
        </div>
      </div>
      <p className="pb-6 text-center text-xs text-muted-foreground">
        <Link href="/billing" className="hover:text-foreground">
          Billing
        </Link>
        {" · "}
        <Link href="/" className="hover:text-foreground">
          Home
        </Link>
      </p>
    </div>
  )
}
