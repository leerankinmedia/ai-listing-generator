/**
 * Canonical public origin for ListWise Production.
 * Never use deployment-specific *.vercel.app hosts for OAuth redirects.
 */
export const PRODUCTION_APP_URL =
  "https://ai-listing-generator-n2ji.vercel.app"

export const PRODUCTION_HOST = "ai-listing-generator-n2ji.vercel.app"

export function isLocalAppHost(value: string) {
  const v = value.toLowerCase()
  return (
    v.includes("localhost") ||
    v.includes("127.0.0.1") ||
    v.includes("0.0.0.0")
  )
}

export function hostnameOf(value: string) {
  try {
    if (/^https?:\/\//i.test(value)) return new URL(value).hostname
  } catch {
    // fall through
  }
  return value.replace(/^https?:\/\//i, "").split("/")[0].split(":")[0]
}

export function isCanonicalProductionHost(hostOrUrl: string) {
  return hostnameOf(hostOrUrl).toLowerCase() === PRODUCTION_HOST
}

/** True for *.vercel.app hosts that are not the canonical production alias. */
export function isVercelDeploymentHost(hostOrUrl: string) {
  const host = hostnameOf(hostOrUrl).toLowerCase()
  return host.endsWith(".vercel.app") && host !== PRODUCTION_HOST
}

function cleanOrigin(value: string | undefined | null): string | null {
  if (!value || typeof value !== "string") return null
  const cleaned = value.trim().replace(/\/$/, "")
  if (!cleaned) return null
  if (!/^https?:\/\//i.test(cleaned)) {
    if (isLocalAppHost(cleaned)) return null
    return `https://${cleaned.replace(/^\/\//, "")}`
  }
  if (isLocalAppHost(cleaned)) return null
  return cleaned
}

/**
 * Public app origin for redirects and absolute links.
 * On Vercel / production builds always returns the canonical production alias —
 * never a deployment-specific VERCEL_URL (those break eBay OAuth cookies/params).
 */
export function getAppBaseUrl() {
  if (!process.env["VERCEL"] && process.env["NODE_ENV"] !== "production") {
    const local =
      cleanOrigin(process.env["NEXT_PUBLIC_APP_URL"]) ||
      cleanOrigin(process.env["APP_URL"])
    return local && isLocalAppHost(local) ? local : "http://localhost:3000"
  }

  // Production / Vercel: always canonical. Ignore VERCEL_URL and preview aliases.
  return PRODUCTION_APP_URL
}

/**
 * Absolute URL on the canonical production host (keeps path + query).
 * Used to bounce eBay OAuth off temporary deployment URLs without dropping params.
 */
export function toCanonicalProductionUrl(pathWithSearch: string) {
  const path = pathWithSearch.startsWith("/")
    ? pathWithSearch
    : `/${pathWithSearch}`
  return `${PRODUCTION_APP_URL}${path}`
}

/** @deprecated Prefer getAppBaseUrl() — kept for call-site compatibility. */
export function resolveRequestAppBaseUrl(_request?: { url: string }) {
  return getAppBaseUrl()
}
