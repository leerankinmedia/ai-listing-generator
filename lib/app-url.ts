/**
 * Canonical public origin for ListWise Production.
 * Used whenever env/base-URL resolution would otherwise yield localhost.
 */
export const PRODUCTION_APP_URL =
  "https://ai-listing-generator-n2ji.vercel.app"

export function isLocalAppHost(value: string) {
  const v = value.toLowerCase()
  return (
    v.includes("localhost") ||
    v.includes("127.0.0.1") ||
    v.includes("0.0.0.0")
  )
}

function cleanOrigin(value: string | undefined | null): string | null {
  if (!value || typeof value !== "string") return null
  const cleaned = value.trim().replace(/\/$/, "")
  if (!cleaned) return null
  // VERCEL_URL is host-only; normalize to https origin
  if (!/^https?:\/\//i.test(cleaned)) {
    if (isLocalAppHost(cleaned)) return null
    return `https://${cleaned.replace(/^\/\//, "")}`
  }
  if (isLocalAppHost(cleaned)) return null
  return cleaned
}

/**
 * Public app origin for redirects, OAuth return URLs, and absolute links.
 * Never returns localhost when running on Vercel or in production builds.
 */
export function getAppBaseUrl() {
  const configured = cleanOrigin(process.env["NEXT_PUBLIC_APP_URL"])
  if (configured) return configured

  const appUrl = cleanOrigin(process.env["APP_URL"])
  if (appUrl) return appUrl

  const vercel = cleanOrigin(process.env["VERCEL_URL"])
  if (vercel) return vercel

  const onVercel = Boolean(process.env["VERCEL"])
  const isProdBuild = process.env["NODE_ENV"] === "production"
  if (onVercel || isProdBuild) {
    return PRODUCTION_APP_URL
  }

  return "http://localhost:3000"
}

/**
 * Prefer the origin of the incoming request when it is a real public host
 * (e.g. Vercel callback hit). Falls back to getAppBaseUrl(); never localhost
 * on Vercel/production.
 */
export function resolveRequestAppBaseUrl(request?: { url: string }) {
  if (request?.url) {
    try {
      const origin = new URL(request.url).origin
      if (!isLocalAppHost(origin)) {
        return origin.replace(/\/$/, "")
      }
    } catch {
      // ignore malformed request.url
    }
  }
  return getAppBaseUrl()
}
