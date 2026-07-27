/**
 * Browser + shared helpers for Supabase SSR auth cookies.
 *
 * Full-page navigations only send cookies. After switching accounts, leftover
 * chunked `sb-*-auth-token*` cookies from the previous user can keep winning
 * on the server. Clearing must match Path / SameSite / Secure variants.
 */

export function getSupabaseAuthStorageKey(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  if (!url) return null
  try {
    const host = new URL(url).hostname
    const ref = host.split(".")[0]
    if (!ref) return null
    return `sb-${ref}-auth-token`
  } catch {
    return null
  }
}

export function isSupabaseAuthCookieName(name: string): boolean {
  // Match base token, chunked `.0` / `.1`, code-verifier, etc.
  return name.startsWith("sb-") && name.includes("-auth-")
}

function expireBrowserCookie(name: string): void {
  if (typeof document === "undefined") return

  const hostname =
    typeof window !== "undefined" ? window.location.hostname : ""
  const base = `${name}=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
  const paths = ["/"]
  const sameSites = ["Lax", "None", "Strict"] as const

  for (const path of paths) {
    document.cookie = `${base}; path=${path}`
    document.cookie = `${base}; path=${path}; SameSite=Lax`
    document.cookie = `${base}; path=${path}; Secure; SameSite=Lax`
    for (const sameSite of sameSites) {
      document.cookie = `${base}; path=${path}; SameSite=${sameSite}`
      document.cookie = `${base}; path=${path}; Secure; SameSite=${sameSite}`
    }
    if (hostname && hostname !== "localhost") {
      document.cookie = `${base}; path=${path}; domain=${hostname}`
      document.cookie = `${base}; path=${path}; domain=${hostname}; Secure; SameSite=Lax`
      const parts = hostname.split(".")
      if (parts.length >= 2) {
        const parent = `.${parts.slice(-2).join(".")}`
        document.cookie = `${base}; path=${path}; domain=${parent}`
        document.cookie = `${base}; path=${path}; domain=${parent}; Secure; SameSite=Lax`
      }
      // Vercel preview / alias hosts
      if (hostname.endsWith(".vercel.app")) {
        document.cookie = `${base}; path=${path}; domain=.vercel.app`
        document.cookie = `${base}; path=${path}; domain=.vercel.app; Secure; SameSite=Lax`
      }
    }
  }
}

/** Known auth cookie names to expire even if not present in document.cookie. */
export function listKnownSupabaseAuthCookieNames(): string[] {
  const names = new Set<string>()
  const storageKey = getSupabaseAuthStorageKey()
  if (storageKey) {
    names.add(storageKey)
    names.add(`${storageKey}-code-verifier`)
    for (let i = 0; i < 10; i += 1) {
      names.add(`${storageKey}.${i}`)
      names.add(`${storageKey}-code-verifier.${i}`)
    }
  }
  return [...names]
}

/** Expire every Supabase auth-related cookie/storage entry in the browser. */
export function clearBrowserSupabaseAuthCookies(): void {
  if (typeof document === "undefined") return

  const present = document.cookie
    .split(";")
    .map((part) => part.split("=")[0]?.trim())
    .filter((name): name is string => Boolean(name))

  const names = new Set<string>([
    ...present.filter(isSupabaseAuthCookieName),
    ...listKnownSupabaseAuthCookieNames(),
  ])

  for (const name of names) {
    expireBrowserCookie(name)
  }

  try {
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const key = localStorage.key(i)
      if (key && (isSupabaseAuthCookieName(key) || key.startsWith("sb-"))) {
        localStorage.removeItem(key)
      }
    }
  } catch {
    // private mode / blocked storage
  }

  try {
    for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
      const key = sessionStorage.key(i)
      if (key && (isSupabaseAuthCookieName(key) || key.startsWith("sb-"))) {
        sessionStorage.removeItem(key)
      }
    }
  } catch {
    // ignore
  }
}
