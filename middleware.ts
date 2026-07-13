import { NextResponse, type NextRequest } from "next/server"
import { updateSession } from "@/lib/supabase/middleware"
import { isSupabaseConfigured } from "@/lib/supabase/config"

const DEMO_COOKIE = "listwise_demo_session"
const PROTECTED = ["/dashboard"]
const AUTH_ROUTES = ["/login", "/signup"]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const { response, user } = await updateSession(request)

  let isAuthenticated = Boolean(user)

  if (!isSupabaseConfigured()) {
    isAuthenticated = request.cookies.get(DEMO_COOKIE)?.value === "1"
  }

  const isProtected = PROTECTED.some((p) => pathname.startsWith(p))
  const isAuthRoute = AUTH_ROUTES.some((p) => pathname.startsWith(p))

  if (isProtected && !isAuthenticated) {
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("next", pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (isAuthRoute && isAuthenticated) {
    return NextResponse.redirect(new URL("/dashboard", request.url))
  }

  return response
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
