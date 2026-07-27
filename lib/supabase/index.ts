import { createClient as createSupabaseJsClient } from "@supabase/supabase-js"
import type { User } from "@supabase/supabase-js"
import { createClient as createBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client"
import { createClient as createServerClient } from "@/lib/supabase/server"

export { createBrowserClient as createBrowserSupabase, isSupabaseConfigured }

/** Server-side Supabase client bound to the request cookies (API routes). */
export async function createServerSupabase() {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured.")
  }
  return createServerClient()
}

/** Optional service-role client for privileged server writes (never expose to browser). */
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key || url === "https://your-project.supabase.co") {
    console.error(
      "[supabase] createServiceRoleClient unavailable — missing URL or SUPABASE_SERVICE_ROLE_KEY"
    )
    return null
  }
  return createSupabaseJsClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function mergeAuthUsers(sessionUser: User, adminUser: User): User {
  const sessionMeta = sessionUser.user_metadata || {}
  const adminMeta = adminUser.user_metadata || {}
  const sessionIdentities = sessionUser.identities || []
  const adminIdentities = adminUser.identities || []

  return {
    ...sessionUser,
    email: sessionUser.email || adminUser.email || undefined,
    new_email:
      (sessionUser as { new_email?: string | null }).new_email ||
      (adminUser as { new_email?: string | null }).new_email ||
      undefined,
    user_metadata: {
      ...adminMeta,
      ...sessionMeta,
      email:
        sessionMeta.email ||
        adminMeta.email ||
        sessionUser.email ||
        adminUser.email,
    },
    app_metadata: {
      ...(adminUser.app_metadata || {}),
      ...(sessionUser.app_metadata || {}),
    },
    // Prefer the richer identity list so Owner email can resolve from either side.
    identities:
      adminIdentities.length >= sessionIdentities.length
        ? adminIdentities
        : sessionIdentities,
  } as User
}

/**
 * Authenticated user for API routes / server components.
 * Always merges Auth Admin email/identities when service role is available so
 * Owner checks on full-page navigations (eBay OAuth start) match Billing.
 */
export async function getServerAuthUser() {
  if (!isSupabaseConfigured()) return null
  try {
    const supabase = await createServerClient()
    const { data, error } = await supabase.auth.getUser()
    if (error || !data.user) return null

    const sessionUser = data.user
    const admin = createServiceRoleClient()
    if (!admin) return sessionUser

    try {
      const { data: adminData, error: adminError } =
        await admin.auth.admin.getUserById(sessionUser.id)
      if (adminError || !adminData?.user) return sessionUser
      return mergeAuthUsers(sessionUser, adminData.user)
    } catch {
      return sessionUser
    }
  } catch {
    return null
  }
}
