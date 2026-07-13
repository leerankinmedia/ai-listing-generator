import Link from "next/link"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function CtaSection() {
  return (
    <section className="border-t border-border/70 py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mesh-panel relative overflow-hidden rounded-2xl border border-border px-6 py-12 text-center sm:px-12 sm:py-16">
          <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Ready to outpace the old way of listing?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Join ListWise and get a faster, cleaner command center for every
            marketplace you sell on.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/signup"
              className={cn(buttonVariants({ variant: "accent", size: "lg" }))}
            >
              Create your account
            </Link>
            <Link
              href="/dashboard"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
            >
              Preview dashboard
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
