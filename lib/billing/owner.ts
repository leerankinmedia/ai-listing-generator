/**
 * Permanent ListWise Owner account.
 * Enforced only via server-side entitlement / credit guards — never trust the client.
 *
 * Identification order (see also lib/billing/owner-resolve.ts):
 * 1) Optional LISTWISE_OWNER_USER_IDS (env UUID allow-list) — never required
 * 2) Session / Auth Admin / profiles email match against LISTWISE_OWNER_EMAIL
 * 3) Current user id equals the Auth/profiles row for LISTWISE_OWNER_EMAIL
 *
 * Owner is NOT tied to a UUID created before the Founder account existed.
 */

export const LISTWISE_OWNER_EMAIL = "leerankinmedia@gmail.com"

/** Header badge copy for the Owner account. */
export const FOUNDER_OWNER_BADGE = "👑 Founder • Owner"

/** Overview / status label under the Owner name. */
export const FOUNDER_OWNER_LABEL = "Founder • Owner"

/** Billing page membership copy for the Owner account. */
export const LIFETIME_FOUNDER_ACCESS = "Lifetime Founder Access"

/** Strip invisible format chars that break exact email equality. */
function stripInvisibleEmailChars(value: string): string {
  return value.replace(/[\u200B-\u200D\uFEFF\u00A0]/g, "")
}

export function normalizeBillingEmail(email: string): string {
  return stripInvisibleEmailChars(email.normalize("NFKC")).trim().toLowerCase()
}

/**
 * Canonical form for Owner comparisons.
 * Gmail: ignore dots, ignore +tags, treat googlemail.com as gmail.com.
 */
export function canonicalizeOwnerEmail(email: string): string {
  const normalized = normalizeBillingEmail(email)
  const at = normalized.lastIndexOf("@")
  if (at <= 0) return normalized

  let local = normalized.slice(0, at)
  let domain = normalized.slice(at + 1)

  if (domain === "googlemail.com") domain = "gmail.com"

  if (domain === "gmail.com") {
    const plus = local.indexOf("+")
    if (plus >= 0) local = local.slice(0, plus)
    local = local.replace(/\./g, "")
  }

  return `${local}@${domain}`
}

/**
 * Owner email whitelist: hardcoded Founder address plus optional
 * LISTWISE_OWNER_EMAILS (comma-separated) for additional login emails.
 */
export function getOwnerEmailWhitelist(): string[] {
  const emails = [LISTWISE_OWNER_EMAIL]
  const raw = process.env.LISTWISE_OWNER_EMAILS || ""
  for (const part of raw.split(",")) {
    const trimmed = part.trim()
    if (!trimmed || !trimmed.includes("@")) continue
    const normalized = normalizeBillingEmail(trimmed)
    if (!emails.includes(normalized)) emails.push(normalized)
  }
  return emails
}

/** True when the email is the permanent Owner account (or an allow-listed alias). */
export function isListWiseOwnerEmail(
  email: string | null | undefined
): boolean {
  if (!email || typeof email !== "string") return false
  const candidate = canonicalizeOwnerEmail(email)
  if (!candidate.includes("@")) return false
  return getOwnerEmailWhitelist().some(
    (ownerEmail) => canonicalizeOwnerEmail(ownerEmail) === candidate
  )
}

/** Optional Owner user ids (comma-separated). Email remains the primary key. */
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
    const trimmed = stripInvisibleEmailChars(value.normalize("NFKC")).trim()
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
 * Explain why a session email did or did not match the Owner whitelist.
 * Used by temporary OAuth ?debug=1 diagnostics.
 */
export function explainOwnerEmailMatch(
  sessionEmails: string[]
): {
  ownerWhitelist: string[]
  sessionEmails: string[]
  matched: boolean
  matchedEmail: string | null
  mismatchReason: string | null
} {
  const ownerWhitelist = getOwnerEmailWhitelist()
  for (const email of sessionEmails) {
    if (isListWiseOwnerEmail(email)) {
      return {
        ownerWhitelist,
        sessionEmails,
        matched: true,
        matchedEmail: email,
        mismatchReason: null,
      }
    }
  }

  const session =
    sessionEmails.length > 0 ? sessionEmails.join(", ") : "(none)"
  const whitelist = ownerWhitelist.join(", ")
  return {
    ownerWhitelist,
    sessionEmails,
    matched: false,
    matchedEmail: null,
    mismatchReason: `Session email(s) [${session}] are not in Owner whitelist [${whitelist}] (compared with Gmail-canonical form). Owner is email-based (${LISTWISE_OWNER_EMAIL}), not a pre-created UUID.`,
  }
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
