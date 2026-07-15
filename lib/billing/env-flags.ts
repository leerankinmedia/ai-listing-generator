import "server-only"

/**
 * Read boolean env flags at request time (bracket access avoids build-time inlining).
 */
function readBoolEnv(name: string): boolean {
  const raw = process.env[name]
  if (typeof raw !== "string") return false
  const normalized = raw.trim().toLowerCase()
  return normalized === "true" || normalized === "1" || normalized === "yes"
}

/**
 * BILLING_ENFORCEMENT only controls optional account-wide hard redirects.
 * Paid feature API/page locks do NOT depend on this flag.
 */
export function isBillingEnforcementEnabled() {
  return readBoolEnv("BILLING_ENFORCEMENT")
}
