/**
 * Password-recovery redirects must use the live production origin.
 * Never send users to localhost or a stale hardcoded preview domain.
 */
export const PRODUCTION_APP_URL =
  "https://ai-listing-generator-n2ji.vercel.app"

function isLocalHost(hostnameOrUrl: string) {
  return (
    hostnameOrUrl.includes("localhost") ||
    hostnameOrUrl.includes("127.0.0.1")
  )
}

/** Resolve the public app origin for auth email redirects. */
export function getAppOriginForAuth() {
  if (typeof window !== "undefined") {
    const { origin, hostname } = window.location
    if (!isLocalHost(hostname)) {
      return origin
    }
  }

  // Vercel injects VERCEL_URL automatically — read only, do not require new env vars
  const vercelUrl = process.env.VERCEL_URL?.replace(/^https?:\/\//, "")
  if (vercelUrl && !isLocalHost(vercelUrl)) {
    return `https://${vercelUrl}`
  }

  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "")
  if (configured && !isLocalHost(configured)) {
    return configured
  }

  return PRODUCTION_APP_URL
}

/**
 * Supabase recovery emails redirect here first so the server can exchange
 * the auth code for a session cookie, then send the user to /reset-password.
 */
export function getPasswordRecoveryRedirectUrl() {
  const origin = getAppOriginForAuth()
  const next = encodeURIComponent("/reset-password")
  return `${origin}/auth/callback?next=${next}`
}
