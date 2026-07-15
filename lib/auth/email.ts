/**
 * Shared email validation for signup + Stripe checkout.
 * Requires a domain with a TLD (rejects values like "user@g").
 */

const EMAIL_RE =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function isValidEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const normalized = normalizeEmail(email)
  if (!normalized || normalized.length > 254) return false
  if (normalized.includes("..")) return false
  return EMAIL_RE.test(normalized)
}

export function getEmailValidationError(
  email: string | null | undefined
): string | null {
  if (!email || !email.trim()) {
    return "Enter a valid email address."
  }
  if (!isValidEmail(email)) {
    return "Enter a valid email address (example: you@shop.com)."
  }
  return null
}
