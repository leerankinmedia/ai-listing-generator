import { createBrowserClient } from "@supabase/ssr"

export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
      process.env.NEXT_PUBLIC_SUPABASE_URL !== "https://your-project.supabase.co"
  )
}

/**
 * Browser Supabase client (cookie-backed via @supabase/ssr).
 * Pass `{ fresh: true }` after a forced cookie wipe so a new client is created
 * instead of reusing the singleton that may still hold the prior session.
 */
export function createClient(options?: { fresh?: boolean }) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!url || !key) {
    throw new Error("Supabase environment variables are not configured.")
  }

  return createBrowserClient(url, key, {
    isSingleton: options?.fresh ? false : true,
  })
}
