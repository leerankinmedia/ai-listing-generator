import { getAppBaseUrl } from "@/lib/app-url"

function supabasePublicOrigin(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  if (!url || url === "https://your-project.supabase.co") return null
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

/** Only accept Analyze Photos URLs from our storage or staging routes. */
export function isAllowedAnalyzeImageUrl(urlString: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(urlString)
  } catch {
    return false
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false

  const supabaseOrigin = supabasePublicOrigin()
  if (supabaseOrigin && parsed.origin === supabaseOrigin) {
    return /\/storage\/v1\/object\/public\//i.test(parsed.pathname)
  }

  try {
    const app = new URL(getAppBaseUrl())
    if (parsed.origin === app.origin) {
      return /^\/api\/media\/staging\/[a-f0-9]{32}$/i.test(parsed.pathname)
    }
  } catch {
    // ignore
  }
  return false
}
