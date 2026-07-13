import Link from "next/link"
import { buttonVariants } from "@/lib/ui/button-variants"
import { cn } from "@/lib/utils"

export function LandingCta() {
  return (
    <section className="border-t border-[var(--lw-border)]">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
        <div className="relative overflow-hidden rounded-2xl border border-[var(--lw-border)] bg-[var(--lw-surface)] px-6 py-12 sm:px-10 sm:py-14">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 lw-cta-glow"
          />
          <div className="relative max-w-xl">
            <h2 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-[var(--lw-fg)] sm:text-4xl">
              Sell smarter across every channel
            </h2>
            <p className="mt-3 text-base text-[var(--lw-fg-muted)]">
              Create your ListWise account and explore the dashboard. Marketplace
              sync and AI generation land in upcoming phases.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link href="/signup" className={cn(buttonVariants({ size: "lg" }))}>
                Create free account
              </Link>
              <Link
                href="/login"
                className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
              >
                Log in
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
