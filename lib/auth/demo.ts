import type { AuthSession, UserProfile } from "@/lib/types"

export const DEMO_COOKIE = "listwise_demo_session"

export function parseDemoSession(raw: string | undefined): AuthSession | null {
  if (!raw) return null
  try {
    const user = JSON.parse(decodeURIComponent(raw)) as UserProfile
    if (!user?.id || !user?.email) return null
    return { user, isDemo: true }
  } catch {
    return null
  }
}

export function serializeDemoUser(user: UserProfile): string {
  return encodeURIComponent(JSON.stringify(user))
}

export function createDemoUser(
  email: string,
  fullName?: string,
): UserProfile {
  const idSeed = btoa(email).replace(/[+/=]/g, "").slice(0, 16)
  return {
    id: `demo_${idSeed}`,
    email,
    fullName: fullName?.trim() || email.split("@")[0] || "Seller",
    avatarUrl: null,
    createdAt: new Date().toISOString(),
  }
}
