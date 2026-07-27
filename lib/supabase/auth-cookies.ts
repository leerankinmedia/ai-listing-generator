/**
 * Browser helpers for Supabase SSR auth cookies.
 *
 * Full-page navigations (e.g. Connect with OAuth → /api/.../oauth/start) only
 * send cookies. The React auth UI can show an in-memory session for a different
 * user if cookie writes from a prior account switch were incomplete. These
 * helpers keep the cookie jar aligned with the intended session.
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

function isSupabaseAuthCookieName(name: string): boolean {
  return name.startsWith("sb-") && name.includes("auth-token")
}

/** Expire every Supabase auth token cookie chunk in the browser. */
export function clearBrowserSupabaseAuthCookies(): void {
  if (typeof document === "undefined") return

  const names = document.cookie
    .split(";")
    .map((part) => part.split("=")[0]?.trim())
    .filter((name): name is string => Boolean(name))

  const expire = (name: string) => {
    document.cookie = `${name}=; Max-Age=0; path=/`
    document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`
  }

  for (const name of names) {
    if (isSupabaseAuthCookieName(name)) expire(name)
  }

  const storageKey = getSupabaseAuthStorageKey()
  if (storageKey) {
    expire(storageKey)
    for (let i = 0; i < 10; i += 1) {
      expire(`${storageKey}.${i}`)
    }
  }

  try {
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const key = localStorage.key(i)
      if (key && isSupabaseAuthCookieName(key)) {
        localStorage.removeItem(key)
      }
    }
  } catch {
    // private mode / blocked storage
  }
}
