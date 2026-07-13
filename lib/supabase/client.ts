import { createBrowserClient } from "@supabase/ssr"
import { getSupabaseEnv } from "@/lib/supabase/config"

export function createClient() {
  const env = getSupabaseEnv()
  if (!env) {
    throw new Error("Supabase is not configured")
  }

  return createBrowserClient(env.url, env.anonKey)
}
