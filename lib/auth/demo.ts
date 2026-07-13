/**
 * Demo auth for local/preview when Supabase env vars are not set.
 * When NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are set,
 * demo mode is off unless NEXT_PUBLIC_DEMO_AUTH=true.
 */

export const DEMO_SESSION_COOKIE = "listwise_demo_session"
export const DEMO_USER_KEY = "listwise_demo_user"

export interface DemoUser {
  id: string
  email: string
  fullName: string
}

export function isDemoAuthEnabled() {
  if (process.env.NEXT_PUBLIC_DEMO_AUTH === "true") return true
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  // Supabase configured → never fall back to demo
  if (url && key && url !== "https://your-project.supabase.co") {
    return false
  }
  return true
}

export function createDemoUser(email: string, fullName?: string): DemoUser {
  return {
    id: `demo_${btoa(email).replace(/=+$/, "").slice(0, 12)}`,
    email,
    fullName: fullName || email.split("@")[0],
  }
}

export function setDemoSession(user: DemoUser) {
  if (typeof window === "undefined") return
  localStorage.setItem(DEMO_USER_KEY, JSON.stringify(user))
  document.cookie = `${DEMO_SESSION_COOKIE}=${encodeURIComponent(user.id)}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`
}

export function clearDemoSession() {
  if (typeof window === "undefined") return
  localStorage.removeItem(DEMO_USER_KEY)
  document.cookie = `${DEMO_SESSION_COOKIE}=; path=/; max-age=0; SameSite=Lax`
}

export function getDemoUser(): DemoUser | null {
  if (typeof window === "undefined") return null
  const raw = localStorage.getItem(DEMO_USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as DemoUser
  } catch {
    return null
  }
}
