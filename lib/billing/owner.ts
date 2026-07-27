/**
 * Permanent ListWise Owner account.
 * Enforced only via server-side entitlement / credit guards — never trust the client.
 */

export const LISTWISE_OWNER_EMAIL = "leerankinmedia@gmail.com"

/** Header badge copy for the Owner account. */
export const FOUNDER_OWNER_BADGE = "👑 Founder • Owner"

/** Overview / status label under the Owner name. */
export const FOUNDER_OWNER_LABEL = "Founder • Owner"

/** Billing page membership copy for the Owner account. */
export const LIFETIME_FOUNDER_ACCESS = "Lifetime Founder Access"

export function normalizeBillingEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** True when the email is the permanent Owner account. */
export function isListWiseOwnerEmail(
  email: string | null | undefined
): boolean {
  if (!email || typeof email !== "string") return false
  return normalizeBillingEmail(email) === LISTWISE_OWNER_EMAIL
}

/**
 * Marketplace connect/OAuth: Owner session email bypasses subscription/trial
 * before any Stripe or subscriptions-table enforcement.
 */
export function ownerBypassesMarketplaceSubscription(
  user: { id?: string | null; email?: string | null } | null | undefined
): boolean {
  return Boolean(user?.id && isListWiseOwnerEmail(user.email))
}

/** True when billing status payload is the permanent Owner. */
export function isOwnerBillingStatus(status: {
  ownerOverride?: boolean
  status?: string
} | null | undefined): boolean {
  if (!status) return false
  return status.ownerOverride === true || status.status === "owner"
}
