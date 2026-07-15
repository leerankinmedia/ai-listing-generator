"use client"

import Link from "next/link"
import type { LucideIcon } from "lucide-react"
import {
  Boxes,
  Lock,
  Package,
  Sparkles,
  Store,
  Truck,
  Zap,
} from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { BILLING_TRIAL_DAYS, PLAN_NAME } from "@/lib/billing/config"
import { cn } from "@/lib/utils"

export type LockedFeatureId =
  | "ai_generator"
  | "listings"
  | "connections"
  | "inventory"
  | "automation"
  | "sold_comps"
  | "bolo"
  | "shipping"

const FEATURE_COPY: Record<
  LockedFeatureId,
  { title: string; body: string; icon: LucideIcon }
> = {
  ai_generator: {
    title: "AI listing generator",
    body: "Upload product photos and get SEO titles, descriptions, item specifics, and pricing suggestions in seconds — ready to edit and save.",
    icon: Sparkles,
  },
  listings: {
    title: "Listings & inventory",
    body: "Browse, edit, and organize every draft and live listing in one cloud workspace. Your saved listings stay preserved even when tools are locked.",
    icon: Package,
  },
  connections: {
    title: "Marketplace connections",
    body: "Connect supported marketplaces so ListWise can publish and sync from a single draft when crosslisting ships.",
    icon: Store,
  },
  inventory: {
    title: "Cloud inventory",
    body: "Track SKUs, quantities, and channel status without spreadsheet chaos. No fixed inventory limit on ListWise Pro.",
    icon: Boxes,
  },
  automation: {
    title: "Automation",
    body: "Automatic sale detection, delisting, offers, and relisting where supported — coming soon on ListWise Pro.",
    icon: Zap,
  },
  sold_comps: {
    title: "Sold-comps research",
    body: "Price with confidence using sold-comparable ranges generated alongside every AI listing.",
    icon: Package,
  },
  bolo: {
    title: "BOLO research",
    body: "Be-on-the-lookout research alerts for items you want to source — coming soon.",
    icon: Sparkles,
  },
  shipping: {
    title: "Shipping supplies",
    body: "Free shipping-supplies resources for ListWise Pro members — coming soon.",
    icon: Truck,
  },
}

/**
 * Polished empty-state preview for paid tools before trial / after lapse.
 * CTA opens in-app Embedded Checkout (/checkout).
 */
export function FeatureLockPreview({
  feature,
  className,
  trialEligible = true,
}: {
  feature: LockedFeatureId
  className?: string
  trialEligible?: boolean
}) {
  const copy = FEATURE_COPY[feature]
  const Icon = copy.icon
  const ctaLabel = trialEligible
    ? `Start ${BILLING_TRIAL_DAYS}-day trial`
    : "Get started"

  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-xl flex-col items-center rounded-2xl border border-border bg-card/90 px-6 py-10 text-center shadow-[0_24px_60px_-40px_rgba(10,15,26,0.45)] backdrop-blur-sm sm:px-10 sm:py-12",
        className
      )}
    >
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-accent/15 text-accent">
        <Icon className="h-5 w-5" aria-hidden />
      </div>
      <p className="text-xs font-semibold uppercase tracking-wider text-accent">
        {PLAN_NAME} preview
      </p>
      <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
        {copy.title}
      </h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
        {copy.body}
      </p>

      <div className="mt-6 flex items-start gap-2 rounded-xl border border-border bg-secondary/40 px-4 py-3 text-left">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
        <p className="text-sm text-foreground">
          Start your {BILLING_TRIAL_DAYS}-day free trial to unlock access.
        </p>
      </div>

      <div className="mt-6 flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
        <Link
          href="/checkout"
          className={cn(buttonVariants({ variant: "accent", size: "lg" }), "w-full sm:w-auto")}
        >
          {ctaLabel}
        </Link>
        <Link
          href="/dashboard/billing"
          className={cn(
            buttonVariants({ variant: "outline", size: "lg" }),
            "w-full sm:w-auto"
          )}
        >
          View billing
        </Link>
      </div>

      <p className="mt-5 text-xs text-muted-foreground">
        Saved listings, photos, and account data stay preserved while tools are
        locked.
      </p>
    </div>
  )
}
