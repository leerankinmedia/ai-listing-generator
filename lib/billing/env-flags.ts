import "server-only"

/**
 * Read boolean env flags at request time.
 * Use bracket access so Next.js does not inline a build-time undefined
 * when the var was missing during a previous build.
 */
function readBoolEnv(name: string): boolean {
  const raw = process.env[name]
  if (typeof raw !== "string") return false
  const normalized = raw.trim().toLowerCase()
  return normalized === "true" || normalized === "1" || normalized === "yes"
}

function readRawEnv(name: string): string | null {
  const raw = process.env[name]
  if (typeof raw !== "string") return null
  return raw
}

export function isBillingEnforcementEnabled() {
  return readBoolEnv("BILLING_ENFORCEMENT")
}

export function isBillingPreviewLocksEnabled() {
  return readBoolEnv("BILLING_PREVIEW_LOCKS")
}

export function arePaidToolLocksActive() {
  return isBillingEnforcementEnabled() || isBillingPreviewLocksEnabled()
}

/** Temporary production debug payload for the Billing page. */
export function getBillingLockDebug() {
  return {
    previewLocksEnabled: isBillingPreviewLocksEnabled(),
    billingEnforcementEnabled: isBillingEnforcementEnabled(),
    locksActive: arePaidToolLocksActive(),
    previewLocksRaw: readRawEnv("BILLING_PREVIEW_LOCKS"),
    enforcementRaw: readRawEnv("BILLING_ENFORCEMENT"),
  }
}
