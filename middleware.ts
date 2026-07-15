import { NextResponse, type NextRequest } from "next/server"
import { updateSession } from "@/lib/supabase/middleware"

const PROTECTED_PREFIXES = ["/dashboard"]

/** Public auth / billing routes — never force a login redirect. */
const PUBLIC_AUTH_PREFIXES = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/auth",
  "/pricing",
  "/billing",
  "/checkout",
]

/**
 * Preview-first: signed-in users can explore the dashboard without a trial.
 * Paid actions are locked by API guards + PaidFeatureGate when
 * BILLING_ENFORCEMENT=true. Middleware no longer redirects to /pricing.
 */
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

  // Auth requirement for /dashboard is handled by page-level client checks.
  // Do not hard-redirect for missing subscriptions (preview-first trial flow).
  return response
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
