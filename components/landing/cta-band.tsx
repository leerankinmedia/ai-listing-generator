import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function CtaBand() {
  return (
    <section className="border-t border-border/60 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl bg-foreground px-6 py-14 text-background sm:px-12">
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/40 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 left-10 h-56 w-56 rounded-full bg-emerald-400/30 blur-3xl" />

          <div className="relative max-w-2xl">
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
              List once. Sell everywhere. Move faster than Nifty.
            </h2>
            <p className="mt-4 text-base text-background/75 sm:text-lg">
              Create your ListWise account and get a dashboard ready for AI
              listings, crosslisting, and marketplace sync.
            </p>
            <div className="mt-8">
              <Link
                href="/signup"
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "bg-primary text-primary-foreground hover:brightness-110"
                )}
              >
                Create free account
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
