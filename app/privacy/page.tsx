import type { Metadata } from "next"
import Link from "next/link"
import { Logo } from "@/components/brand/logo"
import { ThemeToggle } from "@/components/theme-toggle"

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How ListWise collects, uses, and protects information when you connect marketplaces such as eBay.",
}

export default function PrivacyPage() {
  return (
    <div className="relative flex min-h-screen flex-col">
      <div className="flex items-center justify-between px-4 py-4 sm:px-6">
        <Logo />
        <ThemeToggle />
      </div>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-16 pt-4 sm:px-6">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Privacy Policy
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Last updated: July 27, 2026
        </p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-foreground/90">
          <section className="space-y-2">
            <h2 className="font-display text-lg font-semibold">Overview</h2>
            <p>
              ListWise (“we”, “us”) helps sellers create and publish listings
              across marketplaces. This page explains what we collect when you
              use the service and when you connect third-party accounts such as
              eBay.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-display text-lg font-semibold">
              Information we collect
            </h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>Account details you provide (such as email and name).</li>
              <li>
                Listing content you create or upload (titles, descriptions,
                photos, and related item details).
              </li>
              <li>
                Marketplace connection tokens and account labels needed to
                publish on your behalf after you authorize a connection.
              </li>
              <li>
                Basic usage and billing information required to operate your
                subscription.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="font-display text-lg font-semibold">
              How we use information
            </h2>
            <p>
              We use this information to provide ListWise features: generate
              listings, connect marketplaces, publish inventory, show account
              status, and support your subscription. We do not sell your
              personal information.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-display text-lg font-semibold">
              Marketplace connections (including eBay)
            </h2>
            <p>
              When you connect eBay (or another marketplace), ListWise stores
              OAuth tokens so we can call that marketplace’s APIs on your
              behalf. You can disconnect a marketplace from your ListWise
              Connections page. Marketplace account deletion or closure notices
              from eBay are processed through our dedicated compliance endpoint.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-display text-lg font-semibold">Contact</h2>
            <p>
              Questions about this policy can be sent to{" "}
              <a
                className="underline underline-offset-2 hover:text-foreground"
                href="mailto:support@listwise.app"
              >
                support@listwise.app
              </a>
              .
            </p>
          </section>
        </div>
      </main>

      <p className="pb-6 text-center text-xs text-muted-foreground">
        <Link href="/" className="hover:text-foreground">
          ← Back to home
        </Link>
      </p>
    </div>
  )
}
