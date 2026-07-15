/** Server + shared billing configuration (no secrets in client bundles). */

export const PLAN_NAME = "ListWise Pro"

export const BILLING_TRIAL_DAYS = 7

/**
 * Customer AI listing credits included per billing cycle.
 * One completed AI-generated listing = 1 credit (not per internal OpenAI call).
 * Enforcement is gated by BILLING_ENFORCEMENT — keep false until ready.
 */
export const MONTHLY_LISTING_CREDITS = 600

/** Display-only membership price (Stripe Price object is source of charge). */
export function getMembershipPriceLabel() {
  return (
    process.env.NEXT_PUBLIC_STRIPE_MONTHLY_PRICE_LABEL?.trim() ||
    "$34.99/month"
  )
}

/**
 * @deprecated Prefer lib/billing/env-flags on the server. Client code must use
 * /api/billing/status flags — non-NEXT_PUBLIC env is unavailable in the browser.
 */
export function isBillingEnforcementEnabled() {
  return (
    typeof process.env.BILLING_ENFORCEMENT === "string" &&
    process.env.BILLING_ENFORCEMENT.trim().toLowerCase() === "true"
  )
}

/**
 * @deprecated Prefer lib/billing/env-flags on the server.
 */
export function isBillingPreviewLocksEnabled() {
  return (
    typeof process.env.BILLING_PREVIEW_LOCKS === "string" &&
    process.env.BILLING_PREVIEW_LOCKS.trim().toLowerCase() === "true"
  )
}

/** @deprecated Prefer lib/billing/env-flags on the server. */
export function arePaidToolLocksActive() {
  return isBillingEnforcementEnabled() || isBillingPreviewLocksEnabled()
}

export function getStripeSecretKey() {
  return process.env.STRIPE_SECRET_KEY?.trim() || ""
}

export function getStripeWebhookSecret() {
  return process.env.STRIPE_WEBHOOK_SECRET?.trim() || ""
}

export function getStripePriceId() {
  return process.env.STRIPE_PRICE_ID?.trim() || ""
}

/** Publishable key for Stripe.js Embedded Checkout (safe for the browser). */
export function getStripePublishableKey() {
  return process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() || ""
}

export function isStripeBillingConfigured() {
  return Boolean(getStripeSecretKey() && getStripePriceId())
}

export function getBillingAppOrigin() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "")
  if (
    configured &&
    !configured.includes("localhost") &&
    !configured.includes("127.0.0.1")
  ) {
    return configured
  }
  const vercel = process.env.VERCEL_URL?.replace(/^https?:\/\//, "")
  if (vercel && !vercel.includes("localhost")) {
    return `https://${vercel}`
  }
  if (typeof window !== "undefined") {
    const { origin, hostname } = window.location
    if (hostname !== "localhost" && hostname !== "127.0.0.1") {
      return origin
    }
  }
  return "https://ai-listing-generator-n2ji.vercel.app"
}

/** Stripe statuses that unlock paid tools. */
export const ACCESS_STATUSES = new Set(["trialing", "active"] as const)

export type AccessStatus = "trialing" | "active"

/**
 * Extra days past current_period_end while status is past_due before tools lock.
 * Set to 0 to lock immediately on past_due.
 */
export const PAST_DUE_GRACE_DAYS = 3

export function statusGrantsAccess(
  status: string | null | undefined,
  currentPeriodEnd?: string | null
) {
  if (!status) return false
  if (ACCESS_STATUSES.has(status as AccessStatus)) return true

  // Brief grace for past_due (failed payment) while still within period + grace
  if (status === "past_due" && PAST_DUE_GRACE_DAYS > 0 && currentPeriodEnd) {
    const endMs = new Date(currentPeriodEnd).getTime()
    if (!Number.isFinite(endMs)) return false
    const graceMs = PAST_DUE_GRACE_DAYS * 24 * 60 * 60 * 1000
    return Date.now() <= endMs + graceMs
  }

  return false
}

/**
 * Paid tools unlock when:
 * - neither BILLING_ENFORCEMENT nor BILLING_PREVIEW_LOCKS is on, OR
 * - Stripe status is trialing / active (or past_due within grace).
 */
export function paidToolsUnlocked(input: {
  enforcement?: boolean
  previewLocks?: boolean
  /** Prefer this when available — true if either lock mode is active. */
  locksActive?: boolean
  status: string | null | undefined
  currentPeriodEnd?: string | null
}) {
  const locksActive =
    input.locksActive ??
    (Boolean(input.enforcement) || Boolean(input.previewLocks))
  if (!locksActive) return true
  return statusGrantsAccess(input.status, input.currentPeriodEnd)
}

export type PlanFeature = {
  label: string
  /** When true, UI must show “Coming soon” — do not claim it is live. */
  comingSoon?: boolean
}

/**
 * Public plan inclusions for pricing / paywall / billing UI.
 * Keep marketplace automation clearly labeled until shipped.
 */
export const PLAN_FEATURES: PlanFeature[] = [
  {
    label: `${MONTHLY_LISTING_CREDITS} AI listing credits per billing cycle`,
  },
  { label: "No fixed inventory limit" },
  { label: "AI-generated listings" },
  { label: "Cloud inventory" },
  {
    label: "Crosslisting to supported marketplaces",
    comingSoon: true,
  },
  {
    label: "Automatic sale detection and delisting",
    comingSoon: true,
  },
  {
    label: "Automatic offers and relisting where supported",
    comingSoon: true,
  },
  { label: "Sold-comps research" },
  {
    label: "BOLO research alerts",
    comingSoon: true,
  },
  {
    label: "Free shipping-supplies resources",
    comingSoon: true,
  },
]
