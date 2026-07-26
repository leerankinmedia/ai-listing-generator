"use client"

import Link from "next/link"
import { ArrowLeft, Eye } from "lucide-react"

const GUIDES = [
  {
    title: "Build a tight BOLO list",
    body: "Track 5–10 brands/sizes you already sell well. Keep the list short enough to scan in under a minute while sourcing.",
  },
  {
    title: "Match condition to your buyers",
    body: "Only BOLO pieces you can photograph honestly. Used-excellent with clean flaws notes outperform mystery wear every time.",
  },
  {
    title: "Price from your own sold comps",
    body: "Use Sales Insights sold ranges from your eBay orders before you buy. If you have no sold comps yet, skip the purchase.",
  },
  {
    title: "Photograph before you leave",
    body: "Quick phone shots at the bin help you compare later and avoid duplicate buys of the same silhouette.",
  },
]

/**
 * Full BOLO guides live here — not on Overview, and not mixed with sales stats.
 */
export function BoloPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <Link
          href="/dashboard"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Overview
        </Link>
        <p className="text-xs font-semibold uppercase tracking-wider text-accent">
          Resources
        </p>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
          BOLO guides
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Be-on-the-lookout tactics for used inventory. Sales stats stay on Sales
          Insights — this page is guidance only.
        </p>
      </div>

      <ul className="space-y-3">
        {GUIDES.map((guide) => (
          <li
            key={guide.title}
            className="rounded-xl border border-border bg-card/80 p-4"
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
                <Eye className="h-4 w-4" />
              </span>
              <div>
                <p className="font-semibold">{guide.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {guide.body}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <p className="text-sm text-muted-foreground">
        Ready to act on real sold data?{" "}
        <Link href="/dashboard/insights" className="underline hover:text-foreground">
          Open Sales Insights
        </Link>
        .
      </p>
    </div>
  )
}
