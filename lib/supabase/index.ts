import { createClient as createSupabaseJsClient } from "@supabase/supabase-js"
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

export async function getServerAuthUser() {
  if (!isSupabaseConfigured()) return null
  try {
    const supabase = await createServerClient()
    const { data, error } = await supabase.auth.getUser()
    if (error || !data.user) return null
    return data.user
  } catch {
    return null
  }
}
