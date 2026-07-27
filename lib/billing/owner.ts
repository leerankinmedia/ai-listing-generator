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
  return email.normalize("NFKC").trim().toLowerCase()
}

/** True when the email is the permanent Owner account. */
export function isListWiseOwnerEmail(
  email: string | null | undefined
): boolean {
  if (!email || typeof email !== "string") return false
  return normalizeBillingEmail(email) === LISTWISE_OWNER_EMAIL
}

/** Optional Owner user ids (comma-separated). Primary Owner match remains the email. */
export function getOwnerUserIds(): Set<string> {
  const raw = process.env.LISTWISE_OWNER_USER_IDS || ""
  return new Set(
    raw
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
  )
}

export function isOwnerUserId(userId: string | null | undefined): boolean {
  if (!userId) return false
  return getOwnerUserIds().has(userId)
}

type AuthEmailSource = {
  email?: string | null
  new_email?: string | null
  user_metadata?: Record<string, unknown> | null
  identities?: Array<{
    identity_data?: Record<string, unknown> | null
    email?: string | null
  }> | null
}

/** Collect every plausible email from a Supabase Auth user object. */
export function collectAuthUserEmails(user: AuthEmailSource | null | undefined): string[] {
  if (!user) return []
  const found: string[] = []
  const push = (value: unknown) => {
    if (typeof value !== "string") return
    const trimmed = value.normalize("NFKC").trim()
    if (!trimmed || !trimmed.includes("@")) return
    const normalized = normalizeBillingEmail(trimmed)
    if (!found.includes(normalized)) found.push(normalized)
  }

  push(user.email)
  push(user.new_email)
  push(user.user_metadata?.email)
  push(user.user_metadata?.email_address)

  for (const identity of user.identities || []) {
    push(identity.email)
    push(identity.identity_data?.email)
    push(identity.identity_data?.email_address)
  }

  return found
}

/** True when any candidate email is the permanent Owner. */
export function authUserHasOwnerEmail(
  user: AuthEmailSource | null | undefined
): boolean {
  return collectAuthUserEmails(user).some((email) =>
    isListWiseOwnerEmail(email)
  )
}

/**
 * Marketplace connect/OAuth: Owner session email bypasses subscription/trial
 * before any Stripe or subscriptions-table enforcement.
 */
export function ownerBypassesMarketplaceSubscription(
  user: {
    id?: string | null
    email?: string | null
    new_email?: string | null
    user_metadata?: Record<string, unknown> | null
    identities?: Array<{
      identity_data?: Record<string, unknown> | null
      email?: string | null
    }> | null
  } | null | undefined
): boolean {
  if (!user?.id) return false
  if (isOwnerUserId(user.id)) return true
  return authUserHasOwnerEmail(user)
}

/** True when billing status payload is the permanent Owner. */
export function isOwnerBillingStatus(status: {
  ownerOverride?: boolean
  status?: string
} | null | undefined): boolean {
  if (!status) return false
  return status.ownerOverride === true || status.status === "owner"
}
