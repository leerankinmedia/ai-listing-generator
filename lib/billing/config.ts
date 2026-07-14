/** Server + shared billing configuration (no secrets in client bundles). */

export const BILLING_TRIAL_DAYS = 7

/** Display-only membership price (Stripe Price object is source of charge). */
export function getMembershipPriceLabel() {
  return (
    process.env.NEXT_PUBLIC_STRIPE_MONTHLY_PRICE_LABEL?.trim() || "$29/month"
  )
}

export function isBillingEnforcementEnabled() {
  return process.env.BILLING_ENFORCEMENT === "true"
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

/** Stripe statuses that unlock the full app. */
export const ACCESS_STATUSES = new Set(["trialing", "active"] as const)

export type AccessStatus = "trialing" | "active"

export function statusGrantsAccess(status: string | null | undefined) {
  return Boolean(status && ACCESS_STATUSES.has(status as AccessStatus))
}
