import { NextResponse, type NextRequest } from "next/server"
import { updateSession } from "@/lib/supabase/middleware"
import { isBillingEnforcementEnabled } from "@/lib/billing/config"
import { createServerClient } from "@supabase/ssr"
import { createServiceRoleClient } from "@/lib/supabase/index"
import { statusGrantsAccess } from "@/lib/billing/config"

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

/** Dashboard paths locked users may still open. */
const BILLING_EXEMPT_DASHBOARD = ["/dashboard/billing"]

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
    return response
  }

  // Subscription enforcement (off by default while Stripe test mode is verified)
  if (isBillingEnforcementEnabled()) {
    const exempt = BILLING_EXEMPT_DASHBOARD.some((prefix) =>
      pathname.startsWith(prefix)
    )
    if (!exempt) {
      try {
        let userId: string | null = null
        const supabase = createServerClient(url, key, {
          cookies: {
            getAll() {
              return request.cookies.getAll()
            },
            setAll() {
              // Session already refreshed above
            },
          },
        })
        const { data } = await supabase.auth.getUser()
        userId = data.user?.id ?? null

        if (userId) {
          const admin = createServiceRoleClient()
          if (admin) {
            const { data: sub } = await admin
              .from("subscriptions")
              .select("status")
              .eq("user_id", userId)
              .maybeSingle()
            if (!statusGrantsAccess(sub?.status)) {
              const pricing = request.nextUrl.clone()
              pricing.pathname = "/pricing"
              pricing.search = ""
              return NextResponse.redirect(pricing)
            }
          }
        }
      } catch (error) {
        console.error("[middleware] billing check failed", error)
      }
    }
  }

  return response
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
