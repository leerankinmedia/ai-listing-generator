/**
 * Permanent ListWise Owner account.
 * Enforced only via server-side entitlement / credit guards — never trust the client.
 */

export const LISTWISE_OWNER_EMAIL = "leerankinmedia@gmail.com"

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
