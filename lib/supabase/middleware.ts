import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

/**
 * Refresh the Supabase auth cookies on every matched request.
 * Must write Set-Cookie on the response so chunked token updates replace any
 * prior account's leftover chunks before API routes call getUser().
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!url || !key || url === "https://your-project.supabase.co") {
    return supabaseResponse
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value)
        })
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options)
        })
      },
    },
  })

  // getUser() validates JWT and may rotate cookies via setAll above.
  // Never throw from middleware on API routes — that becomes a Next.js HTML 500
  // before /api/listings/publish can return JSON.
  try {
    await supabase.auth.getUser()
  } catch (error) {
    console.error("[middleware] getUser failed", {
      path: request.nextUrl.pathname,
      name: error instanceof Error ? error.name : typeof error,
      message: error instanceof Error ? error.message : String(error),
    })
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return supabaseResponse
    }
    throw error
  }
  return supabaseResponse
}
