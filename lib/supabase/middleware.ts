import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { getSupabaseEnv } from "@/lib/supabase/config"
import { DEMO_COOKIE } from "@/lib/auth/demo"

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const env = getSupabaseEnv()
  const pathname = request.nextUrl.pathname
  const isProtected =
    pathname.startsWith("/dashboard") || pathname.startsWith("/api/protected")
  const isAuthPage =
    pathname.startsWith("/login") || pathname.startsWith("/signup")

  if (!env) {
    const demoSession = request.cookies.get(DEMO_COOKIE)?.value
    if (isProtected && !demoSession) {
      const url = request.nextUrl.clone()
      url.pathname = "/login"
      url.searchParams.set("next", pathname)
      return NextResponse.redirect(url)
    }
    if (isAuthPage && demoSession) {
      const url = request.nextUrl.clone()
      url.pathname = "/dashboard"
      return NextResponse.redirect(url)
    }
    return supabaseResponse
  }

  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        )
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        )
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (isProtected && !user) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    url.searchParams.set("next", pathname)
    return NextResponse.redirect(url)
  }

  if (isAuthPage && user) {
    const url = request.nextUrl.clone()
    url.pathname = "/dashboard"
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
