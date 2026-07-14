import { NextResponse, type NextRequest } from "next/server"
import { updateSession } from "@/lib/supabase/middleware"

const PROTECTED_PREFIXES = ["/dashboard"]

/** Public auth routes — never force a login redirect. */
const PUBLIC_AUTH_PREFIXES = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/auth",
]

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl

  // If Supabase drops a recovery code on the Site URL (/), send it through
  // the callback so the session is established and /reset-password is shown.
  if (
    pathname === "/" &&
    (searchParams.has("code") || searchParams.has("token_hash"))
  ) {
    const url = request.nextUrl.clone()
    url.pathname = "/auth/callback"
    if (!url.searchParams.get("next")) {
      url.searchParams.set("next", "/reset-password")
    }
    return NextResponse.redirect(url)
  }

  const response = await updateSession(request)

  const isPublicAuth = PUBLIC_AUTH_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  )
  if (isPublicAuth) {
    return response
  }

  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  )

  if (!isProtected) {
    return response
  }

  const demoSession = request.cookies.get("listwise_demo_session")?.value
  if (demoSession) {
    return response
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  const supabaseReady =
    url && key && url !== "https://your-project.supabase.co"

  if (!supabaseReady) {
    // Demo mode: allow dashboard access without forcing redirect when no cookie —
    // client-side AuthProvider handles demo session. Soft-gate via cookie only.
    return response
  }

  return response
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
