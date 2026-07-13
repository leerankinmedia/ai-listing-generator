import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function CtaBand() {
  return (
    <section className="pb-20 md:pb-28">
      <div className="mx-auto max-w-6xl px-5 md:px-8">
        <div className="relative overflow-hidden rounded-3xl border border-[var(--lw-border)] bg-[var(--lw-ink)] px-6 py-14 text-center md:px-12 md:py-16">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(45,212,191,0.22),_transparent_55%)]"
          />
          <h2 className="relative font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-white md:text-4xl">
            Sell smarter with ListWise
          </h2>
          <p className="relative mx-auto mt-3 max-w-md text-sm text-white/70 md:text-base">
            Create your account and explore the dashboard. Marketplace
            connections land in the next phases.
          </p>
          <div className="relative mt-8 flex justify-center">
            <Link
              href="/signup"
              className={cn(
                buttonVariants({ size: "lg" }),
                "bg-teal-400 text-slate-950 hover:bg-teal-300",
              )}
            >
              Create account
              <ArrowRight />
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
