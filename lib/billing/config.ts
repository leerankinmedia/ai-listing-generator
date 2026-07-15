/** Server + shared billing configuration (no secrets in client bundles). */

export const PLAN_NAME = "ListWise Pro"

export const BILLING_TRIAL_DAYS = 7

/**
 * Customer AI listing credits included per billing cycle.
 * One completed AI-generated listing = 1 credit (not per internal OpenAI call).
 * Credit limit enforcement is gated by BILLING_ENFORCEMENT only.
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
 * Optional account-wide redirect enforcement (not used for paid-feature locks).
 * Prefer lib/billing/env-flags on the server.
 */
export function isBillingEnforcementEnabled() {
  return (
    typeof process.env.BILLING_ENFORCEMENT === "string" &&
    process.env.BILLING_ENFORCEMENT.trim().toLowerCase() === "true"
  )
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

/** Stripe statuses that unlock paid tools — nothing else qualifies. */
export const ACCESS_STATUSES = new Set(["trialing", "active"] as const)

export type AccessStatus = "trialing" | "active"

/**
 * Paid access rule (always on):
 * trialing | active → allowed
 * every other status, including none / missing → denied
 */
export function statusGrantsAccess(status: string | null | undefined) {
  return Boolean(status && ACCESS_STATUSES.has(status as AccessStatus))
}

/** Alias for clarity in UI/status payloads. */
export function paidToolsUnlocked(status: string | null | undefined) {
  return statusGrantsAccess(status)
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
